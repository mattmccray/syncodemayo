# Modernize the toolchain

- Status: done
- Job: 002-modernize-toolchain (merged a295dfc via epic syncodemayo-v2, 2026-11-13)
- Sources: factory/epics/syncodemayo-v2.md
- Date: 2026-11-13

## Intent
Move the build onto current tools without changing what the CLI does, so the dependency swaps
that follow happen on a modern base.

## Decisions
1. Minimum Node → **22** (the exact minor is pinned here, high enough for `zlib.crc32` and
   `path.matchesGlob`). Why: Node 20 reached end of life in April 2026. Approved by the user on 2026-11-13.
2. Module format → **ESM**, with `engines` set to **`node >=22.12`**. Why: current versions of the
   replaced or vendored packages are ESM-only, and 22.12 is the first version where CommonJS code
   can `require()` an ESM package without a flag, so CommonJS users of the library API keep working.
3. ESLint → **dropped**, with no replacement. Why: it was never configured or run, and strict
   `tsc` (including `noUnusedLocals`) covers this codebase. A linter can be added later.

## Scope
- In: TypeScript 5; `src/` → `dist/` layout; `@types/node`; drop the `@types/*` packages for
  dependencies that are going away; `engines`; removing `eslint` from `devDependencies`; a shebang that works on Linux
  (`#!/usr/bin/env node`, no `--harmony`); `package.json` `bin`/`main`/`files`.
- Out: replacing any runtime dependency; behavior changes.

## Acceptance sketch
- Clean build; the characterization suite passes against the built output.
- `npm pack` contains the built CLI and library and no TypeScript sources or tests.

## Contract calls
None.

## Open
None.
