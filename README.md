# Script Minecraft Launcher

A fast, sleek, and modular Minecraft launcher built with **Electron**, **React**, **TypeScript**, and **Tailwind CSS**.

Most Minecraft launchers out there either look like they're stuck in 2010 with clunky Java Swing windows, or they're bloated with electron bloatware and ads. Script Launcher is built to be fast, clean, and completely isolated so your mod setups and game versions never conflict with each other.

---

## Highlights

- **Complete Instance Isolation:** Every instance has its own dedicated directory (`instances/<id>/minecraft/`). Mods, configs, resource packs, and saves stay strictly inside that instance. No shared messy `.minecraft` folder.
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
  - **Live "Installed" Status Badges:** Mod cards in Mod Browser automatically indicate when a mod is already installed in the selected instance with a clean green status badge.
  - **In-App Version Switching:** Change or upgrade any mod's version directly from the Instance Details mods tab or the Mod Browser with one click; automatically removes old `.jar` / `.jar.disabled` files and updates configurations.
  - One-click mod installation directly into your instance's `mods/` folder with SHA-512 hash verification.
  - In-app mod manager to toggle mods on/off (`.jar.disabled`) or delete them without digging through File Explorer.
- **Modpack Support (Local Imports & Direct Online Downloads):**
  - **Local Archive Import:** One-click import for Modrinth (`.mrpack`) and CurseForge (`.zip`) archives. Automatically extracts `overrides/` (configs, options, resource packs) directly into your instance and batch-downloads all required mods with hash verification.
  - **Online Modpack Browser:** Search and browse thousands of curated modpacks on Modrinth and CurseForge directly from the Mods page. One-click "Install Modpack" creates a brand new instance and installs everything automatically.
- **Dedicated Instance Detail & Settings View:**
  - Full-window management page for each instance accessible directly from instance cards.
  - **RAM Memory Tuning:** Dynamic memory slider with quick preset pills (2 GB, 4 GB, 6 GB, 8 GB, 12 GB, 16 GB).
  - **JVM Arguments Editor:** Quick-apply presets for Aikar's high-performance G1GC flags, ultra-low-latency Shenandoah GC, or custom arguments.
  - **Custom Java Override:** Browse and select any external `java.exe` binary with file picker, or let the launcher auto-manage it.
  - **Embedded Mod Manager:** Direct mod list table with search filtering, on/off toggles (`.jar.disabled`), one-click version switching, and quick deletion.
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
│   │   │   └── mods/            # Modrinth client, CurseForge client, instance mod manager
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
│   └── test-services.mjs        # Automated sandbox test suite (Phases 1–7 + Cloner)
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
- [x] **Dedicated Logs:** Full-window live terminal page with search & controls
- [ ] **Production Packaging:** Custom launcher icon & Windows `.exe` installer via `electron-builder`

---

## License

MIT License. Free to use, modify, and build upon.
