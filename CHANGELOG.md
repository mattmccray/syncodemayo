# Changelog

## 2.0.0

A modernized SyncoDeMayo: ESM, Node.js built-ins in place of most dependencies, FTPS support,
and fixes for v1 bugs. Some behavior changes; read the migration notes below before upgrading.

### Migration from 1.x

**Before your first 2.0 sync, run `syncodemayo diff [target]`** and read the list of changes.
2.0 now syncs dotfiles and builds remote paths differently (see below), so the first sync may
upload files v1 never did. This matters most with `deleteRemoteFiles: true`: check that nothing
you want kept on the server is listed for deletion, and that nothing private (such as `.env`) is
listed for upload.

#### Requirements and packaging

- Node.js 22.17 or later is required (`engines.node` is `>=22.17`).
- The package is ESM. The CLI is `dist/cli.js`; the library entry is `dist/index.js`, with
  types in `dist/index.d.ts`. CommonJS callers can still `require()` the library on Node.js
  22.12 and later.
- Runtime dependencies drop from ten to one (`basic-ftp`).
- The library no longer exports the joi schemas `localSchema`, `targetSchema`, and
  `configSchema`.

#### CLI

- An unknown command, extra positional arguments, and `-f` on any command other than `sync`
  now exit 1 with an error. v1 printed the help or ignored them.
- `-c` now requires a value (`-c <file>`).
- The help text is reworded but lists the same commands and options.
- `--version` / `-V` prints the real package version.

#### Config

- Config validation errors keep the `Config Schema Error:` prefix, but the detail after it is
  new.
- `local`, `targets`, or `exclude` given as a JSON *string* is now rejected.
- `.syncodemayo.json` and `sync-config.json` are now found when `syncodemayo.json` is absent.
- With no config, `init` creates `syncodemayo.json`, and `verify` / `ls` report that the folder
  is not configured instead of throwing "Local config not found."
- Configs created by `init` exclude `**/.env*` by default. Existing configs are not changed:
  if you have a `.env` under `local.path`, add `"**/.env*"` to your `exclude` list yourself.

#### File list

- Dotfiles and files inside dot-directories (such as `.htaccess` or `.well-known/`) are now
  synced. v1 skipped them.
- `**/.git*` excludes `.gitignore` but not the files inside a `.git/` directory. Add
  `**/.git/**` to keep one off the server.
- On macOS and Windows, `files` and `exclude` patterns match case-insensitively.
- Exclude patterns that start with `!` are matched literally, not as negations.
- `*.md` and `**/*.md` no longer match a file named exactly `.md`.
- Symlinked directories are walked for every `files` pattern, the way v1's default `**/**`
  walked them: in full, without entering a symlinked directory inside one. Dangling symlinks
  and symlink loops are skipped.

#### Remote and sync

- `init` no longer creates a missing remote `path`. It fails and tells you to create the
  folder. `sync` still creates subfolders under the target path.
- A missing or unreadable remote file list is now a normal error (still exit code 1) instead
  of a `process.exit` from inside the library.
- Remote paths are correct when `local.path` has a trailing or repeated slash, or
  `target.path` has a trailing slash. v1 glued names together (`www` + `a.html` →
  `wwwa.html`) or doubled slashes.

### Added

- FTPS support through two new target fields:
  - `secure`: `false` (default, plain FTP), `true` (explicit FTPS, `AUTH TLS`), or
    `"implicit"` (implicit FTPS, default port 990).
  - `rejectUnauthorized`: `true` (default) requires a trusted server certificate; `false`
    accepts a self-signed one and prints a warning naming the target on every connection.

  See the FTPS section of the [README](README.md#ftps-ftp-over-tls).

### Unchanged

- A remote `.synco-filelist` written by v1 still diffs correctly: 2.0 uses the same keys and
  CRCs, so upgrading does not re-upload everything.
