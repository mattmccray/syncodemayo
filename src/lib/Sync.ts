
import * as path from 'path'
import * as Log from './Log.js'
import { IConfig, ILocalConfig, ITargetConfig, resolveTarget } from './Config.js'
import { RemoteConnection } from './RemoteConnection.js'
import { IFilelist, getRemoteFilelist, buildLocalFilelist, remotePathForKey } from './Filelist.js'
import { ConfirmStreams, confirmUpload } from './Prompt.js'

export interface IChangeset {
  added: string[]
  changed: string[]
  removed: string[]
}

export class Sync {
  private _conn: RemoteConnection
  private _config: IConfig
  private _target: ITargetConfig

  constructor(conn: RemoteConnection, config: IConfig, target: string | ITargetConfig) {
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

    // The remote path for a cache key, or null (with a warning) when the key is outside the
    // current local.path.
    const remotePathFor = (filePath: string): string | null => {
      const remotePath = remotePathForKey(this._config.local.path, this._target.path, filePath)
      if (remotePath === null) {
        Log.urgent(`   -> Skipping ${filePath}: it isn't under local.path (${this._config.local.path}), so its remote path is unknown.`)
      }
      return remotePath
    }

    let sequentialUploader: any = Promise.resolve(true)

    filesToUpload.forEach((filePath: string) => {
      sequentialUploader = sequentialUploader.then(async () => {
        const remotePath = remotePathFor(filePath)
        if (remotePath === null) return true
        const remoteDir = path.posix.dirname(remotePath)
        const localPath = path.resolve(filePath)

        await verifyDirExists(remoteDir)
        await this._conn.putFile(localPath, remotePath)
        return true
      })
    })

    if (this._config.local.deleteRemoteFiles && changeset.removed.length > 0) {
      changeset.removed.forEach((filePath: string) => {
        sequentialUploader = sequentialUploader.then(async () => {
          const remotePath = remotePathFor(filePath)
          if (remotePath === null) return true
          const didDelete = await this._conn.deleteRemoteFile(remotePath)
          if (!didDelete) Log.urgent("   -> Error deleting file")
          return true
        })
      })
    }

    await sequentialUploader

    const remoteCachePath = `${this._target.path}/${this._target.cache}`
    await verifyDirExists(path.dirname(remoteCachePath))
    await this._conn.putContent(
      JSON.stringify(localFiles, null, 2),
      remoteCachePath
    )

    return changeset
  }

  private async _confirmUpload(target: ITargetConfig, fileCount: number, streams?: ConfirmStreams): Promise<boolean> {
    // If no prompt is specified, auto-confirm upload!
    if (!target.prompt) return true

    const message = typeof target.prompt === 'string'
      ? target.prompt
      : "Confirm upload?"

    return confirmUpload(message, streams)
  }

  private async _getFilelists(local: ILocalConfig, target: ITargetConfig, conn: RemoteConnection) {
    // Load/build Filesets in parallel.
    const [localFiles, remoteFiles] = await Promise.all([
      buildLocalFilelist(local),
      getRemoteFilelist(target, conn),
    ])
    return { localFiles, remoteFiles }
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

  static create(conn: RemoteConnection, config: IConfig, target: string | ITargetConfig) {
    return new Sync(conn, config, target);
  }
}