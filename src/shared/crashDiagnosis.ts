export interface CrashDiagnosis {
  title: string
  explanation: string
  evidence?: string
}

const rules = [
  {
    pattern: /OutOfMemoryError|Could not reserve enough space for.*heap/i,
    title: 'Java ran out of available memory',
    explanation:
      'Review this instance’s RAM allocation and available system memory. Close other applications; increasing the allocation is useful only when enough memory is available.'
  },
  {
    pattern: /UnsupportedClassVersionError|class file version .*only recognizes/i,
    title: 'The selected Java version is too old',
    explanation:
      'Use the managed Java runtime or select a Java version compatible with both Minecraft and the installed mods.'
  },
  {
    pattern:
      /requires.*(?:which is missing|not installed)|Missing mandatory dependencies|depends on.*missing|requires.*version.*but.*(?:present|found)/i,
    title: 'A mod dependency is missing or incompatible',
    explanation:
      'Use the dependency named in the log excerpt to identify the missing or incompatible mod. Install a matching version or restore the previous mod setup from Backups.'
  },
  {
    pattern: /DuplicateModsFoundException|Found duplicate mods|Duplicate mod ID/i,
    title: 'Multiple copies of a mod were found',
    explanation:
      'Open the instance’s Mods tab and remove the extra version. Keep one compatible copy of each mod.'
  },
  {
    pattern: /GLFW error 65542|does not support OpenGL|Failed to create.*OpenGL/i,
    title: 'Minecraft could not initialize OpenGL',
    explanation:
      'Check the graphics driver and Minecraft’s GPU requirements. If this began after enabling shaders, disable the shader in the game settings.'
  }
]

export function diagnoseCrash(lines: string[]): CrashDiagnosis {
  for (const rule of rules) {
    const evidence = lines.find((line) => rule.pattern.test(line))
    if (evidence) return { title: rule.title, explanation: rule.explanation, evidence }
  }
  return {
    title: 'The cause could not be identified automatically',
    explanation:
      'Review the error lines below and the instance’s crash-reports folder. If the failure started after a mod update, you can restore a previous mod setup from Backups.'
  }
}
