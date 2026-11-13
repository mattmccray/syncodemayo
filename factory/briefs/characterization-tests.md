# Characterization tests for v1

- Status: done
- Job: 001-characterization-tests (merged e99143b via epic syncodemayo-v2, 2026-11-13)
- Sources: factory/epics/syncodemayo-v2.md
- Date: 2026-11-13

## Intent
Before anything changes, record what v1 actually does as a test suite. Every later member is
checked against it, so a dependency swap that changes behavior shows up as a failing test
rather than a production server re-uploading every file.

## Decisions
1. Test runner → **`node:test`** (built in). Why: it matches the epic's goal of fewer dependencies.
2. Bugs found in v1 → **recorded as `todo` tests, not fixed here**. Why: this member must not
   change behavior; `fix-v1-bugs` turns them into passing tests.
3. Golden file-list fixture → **committed**: a sample folder (nested dirs, dotfiles, excluded
   patterns, binary files) plus the exact keys and CRC32 values v1 produces for it. Why: it is
   the executable definition of the cache format the epic promises to keep.
4. How tests load v1 code → **plain JavaScript (`.mjs`) test files that import the compiled
   output**, not TypeScript. Why: v1 uses a TypeScript `enum`, which Node's built-in TypeScript
   support can't run, and TypeScript 2.4 is too old to write modern tests in. JavaScript tests
   survive the toolchain upgrade unchanged; `modernize-toolchain` only points them at `dist/`.

## Scope
- In: test harness and `npm test`; golden file-list fixture; unit tests for config
  loading and defaults, `resolveTarget`, `resolvePassword`, schema validation, the changeset diff,
  and comment stripping; `todo` tests for the known bugs (fallback config files never load,
  `Client.ts` `indexOf` misclassification, hard-coded `--version`).
- Out: any change to `lib/` or `cli.ts` behavior; FTP network tests (they come with `basic-ftp-connection`).

## Acceptance sketch
- `npm test` passes on unmodified v1 code with its original dependencies installed.
- The golden fixture shows v1 *excluding* dotfiles, confirming the behavior the epic changes on purpose.

## Contract calls
None.

## Open
None.
