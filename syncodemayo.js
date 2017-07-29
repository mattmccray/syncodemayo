const Promise = require('bluebird');
const Ftp = require('jsftp-mkdirp')(require('jsftp'));
const glob = require('glob');
const path = require('path');
const crc = require('crc');
const fs = require('fs');
const _ = require('lodash');

Promise.promisifyAll(fs);

Promise.resolve(false)

let conn = null;
let config = {};
let opts = {
  verbose: false,
  force: false
};

const DRY_RUN_MSG = "Dry run, stopping sync."

function log() {
  if (opts.verbose) {
    console.log(...arguments);
  }
};

// Connect to ftp
function connect(config) {
  return new Promise((resolve, reject) => {
    const { host, port, user, pass } = config;

    log("Connecting to FTP:", { host, port, user, pass: `(${pass.length} chars)` });
    conn = new Ftp({ host, port, user, pass });

    resolve(conn);
  })
};

function getRemoteFile(filename) {
  log("Retrieve:", filename);
  let content = "";
  return new Promise((resolve, reject) => {
    conn.get(filename, function (err, socket) {
      if (err != null) { return reject(err); }

      socket.on("data", (d) => content += d.toString());
      socket.on('error', (err) => {
        console.log("Retrieval error.");
        reject(conn_err);
      });
      socket.on("close", (conn_err) => {
        if (conn_err) {
          reject(conn_err);
        }
        else {
          resolve(content);
        }
      });
      socket.resume();
    });
  });
};

function verifyRemoteDirectory(pathname) {
  return new Promise((resolve, reject) => {
    conn.mkdirp(pathname, function (err) {
      if (err) {
        reject(err);
      }
      else {
        resolve(true);
      }
    });
  })
};

function putBuffer(buff, remotePath) {
  return new Promise((resolve, reject) => {
    console.log(" ->", remotePath);
    conn.put(buff, remotePath, function (err) {
      if (err) {
        reject(err);
      }
      else {
        resolve(remotePath);
      }
    });
  })
};

function putContent(content, remotePath) {
  return putBuffer(new Buffer(content), remotePath);
}

function putFile(filename, remotePath) {
  return new Promise((resolve, reject) => {
    fs.readFileAsync(filename)
      .then(buffer =>
        putBuffer(buffer, remotePath)
          .then(() => resolve(remotePath))
          .catch((err) => reject(err))
      );
  })
};

function loadLocalFile(pathname) {
  return new Promise((resolve, reject) => {
    if (typeof pathname !== 'string') {
      return reject(new Error(`Path must be a string. Got a ${typeof pathname}`));
    }
    try {
      const fullpath = path.resolve("./" + pathname)
      log("Trying require of:", fullpath);
      const data = require(fullpath);
      if (typeof data === 'object') { data._path = fullpath; }
      resolve(data);
    }
    catch (err) {
      reject(err)
    }
  });
};

