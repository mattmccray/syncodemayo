import { resolve as resolvePath } from 'path'
import { validateConfig } from './ConfigSchema.js'
import { localFileExists, readLocalFile } from './Filelist.js'
import stripJsonComments from '../vendor/strip-json-comments.js'


export interface IConfig {
  local: ILocalConfig
  targets: { [name: string]: ITargetConfig }
  _path?: string
}

export interface ILocalConfig {
  path: string
  files: string
  exclude: string[]
  defaultTarget: string
  deleteRemoteFiles: boolean
}

export interface ITargetConfig {
  host: string
  user: string
  pass?: string
  path: string
  port: number
  cache: string
  prompt?: boolean | string
  _name: string
  enabled?: boolean
  type?: string
  /** `false` (default): plain FTP. `true`: explicit FTPS. `"implicit"`: implicit FTPS. */
  secure?: boolean | 'implicit'
  /** Default `true`. `false` accepts self-signed or mismatched certificates, with a warning. */
  rejectUnauthorized?: boolean
}

/**
 * Thrown by `loadConfigFile` when no config file exists: the preferred path is missing, or (with
 * no preferred path) none of the default file names exists in the working directory.
 */
export class ConfigNotFoundError extends Error {
  constructor(message = "Local config not found.") {
    super(message)
    this.name = 'ConfigNotFoundError'
  }
}

/** The config file names `loadConfigFile` tries, in order, when it isn't given a path. */
export const CONFIG_FILE_NAMES = [
  'syncodemayo.json',
  '.syncodemayo.json',
  'sync-config.json',
]

// Reads and parses a config file. Resolves undefined (which JSON never parses to) when the file
// doesn't exist.
async function evalConfigFromFile(pathname: string): Promise<IConfig | undefined> {
  if (typeof pathname !== 'string')
    throw new Error(`Path must be a string. Got a ${typeof pathname}`)

  const fullpath = resolvePath("./" + pathname)
  if (!(await localFileExists(fullpath)))
    return undefined

  const source = await readLocalFile(fullpath, false) as string
  const data = JSON.parse(stripJsonComments(source)) as IConfig

  if (typeof data === 'object' && data !== null)
    data._path = fullpath

  return data
}


/**
 * Loads, validates, and fills in the defaults of a config file. With no preferred path it tries
 * each of `CONFIG_FILE_NAMES` in the working directory and loads the first one that exists.
 * Rejects with `ConfigNotFoundError` when there's no config file, with a `SyntaxError` when the
 * file isn't valid JSON, and with a "Config Schema Error: ..." `Error` when it fails validation.
 */
export async function loadConfigFile(preferredPath?: string): Promise<IConfig> {
  const potentialConfigs = (!!preferredPath) ? [preferredPath] : CONFIG_FILE_NAMES

  for (const path of potentialConfigs) {
    const config = await evalConfigFromFile(path)
    if (config !== undefined)
      return massageConfigData(await validateConfig(config))
  }

  throw new ConfigNotFoundError()
}

async function massageConfigData(config: IConfig): Promise<IConfig> {
  config.local.files = config.local.files || '**/**'
  config.local.exclude = config.local.exclude || []
  config.local.defaultTarget = config.local.defaultTarget || "staging"
  config.local.deleteRemoteFiles = config.local.deleteRemoteFiles === true

  Object.keys(config.targets).forEach(name => {
    const target = config.targets[name]
    target._name = name
    target.port = target.port || (target.secure === 'implicit' ? 990 : 21)
    target.cache = target.cache || ".synco-filelist"
    target.enabled = target.enabled !== false
    target.type = target.type || 'ftp' // Will support more eventually
    if (typeof target.prompt === 'undefined')
      target.prompt = true
    target.secure = target.secure ?? false
    target.rejectUnauthorized = target.rejectUnauthorized ?? true
  })

  return config
}

export function resolvePassword(targetConfig: ITargetConfig): string {
  const password = targetConfig.pass || process.env[`${targetConfig._name.toUpperCase()}_PWD`] as string
  if (typeof password === 'undefined') {
    throw new Error("Cannot find password for target: " + targetConfig._name)
  }
  return password
}

export function resolveTarget(config: IConfig, name: string | ITargetConfig | undefined): ITargetConfig {
  if (typeof name === 'undefined') name = config.local.defaultTarget
  if (typeof name === 'object') return name

  const lookingFor = name as string
  const targetName = Object.keys(config.targets).find(namedTarget => (
    lookingFor.toUpperCase() === config.targets[namedTarget]._name.toUpperCase()
  ))

  if (!targetName) {
    throw new Error("Target '" + name + "' not found.")
  }

  const target = config.targets[targetName]

  if (!target.enabled) {
    throw new Error("Target '" + name + "' not enabled.")
  }

  return target
}