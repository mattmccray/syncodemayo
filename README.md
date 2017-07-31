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
    verify [target]          Verify server is configured
    sync [options] [target]  Perform sync to server
    ls                       List defined targets in config
```


Example `syncodemayo.json` config:

```js
{
  "local": {
    "path": "public", // Required, local path to sync
    "files": "**/**", // Optional, default='**/***', file glob pattern
    "exclude": ["**/*.map", "**/.DS_Store", "**/.git*"], // Optional, default=[], glob pattern to ingnore
    "defaultTarget": "staging", // Optional, default='staging', target to use if not specified on cmd line
    "deleteRemoteFiles": true // Optional, default=false - for now...
  },

  "targets": {
    "staging": {
      "host": "www.myapp.com", // Required
      "path": "MyApp/www/stage", // Required
      "user": "USERNAME", // Required
      "pass": "PASSWORD", // Optional, NOT RECOMMENDED! See note below for better way...
      "port": 21, // Optional, default=21
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
}
```

You can put the FTP password in the config, but if you're adding it to source control I wouldn't. Instead, add the password to an `.env` file that you set to ignored in your SCM.

Example `.env` for above config:

```bash
STAGING_PWD=ftpPasswordHere
PRODUCTION_PWD="Other password here"
```

SyncoDeMayo will automatically look in your `.env` for passwords if they aren't in your config.

**Note**: Comments *are* allowed in config JSON files.