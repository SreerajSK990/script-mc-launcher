# Script Minecraft Launcher — Agent & Developer Handbook

Official guidelines, architecture standards, coding conventions, Git workflow, README synchronization, and release publishing rules for **Script Minecraft Launcher**.

---

## 1. Project Overview & Philosophy

Script Minecraft Launcher is a modern, high-performance, isolated Minecraft launcher built with **Electron**, **React 19**, **TypeScript (ESM)**, and **Tailwind CSS**.

### Core Tenets
1. **Zero Bloat & Peak Performance:** Ultra-fast startup, low RAM footprint, native OS responsiveness.
2. **Absolute Instance Isolation:** Every instance lives in its own sandboxed folder (`instances/<id>/minecraft/`). One instance's mods, configs, saves, or versions never pollute another.
3. **No Forced Dependencies:** Auto-manages official Mojang Java runtimes (Java 8, 16, 17, 21) silently in the background. Users never have to install Java manually.
4. **Clean, Modern Visuals:** Cyber-industrial dark UI with Lucide SVG icons, glassmorphism panels, and full-screen data density. No clumsy 2010 Java Swing windows or ad banners.
5. **Open Ecosystem:** Native support for all major mod loaders (Fabric, Quilt, Forge, NeoForge, Vanilla), direct unified mod & modpack browsing (Modrinth + CurseForge), multiplayer server management, 3D skin viewer, and Discord Rich Presence.

---

## 2. Architecture & Directory Structure

The project follows a strict three-tier Electron architecture: **Main Process**, **Preload Bridge**, and **Renderer Process**, backed by a shared type and constant system.

