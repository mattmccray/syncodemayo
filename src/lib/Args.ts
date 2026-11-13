import { parseArgs } from 'node:util'
import { LogLevel } from './Log.js'

/** What the CLI was asked to do. `check` is the `verify` command, as in v1. */
export type CliCommand = 'init' | 'changes' | 'check' | 'sync' | 'ls' | 'help' | 'version'

export interface CliArgs {
  command: CliCommand
  target?: string
  config?: string
  logLevel: LogLevel
  /** `sync -f/--force`: don't prompt before uploading. */
  force: boolean
}

/** Thrown for a command line the CLI can't run (unknown option or command, extra arguments). */
export class CliArgsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CliArgsError'
  }
}

// Command name (and alias) -> what it runs, and whether it takes a [target].
const COMMANDS: { [name: string]: { command: CliCommand, takesTarget: boolean } } = {
  init: { command: 'init', takesTarget: true },
  changes: { command: 'changes', takesTarget: true },
  diff: { command: 'changes', takesTarget: true },
  verify: { command: 'check', takesTarget: true },
  sync: { command: 'sync', takesTarget: true },
  ls: { command: 'ls', takesTarget: false },
}

export const HELP = `Usage: syncodemayo [options] [command]

Options:
  -c, --config <file>  Specify local config <file>
  -v, --verbose        Verbose logging
  -q, --quiet          Minimal logging
  -V, --version        Output the version number
  -h, --help           Output usage information

Commands:
  init [target]          Configure local folder and/or server to sync
  changes|diff [target]  Perform sync dry run and display the changes
  verify [target]        Verify server is configured
  sync [options] [target]
                         Perform sync to server
    -f, --force          Don't prompt before uploading.
  ls                     List defined targets in config

With no command, shows this help.
`

/**
 * Parses the CLI arguments (without the node and script paths) into what to run.
 * Pure: it reads nothing and prints nothing. Throws CliArgsError for a command line it can't run.
 */
export function parseCliArgs(argv: string[]): CliArgs {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        config: { type: 'string', short: 'c' },
        verbose: { type: 'boolean', short: 'v' },
        quiet: { type: 'boolean', short: 'q' },
        version: { type: 'boolean', short: 'V' },
        help: { type: 'boolean', short: 'h' },
        force: { type: 'boolean', short: 'f' },
      },
    })
  }
  catch (err) {
    throw new CliArgsError((err as Error).message)
  }

  const { values, positionals } = parsed
  const force = values.force === true
  const logLevel = values.verbose
    ? LogLevel.Debug
    : values.quiet
      ? LogLevel.Info
      : LogLevel.Default
  // Only the keys that are set, so a result compares equal to a plain literal.
  const result = (command: CliCommand, target?: string): CliArgs => {
    const args: CliArgs = { command, logLevel, force }
    if (values.config !== undefined) args.config = values.config
    if (target) args.target = target
    return args
  }

  if (values.help) return result('help')
  if (values.version) return result('version')
  if (positionals.length === 0) {
    if (force) throw new CliArgsError("Unknown option '-f, --force': it applies only to the sync command")
    return result('help')
  }

  const [name, ...rest] = positionals
  const spec = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined
  if (!spec) throw new CliArgsError(`Unknown command '${name}'`)

  if (force && spec.command !== 'sync')
    throw new CliArgsError(`Unknown option '-f, --force' for the ${name} command: it applies only to sync`)

  const maxArgs = spec.takesTarget ? 1 : 0
  if (rest.length > maxArgs)
    throw new CliArgsError(`Too many arguments for the ${name} command: ${rest.join(' ')}`)

  return result(spec.command, rest[0])
}
