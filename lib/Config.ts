import { resolve as resolvePath } from 'path'
import { validateConfig } from './ConfigSchema'
import { localFileExists, readLocalFile } from './Filelist'
import * as stripJsonComments from 'strip-json-comments'


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
}

async function evalConfigFromFile(pathname: string): Promise<IConfig> {
  if (typeof pathname !== 'string')
    throw new Error(`Path must be a string. Got a ${typeof pathname}`)

  const fullpath = resolvePath("./" + pathname)
  if (!localFileExists(fullpath))
    throw new Error("SKIP")

  const source = await readLocalFile(fullpath, false) as string
  const data = JSON.parse(stripJsonComments(source)) as IConfig
  // const data = require(fullpath) as IConfig

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
        'syncodemayo.json',
        '.syncodemayo.json',
        'syncodemayo.js',
        '.syncodemayo.js',
        '.syncodemayo',
        'sync-config.json',
        'sync-config.js',
        '.sync-config',
      ]
    const tryLoading = (path: string | undefined) => {
      if (!!path) {
        evalConfigFromFile(path)
          .then(resolve)
          .catch(err => {
            if (err.message === "SKIP")
              tryLoading(potentialConfigs.shift())
            else
              reject(err)
          })
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
  config.local.deleteRemoteFiles = config.local.deleteRemoteFiles === true

  Object.keys(config.targets).forEach(name => {
    const target = config.targets[name]
    target._name = name
    target.port = target.port || 21
    target.cache = target.cache || ".synco-filelist"
    target.enabled = target.enabled !== false
    target.type = target.type || 'ftp' // Will support more eventually
    if (typeof target.prompt === 'undefined')
      target.prompt = true
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