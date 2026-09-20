# Minecraft Launcher — Agent Implementation Plan

> Stack: Electron + TypeScript (ESM). Tauri/Rust is optional later. Start here since the dev already has Electron experience from Music4All.

---

## Project Overview

Build a custom Minecraft launcher with:

- All vanilla MC versions
- Mod loader support: Fabric, Quilt, Forge, NeoForge, LiteLoader
- Integrated mod browser: Modrinth + CurseForge in one UI
- Microsoft OAuth authentication
- Java auto-management
- Instance isolation (each instance = its own folder)

---

## Repository Structure

```
launcher/
├── src/
│   ├── main/                    # Electron main process (Node.js)
│   │   ├── index.ts             # Entry point, BrowserWindow setup
│   │   ├── ipc/                 # IPC handlers (bridge to renderer)
│   │   │   ├── auth.ts
│   │   │   ├── instances.ts
│   │   │   ├── install.ts
│   │   │   ├── launch.ts
│   │   │   └── mods.ts
│   │   ├── core/                # All launcher logic
│   │   │   ├── auth/
│   │   │   │   └── microsoft.ts
│   │   │   ├── meta/
│   │   │   │   └── prism.ts     # Fetches from meta.prismlauncher.org
│   │   │   ├── minecraft/
│   │   │   │   ├── assets.ts
│   │   │   │   ├── libraries.ts
│   │   │   │   └── launcher.ts  # Builds JVM args, spawns Java process
│   │   │   ├── loaders/
│   │   │   │   ├── fabric.ts
│   │   │   │   ├── quilt.ts
│   │   │   │   ├── forge.ts
│   │   │   │   └── neoforge.ts
│   │   │   ├── java/
│   │   │   │   └── runtime.ts   # Download + manage Java runtimes
│   │   │   └── mods/
│   │   │       ├── modrinth.ts
│   │   │       └── curseforge.ts
│   │   └── utils/
│   │       ├── download.ts      # Downloader with progress + hash verify
│   │       ├── fs.ts            # File system helpers
│   │       └── zip.ts           # ZIP extraction helper
│   ├── renderer/                # Electron renderer process (UI)
│   │   ├── index.html
│   │   ├── app.ts
│   │   └── pages/
│   │       ├── Home.ts
│   │       ├── Instances.ts
│   │       ├── ModBrowser.ts
│   │       └── Settings.ts
│   └── shared/
│       └── types.ts             # Shared TS types between main + renderer
├── package.json
├── tsconfig.json
└── electron-builder.json
```

---

## Data Directories (Runtime)

```
~/.launcher/                     # Or %APPDATA%\launcher on Windows
├── instances/
│   └── <instance-name>/
│       ├── instance.json        # Instance config
│       └── minecraft/           # Actual .minecraft folder
│           ├── mods/
│           ├── saves/
│           └── config/
├── libraries/                   # Shared MC libraries cache
├── assets/                      # Shared MC assets cache
├── java/                        # Managed Java runtimes
│   ├── java-8/
│   ├── java-17/
│   └── java-21/
└── meta-cache/                  # Cached JSON from Prism meta server
```

---

## Phase 1 — Foundation

**Goal:** Electron shell + config system + basic UI skeleton.

### Tasks

- [ ] Init Electron project with TypeScript + ESM
- [ ] Set up `electron-builder` for packaging
- [ ] Create main window with basic routing between pages
- [ ] Set up IPC bridge pattern (main ↔ renderer via `contextBridge`)
- [ ] Implement `~/.launcher/` directory structure creation on first launch
- [ ] Define `Instance` type in `shared/types.ts`:
  ```ts
  type Instance = {
    id: string;
    name: string;
    mcVersion: string;
    loader: "vanilla" | "fabric" | "quilt" | "forge" | "neoforge";
    loaderVersion: string | null;
    javaPath: string | null;
    jvmArgs: string[];
    ram: number; // MB
    createdAt: string;
  };
  ```
- [ ] Save/load instances from `instances/<id>/instance.json`

---

## Phase 2 — Microsoft Authentication

**Goal:** Full Microsoft OAuth → Minecraft token flow.

### The Token Chain (must implement in this order)

1. Open Microsoft OAuth URL in a dedicated `BrowserWindow` (not shell)
2. Capture the `code` from the redirect URL (`https://login.microsoftonline.com/...`)
3. Exchange `code` for Microsoft access token + refresh token
4. POST to XBox Live (`https://user.auth.xboxlive.com/user/authenticate`) with the MS token → get XBL token + UserHash
5. POST to XSTS (`https://xsts.auth.xboxlive.com/xsts/authorize`) with XBL token → get XSTS token
6. POST to Minecraft (`https://api.minecraftservices.com/authentication/login_with_xbox`) with XSTS token + UserHash → get Minecraft access token
7. GET `https://api.minecraftservices.com/minecraft/profile` with the MC token → get UUID + username
8. Store all tokens encrypted in `~/.launcher/auth.json`
9. On startup: check token expiry, use refresh token to silently re-auth

