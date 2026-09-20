import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { Socket } from 'node:net'
import type {
  MinecraftServerEntry,
  SingleplayerWorldEntry,
  ServerPingStatus,
  QuickPlayTarget
} from '@shared/types/servers'
import type { InstanceConfiguration } from '@shared/types/instance'
import { getInstanceMinecraftPath, getInstanceConfigPath, getInstancesDirectory } from '@main/services/paths'
import { readJsonFile } from '@main/utils/filesystem'

// --- Lightweight NBT Parser for servers.dat & level.dat ---

class NbtReader {
  private buffer: Buffer
  private offset = 0

  constructor(buffer: Buffer) {
    // Check if gzipped (0x1f, 0x8b)
    if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
      try {
        this.buffer = gunzipSync(buffer)
      } catch {
        this.buffer = buffer
      }
    } else {
      this.buffer = buffer
    }
  }

  readByte(): number {
    const val = this.buffer.readInt8(this.offset)
    this.offset += 1
    return val
  }

  readShort(): number {
    const val = this.buffer.readInt16BE(this.offset)
    this.offset += 2
    return val
  }

  readInt(): number {
    const val = this.buffer.readInt32BE(this.offset)
    this.offset += 4
    return val
  }

  readLong(): bigint {
    const val = this.buffer.readBigInt64BE(this.offset)
    this.offset += 8
    return val
  }

  readFloat(): number {
    const val = this.buffer.readFloatBE(this.offset)
    this.offset += 4
    return val
  }

  readDouble(): number {
    const val = this.buffer.readDoubleBE(this.offset)
    this.offset += 8
    return val
  }

  readString(): string {
    const length = this.readShort()
    if (length <= 0) return ''
    const str = this.buffer.toString('utf8', this.offset, this.offset + length)
    this.offset += length
    return str
  }

  readTag(type: number): any {
    switch (type) {
      case 1: // TAG_Byte
        return this.readByte()
      case 2: // TAG_Short
        return this.readShort()
      case 3: // TAG_Int
        return this.readInt()
      case 4: // TAG_Long
        return Number(this.readLong())
      case 5: // TAG_Float
        return this.readFloat()
      case 6: // TAG_Double
        return this.readDouble()
      case 7: { // TAG_Byte_Array
        const len = this.readInt()
        this.offset += len
        return null
      }
      case 8: // TAG_String
        return this.readString()
      case 9: { // TAG_List
        const elemType = this.readByte()
        const len = this.readInt()
        const list: any[] = []
        for (let i = 0; i < len; i++) {
          list.push(this.readTag(elemType))
        }
        return list
      }
      case 10: { // TAG_Compound
        const compound: Record<string, any> = {}
        while (this.offset < this.buffer.length) {
          const tagType = this.readByte()
          if (tagType === 0) break // TAG_End
          const name = this.readString()
          compound[name] = this.readTag(tagType)
        }
        return compound
      }
      case 11: { // TAG_Int_Array
        const len = this.readInt()
        this.offset += len * 4
        return null
      }
      case 12: { // TAG_Long_Array
        const len = this.readInt()
        this.offset += len * 8
        return null
      }
      default:
        return null
    }
  }

  parse(): Record<string, any> {
    try {
      if (this.offset >= this.buffer.length) return {}
      const rootType = this.readByte()
      if (rootType !== 10) return {}
      this.readString() // root name
      return this.readTag(10) || {}
    } catch (err) {
      return {}
    }
  }
}

// --- Server List Ping (SLP) Implementation ---

function writeVarInt(value: number): Buffer {
  const bytes: number[] = []
  let val = value
  while (true) {
    if ((val & ~0x7f) === 0) {
      bytes.push(val)
      break
    }
    bytes.push((val & 0x7f) | 0x80)
    val >>>= 7
  }
  return Buffer.from(bytes)
}

