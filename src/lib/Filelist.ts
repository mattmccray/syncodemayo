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
// Each directory is globbed with `*` and `.*` from inside it. `fs.globSync`'s
// `**` can't do the walk: it never lists a dot entry or enters a
// dot-directory, on Node 22.17 `**/.*` finds no dot entries at all, and it
// follows a symlinked directory only one level deep.
//
// Symlinks follow glob 7's `**/**` rule (the v1 default `files`): a symlinked
// directory reached through real directories is walked in full, but a
// symlinked directory inside one is not entered. No path crosses more than one
// symlink, so a symlink loop ends instead of failing with ELOOP. Entries that
// can't be resolved (dangling symlinks, self-referencing symlinks) are skipped.
// lstat and stat for one entry, or null when it can't be resolved (a dangling
// symlink, or a symlink loop): such entries are skipped.
function statEntry(fullpath: string): { isSymlink: boolean, isDirectory: boolean } | null {
  try {
    return {
      isSymlink: fs.lstatSync(fullpath).isSymbolicLink(),
      isDirectory: fs.statSync(fullpath).isDirectory(),
    }
  }
  catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ELOOP') return null
    throw err
  }
}

export function listLocalFiles(root: string): string[] {
  const files = new Set<string>()
  const pending: { dir: string, inSymlink: boolean }[] = [{ dir: '', inSymlink: false }]

  while (pending.length > 0) {
    const { dir, inSymlink } = pending.pop()!
    const entries = new Set(fs.globSync(['*', '.*'], { cwd: path.join(root, dir) }))
    for (const entry of entries) {
      const relative = dir ? `${dir}/${toPosixPath(entry)}` : toPosixPath(entry)
      const fullpath = path.join(root, relative)
      const stats = statEntry(fullpath)
      if (stats == null) continue
      const { isSymlink, isDirectory } = stats
      if (!isDirectory) {
        files.add(relative)
      }
      else if (!isSymlink) {
        pending.push({ dir: relative, inSymlink })
      }
      else if (!inSymlink) {
        pending.push({ dir: relative, inSymlink: true })
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