### Files

- `src/main/core/auth/microsoft.ts` — full token chain
- `src/main/ipc/auth.ts` — IPC handlers: `auth:login`, `auth:logout`, `auth:status`

### Notes

- Reference: `wiki.vg/Microsoft_Authentication_Scheme` — this is the canonical doc
- Never store the Microsoft password, only OAuth tokens
- Refresh token is valid for 90 days

---

## Phase 3 — Minecraft Metadata + Vanilla Launch

**Goal:** Download and launch vanilla Minecraft for any version.

### 3a — Version Metadata

- [ ] Fetch version manifest from:
      `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json`
- [ ] Cache it in `meta-cache/mojang/version_manifest.json`
- [ ] For a chosen version, fetch its version JSON (URL is inside the manifest)
  - Contains: `libraries`, `downloads` (client jar), `assetIndex`, `mainClass`, `arguments`
- [ ] Parse and store locally

### 3b — Asset Download

- [ ] From version JSON, get `assetIndex.url` → download the asset index JSON
- [ ] Asset index contains a map of `{ "path": { "hash": "...", "size": ... } }` for all game assets
- [ ] Download each asset to `assets/objects/<first2ofhash>/<hash>`
- [ ] Use SHA1 hash to verify each file before saving

### 3c — Library Download

- [ ] From version JSON `libraries` array: filter by OS rules, download each JAR
- [ ] Verify SHA1 for each
- [ ] Store at `libraries/<maven-path>` (convert Maven coordinates to path)
- [ ] Handle native libraries (extract `.dll`/`.so`/`.dylib` to a `natives/` temp folder)

### 3d — Client JAR

- [ ] Download `client.jar` from version JSON `downloads.client`
- [ ] Store at `libraries/com/mojang/minecraft/<version>/minecraft-<version>-client.jar`

### 3e — Launch

- [ ] Find correct Java for the MC version:
  - MC < 1.17 → Java 8
  - MC 1.17 → Java 16
  - MC 1.18–1.20.4 → Java 17
  - MC >= 1.20.5 → Java 21
- [ ] Build JVM arguments from version JSON `arguments.jvm` (or `minecraftArguments` for legacy < 1.13)
- [ ] Build game arguments from version JSON `arguments.game`
- [ ] Replace template variables: `${auth_player_name}`, `${auth_uuid}`, `${auth_access_token}`, `${game_directory}`, `${assets_root}`, `${assets_index_name}`, `${version_name}`, `${version_type}`, `${natives_directory}`, `${classpath}`
- [ ] Build classpath: all library JARs + client JAR joined by `:` (or `;` on Windows)
- [ ] Spawn Java subprocess: `java [jvmArgs] -cp [classpath] [mainClass] [gameArgs]`
- [ ] Stream stdout/stderr back to renderer via IPC for the console log view

---

## Phase 4 — Prism Meta Server Integration

**Goal:** Use Prism's metadata pipeline to get loader versions without touching Forge Maven directly.

### How Prism Meta Works

- Base URL: `https://meta.prismlauncher.org/v1/`
- `GET /index.json` → list of all available component UIDs with SHA256
- `GET /<uid>/index.json` → list of all versions for that component
- `GET /<uid>/<version>.json` → full version JSON for that specific component version

### UIDs to Use

| Loader    | UID                          |
| --------- | ---------------------------- |
| Minecraft | `net.minecraft`              |
| Fabric    | `net.fabricmc.fabric-loader` |
| Quilt     | `org.quiltmc.quilt-loader`   |
| Forge     | `net.minecraftforge`         |
| NeoForge  | `net.neoforged`              |
| Java      | `net.minecraft.java`         |

### Files

- `src/main/core/meta/prism.ts`
  - `fetchIndex()` → returns all UIDs
  - `fetchComponentVersions(uid)` → returns version list for that loader
  - `fetchVersionJson(uid, version)` → returns the full component JSON
  - Cache all responses in `meta-cache/` with TTL (e.g. 1 hour)

### The Component JSON Format

Each component JSON has:

```json
{
  "uid": "net.fabricmc.fabric-loader",
  "version": "0.15.11",
  "requires": [{ "uid": "net.minecraft" }],
  "libraries": [...],
  "mainClass": "...",
  "releaseTime": "..."
}
```

Merge the loader component JSON on top of the base MC version JSON to get the final launch config.

---

