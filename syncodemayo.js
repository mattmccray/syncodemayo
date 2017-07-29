"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const Bluebird = require("bluebird");
const JsFtp = require("jsftp");
const JsFtpMkDirP = require("jsftp-mkdirp");
const glob = require("glob");
const minimatch = require("minimatch");
const path = require("path");
const crc = require("crc");
const fsSrc = require("fs");
const _ = require("lodash");
const Ftp = JsFtpMkDirP(JsFtp);
const fs = Bluebird.promisifyAll(fsSrc);
let conn = null;
let config = {};
let opts = {
    verbose: false,
    force: false,
    stage: 'staging'
};
const DRY_RUN_MSG = "Dry run, stopping sync.";
function log(...args) {
    if (opts.verbose) {
        console.log(...args);
    }
}
function connect(config) {
    return __awaiter(this, void 0, void 0, function* () {
        const { host, port, user, pass } = config;
        log("Connecting to FTP:", { host, port, user, pass: `(${pass.length} chars)` });
        return new Ftp({ host, port, user, pass });
    });
}
function getRemoteFile(filename) {
    log("Retrieve:", filename);
    let content = "";
    return new Promise((resolve, reject) => {
        conn.get(filename, function (err, socket) {
            if (err != null) {
                return reject(err);
            }
            socket.on("data", (d) => content += d.toString());
            socket.on('error', (err) => {
                console.log("Retrieval error.");
                reject(err);
            });
            socket.on("close", (connErr) => {
                if (connErr) {
                    reject(connErr);
                }
                else {
                    resolve(content);
                }
            });
            socket.resume();
        });
    });
}
function verifyRemoteDirectory(pathname) {
    return new Promise((resolve, reject) => {
        conn.mkdirp(pathname, (err) => resolve(!err));
    });
}
function putBuffer(buff, remotePath) {
    return new Promise((resolve, reject) => {
        console.log(" ->", remotePath);
        conn.put(buff, remotePath, (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(remotePath);
            }
        });
    });
}
function putContent(content, remotePath) {
    return putBuffer(new Buffer(content), remotePath);
}
function putFile(filename, remotePath) {
    return __awaiter(this, void 0, void 0, function* () {
        const buffer = yield fs.readFileAsync(filename);
        yield putBuffer(buffer, remotePath);
        return remotePath;
    });
}
function loadLocalConfig(pathname) {
    return __awaiter(this, void 0, void 0, function* () {
        if (typeof pathname !== 'string')
            throw new Error(`Path must be a string. Got a ${typeof pathname}`);
        const fullpath = path.resolve("./" + pathname);
        log("Trying require of:", fullpath);
        const data = require(fullpath);
        if (typeof data === 'object')
            data._path = fullpath;
        return data;
    });
}
function getConfig(opts) {
    if (opts == null) {
        opts = {};
    }
    log("SyncoDeMayo, getting started...");
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
        ];
        if (!!opts.config) {
            potentialConfigs.unshift(opts.config);
        }
        const tryLoading = (path) => {
            if (!!path) {
                loadLocalConfig(path)
                    .then(result => {
                    resolve(result);
                })
                    .catch(err => {
                    tryLoading(potentialConfigs.shift());
                });
            }
            else {
                reject(new Error("Local config not found."));
            }
        };
        tryLoading(potentialConfigs.shift());
    });
}
function getRemoteFilelist(config) {
    const pathname = `${config.path}/${config.cache}`;
    console.log(" <-", pathname);
    return getRemoteFile(pathname)
        .then(JSON.parse)
        .catch((err) => {
        console.log("Missing or error parsing remote file list.", err);
        console.log("\n   Run sync:init to setup SyncoDeMayo on the server.\n");
        process.exit(1);
    });
}
function buildLocalFilelist(config) {
    return __awaiter(this, void 0, void 0, function* () {
        const excludeDirectories = (path) => !fs.statSync(path).isDirectory();
        const excludeBlacklistedFiles = (path) => config.exclude.some(pattern => minimatch(path, pattern, { dot: true }));
        log("Create CRCs:");
        const filelist = {};
        const pathname = `${config.path}/${config.files || '**/**'}`;
        const paths = glob.sync(pathname);
        const filePaths = _(paths)
            .filter(excludeDirectories)
            .uniq()
            .compact()
            .filter(excludeBlacklistedFiles)
            .value();
        for (let pathname of filePaths) {
            filelist[pathname] = crc.crc32(fs.readFileSync(pathname));
        }
        return filelist;
    });
}
function startup(options) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!options) {
            options = {};
        }
        opts = _.defaults(options, opts);
        const conf = yield getConfig(options);
        if (conf == null)
            throw new Error("Local config not found.");
        if (!conf.local)
            throw new Error("Invalid config, 'local' section missing.");
        conf._target = conf.targets[opts.stage || 'staging'];
        if (!conf._target)
            throw new Error(`Target '${opts.stage || 'staging'}' section missing.`);
        conf._target.cache = conf._target.cache || '.synco-filelist';
        // Assign global
        config = conf;
        const conn = yield connect(conf._target);
        console.log(`Connected to ${config._target.host}`);
        return conn;
    });
}
function cleanup(data) {
    conn && conn.raw && conn.raw.quit && conn.raw.quit((err, data) => {
        if (err != null) {
            console.error(err);
        }
    });
    return data;
}
function cleanupAndRethrowError(err) {
    cleanup();
    throw err;
}
function remoteFileExists(remotePath) {
    return new Promise((resolve, reject) => {
        conn.raw.size(remotePath, (err, size) => resolve(!err));
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
                putContent("{}", remotePath);
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
    return Promise
        .all([
        getRemoteFilelist(config._target),
        buildLocalFilelist(config.local)
    ])
        .then(([remoteFiles, localFiles]) => {
        log("Remote filelist:", remoteFiles);
        log("Local filelist:", localFiles);
        const changeset = {
            added: [],
            changed: [],
            removed: [],
            uploading: []
        };
        Object
            .keys(localFiles)
            .forEach((localFilename) => {
            const localHash = localFiles[localFilename];
            if (!(localFilename in remoteFiles)) {
                changeset.added.push(localFilename);
                changeset.uploading.push(localFilename);
            }
            else if (remoteFiles[localFilename] != localHash) {
                changeset.changed.push(localFilename);
                changeset.uploading.push(localFilename);
            }
        });
        Object
            .keys(remoteFiles)
            .forEach((remoteFilename) => {
            const remoteHash = remoteFiles[remoteFilename];
            if (!(remoteFilename in localFiles)) {
                changeset.removed.push(remoteFilename);
            }
        });
        log("File Changeset:", changeset);
        if (dryRun) {
            if (changeset.added.length > 0) {
                console.log("New Local Files: (%s)", changeset.added.length);
                changeset.added.forEach(f => console.log(" -", f));
            }
            if (changeset.changed.length > 0) {
                console.log("Changed Local Files: (%s)", changeset.changed.length);
                changeset.changed.forEach(f => console.log(" -", f));
            }
            if (changeset.removed.length > 0) {
                console.log("Removed Local Files (not handled yet): (%s)", changeset.removed.length);
                changeset.removed.forEach(f => console.log(" -", f));
            }
            throw new Error(DRY_RUN_MSG);
        }
        return changeset.uploading;
    })
        .then((changedFiles) => {
        log("Changed files:", changedFiles);
        let current = Promise.resolve({});
        console.log("Uploading %s files...", changedFiles.length);
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
                .then((success) => {
                if (success) {
                    putContent(JSON.stringify(changedFiles, null, 2), remotePath);
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
            throw err;
        }
    });
}
/**
 * Check ensures that the server is setup to sync
 */
function check(options) {
    if (options == null) {
        options = {};
    }
    log("Checking server....");
    return startup(options)
        .then(() => {
        log("Connected to server.");
        const remotePath = `${config._target.path}/${config._target.cache}`;
        log("Looking for", remotePath);
        return remoteFileExists(remotePath);
    })
        .then((exists) => {
        if (exists) {
            console.log(`${config._target.host} appears ready to sync.`);
        }
        else {
            console.log(`It looks like you need to run sync:init for ${config._target.host}`);
        }
    })
        .then(cleanup)
        .catch(cleanupAndRethrowError);
}
exports.check = check;
/**
 * Initialize server to support sync
 */
function init(options) {
    if (options == null) {
        options = {};
    }
    return startup(options)
        .then(initializeServerConfiguration)
        .catch(err => {
        if (err.message === "Local config not found.") {
            const configPath = path.resolve('./syncodemayo.json');
            console.log("Creating local config at:");
            console.log(" -", configPath);
            fs.writeFileSync(configPath, JSON.stringify({
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
            }, null, 2));
        }
        else {
            throw err;
        }
    })
        .then(cleanup)
        .catch(cleanupAndRethrowError);
}
exports.init = init;
/**
 * Display list of changed files
 */
function changed(options) {
    return startup(options)
        .then(() => {
        const remotePath = `${config._target.path}/${config._target.cache}`;
        return remoteFileExists(remotePath);
    })
        .then((isConfigured) => {
        if (!isConfigured) {
            throw new Error(`${config._target.host} doesn't appear to be configured. Run sync:init.`);
        }
        return isConfigured;
    })
        .then(() => doFileSync(true))
        .then(cleanup)
        .catch(cleanupAndRethrowError);
}
exports.changed = changed;
/**
 * Syncronize local and remote files via FTP
 */
function run(options) {
    if (options == null) {
        options = {};
    }
    return startup(options)
        .then(() => {
        const remotePath = `${config._target.path}/${config._target.cache}`;
        return remoteFileExists(remotePath);
    })
        .then((isConfigured) => {
        if (!isConfigured) {
            throw new Error(`${config._target.host} doesn't appear to be configured. Run sync:init.`);
        }
        return isConfigured;
    })
        .then(() => doFileSync(false))
        .then(cleanup)
        .catch(cleanupAndRethrowError);
}
exports.run = run;
function listTargets(options) {
    return getConfig(options)
        .then((config) => {
        console.log("Sync targets:");
        Object.keys(config.targets).forEach((target) => {
            if (target != 'local' && !target.startsWith('_'))
                console.log(" -", target);
        });
    });
}
exports.listTargets = listTargets;
