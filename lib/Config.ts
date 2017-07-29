import { resolve as resolvePath } from 'path'
import { validateConfig } from './ConfigSchema'

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
}

async function evalConfigFromFile(pathname: string): Promise<IConfig> {
  if (typeof pathname !== 'string')
    throw new Error(`Path must be a string. Got a ${typeof pathname}`)

  const fullpath = resolvePath("./" + pathname)
  const data = require(fullpath) as IConfig

  if (typeof data === 'object')
    data._path = fullpath

  return data
}


/**
 * Sending nulll as the preferred path will result in scan for the config
 */
export function loadConfigFile(preferredPath?: string): Promise<IConfig> {
  const loadingPromise = new Promise((resolve, reject) => {
    const potentialConfigs = (!!preferredPath)
      ? [preferredPath]
      : [
        '.syncodemayo.json',
        'syncodemayo.json',
        '.syncodemayo.js',
        'syncodemayo.js',
        '.syncodemayo',
        '.sync-config',
        'sync-config.json',
        'sync-config.js'
      ]
    const tryLoading = (path: string | undefined) => {
      if (!!path) {
        evalConfigFromFile(path)
          .then(resolve)
          .catch(err =>
            tryLoading(potentialConfigs.shift()))
      }
      else {
        reject(new Error("Local config not found."))
      }
    }
    // Kick off config loading...
    tryLoading(potentialConfigs.shift())
  })

  return loadingPromise
    .then(validateConfig)
    .then(massageConfigData)
}

async function massageConfigData(config: IConfig): Promise<IConfig> {
  config.local.files = config.local.files || '**/**'
  config.local.exclude = config.local.exclude || []
  config.local.defaultTarget = config.local.defaultTarget || "staging"

  Object.keys(config.targets).forEach(name => {
    const target = config.targets[name]
    target._name = name
    target.port = target.port || 21
    target.cache = target.cache || ".synco-filelist"
    if (typeof target.prompt === 'undefined')
      target.prompt = true
  })
  return config
}

export function resolvePassword(targetConfig: ITargetConfig): string {
  return targetConfig.pass || process.env[`${targetConfig._name.toUpperCase()}_PWD`] as string
}

export function resolveTarget(config: IConfig, name: string | ITargetConfig | undefined): ITargetConfig {
  if (typeof name === 'undefined') name = config.local.defaultTarget
  if (typeof name === 'object') return name

  const targetName = Object.keys(config.targets).find(name => {
    return name.toUpperCase() === config.targets[name]._name.toUpperCase()
  })

  if (!targetName) {
    throw new Error("Target '" + name + "' not found.")
  }

  return config.targets[targetName]
}