```
script-mc-launcher/
├── src/
│   ├── main/                            # Electron Main Process (Node.js runtime)
│   │   ├── index.ts                     # App lifecycle, single-instance lock, window manager
│   │   ├── ipc/                         # IPC handler registrations (bridge endpoints)
│   │   │   ├── auth.ts                  # Microsoft OAuth & offline account handlers
│   │   │   ├── instances.ts             # CRUD, folder opening, duplicate, export
│   │   │   ├── install.ts               # Loader installation handlers
│   │   │   ├── launch.ts                # Game launch, process supervision, kill
│   │   │   ├── mods.ts                  # Mod search, toggle, delete, version switch
│   │   │   ├── modpacks.ts              # Modpack archive & online install
│   │   │   ├── servers.ts               # Multiplayer servers.dat reader/writer & pinger
│   │   │   ├── screenshots.ts           # Screenshots gallery scanner & clipboard
│   │   │   ├── cloner.ts                # External launcher detection & deep cloner
│   │   │   ├── meta.ts                  # Mojang & Prism metadata handlers
│   │   │   ├── system.ts                # System specs & memory detection
│   │   │   ├── discordRpc.ts            # Discord Rich Presence IPC bridge
│   │   │   ├── updater.ts               # Auto-updater check & install handlers
│   │   │   └── register.ts              # Central registry initializing all IPC handlers
│   │   ├── core/                        # Launcher core business logic
│   │   │   ├── auth/                    # OAuth window, Xbox Live, XSTS, tokens, DPAPI encryption
│   │   │   ├── importers/               # Deep cloner for Prism, Modrinth, CurseForge, Vanilla
│   │   │   ├── java/                    # Mojang JRE API client, runtime auto-downloader
│   │   │   ├── loaders/                 # Fabric, Quilt, Forge, NeoForge resolvers
│   │   │   ├── meta/                    # Mojang manifest & Prism Meta client (disk cache + TTL)
│   │   │   ├── minecraft/               # Assets, libraries, natives, JVM args, Java spawner
│   │   │   ├── modpacks/                # .mrpack & .zip manifest parser, override extractor
│   │   │   ├── mods/                    # Modrinth API, CurseForge API, local mod manager
│   │   │   └── servers/                 # NBT parser/writer for servers.dat & TCP pinger
│   │   ├── services/                    # Stateful singleton services
│   │   │   ├── instances.ts             # Instance state manager & config writer
│   │   │   ├── auth.ts                  # Active account session manager
│   │   │   ├── launch.ts                # Active process manager & log broadcaster
│   │   │   ├── discordRpc.ts            # Discord RPC client lifecycle & presence formatter
│   │   │   ├── paths.ts                 # Launcher data directories resolver
│   │   │   └── system.ts                # Host RAM and CPU detector
│   │   └── utils/                       # Low-level utilities
│   │       ├── download.ts              # Concurrency-limited batch downloader + hash verify
│   │       ├── fs.ts                    # Safe atomic file writer, directory copy/clean
│   │       └── zip.ts                   # Zip extractor & archive tools
│   ├── preload/                         # Secure Preload Scripts
│   │   └── index.ts                     # contextBridge exposing window.launcherAPI
│   ├── renderer/                        # Electron Renderer Process (React 19 UI)
│   │   ├── index.html                   # Shell HTML
│   │   └── src/
│   │       ├── App.tsx                  # Root layout, router, tab state, global modals
│   │       ├── main.tsx                 # React entry point
│   │       ├── index.css                # Tailwind directives & global styling
│   │       ├── components/              # Reusable UI components
│   │       │   ├── TitleBar.tsx         # Frameless window drag region & window controls
│   │       │   ├── Sidebar.tsx          # Main navigation bar with active badges
│   │       │   ├── InstanceCard.tsx     # Instance tile with status, loader badge, launch
│   │       │   ├── Toast.tsx            # Floating notification alerts
│   │       │   └── modals/              # CreateInstance, EditInstance, AddServer, etc.
│   │       └── pages/                   # Main view pages
│   │           ├── Dashboard.tsx        # Quick launch, recent instances, stats
│   │           ├── Instances.tsx        # Instance grid/list, filter, search, actions
│   │           ├── InstanceDetail.tsx   # Per-instance RAM, JVM flags, mods, servers, screenshots
│   │           ├── ModBrowser.tsx       # Modrinth + CurseForge browser with installed status
│   │           ├── SkinStudio.tsx       # Interactive 3D skin viewer & preset applicator
│   │           ├── Logs.tsx             # Live streaming console log viewer
│   │           └── Settings.tsx         # Global JVM memory, custom paths, updater, accounts
│   └── shared/                          # Shared Types & Constants (Isomorphic)
│       ├── constants/
│       │   ├── channels.ts              # IPC channel string constants
│       │   └── defaults.ts              # Default memory, launcher version, API endpoints
│       └── types/
│           ├── instance.ts              # Instance, loader types, memory configs
│           ├── auth.ts                  # UserAccount, AuthProfile, token payloads
│           ├── launch.ts                # LaunchState, LaunchProgress, LogEntry
│           ├── mods.ts                  # Mod, ModVersion, Modpack, InstalledMod
│           ├── servers.ts               # ServerEntry, ServerPingResult
│           ├── discord.ts               # Discord presence payload & page types
│           ├── cloner.ts                # DetectedLauncher, ImportableInstance
│           └── ipc.ts                   # Strongly typed LauncherAPI interface
├── scripts/
│   └── test-services.mjs                # Automated standalone sandbox test suite
├── electron.vite.config.ts              # Vite configuration for main, preload, and renderer
├── electron-builder.json                # Packaging configuration (NSIS, portable, icons)
├── package.json                         # Dependencies and build scripts
└── tsconfig.json                        # Root TypeScript configuration
```

---

## 3. Data Directories & Sandboxing

All user data is stored strictly in the launcher's root data directory:
- **Windows:** `%APPDATA%\script-launcher\`
- **Linux:** `~/.config/script-launcher/`
- **macOS:** `~/Library/Application Support/script-launcher/`

### Subdirectory Structure
```
<data-dir>/
├── instances/
│   └── <instance-id>/
│       ├── instance.json                # Instance metadata, memory, loader config
│       ├── mods.json                    # Managed mod metadata (version, source, hash)
│       └── minecraft/                   # Isolated Minecraft game directory
│           ├── mods/                    # Active .jar and disabled .jar.disabled
│           ├── config/                  # Mod configuration files
│           ├── saves/                   # Singleplayer worlds
│           ├── resourcepacks/           # Resource packs
│           ├── shaderpacks/             # Shader packs
│           ├── screenshots/             # In-game captures
│           └── servers.dat              # Multiplayer server list (NBT format)
├── libraries/                           # Shared Minecraft & loader library cache
├── assets/                              # Shared vanilla Minecraft assets
│   ├── indexes/                         # Asset index JSON manifests
│   └── objects/                         # 2-character prefix hash directories
├── java/                                # Managed Mojang Java runtimes
│   ├── jre-legacy/                      # Java 8 (MC < 1.17)
│   ├── java-runtime-alpha/              # Java 16 (MC 1.17)
│   ├── java-runtime-gamma/              # Java 17 (MC 1.18 - 1.20.4)
│   └── java-runtime-delta/              # Java 21 (MC >= 1.20.5)
├── meta-cache/                          # Cached Mojang & Prism JSON manifests with TTL
├── auth.json                            # Encrypted OAuth tokens (DPAPI safeStorage)
└── logs/                                # Launcher operational logs
```

---

## 4. Coding Standards & Cleanliness

### Rule 1: STRICT ZERO COMMENTS
**Never write code comments anywhere in the codebase.**
- Prohibited: Single-line `//`, multi-line `/* ... */`, and JSX `{/* ... */}` comments.
- Applies across all files: TypeScript, TSX, JavaScript, CSS, HTML, and JSON.
- Code must be clean and self-documenting. Use descriptive function names, explicit variable names, and clear control flow instead of explanatory comments.
- Do not keep commented-out dead code. If code is unused or deprecated, delete it cleanly.

