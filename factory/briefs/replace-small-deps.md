# Replace the small dependencies

- Status: done
- Job: 003-replace-small-deps (merged e12f79b via epic syncodemayo-v2, 2026-11-13)
- Sources: factory/epics/syncodemayo-v2.md
- Date: 2026-11-13

## Intent
Remove five runtime dependencies that Node built-ins or a few lines of our own code now cover.

## Decisions
1. `dotenv` → **`process.loadEnvFile()`**; a missing `.env` is not an error.
2. `yesno` → **`readline/promises`**.
3. `strip-json-comments` → **vendored copy with its MIT license header**. Why: it's small, and
   current versions are ESM-only.
4. `joi` → **hand-written validator**, plus a test that it agrees with `config.schema.json`
   (`ajv` as a dev-only dependency). Unknown top-level keys stay allowed, as in v1.
5. `commander` → **`util.parseArgs` plus hand-written help**, with the same commands, alias
   (`diff`) and flags; `--version` read from `package.json`.
6. Wording of messages → **may differ from v1**. Validation errors keep the `Config Schema Error:`
   prefix, but the detail after it comes from our validator. The help text lists the same
   commands and options, but not word for word.

## Scope
- In: the five swaps above.
- Out: glob/minimatch/crc (`builtin-filelist`); FTP (`basic-ftp-connection`).

## Acceptance sketch
- The five packages are gone from `package.json`; tests pass.
- `syncodemayo --help` lists the same commands and options as v1, and `--version` prints the real version.

## Contract calls
None.

## Open
None.
