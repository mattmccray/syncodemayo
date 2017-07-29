import * as dotenv from 'dotenv'
import * as Bluebird from 'bluebird'
import * as JsFtp from 'jsftp'
import * as JsFtpMkDirP from 'jsftp-mkdirp'
import * as glob from 'glob'
import * as minimatch from 'minimatch'
import * as path from 'path'
import * as crc from 'crc'
import * as fsSrc from 'fs'
import * as _ from 'lodash'

dotenv.config()

const Ftp: any = JsFtpMkDirP(JsFtp)
const fs: any = Bluebird.promisifyAll(fsSrc)

interface IConfig {
  local: ILocalConfig
  targets: { [name: string]: ITargetConfig }
  _path: string
  _target: ITargetConfig
}

interface ILocalConfig {
  path: string
  files: string
  exclude: string[]
}

interface ITargetConfig {
  host: string
  user: string
  pass: string
  path: string
  port: number
  cache: string
}

export interface CLIOptions {
  verbose: boolean
  force: boolean
  stage: string
  config?: string
}

interface IFilelist {
  [filename: string]: number
}


let conn: any = null
let config: IConfig = {} as IConfig
let opts: CLIOptions = {
  verbose: false,
  force: false,
  stage: 'staging'
}


const DRY_RUN_MSG = "Dry run, stopping sync."

function log(...args: any[]) {
  if (opts.verbose) {
    console.log(...args)
  }
}

async function connect(config: ITargetConfig) {
  const { host, port, user, pass } = config

  log("Connecting to FTP:", { host, port, user, pass: `(${pass.length} chars)` })
  return new Ftp({ host, port, user, pass, debugMode: false })
}

function getRemoteFile(filename: string): Promise<string> {
  log("Retrieve:", filename)
  let content = ""
  return new Promise((resolve, reject) => {
    conn.get(filename, function (err: any, socket: any) {
      if (err != null) { return reject(err) }

      socket.on("data", (d: any) => content += d.toString())
      socket.on('error', (err: any) => {
        console.log("Retrieval error.")
        reject(err)
      })
      socket.on("close", (connErr: any) => {
        if (connErr) {
          reject(connErr)
        }
        else {
          resolve(content)
        }
      })
      socket.resume()
    })
  })
}

function verifyRemoteDirectory(pathname: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    conn.mkdirp(pathname, (err: any) => resolve(!err))
  })
}

function putBuffer(buff: any, remotePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(" ->", remotePath)
    conn.put(buff, remotePath, (err: any) => {
      if (err) {
        reject(err)
      }
      else {
        resolve(remotePath)
      }
    })
  })
}

function putContent(content: string, remotePath: string) {
  return putBuffer(new Buffer(content), remotePath)
}

async function putFile(filename: string, remotePath: string) {
  const buffer = await fs.readFileAsync(filename)
  await putBuffer(buffer, remotePath)
  return remotePath
}


async function loadLocalConfig(pathname: string): Promise<IConfig> {
  if (typeof pathname !== 'string')
    throw new Error(`Path must be a string. Got a ${typeof pathname}`)

  const fullpath = path.resolve("./" + pathname)

  log("Trying require of:", fullpath)
  const data = require(fullpath) as IConfig

  if (typeof data === 'object')
    data._path = fullpath

  return data
}


function getConfig(opts: Partial<CLIOptions>): Promise<IConfig> {
  if (opts == null) { opts = {} }
  log("SyncoDeMayo, getting started...")
  return new Promise((resolve, reject) => {
    const potentialConfigs = [
      '.syncodemayo.json',
      'syncodemayo.json',
      '.syncodemayo.js',
      'syncodemayo.js',
      '.syncodemayo',
      '.sync-config',
      'sync-config.json',
      'sync-config.js'
    ]
    if (!!opts.config) {
      potentialConfigs.unshift(opts.config)
    }
    const tryLoading = (path: string | undefined) => {
      if (!!path) {
        loadLocalConfig(path)
          .then(result => {
            resolve(result)
          })
          .catch(err => {
            tryLoading(potentialConfigs.shift())
          })
      }
      else {
        reject(new Error("Local config not found."))
      }
    }

    tryLoading(potentialConfigs.shift())
  })
}


function getRemoteFilelist(config: ITargetConfig): Promise<IFilelist> {
  const pathname = `${config.path}/${config.cache}`
  console.log(" <-", pathname)
  return getRemoteFile(pathname)
    .then(JSON.parse)
    .catch((err) => {
      console.log("Missing or error parsing remote file list.", err)
      console.log("\n   Run sync:init to setup SyncoDeMayo on the server.\n")
      process.exit(1)
    })
}


