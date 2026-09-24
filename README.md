# Script Minecraft Launcher

A fast, sleek, and modular Minecraft launcher built with **Electron**, **React**, **TypeScript**, and **Tailwind CSS**.

Most Minecraft launchers out there either look like they're stuck in 2010 with clunky Java Swing windows, or they're bloated with electron bloatware and ads. Script Launcher is built to be fast, clean, and completely isolated so your mod setups and game versions never conflict with each other.

---

## Highlights

- **Complete Instance Isolation:** Every instance has its own dedicated directory (`instances/<id>/minecraft/`). Mods, configs, resource packs, and saves stay strictly inside that instance. No shared messy `.minecraft` folder.
- **Snapshots & Historical Minecraft Versions:** Full access to all official development snapshots, Release Candidates, Pre-releases, and historical Beta and Alpha versions alongside stable releases. Built-in version-type filters in the instance creation modal and smart loader compatibility warnings.
- **All Major Mod Loaders Supported:**
  - **Vanilla** (all releases and legacy versions)
  - **Fabric** (auto-configured with KnotClient)
  - **Quilt** (full Quilt Loader support)
  - **Forge** (bootstrapped with Prism ForgeWrapper)
  - **NeoForge** (modern 1.20.4+ Forge fork support)
- **Automatic Mojang Java Runtimes:** Never worry about installing Java manually again. The launcher talks directly to Mojang's official JRE API and auto-downloads the exact right Java version for your game (Java 8 for old versions, Java 17 for 1.18–1.20.4, Java 21 for 1.20.5+) right into `.scriptlauncher/java/`.
- **Integrated Mod Browser (Modrinth + CurseForge):**
  - Search thousands of mods on Modrinth with zero API keys or setup needed.
  - Optional CurseForge API integration if you have an API key.
  - Automatically filters mods to match your selected instance's Minecraft version and mod loader.
  - **Rate-Safe Infinite Scrolling:** Smooth catalog browsing powered by `IntersectionObserver` with automated pre-fetching, concurrency guards, debounce protection, and a memory safety cap; browse deeply without arbitrary page limits.
  - **Live "Installed" Status Badges:** Mod cards in Mod Browser automatically indicate when a mod is already installed in the selected instance with a clean green status badge.
  - **In-App Version Switching:** Change or upgrade any mod's version directly from the Instance Details mods tab or the Mod Browser with one click; automatically removes old `.jar` / `.jar.disabled` files and updates configurations.
  - **Enhanced Version Listing & Web Downloads:** All mod releases are preserved including files where authors restrict automated 3rd-party downloads (`downloadUrl: null`). Displays a one-click **"Download on Web"** button with browser redirection to the exact CurseForge or Modrinth release page, accompanied by an inline **"Mods Folder"** shortcut to drop downloaded `.jar` files in with zero hassle.
  - **High-Density Version Modal:** Real-time channel filtering (`All`, `Release`, `Beta`, `Alpha`), "Show all MC versions" toggle, relative publication dates, loader compatibility pills (`NeoForge`, `Forge`, `Fabric`, `Quilt`), and collapsible in-app changelog previews.
  - **CurseForge Modpack Resolution & Self-Healing:** Automatic detection and recovery of canonical mod project IDs from legacy modpack imports to prevent mismatched version listings.
  - One-click mod installation directly into your instance's `mods/` folder with SHA-512 hash verification.
  - In-app mod manager to toggle mods on/off (`.jar.disabled`) or delete them without digging through File Explorer.
  - **Batch Mod Update Engine:** Check all installed mods for compatible updates in a single lightning-fast network call using Modrinth's SHA-512 batch hash endpoint (`/v2/version_files/update`) and CurseForge version checks; view update version jumps (`v{current} → v{latest}`), update individual mods, or click "Update All" with live progress tracking.
- **Integrated Resource Pack (Texture Pack) Browser & Manager:**
  - Search and discover thousands of texture and resource packs across Modrinth and CurseForge without leaving the launcher.
  - **Resolution & Style Filters:** Filter packs instantly by texture resolution (16x, 32x, 64x+) or artistic style (Faithful, Realistic, Medieval, Modern, Futuristic, RPG, Steampunk, Themed).
  - **Universal Instance Compatibility:** Works out of the box with all Minecraft instances, including Vanilla as well as modded instances (Fabric, Quilt, Forge, NeoForge).
  - **In-App Pack Management:** View installed resource packs with extracted description and resolution badges, toggle them on/off (`.zip.disabled`), change versions in one click, or delete files cleanly.
  - **Metadata & Thumbnail Extraction:** Automatically inspects `pack.mcmeta` and `pack.png` within archives to display custom descriptions and pack artwork.
  - **Drag-and-Drop Installation:** Drag any `.zip` resource pack directly onto the launcher window to install it into your active instance immediately.