function getConfig(opts) {
  if (opts == null) { opts = {}; }
  log("SyncoDeMayo, getting started...");

  return new Promise((resolve, reject) => {
    const potentialConfigs = [
      '.syncodemayo.json',
      'syncodemayo.json',
      '.syncodemayo.js',
      'syncodemayo.js',
      '.syncodemayo',
      'syncodemayo',
      'sync-config',
      'sync-config.json'
    ]
    if (!!opts.config) {
      potentialConfigs.unshift(opts.config)
    }
    const tryLoading = (path) => {
      if (!!path) {
        return loadLocalFile(path)
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
};


function getRemoteFilelist(config) {
  const pathname = `${config.path}/${config.cache}`;
  console.log(" <-", pathname);
  return getRemoteFile(pathname)
    .then(JSON.parse)
    .catch((err) => {
      console.log("Missing or error parsing remote file list.", err);
      console.log("\n   Run sync:init to setup SyncoDeMayo on the server.\n");
      process.exit(1);
      return {};
    });
};

function buildLocalFilelist(config) {
  log("Create CRCs:");
  return Promise
    .resolve(`${config.path}/${config.files || '**/**'}`)
    .then((pathname) => {
      log('Glob: ', pathname);
      return glob.sync(pathname);
    })
    .then((paths) =>
      _(paths)
        .filter((pathname) => {
          const stat = fs.statSync(pathname);
          return !stat.isDirectory();
        })
        .unique()
        .compact()
        .value())
    .then((paths) => {
      const filelist = {};
      for (let pathname of Array.from(paths)) {
        filelist[pathname] = crc.crc32(fs.readFileSync(pathname));
      }
      return filelist;
    });
};

function startup(options) {
  if (!options) { options = {}; }
  opts = _.defaults(options, opts);
  return getConfig(opts)
    .then((conf) => {
      if (conf == null) { throw new Error("Local config not found."); }
      if (!conf.local) {
        throw new Error("Invalid config, 'local' section missing.")
      }
      conf._target = (opts._target = conf[opts.stage || 'staging']);
      if (!conf._target) {
        throw new Error(`Target '${opts.stage || 'staging'}' section missing.`)
      }
      conf._target.cache = conf._target.cache || '.synco-filelist'
      return conf;
    })
    .then((conf) => {
      config = conf;
      return connect(conf._target);
    })
    .then((conn) => {
      console.log(`Connected to ${config._target.host}`);
      return conn;
    });
};

function cleanup() {
  conn && conn.raw && conn.raw.quit && conn.raw.quit((err, data) => {
    if (err != null) {
      console.error(err);
    }
  })
}

function remoteFileExists(remotePath) {
  return new Promise((resolve, reject) => {
    conn.raw.size(remotePath, (err, size) => {
      // log "SIZE OF", remotePath, "IS", size
      if (err) {
        resolve(false);
      }
      else {
        resolve(true);
      }
    });
  });
}

function initializeServerConfiguration() {
  log("Connected to server.");
  const remotePath = `${config._target.path}/${config._target.cache}`;
  return remoteFileExists(remotePath)
    .then((exists) => {
      if (exists) {
        if (opts.force) {
          console.log(`${config._target.host} already is initialized, forcing over-write of existing filelist`);
        }
        else {
          console.log(`${config._target.host} already is initialized, to re-initialize use the --force option`);
          throw new Error("Already initialized");
        }
      }
      else {
        return true;
      }
    })
    .then(() => {
      log("Updating remote filelist:", remotePath);
      return verifyRemoteDirectory(path.dirname(remotePath))
        .then(function (success) {
          if (success) {
            putContent("{}", remotePath); //,
          }
          else {
            console.error("Directory error.");
            throw new Error("Directory creation error.");
          }
        });
    });
}

function doFileSync(dryRun) {
  log("Connected to server.");

  return Promise.all([
    getRemoteFilelist(config._target),
    buildLocalFilelist(config.local)
  ])
    .then((results) => {
      const remoteFiles = results[0]
      const localFiles = results[1]
      log("Remote filelist:", remoteFiles);
      log("Local filelist:", localFiles);

      const changeset = {
        added: [],
        changed: [],
        removed: [],
        uploading: []
      }

      Object
        .keys(localFiles)
        .forEach((localFilename) => {
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
          const remoteHash = remoteFiles[remoteFilename]

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
      log("Changed files:", changedFiles);
      let current = Promise.fulfilled();

      console.log("Uploading %s files...", changedFiles.length)
      return Promise
        .all(changedFiles.map((filename) => {
          const remotePath = `${config._target.path}${filename.replace(config.local.path, '')}`;
          return current = current
            .then(() => verifyRemoteDirectory(path.dirname(remotePath)))
            .then(() => putFile(filename, remotePath));
        }))
        .then(() => changedFiles);
    })
    .then((changedFiles) => {
      if (changedFiles.length > 0) {
        const remotePath = `${config._target.path}/${config._target.cache}`;
        log("Updating remote filelist:", remotePath);
        return verifyRemoteDirectory(path.dirname(remotePath))
          .then(function (success) {
            if (success) {
              putContent(JSON.stringify(localFiles, null, 2), remotePath);
            }
            else {
              console.error("Directory error.");
              throw new Error("Directory creation error.");
            }
          });
      }
      else {
        console.log("No changed files.");
      }
    })
    .catch((err) => {
      if (err.message !== DRY_RUN_MSG) {
        throw err
      }
    })
}

const api = {

  /**
   * Check ensures that the server is setup to sync
   */
  check(options) {
    if (options == null) { options = {}; }
    log("Checking server....");

    return startup(options)
      .then(() => {
        log("Connected to server.");
        const remotePath = `${config._target.path}/${config._target.cache}`;
        log("Looking for", remotePath)
        return remoteFileExists(remotePath);
      })
      .then(function (exists) {
        if (exists) {
          console.log(`${config._target.host} appears ready to sync.`);
        }
        else {
          console.log(`It looks like you need to run sync:init for ${config._target.host}`);
        }
      })
      .finally(cleanup);
  },

  /**
   * Initialize server to support sync
   */
  init(options) {
    if (options == null) { options = {}; }
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

              staging: {
                path: "Example/www/stage",
                host: "www.example.com",
                user: "USERNAME",
                pass: "PASSWORD",
                port: 21,
                cache: ".synco-filelist"
              }
            }, null, 2)
          )
        }
        else {
          throw err
        }
      })
      .finally(cleanup);
  },


  /**
   * Display list of changed files
   */
  changed(options) {
    return startup(options)
      .then(() => {
        const remotePath = `${config._target.path}/${config._target.cache}`;
        return remoteFileExists(remotePath);
      })
      .then((is_configured) => {
        if (!is_configured) { throw new Error(`${config._target.host} doesn't appear to be configured. Run sync:init.`); }
        return is_configured;
      })
      .then(() => doFileSync(true))
      .finally(cleanup);
  },

  /**
   * Syncronize local and remote files via FTP
   */
  run(options) {
    if (options == null) { options = {}; }
    return startup(options)
      .then(() => {
        const remotePath = `${config._target.path}/${config._target.cache}`;
        return remoteFileExists(remotePath);
      })
      .then((is_configured) => {
        if (!is_configured) { throw new Error(`${config._target.host} doesn't appear to be configured. Run sync:init.`); }
        return is_configured;
      })
      .then(() => doFileSync(false))
      .finally(cleanup);
  },

  listTargets(options) {
    return getConfig(options)
      .then((config) => {
        console.log("Sync targets:")
        Object.keys(config).forEach(target => {
          if (target != 'local' && !target.startsWith('_'))
            console.log(" -", target)
        })
      })
  }
};


module.exports = api;
