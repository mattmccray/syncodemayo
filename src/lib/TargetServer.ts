import * as Log from './Log.js'
import { IConfig, ITargetConfig, resolveTarget } from './Config.js'
import { Connection } from './Connection.js'
import { ConnectionFactory, RemoteConnection } from './RemoteConnection.js'
import { Sync, IChangeset } from './Sync.js'

export class TargetServer {
  private _config: IConfig
  private _targetConfig: ITargetConfig
  private _connect: ConnectionFactory

  get config() {
    return this._targetConfig
  }

  get name() {
    return this.config._name
  }

  /**
   * `connect` opens the connection for each operation. It defaults to FTP/FTPS (`Connection`);
   * tests pass a fake.
   */
  constructor(config: IConfig, target: string | ITargetConfig | undefined, connect: ConnectionFactory = Connection.create) {
    this._config = config
    this._targetConfig = resolveTarget(config, target)
    this._connect = connect
  }

  // Opens a connection, runs `task` with it, and closes it, whether `task` resolves or rejects.
  private async _withConnection<T>(task: (conn: RemoteConnection) => Promise<T>): Promise<T> {
    const conn = this._connect(this._targetConfig)
    try {
      return await task(conn)
    }
    finally {
      try {
        await conn.close()
      }
      catch (err) {
        Log.debug("Error closing the connection:", err)
      }
    }
  }

  /**
   * Add a cache file, if there's not one
   */
  async prepare(force?: boolean): Promise<boolean> {
    const remoteCachePath = `${this._targetConfig.path}/${this._targetConfig.cache}`
    return this._withConnection(async (conn) => {
      const remoteIsConfigured = await conn.remoteFileExists(remoteCachePath)

      if (remoteIsConfigured && force !== true) {
        Log.info(`${this._targetConfig.host} already is initialized.`)
        return false
      }

      const remoteDirExists = await conn.remoteDirectoryExists(this._targetConfig.path)
      if (!remoteDirExists) {
        throw new Error("Remote path not found: " + this._targetConfig.path)
      }

      await conn.putContent("{}", remoteCachePath)

      return true
    })
  }

  /**
   * Verify the server has a cache file
   */
  async verify(): Promise<boolean> {
    const remoteCachePath = `${this._targetConfig.path}/${this._targetConfig.cache}`
    return this._withConnection(conn => conn.remoteFileExists(remoteCachePath))
  }

  /**
   * Sync local files to target server
   */
  async sync(isDryRun: boolean, forceConfirmation = false): Promise<IChangeset | null> {
    return this._withConnection(conn =>
      Sync.create(conn, this._config, this._targetConfig).run(isDryRun, forceConfirmation))
  }

  static create(config: IConfig, targetConfig: string | ITargetConfig | undefined, connect?: ConnectionFactory): TargetServer {
    return new TargetServer(config, targetConfig, connect)
  }
}
