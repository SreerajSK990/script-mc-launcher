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



class NbtReader {
  private buffer: Buffer
  private offset = 0

  constructor(buffer: Buffer) {
    
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
      case 1: 
        return this.readByte()
      case 2: 
        return this.readShort()
      case 3: 
        return this.readInt()
      case 4: 
        return Number(this.readLong())
      case 5: 
        return this.readFloat()
      case 6: 
        return this.readDouble()
      case 7: { 
        const len = this.readInt()
        this.offset += len
        return null
      }
      case 8: 
        return this.readString()
      case 9: { 
        const elemType = this.readByte()
        const len = this.readInt()
        const list: any[] = []
        for (let i = 0; i < len; i++) {
          list.push(this.readTag(elemType))
        }
        return list
      }
      case 10: { 
        const compound: Record<string, any> = {}
        while (this.offset < this.buffer.length) {
          const tagType = this.readByte()
          if (tagType === 0) break 
          const name = this.readString()
          compound[name] = this.readTag(tagType)
        }
        return compound
      }
      case 11: { 
        const len = this.readInt()
        this.offset += len * 4
        return null
      }
      case 12: { 
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
      this.readString() 
      return this.readTag(10) || {}
    } catch (err) {
      return {}
    }
  }
}

class NbtWriter {
  private chunks: Buffer[] = []

  writeByte(val: number): void {
    const b = Buffer.alloc(1)
    b.writeInt8(val, 0)
    this.chunks.push(b)
  }

  writeShort(val: number): void {
    const b = Buffer.alloc(2)
    b.writeInt16BE(val, 0)
    this.chunks.push(b)
  }

  writeInt(val: number): void {
    const b = Buffer.alloc(4)
    b.writeInt32BE(val, 0)
    this.chunks.push(b)
  }

  writeString(str: string): void {
    const buf = Buffer.from(str, 'utf8')
    this.writeShort(buf.length)
    this.chunks.push(buf)
  }

  writeNamedTag(type: number, name: string): void {
    this.writeByte(type)
    this.writeString(name)
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks)
  }
}



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
    const socket = new Socket()
    let buffer = Buffer.alloc(0)
    let isResolved = false
    let requestSentTime = 0
    let firstByteLatency = -1
    let pingSentTime = 0
    let statusData: any = null

    const finish = (result: ServerPingStatus) => {
      if (isResolved) return
      isResolved = true
      socket.destroy()
      resolve(result)
    }

    const finishWithStatusData = (latency: number) => {
      if (!statusData) return
      let rawMotd = ''
      if (typeof statusData.description === 'string') {
        rawMotd = statusData.description
      } else if (statusData.description?.text) {
        rawMotd = statusData.description.text
      } else if (statusData.description?.extra) {
        rawMotd = statusData.description.extra.map((e: any) => e.text || '').join('')
      }

      const cleanMotd = stripMinecraftColors(rawMotd) || 'A Minecraft Server'

      finish({
        online: true,
        latencyMs: Math.max(1, latency),
        motd: rawMotd,
        cleanMotd,
        versionName: statusData.version?.name,
        protocolVersion: statusData.version?.protocol,
        players: statusData.players
          ? { online: statusData.players.online ?? 0, max: statusData.players.max ?? 0 }
          : undefined,
        favicon: statusData.favicon
      })
    }

    socket.setTimeout(timeoutMs)

    socket.on('timeout', () => {
      if (statusData) {
        finishWithStatusData(firstByteLatency > 0 ? firstByteLatency : 50)
      } else {
        finish({ online: false, latencyMs: -1, cleanMotd: "Can't connect to server" })
      }
    })

    socket.on('error', () => {
      if (statusData) {
        finishWithStatusData(firstByteLatency > 0 ? firstByteLatency : 50)
      } else {
        finish({ online: false, latencyMs: -1, cleanMotd: "Can't connect to server" })
      }
    })

    socket.connect(port, host, () => {
      try {
        const hostBuf = Buffer.from(host, 'utf8')
        const handshakePayload = Buffer.concat([
          writeVarInt(0x00),
          writeVarInt(47),
          writeVarInt(hostBuf.length),
          hostBuf,
          Buffer.from([(port >> 8) & 0xff, port & 0xff]),
          writeVarInt(1)
        ])

        const handshakePacket = Buffer.concat([
          writeVarInt(handshakePayload.length),
          handshakePayload
        ])

        const requestPacket = Buffer.from([0x01, 0x00])

        requestSentTime = Date.now()
        socket.write(Buffer.concat([handshakePacket, requestPacket]))
      } catch {
        finish({ online: false, latencyMs: -1, cleanMotd: "Can't connect to server" })
      }
    })

    socket.on('data', (chunk) => {
      if (firstByteLatency === -1 && requestSentTime > 0) {
        firstByteLatency = Math.max(1, Date.now() - requestSentTime)
      }

      buffer = Buffer.concat([buffer, chunk])

      try {
        const offset = { index: 0 }
        const packetLength = readVarInt(buffer, offset)
        if (packetLength <= 0) return

        const packetId = readVarInt(buffer, offset)

        if (packetId === 0 && !statusData) {
          const stringLength = readVarInt(buffer, offset)
          if (buffer.length >= offset.index + stringLength) {
            const jsonString = buffer.toString('utf8', offset.index, offset.index + stringLength)
            statusData = JSON.parse(jsonString)

            buffer = buffer.subarray(offset.index + stringLength)

            pingSentTime = Date.now()
            const pingPayload = Buffer.alloc(9)
            pingPayload.writeUInt8(0x01, 0)
            pingPayload.writeBigInt64BE(BigInt(pingSentTime), 1)
            const pingPacket = Buffer.concat([writeVarInt(pingPayload.length), pingPayload])
            socket.write(pingPacket)

            setTimeout(() => {
              finishWithStatusData(firstByteLatency > 0 ? firstByteLatency : 50)
            }, 400)
          }
        } else if (packetId === 1 && statusData) {
          const actualPing = pingSentTime > 0 ? Date.now() - pingSentTime : firstByteLatency
          finishWithStatusData(actualPing > 0 ? actualPing : firstByteLatency)
        }
      } catch {
      }
    })
  })
}



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

