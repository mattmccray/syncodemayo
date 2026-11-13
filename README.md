# SyncoDeMayo
> A simple FTP syncing tool

What? That server you're uploading files to doesn't support rsync?! Yeah, me too. So here's a simple tool that will sync changed files to an FTP server.

It's pretty simple. SyncoDeMayo caches a list of known files, and their CRCs, on the server. On subsequent syncs it will only upload local files with a different CRC hash value.

---

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
  "script": {
    "sync": "syncodemayo sync staging",
    "sync:production": "syncodemayo sync production"
  }
}
```

---

```
$ syncodemayo

  Usage: syncodemayo [options] [command]


  Options:

    -V, --version        output the version number
    -c, --config [file]  Specify local config [file]
    -h, --help           output usage information


  Commands:

    init [target]            Configure local folder and/or server to sync
    changes|diff [target]    Perform sync dry run and display the changes
    verify [target]          Verify server is correctly configured
    sync [options] [target]  Perform sync to server
    ls                       List defined targets in config
```


Example `syncodemayo.json` config:

```js
{
  "local": {
    "path": "public", // Required, local path to sync
    "files": "**/**", // Optional, default='**/***', file glob pattern
    "exclude": ["**/*.map", "**/.DS_Store", "**/.git*"], // Optional, default=[], glob pattern to ignore
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

You can put the FTP password in the config, but if you're adding it to source control I wouldn't. Instead, add the password to an `.env` file that you set to ignored in your SCM.

Example `.env` for above config:

```bash
STAGING_PWD=ftpPasswordHere
PRODUCTION_PWD="Other password here"
```

SyncoDeMayo will automatically look in your `.env` for passwords if they aren't in your config.

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
