
import * as path from 'path'
import * as yesno from 'yesno'
import * as Log from './Log'
import { IConfig, ILocalConfig, ITargetConfig, resolveTarget } from './Config'
import { Connection } from './Connection'
import { IFilelist, getRemoteFilelist, buildLocalFilelist } from './Filelist'

export interface IChangeset {
  added: string[]
  changed: string[]
  removed: string[]
}

export class Sync {
  private _conn: Connection
  private _config: IConfig
  private _target: ITargetConfig

  constructor(conn: Connection, config: IConfig, target: string | ITargetConfig) {
    this._conn = conn
    this._config = config
    this._target = resolveTarget(config, target)
  }

  async run(isDryRun = false, forceConfirmation = false): Promise<IChangeset | null> {
    const { localFiles, remoteFiles } = await this._getFilelists(this._config.local, this._target, this._conn)
    const changeset = this._buildChangeset(localFiles, remoteFiles)
    const filesToUpload = [...changeset.added, ...changeset.changed]

    if (isDryRun || (filesToUpload.length === 0 && changeset.removed.length === 0)) {
      return changeset
    }

    const _verifiedDirs = new Map();

    const verifyDirExists = async (remoteDir: string) => {
      if (!_verifiedDirs.has(remoteDir)) {
        const isVerified = await this._conn.remoteDirectoryExists(remoteDir)
        _verifiedDirs.set(remoteDir, isVerified)
      }
      return true
    }

    Log.info("\n%s files to upload...", filesToUpload.length)
    Log.info("%s files to remove...\n", changeset.removed.length)

    const confirmed = forceConfirmation === true
      ? true
      : await this._confirmUpload(this._target, filesToUpload.length)

    if (!confirmed) {
      Log.info("Canceled upload.")
      return null
    }

    Log.log("Uploading %s files...", filesToUpload.length)

    let sequentialUploader: any = Promise.resolve(true)

    filesToUpload.forEach((filePath: string) => {
      sequentialUploader = sequentialUploader.then(async () => {
        const remotePath = `${this._target.path}${filePath.replace(this._config.local.path, '')}`
        const remoteDir = path.dirname(remotePath)
        const localPath = path.resolve(filePath)

        await verifyDirExists(remoteDir)
        await this._conn.putFile(localPath, remotePath)
        return true
      })
    })

    if (this._config.local.deleteRemoteFiles && changeset.removed.length > 0) {
      changeset.removed.forEach((filePath: string) => {
        sequentialUploader = sequentialUploader.then(async () => {
          const remotePath = `${this._target.path}${filePath.replace(this._config.local.path, '')}`
          const didDelete = await this._conn.deleteRemoteFile(remotePath)
          if (!didDelete) Log.urgent("   -> Error deleting file")
          return true
        })
      })
    }

    await sequentialUploader

    // await Promise.all(
    //   filesToUpload.map(async (filePath: string) => {
    //     const remotePath = `${this._target.path}${filePath.replace(this._config.local.path, '')}`
    //     const remoteDir = path.dirname(remotePath)

    //     await verifyDirExists(remoteDir)
    //     await this._conn.putFile(filePath, remotePath)
    //     return filePath
    //   })
    // )

    const remoteCachePath = `${this._target.path}/${this._target.cache}`
    await verifyDirExists(path.dirname(remoteCachePath))
    await this._conn.putContent(
      JSON.stringify(localFiles, null, 2),
      remoteCachePath
    )

    return changeset
  }

  private _confirmUpload(target: ITargetConfig, fileCount: number): Promise<boolean> {
    // If no prompt is specified, auto-confirm upload!
    return new Promise(resolve => {
      if (!target.prompt) return resolve(true)

      const message = typeof target.prompt === 'string'
        ? target.prompt
        : "Confirm upload?"

      yesno.ask(`${message} - (Yes will upload)`, null, resolve)
    })
  }

  private async _getFilelists(local: ILocalConfig, target: ITargetConfig, conn: Connection) {
    // Load/build Filesets in parralel.
    const remoteFilesLoader = getRemoteFilelist(target, conn)
    const localFilesBuilder = buildLocalFilelist(local)

    return {
      localFiles: await localFilesBuilder,
      remoteFiles: await remoteFilesLoader
    }
  }

  private _buildChangeset(localFiles: IFilelist, remoteFiles: IFilelist) {
    const changeset: IChangeset = {
      added: [],
      removed: [],
      changed: []
    }

    // Build list of files that need to be uploaded...
    Object.keys(localFiles).forEach((localFilename: string) => {
      const localHash = localFiles[localFilename]
      const remoteHash = remoteFiles[localFilename]

      // Local hash not in remote cache
      if (!(localFilename in remoteFiles)) {
        changeset.added.push(localFilename)
      }
      // Local hash unequal to remote cache
      else if (remoteHash != localHash) {
        changeset.changed.push(localFilename)
      }
      // Local hash and remote hash are equal!
    })

    // Build list of files to be removed from the server...
    Object.keys(remoteFiles).forEach((remoteFilename) => {
      if (!(remoteFilename in localFiles)) {
        changeset.removed.push(remoteFilename)
      }
    })

    return changeset
  }

  static create(conn: Connection, config: IConfig, target: string | ITargetConfig) {
    return new Sync(conn, config, target);
  }
}