import * as JsFtp from 'jsftp'
import * as JsFtpMkDirP from 'jsftp-mkdirp'
import { ITargetConfig, resolvePassword } from './Config'
import { readLocalFile } from './Filelist'

const Ftp: any = JsFtpMkDirP(JsFtp)


/*
  TODO: Extract FTP from the connection to allow other connection types.. File/SFTP/S3/whatever
*/

// interface IRemoteConnection {
//   get(filepath): Promise<string>
//   put(filepath): Promise<boolean>
// }

export class Connection {
  private _ftpConn: any

  constructor(host: string, port: number, user: string, pass: string) {
    // log("Connecting to FTP:", { host, port, user, pass: `(${pass.length} chars)` })
    this._ftpConn = new Ftp({ host, port, user, pass })
    process.on('beforeExit', () => {
      this.close() // Ensure all connections are close when the app exits
    })
  }

  getRemoteFile(filename: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let content = ""
      console.log(" <-", filename)
      this._ftpConn.get(filename, function (err: any, socket: any) {
        if (err != null) { return reject(err) }

        socket.on("data", (d: any) => content += d.toString())
        socket.on('error', (err: any) => {
          console.log("Retrieval error.")
          reject(err)
        })
        socket.on("close", (connErr: any) => {
          if (connErr) reject(connErr)
          else resolve(content)
        })
        socket.resume()
      })
    })
  }

  remoteDirectoryExists(pathname: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this._ftpConn.mkdirp(pathname, (err: any) => resolve(!err))
    })
  }

  remoteFileExists(remotePath: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this._ftpConn.raw.size(remotePath, (err: any, size: any) => resolve(!err))
    })
  }

  putBuffer(buff: any, remotePath: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      console.log(" ->", remotePath)
      this._ftpConn.put(buff, remotePath, (err: any) => {
        if (err) reject(err)
        else resolve(true)
      })
    })
  }

  putContent(content: string, remotePath: string) {
    return this.putBuffer(new Buffer(content), remotePath)
  }

  async putFile(filename: string, remotePath: string) {
    const buffer = await readLocalFile(filename, true)
    await this.putBuffer(buffer, remotePath)
    return remotePath
  }

  deleteRemoteFile(remotePath: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      console.log("  x", remotePath)
      this._ftpConn.raw('dele', remotePath, function (err: Error, data: any) {
        if (err) console.log("Error removing", remotePath, err.message)

        if (err) resolve(false)
        else resolve(true)
      })
    })
  }

  close() {
    const conn = this._ftpConn
    conn && conn.raw && conn.raw.quit && conn.raw.quit((err: any, data: any) => {
      if (err != null) console.error(err)
    })
  }

  static create(target: ITargetConfig) {
    const pass = resolvePassword(target)
    return new Connection(target.host, target.port, target.user, pass)
  }
}