async function buildLocalFilelist(config: ILocalConfig): Promise<IFilelist> {
  const excludeDirectories = (path: string) =>
    !fs.statSync(path).isDirectory()
  const excludeBlacklistedFiles = (path: string) =>
    config.exclude.some(pattern => minimatch(path, pattern, { dot: true }))

  log("Create CRCs:")
  const filelist: IFilelist = {}
  const pathname = `${config.path}/${config.files || '**/**'}`
  const paths = glob.sync(pathname)
  const filePaths = _(paths)
    .filter(excludeDirectories)
    .uniq()
    .compact()
    .filter(excludeBlacklistedFiles)
    .value()

  for (let pathname of filePaths) {
    filelist[pathname] = crc.crc32(fs.readFileSync(pathname))
  }

  return filelist
}


async function startup(options: Partial<CLIOptions>) {
  if (!options) { options = {} }
  opts = _.defaults(options, opts)

  const conf = await getConfig(options)

  if (conf == null)
    throw new Error("Local config not found.")

  if (!conf.local)
    throw new Error("Invalid config, 'local' section missing.")

  conf._target = conf.targets[opts.stage || 'staging']

  if (!conf._target)
    throw new Error(`Target '${opts.stage || 'staging'}' section missing.`)

  conf._target.cache = conf._target.cache || '.synco-filelist'

  // Assign global
  config = conf

  const conn = await connect(conf._target)

  console.log(`Connected to ${config._target.host}`)
  return conn
}


function cleanup(data?: any) {
  conn && conn.raw && conn.raw.quit && conn.raw.quit((err: any, data: any) => {
    if (err != null) {
      console.error(err)
    }
  })
  return data
}

function cleanupAndRethrowError(err: any) {
  cleanup()
  throw err
}

function remoteFileExists(remotePath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    conn.raw.size(remotePath, (err: any, size: any) => resolve(!err))
  })
}

function initializeServerConfiguration() {
  log("Connected to server.")
  const remotePath = `${config._target.path}/${config._target.cache}`
  return remoteFileExists(remotePath)
    .then((exists) => {
      if (exists) {
        if (opts.force) {
          console.log(`${config._target.host} already is initialized, forcing over-write of existing filelist`)
        }
        else {
          console.log(`${config._target.host} already is initialized, to re-initialize use the --force option`)
          throw new Error("Already initialized")
        }
      }
      else {
        return true
      }
    })
    .then(() => {
      log("Updating remote filelist:", remotePath)
      return verifyRemoteDirectory(path.dirname(remotePath))
        .then(function (success) {
          if (success) {
            putContent("{}", remotePath)
          }
          else {
            console.error("Directory error.")
            throw new Error("Directory creation error.")
          }
        })
    })
}

function doFileSync(dryRun: boolean) {
  log("Connected to server.")
  return Promise
    .all([
      getRemoteFilelist(config._target),
      buildLocalFilelist(config.local)
    ])
    .then(([remoteFiles, localFiles]) => {
      log("Remote filelist:", remoteFiles)
      log("Local filelist:", localFiles)

      const changeset = {
        added: [] as string[],
        changed: [] as string[],
        removed: [] as string[],
        uploading: [] as string[]
      }

      Object
        .keys(localFiles)
        .forEach((localFilename: string) => {
          const localHash = localFiles[localFilename]

          if (!(localFilename in remoteFiles)) {
            changeset.added.push(localFilename)
            changeset.uploading.push(localFilename)
          }
          else if (remoteFiles[localFilename] != localHash) {
            changeset.changed.push(localFilename)
            changeset.uploading.push(localFilename)
          }
        })
      Object
        .keys(remoteFiles)
        .forEach((remoteFilename) => {
          // const remoteHash = remoteFiles[remoteFilename]

          if (!(remoteFilename in localFiles)) {
            changeset.removed.push(remoteFilename)
          }
        })

      log("File Changeset:", changeset)

      if (dryRun) {
        if (changeset.added.length > 0) {
          console.log("New Local Files: (%s)", changeset.added.length)
          changeset.added.forEach(f => console.log(" -", f))
        }
        if (changeset.changed.length > 0) {
          console.log("Changed Local Files: (%s)", changeset.changed.length)
          changeset.changed.forEach(f => console.log(" -", f))
        }
        if (changeset.removed.length > 0) {
          console.log("Removed Local Files (not handled yet): (%s)", changeset.removed.length)
          changeset.removed.forEach(f => console.log(" -", f))
        }
        throw new Error(DRY_RUN_MSG)
      }

      return changeset.uploading
    })
    .then((changedFiles) => {
      log("Changed files:", changedFiles)
      let current = Promise.resolve({})

      console.log("Uploading %s files...", changedFiles.length)
      return Promise
        .all(changedFiles.map((filename) => {
          const remotePath = `${config._target.path}${filename.replace(config.local.path, '')}`
          return current = current
            .then(() => verifyRemoteDirectory(path.dirname(remotePath)))
            .then(() => putFile(filename, remotePath))
        }))
        .then(() => changedFiles)
    })
    .then((changedFiles: string[]) => {
      if (changedFiles.length > 0) {
        const remotePath = `${config._target.path}/${config._target.cache}`
        log("Updating remote filelist:", remotePath)
        return verifyRemoteDirectory(path.dirname(remotePath))
          .then((success) => {
            if (success) {
              putContent(JSON.stringify(changedFiles, null, 2), remotePath)
            }
            else {
              console.error("Directory error.")
              throw new Error("Directory creation error.")
            }
          })
      }
      else {
        console.log("No changed files.")
      }
    })
    .catch((err) => {
      if (err.message !== DRY_RUN_MSG) {
        throw err
      }
    })
}