## Phase 5 — Mod Loader Installation

**Goal:** Install Fabric, Quilt, Forge, and NeoForge into an instance.

### Fabric & Quilt (Easy)

- [ ] Fetch the loader component JSON from Prism meta (Phase 4)
- [ ] Merge with the base MC version JSON:
  - Combine `libraries` arrays
  - Replace `mainClass` with loader's mainClass
  - Merge `arguments`
- [ ] Save merged JSON as the instance's launch config
- [ ] Done — no separate installer step needed

### Forge & NeoForge (Complex)

Prism meta handles the hard part for you. Their server has already processed the installer JARs.

- [ ] Fetch `net.minecraftforge` or `net.neoforged` version JSON from Prism meta
- [ ] The JSON contains a `+forge` style entry with `install` data and post-processors
- [ ] Download all listed libraries
- [ ] Run the processors: these are Java JARs listed in the component JSON under `+forge`
  - Spawn each processor as a Java subprocess with the listed args
  - Processors do the binary patching, mapping remapping, etc.
  - ForgeWrapper (maintained by Prism) handles the heavy lifting — it is listed as a library
- [ ] After processors complete, the instance is ready to launch normally
- [ ] For Forge/NeoForge launch: the mainClass will be `io.github.zekerzhayard.forgewrapper.installer.Main` (ForgeWrapper) which bootstraps Forge's own main class

### Files

- `src/main/loaders/fabric.ts` — fetchAndMerge(mcVersion, loaderVersion)
- `src/main/loaders/quilt.ts` — same pattern as fabric
- `src/main/loaders/forge.ts` — fetchAndInstall(mcVersion, loaderVersion)
- `src/main/loaders/neoforge.ts` — same pattern as forge

---

## Phase 6 — Java Runtime Management

**Goal:** Auto-download and manage the right Java for each MC version. Never ask the user to install Java.

### Mojang Java Runtimes API

- Mojang hosts their own JRE builds for all platforms
- Fetch: `https://piston-meta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json`
- Returns available runtimes by platform: `java-runtime-alpha` (Java 16), `java-runtime-beta` (Java 17), `java-runtime-gamma` (Java 17.0.3+), `java-runtime-delta` (Java 17), `java-runtime-gamma-snapshot`, `jre-legacy` (Java 8)

### Version → Runtime Mapping

```ts
function getRuntimeForVersion(mcVersion: string): string {
  // Compare semver
  if (mcVersion < "1.17") return "jre-legacy"; // Java 8
  if (mcVersion < "1.18") return "java-runtime-alpha"; // Java 16
  if (mcVersion < "1.20.5") return "java-runtime-gamma"; // Java 17
  return "java-runtime-delta"; // Java 21
}
```

### Files

- `src/main/core/java/runtime.ts`
  - `ensureJava(mcVersion)` → checks if correct Java exists in `~/.launcher/java/`, downloads if not
  - `getJavaPath(mcVersion)` → returns path to `java` binary

---

## Phase 7 — Mod Browser (Modrinth + CurseForge)

**Goal:** Single unified mod browser that searches both platforms, filters by MC version and loader.

### Modrinth API

- Base: `https://api.modrinth.com/v2/`
- No API key needed for read-only use
- Key endpoints:
  - `GET /search?query=<q>&facets=[["categories:<loader>"],["versions:<mcVersion>"],["project_type:mod"]]`
  - `GET /project/<id>` — full mod info
  - `GET /project/<id>/version?loaders=["fabric"]&game_versions=["1.20.1"]` — get versions
- Response has `files[0].url` for direct download, `files[0].hashes.sha512` for verification

### CurseForge API

- Base: `https://api.curseforge.com/v1/`
- Requires API key — get a free key at `console.curseforge.com`
- Store key in launcher settings, never hardcode
- Key endpoints:
  - `GET /mods/search?gameId=432&searchFilter=<q>&modLoaderType=<loaderEnum>&gameVersion=<mcVersion>`
  - Loader enum: Forge=1, Fabric=4, Quilt=5, NeoForge=6
  - `GET /mods/<id>/files` — get available versions
  - File objects include `downloadUrl` and `fileFingerprint`

### Unified Layer

- `src/main/core/mods/modrinth.ts` and `curseforge.ts` each implement the same interface:
  ```ts
  interface ModProvider {
    search(
      query: string,
      mcVersion: string,
      loader: string,
    ): Promise<ModResult[]>;
    getVersions(
      modId: string,
      mcVersion: string,
      loader: string,
    ): Promise<ModVersion[]>;
    download(version: ModVersion, targetPath: string): Promise<void>;
  }
  ```
- The IPC handler in `mods.ts` calls both providers, merges results, deduplicates by name

### Mod Installation