### Rule 2: Strict TypeScript & Type Safety
- Never use `any` unless required for low-level third-party CJS/ESM interop. Wrap untyped interfaces in typed adapters immediately.
- Every IPC channel and payload must have matching types in `src/shared/types/` and string constants in `src/shared/constants/channels.ts`.
- Maintain strict null checks (`strict: true` in `tsconfig.json`). Safely handle `null` and `undefined` using optional chaining (`?.`) and nullish coalescing (`??`).

### Rule 3: Process Isolation & Security
- **Main Process:** Sole owner of filesystem, network requests, child processes, and OS APIs. Never pass raw Node.js modules (`fs`, `child_process`, `net`) to the renderer.
- **Preload Bridge:** Use `contextBridge.exposeInMainWorld('launcherAPI', ...)` exclusively. Keep preload strictly typed, safe, and minimal.
- **Renderer Process:** Runs with web sandboxing (`contextIsolation: true`, `nodeIntegration: false`). The renderer only accesses functionality through `window.launcherAPI.<domain>.<method>()`.

### Rule 4: Exception Handling & App Stability
- IPC handlers in the main process must **never throw uncaught exceptions** that could crash the application.
- Always wrap IPC implementations in `try/catch` blocks and return structured responses (e.g. `{ success: true, ... }` or `{ success: false, error: error.message }`).
- Handle network drops, slow connections, and corrupted manifests gracefully with automatic retries or descriptive user error messages.

### Rule 5: File Operations & Path Handling
- Always use Node's `path.join()` or `path.resolve()` for filesystem paths. Never concatenate paths with `+ '/'` or `+ '\\'`.
- All writes to critical files (`instance.json`, `auth.json`, `mods.json`, `servers.dat`) must be atomic: write to a temporary file in the same directory first, then rename it over the target to prevent data corruption.
- Always verify file integrity using checksum hashes (SHA-1 for Mojang assets and client jars, SHA-512 for Modrinth files).

---

## 5. Mod Loader & Metadata Pipelines

### Mojang Metadata
- Manifest: `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json`
- Cache locally in `meta-cache/mojang/version_manifest.json` with a 1-hour TTL.
- Parse version JSON to extract libraries, client download URL, asset index, main class, and JVM/game argument rules.

### Prism Meta Server
- Base URL: `https://meta.prismlauncher.org/v1/`
- Component UIDs:
  - Minecraft: `net.minecraft`
  - Fabric: `net.fabricmc.fabric-loader`
  - Quilt: `org.quiltmc.quilt-loader`
  - Forge: `net.minecraftforge`
  - NeoForge: `net.neoforged`
- Fabric & Quilt: Merge loader libraries, replace `mainClass`, and inject loader arguments on top of the base Minecraft configuration.
- Forge & NeoForge: Bootstrapped via Prism's `ForgeWrapper` library (`io.github.zekerzhayard.forgewrapper.installer.Main`).

### Mojang Java Runtime API
- Endpoint: `https://piston-meta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json`
- Map Minecraft versions to runtimes:
  - `< 1.17` → `jre-legacy` (Java 8)
  - `1.17` → `java-runtime-alpha` (Java 16)
  - `1.18` to `1.20.4` → `java-runtime-gamma` (Java 17)
  - `>= 1.20.5` → `java-runtime-delta` (Java 21)

