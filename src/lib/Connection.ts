import { Readable, Writable } from 'node:stream'
import { Client as FtpClient } from 'basic-ftp'
import * as Log from './Log.js'
import { ITargetConfig, resolvePassword } from './Config.js'
import { readLocalFile } from './Filelist.js'
import { RemoteConnection } from './RemoteConnection.js'

/** How to reach an FTP/FTPS server. */
export interface ConnectionOptions {
  host: string
  port: number
  user: string
  pass: string
  /** `false`: plain FTP. `true`: explicit FTPS (AUTH TLS). `"implicit"`: implicit FTPS. */
  secure?: boolean | 'implicit'
  /** `false` accepts self-signed or mismatched TLS certificates (with a warning). Default `true`. */
  rejectUnauthorized?: boolean
  /** The target name, for messages. */
  name?: string
}

// Node TLS error codes meaning the server's certificate was not trusted.
const UNTRUSTED_CERT_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'CERT_UNTRUSTED',
  'CERT_REJECTED',
  'CERT_SIGNATURE_FAILURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
])

/**
 * A `RemoteConnection` over FTP or FTPS, on `basic-ftp`. It logs in on the first operation and
 * runs operations one at a time, in the order they were called. After creating directories it
 * goes back to the login directory, so relative paths stay relative to it.
 */
export class Connection implements RemoteConnection {
  private _options: ConnectionOptions
  private _client: FtpClient
  private _connected: Promise<string> | undefined
  private _queue: Promise<unknown> = Promise.resolve()
  private _closed = false

  constructor(options: ConnectionOptions) {
    this._options = options
    this._client = new FtpClient()
  }

  // Runs `task` after every operation queued before it, so the client is never used concurrently.
  private _run<T>(task: (startDir: string) => Promise<T>): Promise<T> {
    if (this._closed) return Promise.reject(new Error("Connection is closed."))
    const result = this._queue.then(async () => task(await this._connect()))
    this._queue = result.catch(() => undefined)
    return result
  }

  // Connects and logs in once; resolves the login directory.
  private _connect(): Promise<string> {
    if (!this._connected) this._connected = this._login()
    return this._connected
  }

  private async _login(): Promise<string> {
    const { host, port, user, pass, name } = this._options
    const secure = this._options.secure ?? false
    const rejectUnauthorized = this._options.rejectUnauthorized !== false

    if (secure && !rejectUnauthorized) {
      Log.urgent(`Warning: TLS certificate checks are off for target "${name ?? host}" (rejectUnauthorized: false). The certificate of ${host} is not verified.`)
    }

    try {
      await this._client.access({ host, port, user, password: pass, secure, secureOptions: { rejectUnauthorized } })
    }
    catch (err) {
      throw describeConnectError(err, this._options)
    }
    return this._client.pwd()
  }

  getRemoteFile(filename: string): Promise<string> {
    return this._run(async () => {
      Log.log(" <-", filename)
      const chunks: Buffer[] = []
      const sink = new Writable({
        write(chunk: Buffer, _encoding, callback) {
          chunks.push(chunk)
          callback()
        },
      })
      await this._client.downloadTo(sink, filename)
      return Buffer.concat(chunks).toString()
    })
  }

  // As in v1, this creates the directory and any missing parents (mkdir -p), and resolves
  // whether that worked.
  remoteDirectoryExists(pathname: string): Promise<boolean> {
    return this._run(async (startDir) => {
      try {
        await this._client.ensureDir(pathname)
        return true
      }
      catch {
        return false
      }
      finally {
        await this._client.cd(startDir)
      }
    })
  }

  remoteFileExists(remotePath: string): Promise<boolean> {
    return this._run(async () => {
      try {
        await this._client.size(remotePath)
        return true
      }
      catch {
        return false
      }
    })
  }

  putBuffer(buff: Buffer, remotePath: string): Promise<boolean> {
    return this._run(async () => {
      Log.log(" ->", remotePath)
      await this._client.uploadFrom(Readable.from([buff]), remotePath)
      return true
    })
  }

  putContent(content: string, remotePath: string): Promise<boolean> {
    return this.putBuffer(Buffer.from(content), remotePath)
  }

  async putFile(filename: string, remotePath: string): Promise<string> {
    const buffer = await readLocalFile(filename, true) as Buffer
    await this.putBuffer(buffer, remotePath)
    return remotePath
  }

  deleteRemoteFile(remotePath: string): Promise<boolean> {
    return this._run(async () => {
      Log.log("  x", remotePath)
      try {
        await this._client.remove(remotePath)
        return true
      }
      catch (err) {
        Log.log("Error removing", remotePath, (err as Error).message)
        return false
      }
    })
  }

  // Waits for queued operations, then closes the control and data sockets. Safe to call twice.
  async close(): Promise<void> {
    if (this._closed) return
    this._closed = true
    await this._queue
    this._client.close()
  }

  static create(target: ITargetConfig): Connection {
    const pass = resolvePassword(target)
    return new Connection({
      host: target.host,
      port: target.port,
      user: target.user,
      pass,
      secure: target.secure,
      rejectUnauthorized: target.rejectUnauthorized,
      name: target._name,
    })
  }
}

// An untrusted certificate becomes an error that names the host and the opt-out; anything
// else is returned as is.
function describeConnectError(err: unknown, options: ConnectionOptions): unknown {
  const code = (err as NodeJS.ErrnoException | undefined)?.code
  if (typeof code !== 'string' || !UNTRUSTED_CERT_CODES.has(code)) return err
  const target = options.name ? ` on target "${options.name}"` : ''
  return new Error(
    `The TLS certificate of ${options.host} was not trusted (${(err as Error).message}). ` +
    `If you trust this server, set "rejectUnauthorized": false${target} to accept its certificate.`,
    { cause: err },
  )
}
