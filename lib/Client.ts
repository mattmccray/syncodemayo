import { resolve as resolvePath } from 'path'
import { IConfig, loadConfigFile, ITargetConfig, resolveTarget } from './Config'
import { TargetServer } from './TargetServer'
import { DefaultConfig } from './ConfigSchema'
import { writeLocalFile, localFileExists } from './Filelist'

export class Client {
  private _path: string | undefined
  hasConfig: boolean | null = null
  config: IConfig
  loadError: Error
  parseError: Error
  whenReady: Promise<Client>

  DEFAULT_CONFIG = "syncodemayo.json"

  get hasError() {
    return !!this.loadError || !!this.parseError
  }

  constructor(preferredPath: string | undefined) {
    this._path = preferredPath
    this.whenReady = new Promise((resolve) => {
      loadConfigFile(preferredPath)
        .then((config) => {
          this.config = config
          this._path = this.config._path
          this.hasConfig = true
          resolve(this)
        })
        .catch((err: Error) => {
          if (err.message.indexOf('Schema Error')) this.loadError = err
          if (err.message.indexOf('JSON')) this.parseError = err
          this.hasConfig = false
          resolve(this)
        })
    })
  }

  async createConfig(preferredPath: string | undefined): Promise<boolean> {
    const path = resolvePath(preferredPath || this._path || this.DEFAULT_CONFIG)
    const alreadyExists = await localFileExists(path)
    if (alreadyExists) {
      throw new Error("Config already exists at " + path)
    }
    writeLocalFile(path, JSON.stringify(DefaultConfig, null, 2))
    return true
  }

  async getTargetNames(): Promise<string[]> {
    if (this.hasConfig === null) throw new Error("Config not loaded yet.")
    if (this.hasConfig === false) {
      if (this.hasError) {
        const error = this.loadError || this.parseError
        throw error
      }
      else {
        throw new Error("This directory has no SyncoDeMayo config.")
      }
    }
    return Object.keys(this.config.targets)
  }

  getTargetConfig(name: string | undefined): ITargetConfig {
    return resolveTarget(this.config, name)
  }

  getTargetServer(name: string | ITargetConfig | undefined): TargetServer {
    return TargetServer.from(this.config, name)
  }

  static create(configPath: string | undefined): Promise<Client> {
    const client = new Client(configPath)
    return client.whenReady
  }
}