import { delimiter } from 'node:path'
import type { VersionPackage, ArgumentValue } from '@shared/types/manifest'
import type { InstanceConfiguration } from '@shared/types/instance'
import type { StoredAccount } from '@shared/types/auth'
import { isRuleAllowed } from '@main/core/minecraft/rules'
import { getAssetsDirectory, getInstanceMinecraftPath } from '@main/services/paths'

export interface ArgumentReplacementContext {
  instance: InstanceConfiguration
  versionPackage: VersionPackage
  account: StoredAccount
  nativesDirectory: string
  classpathString: string
}

function replaceArgumentVariables(template: string, context: ArgumentReplacementContext): string {
  const replacements: Record<string, string> = {
    '${auth_player_name}': context.account.username,
    '${auth_uuid}': context.account.uuid,
    '${auth_access_token}': context.account.accessToken,
    '${user_type}': context.account.accountType === 'microsoft' ? 'msa' : 'mojang',
    '${version_name}': context.instance.minecraftVersion,
    '${version_type}': context.versionPackage.type || 'release',
    '${game_directory}': getInstanceMinecraftPath(context.instance.id),
    '${assets_root}': getAssetsDirectory(),
    '${assets_index_name}': context.versionPackage.assetIndex.id,
    '${natives_directory}': context.nativesDirectory,
    '${classpath}': context.classpathString,
    '${classpath_separator}': delimiter,
    '${clientid}': context.account.uuid,
    '${auth_xuid}': context.account.uuid
  }

  let result = template
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(key, value)
  }
  return result
}

function processArgumentValues(
  argValues: ArgumentValue[],
  context: ArgumentReplacementContext
): string[] {
  const processed: string[] = []

  for (const entry of argValues) {
    if (typeof entry === 'string') {
      processed.push(replaceArgumentVariables(entry, context))
      continue
    }

    if (entry.rules && !isRuleAllowed(entry.rules)) {
      continue
    }

    const valueOrValues = entry.value
    if (Array.isArray(valueOrValues)) {
      for (const val of valueOrValues) {
        processed.push(replaceArgumentVariables(val, context))
      }
    } else if (typeof valueOrValues === 'string') {
      processed.push(replaceArgumentVariables(valueOrValues, context))
    }
  }

  return processed
}

export function buildExecutionArguments(context: ArgumentReplacementContext): {
  jvmArguments: string[]
  gameArguments: string[]
  mainClass: string
} {
  const jvmArguments: string[] = []
  const gameArguments: string[] = []

  jvmArguments.push(`-Xms512M`)
  jvmArguments.push(`-Xmx${context.instance.ramAllocationMegabytes}M`)

  for (const customArg of context.instance.jvmArguments) {
    jvmArguments.push(replaceArgumentVariables(customArg, context))
  }

  if (context.versionPackage.arguments?.jvm && context.versionPackage.arguments.jvm.length > 0) {
    const modernJvm = processArgumentValues(context.versionPackage.arguments.jvm, context)
    jvmArguments.push(...modernJvm)
  } else {
    jvmArguments.push(`-Djava.library.path=${context.nativesDirectory}`)
    jvmArguments.push(`-Dminecraft.launcher.brand=ScriptLauncher`)
    jvmArguments.push(`-Dminecraft.launcher.version=0.1.0`)
    jvmArguments.push('-cp')
    jvmArguments.push(context.classpathString)
  }

  if (context.versionPackage.minecraftArguments) {
    const legacyExpanded = replaceArgumentVariables(context.versionPackage.minecraftArguments, context)
    const splitArgs = legacyExpanded.split(' ').filter(Boolean)
    gameArguments.push(...splitArgs)
  } else if (context.versionPackage.arguments?.game && context.versionPackage.arguments.game.length > 0) {
    const modernGame = processArgumentValues(context.versionPackage.arguments.game, context)
    gameArguments.push(...modernGame)
  }

  return {
    jvmArguments,
    gameArguments,
    mainClass: context.versionPackage.mainClass
  }
}
