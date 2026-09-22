Hey everyone! Here is the v0.10.2 release of Script Minecraft Launcher.

### What is new in this release:
- Minecraft Snapshots & Historical Versions: You can now create instances for testing Mojang development snapshots, Release Candidates, Pre-releases, and historical Beta and Alpha versions alongside stable releases.
- Version Stream Filters & Badges: The instance creation modal defaults to official stable releases and includes simple toggles for "Snapshots" and "Historical" versions, with clean visual labels in the version picker.
- Mod Loader Compatibility Advisory: When selecting snapshots or historical versions alongside Forge or NeoForge, an in-line notice guides you toward Vanilla or Fabric since Forge ecosystems primarily target official stable releases.
- Silent Background Auto-Updater: The launcher now checks for updates in the background every 15 minutes without disturbing your session. When an update is ready, a single click applies it silently and restarts the app without opening the setup wizard.

### Improvements & Fixes:
- Modernized Windows NSIS packaging configuration with one-click background installation so launcher updates feel seamless.
- Refactored metadata IPC communication to pass structured version descriptors with release dates and types.
- Fixed version selector synchronization when enabling or disabling snapshot and historical filters in the instance creator.

### Downloads Guide:
- Script-Minecraft-Launcher-Setup-0.10.2.exe: Recommended installer with desktop shortcuts and seamless background auto-updating.
- Script.Minecraft.Launcher.0.10.2.exe: Standalone portable version that runs anywhere without installation.
