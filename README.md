# SyncoDeMayo
> A simple FTP syncing tool

What? That server you're uploading files to doesn't support rsync?! Yeah, me too. So here's a simple tool that will sync changed files to an FTP server.

It's pretty simple. SyncoDeMayo caches a list of known files, and their CRCs, on the server. On subsequent syncs it will only upload local files with a different CRC hash value.

---

Requirements: Node.js 22.17 or later.

Upgrading from 1.x? Version 2.0 changes some behavior. Read the migration notes in
[CHANGELOG.md](CHANGELOG.md) before your first 2.0 sync.

Install globally:
```
$ npm install -g syncodemayo
```

Or install locally:
```
$ npm install syncodemayo
```

Suggested usage as NPM script:
```js
{
  // ... OTHER NPM FIELDS ...
  "scripts": {
    "sync": "syncodemayo sync staging",
    "sync:production": "syncodemayo sync production"
  }
}
```

---

```
$ syncodemayo --help
Usage: syncodemayo [options] [command]

Options:
  -c, --config <file>  Specify local config <file>
  -v, --verbose        Verbose logging
  -q, --quiet          Minimal logging
  -V, --version        Output the version number
  -h, --help           Output usage information

Commands:
  init [target]          Configure local folder and/or server to sync
  changes|diff [target]  Perform sync dry run and display the changes
  verify [target]        Verify server is configured
  sync [options] [target]
                         Perform sync to server
    -f, --force          Don't prompt before uploading.
  ls                     List defined targets in config

With no command, shows this help.
```


Example `syncodemayo.json` config:

```js
{
  "local": {
    "path": "public", // Required, local path to sync
    "files": "**/**", // Optional, default='**/**', file glob pattern
    "exclude": ["**/*.map", "**/.DS_Store", "**/.git*", "**/.env*"], // Optional, default=[] (init writes this list), glob patterns to ignore
    "defaultTarget": "staging", // Optional, default='staging', target to use if not specified on cmd line
    "deleteRemoteFiles": true // Optional, default=false - for now...
  },

  "targets": {
    "staging": {
      "host": "www.myapp.com", // Required
      "path": "MyApp/www/stage", // Required
      "user": "USERNAME", // Required
      "pass": "PASSWORD", // Optional, NOT RECOMMENDED! See note below for better way...
      "port": 21, // Optional, default=21 (990 when secure is "implicit")
      "secure": false, // Optional, default=false. FTPS: false, true (explicit) or "implicit". See below.
      "rejectUnauthorized": true, // Optional, default=true. false accepts self-signed certificates. See below.
      "cache": ".synco-filelist", // Optional, default='.synco-filelist'
      "prompt": false, // Optional, default=true, false will upload w/o confirming
      "enabled": false // Optional, default=true
    },

    "production": {
      "host": "www.myapp.com",
      "path": "MyApp/www",
      "user": "USERNAME",
      "prompt": "This is for PRODUCTION! Do you really mean it?"
    }
  }

  /*
    Note: Yes, comments are allowed in config files.
    SyncoDeMayo will strip them before parsing the JSON.
  */
}
```

### Dotfiles

Dotfiles and dot-directories sync like any other file: `.htaccess`, for example, is uploaded.
(1.x skipped them.) Exclude anything that must not reach the server, such as `**/.env*` for
environment files and `**/.git/**` for a git directory. Note that `**/.git*` excludes
`.gitignore` but not the files inside a `.git/` directory.

On macOS and Windows, `files` and `exclude` patterns match case-insensitively.

### Passwords and `.env`

You can put the FTP password in the config, but if you're adding it to source control I wouldn't. Instead, add the password to an `.env` file that you set to ignored in your SCM.

SyncoDeMayo reads `.env` from the current working directory (where you run `syncodemayo`).
Variables already set in the environment win over the ones in `.env`. When a target has no
`pass`, its password is looked up as `<TARGET NAME UPPERCASED>_PWD`: `STAGING_PWD` for the
`staging` target.

Example `.env` for above config:

```bash
STAGING_PWD=ftpPasswordHere
PRODUCTION_PWD="Other password here"
```

**Warning:** a `.env` inside `local.path` is a dotfile like any other, so it would be uploaded
unless excluded. Configs created by `init` exclude `**/.env*`; if your config predates 2.0, add
`"**/.env*"` to its `exclude` list.

### FTPS (FTP over TLS)

If your host requires FTPS, set `secure` on the target:

| `secure` | Connection | Default `port` |
| --- | --- | --- |
| `false` (default) | Plain FTP | 21 |
| `true` | Explicit FTPS: connects in plain text, then upgrades with `AUTH TLS` | 21 |
| `"implicit"` | Implicit FTPS: TLS from the start | 990 |

An explicit `port` always wins over these defaults. `secure` takes exactly `true`, `false` or
`"implicit"` (not the strings `"true"`/`"false"`).

`rejectUnauthorized` (`true` or `false`, default `true`) controls whether the server's TLS
certificate must be trusted. With the default, a self-signed, expired or mismatched certificate
stops the command with an error that names the host. If you trust the server anyway, set
`"rejectUnauthorized": false` on the target: the connection then accepts the certificate, and
SyncoDeMayo prints a warning naming the target every time it makes such a connection (even
with `-q`).

```js
"targets": {
  "production": {
    "host": "ftp.myapp.com",
    "path": "MyApp/www",
    "user": "USERNAME",
    "secure": true,
    "rejectUnauthorized": false // only for a server you trust with a self-signed certificate
  }
}
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for what changed in each release, including the migration
notes for upgrading from 1.x.