- **Modpack Support (Local Imports & Direct Online Downloads):**
  - **Local Archive Import:** One-click import for Modrinth (`.mrpack`) and CurseForge (`.zip`) archives. Automatically extracts `overrides/` (configs, options, resource packs) directly into your instance and batch-downloads all required mods with hash verification.
  - **Online Modpack Browser:** Search and browse thousands of curated modpacks on Modrinth and CurseForge directly from the Mods page. One-click "Install Modpack" creates a brand new instance and installs everything automatically.
- **Dedicated Instance Detail & Settings View:**
  - Full-window management page for each instance accessible directly from instance cards.
  - **RAM Memory Tuning:** Dynamic memory slider with quick preset pills (2 GB, 4 GB, 6 GB, 8 GB, 12 GB, 16 GB).
  - **JVM Arguments Editor:** Quick-apply presets for Aikar's high-performance G1GC flags, ultra-low-latency Shenandoah GC, or custom arguments.
  - **Custom Java Override:** Browse and select any external `java.exe` binary with file picker, or let the launcher auto-manage it.
  - **Embedded Mod Manager:** Direct mod list table with search filtering, on/off toggles (`.jar.disabled`), one-click version switching, and quick deletion.
- **Direct Multiplayer Server Management:**
  - Add, edit, and remove Minecraft multiplayer servers directly inside any instance without launching the game.
  - Built-in NBT engine reads and writes directly to each instance's `.minecraft/servers.dat`.
  - Built-in server pinger displays real-time latency (ms), online player counts, version requirements, and MOTD.
  - One-click "Join Server" boots Minecraft with `--quickPlayMultiplayer` and connects you straight to the server immediately.
  - Test server ping connection in real-time inside the "Add Server" modal before saving.
  - **Server IP Redaction (Streamer Mode):** Masks sensitive multiplayer server IP addresses and ports across dashboard quick-play cards and instance server lists (`••••••••••••`) with one-click eye toggle peek buttons to prevent leaking private addresses or home IPs during livestreams.
- **In-App Screenshots Gallery:**
  - Visual gallery scanning each instance's `screenshots/` directory automatically.
  - High-resolution Lightbox modal viewer for full-screen inspection.
  - One-click copy image to system clipboard (paste directly into Discord, Slack, etc.).
  - Screenshot deletion and "Open Screenshots Folder" shortcuts.
- **Microsoft OAuth & Local Dev Profiles:**
  - Safe Microsoft Xbox Live login with tokens encrypted on disk via Electron's Windows DPAPI `safeStorage`.
  - Offline local player accounts for testing and dev environments.
- **Direct External Launcher Cloning & Importing:**
  - One-click import and deep cloning from existing launchers installed on your machine: **Prism Launcher**, **Modrinth App**, **CurseForge App**, **Official Vanilla Launcher**, and **MultiMC**.
  - **Custom Directory Scanner:** Point to any folder containing Minecraft instances or profiles.
  - Automatic translation of foreign configuration files (`mmc-pack.json`, `instance.cfg`, `profile.json`, `minecraftinstance.json`, `launcher_profiles.json`) into Script Launcher configurations.
  - Deep file cloning of configs, mods, resource packs, and shader packs with an optional toggle to clone singleplayer world saves.
  - Zero symlink risks: instances are completely copied into isolated folders so neither launcher ever affects the other.
