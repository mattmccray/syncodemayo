import * as fs from 'fs'
import * as path from 'path'
import { crc32 } from 'zlib'
import * as Log from './Log.js'
import { ILocalConfig, ITargetConfig } from './Config.js'
import { Connection } from './Connection.js'

export interface IFilelist {
  [filename: string]: number
}

export async function localFileExists(path: string): Promise<boolean> {
  return fs.existsSync(path)
}

export async function readLocalFile(path: string, asBuffer = false): Promise<string | Buffer> {
  const buff = fs.readFileSync(path)
  return asBuffer ? buff : buff.toString()
}

export async function writeLocalFile(path: string, content: string): Promise<any> {
  return fs.writeFileSync(path, content)
}

export function getRemoteFilelist(target: ITargetConfig, conn: Connection): Promise<IFilelist> {
  const path = `${target.path}/${target.cache}`
  return conn.getRemoteFile(path)
    .then(JSON.parse)
    .catch((err) => {
      Log.info("Missing or error parsing remote file list.", err)
      Log.log("\n   Run sync:init to setup SyncoDeMayo on the server.\n")
      process.exit(1)
    })
}

/**
 * Converts a path that uses `sep` as its separator to POSIX (`/`) separators.
 */
export function toPosixPath(filepath: string, sep: string = path.sep): string {
  return sep === '/' ? filepath : filepath.split(sep).join('/')
}

/**
 * The cache key for a file: its POSIX path relative to `local.path`, prefixed
 * with `local.path`. Matches the keys v1 got from glob 7, which collapsed
 * repeated slashes (so `public/` and `public//` both give `public/<file>`).
 */
export function filelistKey(localPath: string, relativePath: string, sep: string = path.sep): string {
  const prefix = toPosixPath(localPath, sep).replace(/\/+/g, '/').replace(/\/$/, '')
  return `${prefix}/${toPosixPath(relativePath, sep)}`
}

/**
 * The CRC32 of a file's bytes as an unsigned 32-bit integer, the same value
 * `crc` 3.4.1's `crc32` gave v1.
 */
export function fileCrc32(filepath: string): number {
  return crc32(fs.readFileSync(filepath)) >>> 0
}

// A private-use character that stands in for a leading `.` in a path segment.
// `path.matchesGlob` never lets `*`, `**`, or `?` match a segment that starts
// with `.`, but it does match this character.
const DOT_MASK = '\uE000'

const maskPathDots = (posixPath: string) =>
  posixPath
    .split('/')
    .map(segment => segment.startsWith('.') && segment !== '.' && segment !== '..'
      ? DOT_MASK + segment.slice(1)
      : segment)
    .join('/')

// A literal `.` that starts a pattern segment (or a brace, extglob, or
// alternative inside one) must match the masked dot in the path.
const maskPatternDots = (pattern: string) =>
  pattern.replace(/(^|[/{,(|])\./g, `$1${DOT_MASK}`)

/**
 * `path.matchesGlob` with minimatch's `{ dot: true }` meaning, as v1 used it:
 * `*`, `**`, and `?` also match path segments that start with `.`.
 * `filepath` uses POSIX separators.
 */
export function matchesGlobDot(filepath: string, pattern: string): boolean {
  return path.matchesGlob(filepath, pattern)
    || path.matchesGlob(maskPathDots(filepath), maskPatternDots(pattern))
}

// Every file (no directories) under `root`, dotfiles and files inside
// dot-directories included, as sorted POSIX paths relative to `root`.
//
// `fs.globSync('**/*')` never lists a dot entry or enters a dot-directory, and
// on Node 22.17 a pattern like `**/.*` finds no dot entries at all (only `.*`,
// globbed from inside the directory, does). So this globs `**/*` from the root
// and from each dot-directory, and `.*` from every directory found.
export function listLocalFiles(root: string): string[] {
  const files = new Set<string>()
  const seenDirs = new Set<string>()
  const trees: string[] = ['']  // globbed with `**/*`: the root and each dot-directory
  const dirs: string[] = []     // globbed with `.*`: every directory found

  const childOf = (dir: string, entry: string) =>
    dir ? `${dir}/${toPosixPath(entry)}` : toPosixPath(entry)
  const isDirectory = (relative: string) =>
    fs.statSync(path.join(root, relative)).isDirectory()
  const addDir = (relative: string, queue: string[]) => {
    if (seenDirs.has(relative)) return
    seenDirs.add(relative)
    queue.push(relative)
  }

  while (trees.length > 0) {
    const tree = trees.pop()!
    dirs.push(tree)
    for (const entry of fs.globSync('**/*', { cwd: path.join(root, tree) })) {
      const relative = childOf(tree, entry)
      if (isDirectory(relative)) addDir(relative, dirs)
      else files.add(relative)
    }
    while (dirs.length > 0) {
      const dir = dirs.pop()!
      for (const entry of fs.globSync('.*', { cwd: path.join(root, dir) })) {
        const relative = childOf(dir, entry)
        if (isDirectory(relative)) addDir(relative, trees)
        else files.add(relative)
      }
    }
  }

  return [...files].sort()
}

export async function buildLocalFilelist(config: ILocalConfig): Promise<IFilelist> {
  // Create the CRCs...
  const isListed = (relative: string) =>
    matchesGlobDot(relative, config.files)
  const isExcluded = (key: string) =>
    config.exclude.some(pattern => matchesGlobDot(key, pattern))

  const filelist: IFilelist = {}
  for (const relative of listLocalFiles(config.path).filter(isListed)) {
    const key = filelistKey(config.path, relative)
    if (isExcluded(key)) continue
    filelist[key] = fileCrc32(path.join(config.path, relative))
  }
  return filelist
}