function readVarInt(buffer: Buffer, offset: { index: number }): number {
  let result = 0
  let shift = 0
  while (true) {
    if (offset.index >= buffer.length) break
    const byte = buffer[offset.index++]
    result |= (byte & 0x7f) << shift
    if ((byte & 0x80) === 0) break
    shift += 7
  }
  return result
}

function stripMinecraftColors(text: string): string {
  return text.replace(/§[0-9a-fk-or]/gi, '').trim()
}

export function pingMinecraftServer(
  host: string,
  port = 25565,
  timeoutMs = 4000
): Promise<ServerPingStatus> {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const socket = new Socket()
    let buffer = Buffer.alloc(0)
    let isResolved = false

    const finish = (result: ServerPingStatus) => {
      if (isResolved) return
      isResolved = true
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(timeoutMs)

    socket.on('timeout', () => {
      finish({ online: false, latencyMs: -1, cleanMotd: "Can't connect to server" })
    })

    socket.on('error', () => {
      finish({ online: false, latencyMs: -1, cleanMotd: "Can't connect to server" })
    })

    socket.connect(port, host, () => {
      try {
        // 1. Handshake Packet (ID: 0x00)
        const hostBuf = Buffer.from(host, 'utf8')
        const handshakePayload = Buffer.concat([
          writeVarInt(0x00), // Packet ID
          writeVarInt(47), // Protocol Version (1.8 - widely accepted)
          writeVarInt(hostBuf.length),
          hostBuf,
          Buffer.from([(port >> 8) & 0xff, port & 0xff]), // Port as unsigned short
          writeVarInt(1) // Next state: 1 (status)
        ])

        const handshakePacket = Buffer.concat([
          writeVarInt(handshakePayload.length),
          handshakePayload
        ])

        // 2. Status Request Packet (ID: 0x00)
        const requestPacket = Buffer.from([0x01, 0x00])

        socket.write(Buffer.concat([handshakePacket, requestPacket]))
      } catch {
        finish({ online: false, latencyMs: -1, cleanMotd: "Can't connect to server" })
      }
    })

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])

      try {
        const offset = { index: 0 }
        const packetLength = readVarInt(buffer, offset)
        if (packetLength <= 0) return

        const packetId = readVarInt(buffer, offset)
        if (packetId !== 0) return

        const stringLength = readVarInt(buffer, offset)
        if (buffer.length >= offset.index + stringLength) {
          const latencyMs = Date.now() - startTime
          const jsonString = buffer.toString('utf8', offset.index, offset.index + stringLength)
          const data = JSON.parse(jsonString)

          let rawMotd = ''
          if (typeof data.description === 'string') {
            rawMotd = data.description
          } else if (data.description?.text) {
            rawMotd = data.description.text
          } else if (data.description?.extra) {
            rawMotd = data.description.extra.map((e: any) => e.text || '').join('')
          }

          const cleanMotd = stripMinecraftColors(rawMotd) || 'A Minecraft Server'

          finish({
            online: true,
            latencyMs,
            motd: rawMotd,
            cleanMotd,
            versionName: data.version?.name,
            protocolVersion: data.version?.protocol,
            players: data.players
              ? { online: data.players.online ?? 0, max: data.players.max ?? 0 }
              : undefined,
            favicon: data.favicon // Server icon dataUrl!
          })
        }
      } catch {
        // Wait for more chunks
      }
    })
  })
}

// --- Instance Scanner for Servers & Worlds ---