- **Dedicated Live Logs View:** Full-window terminal tab in the sidebar with live stdout/stderr streaming, log search filtering, log level filters (All, Info, Warn, Error), auto-scroll, copy to clipboard, and instant "Stop Game" controls.
- **Silent Background Auto-Updater:** Automatically checks for launcher updates in the background every 15 minutes without interrupting gameplay. Updates download silently with one-click restart installation (zero setup wizard popups).
- **Interactive 3D Skin & Cape Studio:**
  - Real-time 3D character viewer powered by `skinview3d` with dynamic animations (walk, run, idle, fly, wave) and auto-rotation.
  - Full support for both **Classic (4px)** and **Slim (3px)** skin models.
  - Direct player skin search with instant preview and one-click saving to your personal library.
  - Complete **Cape System**: toggle between **None**, **Cape**, and **Elytra** 3D back equipment.
  - Equip owned Mojang account capes, official historic Minecon/event presets (Minecon 2011–2016, 15th Anniversary, Founder's, Cherry, MCC, etc.), or community OptiFine capes via live username search.
  - Local custom skin and cape `.png` drag-and-drop import.
- **Instance Installation & Version Upgrading:**
  - Modrinth-style installation settings panel with live platform selection (Vanilla, Fabric, Forge, NeoForge, Quilt).
  - Effortless Minecraft version switching with current version highlighting (`★ (Current)`) and automatic snapshot/pre-release detection.
  - Dynamic loader build selector querying Prism Meta for compatible loader releases with recommended badges.
  - 4 safety backup strategies before upgrading: **Backup Both** (clones instance & archives saves), **Backup Instance only**, **Backup Saves only**, or **No backup**.
  - One-click **Instance Repair** to purge broken natives, clear stale metadata caches, and re-verify integrity on next launch.
- **Discord Rich Presence (RPC):** Dynamic presence powered by `@xhayper/discord-rpc` showing what page you're browsing (Dashboard, Instances, Mod Browser, Skins, Settings), which instance you're configuring, and live in-game status with elapsed playtime, mod loader badges, and a direct GitHub link button.
- **Collapsible "Jump In" & Playtime-Ranked Quick Join:**
  - Automatically sorts all multiplayer servers and singleplayer worlds by total instance playtime and recent activity.
  - Displays top 3 most played targets by default with instant 1-click launch; provides a seamless "View All" toggle when more targets exist.
  - Interactive collapse/expand toggle on the Jump In card header with persistent saved state.
  - Inline playtime badges (`Clock` icon with formatted hours and minutes) on each quick-play card.
- **Modal Portaling Architecture & UI Stability:**
  - All modal dialogs (Instance Groups, Confirmations, Icon Picker, Upgrades) are rendered through top-level React portals directly to the document body.
  - Eliminates CSS `transform` containing-block conflicts and prevents modal flickering when interacting with items at the bottom of long scrollable lists.
  - Dynamic 3-dot dropdown menus that flip upwards or downwards based on screen position, with outside-click dismissal.
  - Generous bottom scroll padding across all views for comfortable viewing.
- **Zero Button Emojis & Modern UI:** Clean, human-designed dark interface using Lucide SVG icons that uses your full screen properly instead of cramming everything into the center.

---

## Tech Stack

- **Desktop Framework:** Electron + Electron-Vite
- **Frontend:** React 19, Tailwind CSS, Lucide Icons
- **Language:** TypeScript (ESM)
- **Metadata Engines:** Mojang Piston API + Prism Meta API (`meta.prismlauncher.org`)
- **Mod Providers:** Modrinth API v2 + CurseForge API v1
- **Encryption:** Electron `safeStorage` (Windows DPAPI)

---

## Repository Structure

```
├── src/
│   ├── main/                    # Electron Main Process (Node.js)
│   │   ├── index.ts             # App lifecycle and window creation
│   │   ├── core/                # Core launcher business logic
│   │   │   ├── auth/            # OAuth window, Xbox Live, tokens, encrypted storage
│   │   │   ├── importers/       # External launcher detection & deep cloner (Prism, Modrinth, CurseForge, Vanilla)
│   │   │   ├── java/            # Mojang JRE API client and auto-downloader
│   │   │   ├── loaders/         # Fabric, Quilt, Forge, NeoForge resolvers
│   │   │   ├── meta/            # Prism Meta client with disk cache & TTL
│   │   │   ├── minecraft/       # Piston manifest, assets, libraries, args, process spawner, screenshots
│   │   │   ├── modpacks/        # Modrinth (.mrpack) and CurseForge (.zip) archive & online importer
│   │   │   ├── mods/            # Modrinth client, CurseForge client, instance mod manager
│   │   │   └── resourcepacks/   # Resource pack manager, metadata extractor & zip installer
│   │   ├── services/            # Instances, auth state, launch engine, paths, system specs
│   │   ├── ipc/                 # Typed IPC handlers (bridge to renderer)
│   │   └── utils/               # Atomic filesystem writers, batch downloader, zip extract
│   ├── renderer/                # Electron Renderer Process (React UI)
│   │   ├── src/
│   │   │   ├── components/      # TitleBar, Sidebar, Modals, Cards, Buttons
│   │   │   ├── pages/           # Dashboard, Instances, InstanceDetail, ModBrowser, Logs, Settings
│   │   │   └── App.tsx          # Root routing and state management
│   ├── preload/                 # Secure contextBridge API exposing window.launcherAPI
│   └── shared/                  # Shared types (instances, auth, launch, mods, externalLauncher, ipc)
├── scripts/
│   └── test-services.mjs        # Automated sandbox test suite (Phases 1–9 + Batch Mod Updates)
├── package.json
└── tsconfig.json
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or newer)
- npm or pnpm

### Quick Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/SreerajSK990/script-mc-launcher.git
   cd script-mc-launcher
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start in development mode:**
   ```bash
   npm run dev
   ```

4. **Run the automated test suite (in isolated sandbox):**
   ```bash
   npm test
   ```

5. **Build production bundle:**
   ```bash
   npm run build
   ```

---

## Roadmap

- [x] **Phase 1:** Foundation & Isolated Instance System
- [x] **Phase 2:** Microsoft OAuth & Encrypted Auth Storage
- [x] **Phase 3:** Mojang Metadata, Assets, Libraries & Process Spawning
- [x] **Phase 4 & 5:** Prism Meta Integration & Mod Loaders (Fabric, Quilt, Forge, NeoForge)
- [x] **Phase 6:** Automatic Mojang Java Runtime Management (Java 8, 16, 17, 21)
- [x] **Phase 7:** Integrated Mod Browser (Modrinth + CurseForge) & Mod Manager
- [x] **Instance Detail & Settings View:** Per-instance RAM allocation, JVM argument flags, custom Java paths, screenshot gallery
- [x] **Modpack System:** Import `.mrpack` and `.zip` modpacks locally + online modpack browser
- [x] **External Launcher Cloning:** Direct import and cloning from Prism, Modrinth, CurseForge, and Vanilla launchers
- [x] **Production Packaging:** Custom launcher icon, Windows NSIS `.exe` installer, and standalone portable executable via `electron-builder`
- [x] **Auto-Updater:** Differential background updates from GitHub Releases with restart prompts and manual checks
- [x] **Silent Background Auto-Updater:** Automated 15-minute background update checks and one-click silent installer execution
- [x] **Multiplayer Server Management:** Direct `servers.dat` management, real-time server ping, and one-click quick join
- [x] **Discord Rich Presence (RPC):** Live status updates, in-game elapsed timers, loader badges, and interactive GitHub link button
- [x] **Infinite Scroll Mod Browser:** Smooth auto-fetching with API rate limiting, concurrency locking, and memory protection
- [x] **Snapshot & Historical Versions:** Full access to Mojang snapshots, release candidates, and historical beta/alpha versions with loader compatibility safety
- [x] **Server IP Privacy & Streamer Mode:** Server IP redaction on dashboard and instance management with one-click reveal toggles
- [x] **Interactive 3D Skin & Cape Studio:** Real-time 3D skin and cape preview with walk/fly animations, classic/slim models, elytra switching, Minecon presets, and OptiFine lookup
- [x] **Instance Installation & Version Upgrading:** Change game versions, switch mod loaders, 4 safety backup strategies, and one-click instance repair
- [x] **Resource Pack (Texture Pack) Browser & Manager:** Modrinth & CurseForge search, resolution filters, in-app management, drag-and-drop installer, and pack metadata extraction
- [x] **Batch Mod Update Engine:** SHA-512 batch hash lookup, per-mod update badges, one-click individual update, and batch "Update All" with live progress
- [x] **Enhanced Version Listing & Web Download Engine:** External browser download for restricted CurseForge files, channel filters (Release/Beta/Alpha), loader badges, changelog accordions, and modpack project ID self-healing
- [x] **Modal Portaling Architecture & UI Polish:** Top-level React portals for zero CSS transform modal flickering, dynamic 3-dot action menus with outside-click dismissal, collapsible Jump In section, and playtime-based quick-join sorting

---

## License

MIT License. Free to use, modify, and build upon.
