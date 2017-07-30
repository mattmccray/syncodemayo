import { IConfig, ITargetConfig, resolveTarget } from './Config'
import { Connection } from './Connection'
import { Sync, IChangeset } from './Sync'

export class TargetServer {
  private _config: IConfig
  private _targetConfig: ITargetConfig

  get config() {
    return this._targetConfig
  }

  get name() {
    return this.config._name
  }

  constructor(config: IConfig, target: string | ITargetConfig | undefined) {
    this._config = config
    this._targetConfig = resolveTarget(config, target)
  }

  /**
   * Add a cache file, if there's not one
   */
  async prepare(force?: boolean): Promise<boolean> {
    const remoteCachePath = `${this._targetConfig.path}/${this._targetConfig.cache}`
    const conn = await Connection.forTarget(this._targetConfig)
    const remoteIsConfigured = await conn.remoteFileExists(remoteCachePath)

    if (remoteIsConfigured && force !== true) {
      console.log(`${this._targetConfig.host} already is initialized.`)
      return false
    }

    const remoteDirExists = await conn.remoteDirectoryExists(this._targetConfig.path)
    if (!remoteDirExists) {
      throw new Error("Remote path not found: " + this._targetConfig.path)
    }

    await conn.putContent("{}", remoteCachePath)

    return true
  }

  /**
   * Verify the server has a cache file
   */
  async verify(): Promise<boolean> {
    const remoteCachePath = `${this._targetConfig.path}/${this._targetConfig.cache}`
    const conn = await Connection.forTarget(this._targetConfig)
    const remoteIsConfigured = await conn.remoteFileExists(remoteCachePath)

    if (remoteIsConfigured) {
      return true
    }

    return false
  }

  /**
   * Sync local files to target server
   */
  async sync(isDryRun: boolean, forceConfirmation = false): Promise<IChangeset | null> {
    const sync = new Sync(Connection.forTarget(this._targetConfig), this._config, this._targetConfig)
    return sync.run(isDryRun, forceConfirmation)
  }


  static from(config: IConfig, targetConfig: string | ITargetConfig | undefined): TargetServer {
    return new TargetServer(config, targetConfig)
  }
}