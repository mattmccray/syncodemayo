// An in-memory RemoteConnection for tests. It holds remote files in a Map (path -> Buffer),
// records every call in `calls` as { op, args }, and counts close() calls.
// `failOn(op, n, error)` makes the n-th call (1-based) of `op` reject with `error`.
import { readFileSync } from 'node:fs'

export class FakeConnection {
  constructor(files = {}) {
    this.files = new Map(Object.entries(files).map(([path, content]) => [path, Buffer.from(content)]))
    this.dirs = new Set()
    this.calls = []
    this.closeCount = 0
    this._failures = []
  }

  failOn(op, n, error = new Error(`fake ${op} failure`)) {
    this._failures.push({ op, n, error })
    return this
  }

  // Records the call, and throws if a failure is set for this call.
  _record(op, ...args) {
    this.calls.push({ op, args })
    const count = this.calls.filter(call => call.op === op).length
    const failure = this._failures.find(f => f.op === op && f.n === count)
    if (failure) throw failure.error
  }

  callsTo(op) {
    return this.calls.filter(call => call.op === op)
  }

  async getRemoteFile(remotePath) {
    this._record('getRemoteFile', remotePath)
    if (!this.files.has(remotePath)) throw new Error(`550 ${remotePath}: no such file`)
    return this.files.get(remotePath).toString()
  }

  async remoteFileExists(remotePath) {
    this._record('remoteFileExists', remotePath)
    return this.files.has(remotePath)
  }

  async remoteDirectoryExists(remoteDir) {
    this._record('remoteDirectoryExists', remoteDir)
    this.dirs.add(remoteDir)
    return true
  }

  async putBuffer(buffer, remotePath) {
    this._record('putBuffer', buffer, remotePath)
    this.files.set(remotePath, Buffer.from(buffer))
    return true
  }

  async putContent(content, remotePath) {
    this._record('putContent', content, remotePath)
    this.files.set(remotePath, Buffer.from(content))
    return true
  }

  async putFile(localPath, remotePath) {
    this._record('putFile', localPath, remotePath)
    this.files.set(remotePath, readFileSync(localPath))
    return remotePath
  }

  async deleteRemoteFile(remotePath) {
    this._record('deleteRemoteFile', remotePath)
    return this.files.delete(remotePath)
  }

  async close() {
    this.closeCount++
    this._record('close')
  }
}

// The operations that change the remote side.
export const WRITE_OPS = ['remoteDirectoryExists', 'putBuffer', 'putContent', 'putFile', 'deleteRemoteFile']
