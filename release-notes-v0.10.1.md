Hey everyone! Here is the v0.10.1 release of Script Minecraft Launcher.

### What is new in this release:
- Infinite Scroll in Mod Browser: Upgraded mod and modpack browsing with smooth automatic pre-fetching powered by `IntersectionObserver`. You can now scroll continuously through catalog results without manual page navigation.
- Rate-Limit-Safe Concurrency Guard: Integrated strict single-flight request locking and a 200ms debounce buffer to completely prevent duplicate queries or hitting Modrinth and CurseForge API rate limits during rapid scrolling.
- Memory Protection & Safety Cap: Added an automatic pause checkpoint at 8 consecutive pages (around 288 loaded mods) with a simple "Continue Browsing" button to protect system memory from runaway scroll wheel inputs.
- Quick Scroll to Top: A floating action button smoothly brings you back to your search query and category filters whenever you have scrolled down through results.

### Improvements & Fixes:
- Fixed a React asynchronous state updater closure bug in `ModBrowserPage` that previously caused mod pagination to stop after loading 2 pages.
- Increased default page batch size from 24 to 36 items (perfectly matching our 3-column mod grid) to reduce total network requests by 33% and speed up browsing.
- Added clean in-line loading indicators and end-of-catalog status notifications.

### Downloads Guide:
- Script-Minecraft-Launcher-Setup-0.10.1.exe: Recommended installer with desktop shortcuts and seamless background auto-updating.
- Script.Minecraft.Launcher.0.10.1.exe: Standalone portable version that runs anywhere without installation.