- [ ] Download JAR to `instances/<id>/minecraft/mods/<filename>`
- [ ] Verify hash after download
- [ ] Store installed mod metadata in `instances/<id>/mods.json`:
  ```json
  [
    {
      "name": "...",
      "version": "...",
      "source": "modrinth",
      "id": "...",
      "filename": "..."
    }
  ]
  ```

---

## Phase 8 — UI

**Goal:** Clean, dark-themed launcher UI. Reference Music4All's dark sidebar UI pattern.

### Pages

- **Home** — recent instances, quick launch buttons, news feed (optional)
- **Instances** — grid/list of instances, create new, edit, delete, launch
- **Instance Detail** — mod list, loader info, java settings, per-instance RAM
- **Mod Browser** — search bar, loader/version filters, tabbed Modrinth/CurseForge or unified, install button
- **Settings** — global Java path override, CurseForge API key, RAM defaults, accounts

### IPC Contract (main ↔ renderer)

All IPC calls use `ipcMain.handle` / `ipcRenderer.invoke` pattern:

```
auth:login          → opens OAuth window, returns { username, uuid }
auth:logout         → clears stored tokens
auth:status         → returns current account or null

instances:list      → returns Instance[]
instances:create    → takes Instance config, returns id
instances:delete    → takes id
instances:launch    → takes id, returns void (streams logs via auth:log event)

install:fabric      → { instanceId, mcVersion, loaderVersion }
install:forge       → { instanceId, mcVersion, loaderVersion }
install:neoforge    → { instanceId, mcVersion, loaderVersion }
install:quilt       → { instanceId, mcVersion, loaderVersion }

mods:search         → { query, mcVersion, loader, source: 'all'|'modrinth'|'curseforge' }
mods:install        → { instanceId, modVersion }
mods:list           → { instanceId } → ModEntry[]
mods:remove         → { instanceId, filename }

meta:mcVersions     → returns string[] of available MC versions
meta:loaderVersions → { loader, mcVersion } → string[]
```

---

## Phase 9 — Download Manager

**Goal:** Concurrent downloads with progress reporting, hash verification, retry logic.

### Requirements

- Download multiple files in parallel (limit to ~10 concurrent)
- Verify SHA1/SHA256/SHA512 after download depending on source
- Resume interrupted downloads (check file exists + correct size)
- Report progress per-file and overall via IPC events to renderer

### File

- `src/main/utils/download.ts`
  - `downloadFile(url, dest, expectedHash, hashAlgo)` — single file
  - `downloadBatch(tasks: DownloadTask[])` — concurrent with queue
  - Emits `download:progress` IPC events with `{ file, bytesReceived, totalBytes, overall }`

---

## Implementation Order

```
Phase 1  →  Phase 2  →  Phase 3  →  Phase 4  →  Phase 5 (Fabric first)
                                                         ↓
Phase 8 (UI built alongside)   ←   Phase 7   ←   Phase 6
                                                         ↓
                                              Phase 5 (Forge/NeoForge)
                                              Phase 9 (Download manager — integrate early)
```

Start Phase 9 (download manager) during Phase 3 since assets require it immediately.

---

## Key External References

| Resource                               | URL                                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Mojang version manifest                | `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json`                                           |
| Prism meta server                      | `https://meta.prismlauncher.org/v1/`                                                                        |
| Prism meta source (Python scripts)     | `https://github.com/PrismLauncher/meta`                                                                     |
| Prism meta-launcher (processed output) | `https://github.com/PrismLauncher/meta-launcher`                                                            |
| Modrinth API docs                      | `https://docs.modrinth.com/`                                                                                |
| CurseForge API console                 | `https://console.curseforge.com/`                                                                           |
| Microsoft Auth flow                    | `https://wiki.vg/Microsoft_Authentication_Scheme`                                                           |
| Launcher spec (how version JSONs work) | `https://wiki.vg/Game_files`                                                                                |
| Mojang Java runtimes                   | `https://piston-meta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json` |

---

## Key Constraints for the Agent

- All file paths must be OS-aware. Use `path.join()` everywhere, never string concat paths.
- All downloads must be verified with their hash before the file is used.
- Java subprocess must be spawned with correct working directory set to the instance's `.minecraft/` folder.
- IPC handlers in main process must never throw uncaught exceptions — wrap everything in try/catch and send structured error responses.
- The renderer process has no direct filesystem or network access — all such operations go through IPC.
- Tokens stored on disk must use Electron's `safeStorage` API for encryption.
- Never hardcode the CurseForge API key — read from user settings.
- Prism meta responses should be cached to disk with a TTL — don't hit the API on every UI refresh.
- Instance directories are fully isolated — one instance's mods folder never affects another.
