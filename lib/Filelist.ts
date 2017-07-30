import * as glob from 'glob'
import * as minimatch from 'minimatch'
import * as crc from 'crc'
import * as fs from 'fs'
import { ILocalConfig, ITargetConfig } from './Config'
import { Connection } from './Connection'

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
  // console.log(" <-", path)
  return conn.getRemoteFile(path)
    .then(JSON.parse)
    .catch((err) => {
      console.log("Missing or error parsing remote file list.", err)
      console.log("\n   Run sync:init to setup SyncoDeMayo on the server.\n")
      process.exit(1)
    })
}

export async function buildLocalFilelist(config: ILocalConfig): Promise<IFilelist> {
  // Create the CRCs...
  const excludeDirectories = (path: string) =>
    !fs.statSync(path).isDirectory()
  const excludeBlacklistedFiles = (path: string) =>
    !config.exclude.some(pattern => minimatch(path, pattern, { dot: true }))

  return glob
    .sync(`${config.path}/${config.files}`)
    .filter(excludeDirectories)
    .filter(excludeBlacklistedFiles)
    .reduce((hash: any, filepath: string) => (
      hash[filepath] = crc.crc32(fs.readFileSync(filepath)), hash), {}
    ) as IFilelist
}