export async function getInstanceServers(
  instance: InstanceConfiguration
): Promise<MinecraftServerEntry[]> {
  const mcDir = getInstanceMinecraftPath(instance.id)
  const serversDatPath = join(mcDir, 'servers.dat')

  try {
    const raw = await fs.readFile(serversDatPath)
    const reader = new NbtReader(raw)
    const parsed = reader.parse()

    const rawServers = parsed.servers || []
    if (!Array.isArray(rawServers)) return []

    return rawServers.map((s: any, idx: number) => {
      const fullIp = String(s.ip || 'localhost')
      let ip = fullIp
      let port = 25565

      if (fullIp.includes(':')) {
        const parts = fullIp.split(':')
        ip = parts[0]
        port = parseInt(parts[1], 10) || 25565
      }

      let icon: string | undefined = undefined
      if (s.icon && typeof s.icon === 'string') {
        icon = s.icon.startsWith('data:') ? s.icon : `data:image/png;base64,${s.icon}`
      }

      return {
        id: `server_${instance.id}_${idx}_${ip}`,
        instanceId: instance.id,
        instanceName: instance.name,
        loaderType: instance.loaderType,
        minecraftVersion: instance.minecraftVersion,
        name: s.name || ip,
        ip,
        port,
        icon,
        type: 'server'
      }
    })
  } catch {
    return []
  }
}

export async function getInstanceWorlds(
  instance: InstanceConfiguration
): Promise<SingleplayerWorldEntry[]> {
  const mcDir = getInstanceMinecraftPath(instance.id)
  const savesDir = join(mcDir, 'saves')

  try {
    const entries = await fs.readdir(savesDir, { withFileTypes: true })
    const worlds: SingleplayerWorldEntry[] = []

    for (const ent of entries) {
      if (!ent.isDirectory()) continue

      const worldFolder = ent.name
      const worldPath = join(savesDir, worldFolder)
      const levelDatPath = join(worldPath, 'level.dat')
      const iconPath = join(worldPath, 'icon.png')

      try {
        let worldName = worldFolder
        let gameMode = 'Survival'
        let lastPlayed = 0

        if (await fs.stat(levelDatPath).then(() => true).catch(() => false)) {
          const rawLevel = await fs.readFile(levelDatPath)
          const reader = new NbtReader(rawLevel)
          const parsed = reader.parse()
          const data = parsed.Data || {}

          if (data.LevelName) worldName = data.LevelName
          if (typeof data.GameType === 'number') {
            switch (data.GameType) {
              case 1:
                gameMode = 'Creative mode'
                break
              case 2:
                gameMode = 'Adventure mode'
                break
              case 3:
                gameMode = 'Spectator'
                break
              default:
                gameMode = 'Survival mode'
                break
            }
          }
          if (data.LastPlayed) lastPlayed = data.LastPlayed
        }

        let icon: string | undefined = undefined
        try {
          const iconRaw = await fs.readFile(iconPath)
          icon = `data:image/png;base64,${iconRaw.toString('base64')}`
        } catch {
          // No world icon
        }

        worlds.push({
          id: `world_${instance.id}_${worldFolder}`,
          instanceId: instance.id,
          instanceName: instance.name,
          loaderType: instance.loaderType,
          minecraftVersion: instance.minecraftVersion,
          name: worldName,
          folderName: worldFolder,
          gameMode,
          lastPlayed: lastPlayed || Date.now(),
          icon,
          type: 'world'
        })
      } catch {
        // Skip corrupted world
      }
    }

    return worlds.sort((a, b) => b.lastPlayed - a.lastPlayed)
  } catch {
    return []
  }
}

export async function getAllQuickPlayTargets(): Promise<QuickPlayTarget[]> {
  const instancesDir = getInstancesDirectory()
  try {
    const dirs = await fs.readdir(instancesDir, { withFileTypes: true })
    const targets: QuickPlayTarget[] = []

    for (const d of dirs) {
      if (!d.isDirectory()) continue
      const configPath = getInstanceConfigPath(d.name)
      const config = await readJsonFile<InstanceConfiguration>(configPath)
      if (!config) continue

      const [servers, worlds] = await Promise.all([
        getInstanceServers(config),
        getInstanceWorlds(config)
      ])

      targets.push(...servers, ...worlds)
    }

    return targets
  } catch {
    return []
  }
}
