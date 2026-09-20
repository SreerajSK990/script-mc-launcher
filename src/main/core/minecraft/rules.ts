import { platform, arch } from 'node:os'
import type { LibraryRule } from '@shared/types/manifest'

export function getCurrentLauncherOsName(): 'windows' | 'osx' | 'linux' {
  const currentPlatform = platform()
  if (currentPlatform === 'win32') {
    return 'windows'
  }
  if (currentPlatform === 'darwin') {
    return 'osx'
  }
  return 'linux'
}

export function getCurrentLauncherArch(): string {
  const currentArch = arch()
  if (currentArch === 'x64') {
    return 'x64'
  }
  if (currentArch === 'arm64') {
    return 'arm64'
  }
  return 'x86'
}

export function isRuleAllowed(
  rules?: LibraryRule[],
  currentOs = getCurrentLauncherOsName(),
  currentArch = getCurrentLauncherArch()
): boolean {
  if (!rules || rules.length === 0) {
    return true
  }

  let isAllowed = false

  for (const rule of rules) {
    let applies = true

    if (rule.os) {
      if (rule.os.name && rule.os.name !== currentOs) {
        applies = false
      }
      if (rule.os.arch && rule.os.arch !== currentArch) {
        applies = false
      }
    }

    if (rule.features) {
      applies = false
    }

    if (applies) {
      isAllowed = rule.action === 'allow'
    }
  }

  return isAllowed
}