/**
 * Check ensures that the server is setup to sync
 */
export function check(options: Partial<CLIOptions>) {
  if (options == null) { options = {} }
  log("Checking server....")

  return startup(options)
    .then(() => {
      log("Connected to server.")
      const remotePath = `${config._target.path}/${config._target.cache}`
      log("Looking for", remotePath)
      return remoteFileExists(remotePath)
    })
    .then((exists) => {
      if (exists) {
        console.log(`${config._target.host} appears ready to sync.`)
      }
      else {
        console.log(`It looks like you need to run sync:init for ${config._target.host}`)
      }
    })
    .then(cleanup)
    .catch(cleanupAndRethrowError)
}

/**
 * Initialize server to support sync
 */
export function init(options: Partial<CLIOptions>) {
  if (options == null) { options = {} }
  return startup(options)
    .then(initializeServerConfiguration)
    .catch(err => {
      if (err.message === "Local config not found.") {
        const configPath = path.resolve('./syncodemayo.json')
        console.log("Creating local config at:")
        console.log(" -", configPath)
        fs.writeFileSync(
          configPath,
          JSON.stringify({
            local: {
              path: "public",
              files: "**/**",
              exclude: ["**/*.map", "**/.DS_Store", "**/.git*"]
            },
            targets: {
              staging: {
                path: "Example/www/stage",
                host: "www.example.com",
                user: "USERNAME",
                pass: "PASSWORD",
                port: 21,
                cache: ".synco-filelist"
              }
            }
          }, null, 2)
        )
      }
      else {
        throw err
      }
    })
    .then(cleanup)
    .catch(cleanupAndRethrowError)
}


/**
 * Display list of changed files
 */
export function changed(options: Partial<CLIOptions>) {
  return startup(options)
    .then(() => {
      const remotePath = `${config._target.path}/${config._target.cache}`
      return remoteFileExists(remotePath)
    })
    .then((isConfigured) => {
      if (!isConfigured) { throw new Error(`${config._target.host} doesn't appear to be configured. Run sync:init.`) }
      return isConfigured
    })
    .then(() => doFileSync(true))
    .then(cleanup)
    .catch(cleanupAndRethrowError)
}

/**
 * Syncronize local and remote files via FTP
 */
export function run(options: Partial<CLIOptions>) {
  if (options == null) { options = {} }
  return startup(options)
    .then(() => {
      const remotePath = `${config._target.path}/${config._target.cache}`
      return remoteFileExists(remotePath)
    })
    .then((isConfigured) => {
      if (!isConfigured) { throw new Error(`${config._target.host} doesn't appear to be configured. Run sync:init.`) }
      return isConfigured
    })
    .then(() => doFileSync(false))
    .then(cleanup)
    .catch(cleanupAndRethrowError)
}

export function listTargets(options: Partial<CLIOptions>) {
  return getConfig(options)
    .then((config: IConfig) => {
      console.log("Sync targets:")
      Object.keys(config.targets).forEach((target: any) => {
        if (target != 'local' && !target.startsWith('_'))
          console.log(" -", target)
      })
    })
}