export async function writeServersDat(
  mcDir: string,
  servers: Array<{ name: string; ip: string; icon?: string; acceptTextures?: number }>
): Promise<void> {
  const writer = new NbtWriter()
  writer.writeNamedTag(10, '')
  writer.writeNamedTag(9, 'servers')
  writer.writeByte(10)
  writer.writeInt(servers.length)

  for (const s of servers) {
    writer.writeNamedTag(8, 'name')
    writer.writeString(s.name)
    writer.writeNamedTag(8, 'ip')
    writer.writeString(s.ip)
    if (s.icon) {
      const cleanIcon = s.icon.replace(/^data:image\/[a-z]+;base64,/, '')
      writer.writeNamedTag(8, 'icon')
      writer.writeString(cleanIcon)
    }
    if (typeof s.acceptTextures === 'number') {
      writer.writeNamedTag(1, 'acceptTextures')
      writer.writeByte(s.acceptTextures)
    }
    writer.writeByte(0)
  }

  writer.writeByte(0)
  const buffer = writer.toBuffer()

  await fs.mkdir(mcDir, { recursive: true })
  const serversDatPath = join(mcDir, 'servers.dat')
  await fs.writeFile(serversDatPath, buffer)
}

export async function addInstanceServer(
  instanceId: string,
  server: { name: string; ip: string }
): Promise<MinecraftServerEntry[]> {
  const configPath = getInstanceConfigPath(instanceId)
  const config = await readJsonFile<InstanceConfiguration>(configPath)
  if (!config) {
    throw new Error(`Instance ${instanceId} not found`)
  }

  const mcDir = getInstanceMinecraftPath(instanceId)
  const existing = await getInstanceServers(config)

  const normalizedIp = server.ip.trim()
  const normalizedName = server.name.trim() || normalizedIp

  const filtered = existing.filter(
    (s) =>
      s.ip.toLowerCase() !== normalizedIp.toLowerCase() &&
      `${s.ip}:${s.port}`.toLowerCase() !== normalizedIp.toLowerCase()
  )

  const updatedServers = [
    ...filtered.map((s) => ({
      name: s.name,
      ip: s.port && s.port !== 25565 ? `${s.ip}:${s.port}` : s.ip,
      icon: s.icon
    })),
    {
      name: normalizedName,
      ip: normalizedIp
    }
  ]

  await writeServersDat(mcDir, updatedServers)
  return await getInstanceServers(config)
}

export async function removeInstanceServer(
  instanceId: string,
  serverIp: string
): Promise<MinecraftServerEntry[]> {
  const configPath = getInstanceConfigPath(instanceId)
  const config = await readJsonFile<InstanceConfiguration>(configPath)
  if (!config) {
    throw new Error(`Instance ${instanceId} not found`)
  }

  const mcDir = getInstanceMinecraftPath(instanceId)
  const existing = await getInstanceServers(config)

  const normalizedTarget = serverIp.trim().toLowerCase()
  const remaining = existing.filter((s) => {
    const full = `${s.ip}:${s.port}`.toLowerCase()
    const single = s.ip.toLowerCase()
    return single !== normalizedTarget && full !== normalizedTarget
  })

  const updatedServers = remaining.map((s) => ({
    name: s.name,
    ip: s.port && s.port !== 25565 ? `${s.ip}:${s.port}` : s.ip,
    icon: s.icon
  }))

  await writeServersDat(mcDir, updatedServers)
  return await getInstanceServers(config)
}

export async function listInstanceServers(
  instanceId: string
): Promise<MinecraftServerEntry[]> {
  const configPath = getInstanceConfigPath(instanceId)
  const config = await readJsonFile<InstanceConfiguration>(configPath)
  if (!config) return []
  return await getInstanceServers(config)
}
