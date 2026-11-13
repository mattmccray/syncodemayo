# Build the file list with built-ins

- Status: ready
- Sources: factory/epics/syncodemayo-v2.md
- Date: 2026-11-13

## Intent
Build the local file list with Node built-ins and start syncing dotfiles such as `.htaccess`,
while keeping cache files already on servers valid, so upgrading doesn't cause a mass re-upload.

## Decisions
1. Dotfiles → **synced**; unwanted ones go in `local.exclude`. Why: `.htaccess` has to deploy.
   This is a deliberate behavior change. Approved by the user on 2026-11-13.
2. Cache keys → **unchanged format**: POSIX separators and the `local.path` prefix, on every OS.
   CRC32 values must match v1's.
3. Default `exclude` list written by `init` → **adds `**/.env*`**. Why: once dotfiles sync, a
   `.env` in the published folder would be uploaded to a public server, secrets included. It
   only affects configs that `init` creates from now on; the migration notes tell v1 users to
   check their own lists.

## Scope
- In: `glob` + `minimatch` → `fs.globSync` + `path.matchesGlob`; `crc` → `zlib.crc32`; dotfiles
  included; `**/.env*` added to the default config (`DefaultConfig`).
- Out: changing the cache file name or format.

## Acceptance sketch
- The golden fixture matches v1 except for the newly included dotfiles.
- No experimental-feature warnings are printed on the minimum Node version.

## Contract calls
"Dotfiles are now synced (v1 skipped them)", approved by the user on 2026-11-13. The job records it
for the migration notes.

## Open
None.
