# Script Minecraft Launcher

A modern, clean, and modular Minecraft launcher built with Electron, React, TypeScript, and Tailwind CSS.

Most Minecraft launchers out there either look like they are stuck in 2010 with clunky table grids, or they are bloated and slow. This launcher is designed to be fast, sleek, easy to use, and completely isolated so your game instances never mess with each other.

---

## What Makes It Different?

- **Modern full-screen layout:** No cramped windows or tiny centered boxes. It uses your whole screen properly with a clean dark sidebar and responsive card grid.
- **Instance Isolation:** Every instance has its own separate folder (`mods`, `saves`, `config`). Installing a mod or changing settings in one instance will never break another.
- **Built for Modding:** Built to support Vanilla, Fabric, Quilt, Forge, and NeoForge right out of the box.
- **Integrated Mod Browsing:** Modrinth and CurseForge in one place without needing to juggle websites or external downloads.
- **Auto Java Management:** Mojang runtimes are automatically resolved so you don't have to fiddle with installing multiple Java versions manually.
- **Clean and Modular Codebase:** Every piece of launcher logic, IPC bridge, and UI component lives in its own small, focused file.

---

## Tech Stack

- **Desktop Shell:** Electron
- **UI Framework:** React + Vite
- **Styling:** Tailwind CSS + Lucide Icons
- **Language:** TypeScript (ESM)
- **Metadata Sources:** Mojang Piston API + Prism Meta Server
- **Mod Providers:** Modrinth API v2 + CurseForge API

---

## Project Structure

```
├── src/
│   ├── main/                 # Electron main process (Node.js)
│   │   ├── index.ts          # Window setup & app lifecycle
│   │   ├── preload.ts        # Secure contextBridge API
│   │   ├── services/         # Filesystem, paths, instances, system specs
│   │   ├── ipc/              # Typed IPC handlers between main and renderer
│   │   └── utils/            # Atomic file writers, helpers
│   ├── renderer/             # Frontend UI (React + Tailwind)
│   │   ├── index.html
│   │   └── src/
│   │       ├── components/   # Titlebar, sidebar, instance cards, modals
│   │       ├── pages/        # Dashboard, Instances, Mod Browser, Settings
│   │       ├── styles/       # Tailwind and dark theme CSS
│   │       └── App.tsx       # Root view and navigation
│   └── shared/               # Shared TypeScript types and IPC channel constants
│       ├── types/            # Instance, system, and IPC types
│       └── constants/        # Default settings and channel names
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+ recommended)
- Git

### Installation

Clone the repository:

```bash
git clone https://github.com/SreerajSK990/script-mc-launcher.git
cd script-mc-launcher
```

Install dependencies:

```bash
npm install
```

Start the launcher in development mode:

```bash
npm run dev
```

Build and package for production:

```bash
npm run package
```

---

## License

MIT License. Feel free to use and modify.