---

## 6. Git Workflow & Quality Assurance

### Branching Policy
- `main` is the production branch. It must remain fully buildable, type-clean, and functional at all times.
- All changes must be verified before pushing to `main`.

### Pre-Commit Verification Checklist
Before committing and pushing changes, run the following verification pipeline in order:

```bash
npm run typecheck
npm test
npm run build
```

Every command must succeed with 0 errors before creating a commit.

### Commit Message Conventions
Use clear, concise, imperative conventional commit messages:
- `feat: add multiplayer server ping and quick join`
- `fix: resolve race condition in modpack override extraction`
- `refactor: optimize concurrent download queue throttling`
- `chore: bump version to 0.10.0 and update dependencies`
- `docs: update readme with discord rich presence highlights`

---

## 7. README Maintenance Standards

`README.md` is the primary public storefront and documentation hub for the project. Keep it strictly synchronized with codebase changes:

1. **Feature Highlights:** When a new capability is added (e.g. Server Management, Skin Studio, Discord RPC), document it thoroughly in the Highlights section with concise bullet points explaining real user value.
2. **Roadmap Tracking:** Every completed milestone or major feature must have its corresponding checkbox marked `[x]` in the Roadmap section immediately.
3. **Repository Tree:** Keep the directory tree diagram in the README accurate if directories are reorganized.
4. **Prerequisites & Commands:** Keep prerequisites, scripts, and build instructions fully verified.
5. **Tone:** Keep the tone confident, clean, informative, and human-crafted. Avoid marketing fluff or buzzwords.

---

## 8. Release Process & Publishing Style

### Release Preparation Flow
1. **Version Bump:** Update the version string in:
   - `package.json` (`"version": "X.Y.Z"`)
   - `src/shared/constants/defaults.ts` (`DEFAULT_LAUNCHER_VERSION = 'X.Y.Z'`)
2. **Build Production Executables:**
   ```bash
   npm run package
   ```
   This executes `electron-vite build` followed by `electron-builder`, outputting artifacts into `dist/`.
3. **Verify Build Artifacts in `dist/`:**
   - Setup Installer: `Script-Minecraft-Launcher-Setup-X.Y.Z.exe`
   - Blockmap file: `Script-Minecraft-Launcher-Setup-X.Y.Z.exe.blockmap`
   - Portable binary: `Script.Minecraft.Launcher.X.Y.Z.exe`
   - Auto-updater manifest: `latest.yml`
4. **Git Commit & Push:**
   ```bash
   git add .
   git commit -m "chore: release vX.Y.Z"
   git push origin main
   ```
5. **Publish GitHub Release:**
   Use GitHub CLI (`gh release create`) to publish the release tag:
   ```bash
   gh release create vX.Y.Z \
     dist/Script-Minecraft-Launcher-Setup-X.Y.Z.exe \
     dist/Script-Minecraft-Launcher-Setup-X.Y.Z.exe.blockmap \
     dist/Script.Minecraft.Launcher.X.Y.Z.exe \
     dist/latest.yml \
     --title "Script Minecraft Launcher vX.Y.Z" \
     --notes-file <release-notes-path>
   ```

### Release Notes Style Guide (STRICT)
- **Authentic Human Voice:** Write in a natural, friendly, dev-to-user conversational tone.
- **STRICTLY NO AI EMOJIS:** Do not use rocket emojis, sparkle emojis, fire emojis, or robotic AI formatting in release notes (e.g. no 🚀, ✨, 🔥, 🌟, 🎉). Keep it professional, genuine, and clean.
- **Structured Sections:**
  - **Greeting & Overview:** Brief warm intro stating what this version brings.
  - **What is new in this release:** High-level overview of new features and capabilities.
  - **Improvements & Fixes:** Polish, performance improvements, bug fixes, or stability enhancements.
  - **Downloads Guide:** Clear breakdown explaining:
    - `Script-Minecraft-Launcher-Setup-X.Y.Z.exe`: Recommended installer with desktop shortcuts and seamless background auto-updating.
    - `Script.Minecraft.Launcher.X.Y.Z.exe`: Standalone portable version that runs without installation.
- **No Duplicate Assets:** Never upload redundant files with conflicting naming conventions (e.g. do not upload both dotted and hyphenated filenames for the same binary). Always keep the asset set clean and matching `latest.yml`.
