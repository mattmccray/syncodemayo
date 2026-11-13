# SyncoDeMayo 2.0

- Status: draft
- Sources: dependency review in the session of 2026-11-13 (replaces the earlier PLAN.md draft)
- Date: 2026-11-13

## Intent
Bring a 2017-era codebase up to date and ship it as 2.0.0. Runtime dependencies drop from ten
to one (`basic-ftp`), there's a real test suite to catch regressions, FTPS works, `.htaccess`
and other dotfiles sync, and the known v1 bugs are fixed. These ship together because they all
share one safety net: the v1 characterization tests come first, every later member must keep
them green, and a remote `.synco-filelist` written by v1 must still diff correctly in 2.0.

## Members
- `characterization-tests` — node:test suite and golden file-list fixture recorded against the unchanged v1 code
- `modernize-toolchain` — TypeScript 5, src/→dist/, Node ≥22, real `npm test`; no behavior change
  after: `characterization-tests`
- `replace-small-deps` — dotenv, yesno, strip-json-comments, joi, commander → built-ins or in-repo code
  after: `modernize-toolchain`
- `builtin-filelist` — glob, minimatch, crc → fs.globSync, path.matchesGlob, zlib.crc32; dotfiles synced
  after: `modernize-toolchain`
- `basic-ftp-connection` — RemoteConnection interface, jsftp → basic-ftp, FTPS, end-to-end test
  after: `replace-small-deps`
- `fix-v1-bugs` — the known v1 bugs, each fixed test-first
  after: `replace-small-deps`, `builtin-filelist`, `basic-ftp-connection`
- `release-docs` — README, migration notes, 2.0.0 version and package contents; publishing stays manual
  after: `fix-v1-bugs`
