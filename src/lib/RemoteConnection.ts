import { ITargetConfig } from './Config.js'

/**
 * The remote operations `Sync`, `TargetServer` and `getRemoteFilelist` use. The FTP/FTPS
 * implementation is `Connection`; tests use an in-memory fake.
 *
 * Remote paths are used as given: a relative path is relative to the login directory, for the
 * whole life of the connection.
 */
export interface RemoteConnection {
  /** Reads a remote file as text. Rejects when it can't be read. */
  getRemoteFile(remotePath: string): Promise<string>

  /** Whether a remote file exists. */
  remoteFileExists(remotePath: string): Promise<boolean>

  /**
   * Whether a remote directory exists. Only reads: it never creates anything. `init` uses it to
   * check `target.path`, which it must not create.
   */
  remoteDirectoryFound(remoteDir: string): Promise<boolean>

  /**
   * Ensures a remote directory exists, creating it and any missing parents (mkdir -p).
   * Resolves whether it exists afterwards. `Sync` uses it for subfolders under `target.path`;
   * to check a directory without creating it, use `remoteDirectoryFound`.
   */
  remoteDirectoryExists(remoteDir: string): Promise<boolean>

  /** Uploads a buffer to a remote file. */
  putBuffer(buffer: Buffer, remotePath: string): Promise<boolean>

  /** Uploads a string to a remote file. */
  putContent(content: string, remotePath: string): Promise<boolean>

  /** Uploads a local file to a remote file, and resolves the remote path. */
  putFile(localPath: string, remotePath: string): Promise<string>

  /** Deletes a remote file. Resolves false, rather than rejecting, when it can't. */
  deleteRemoteFile(remotePath: string): Promise<boolean>

  /** Closes the connection. */
  close(): Promise<void>
}

/** Opens a connection to a target. */
export type ConnectionFactory = (target: ITargetConfig) => RemoteConnection
