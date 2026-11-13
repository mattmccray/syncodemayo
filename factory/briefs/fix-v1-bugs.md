# Fix the known v1 bugs

- Status: ready
- Sources: factory/epics/syncodemayo-v2.md
- Date: 2026-11-13

## Intent
Fix the bugs found during the dependency review. Each one starts as one of the `todo` tests
from `characterization-tests` and ends as a passing test.

## Decisions
1. Behavior changes are allowed → **yes, 2.0 is a major release**; each one is listed for the
   migration notes. Approved by the user on 2026-11-13.
2. `init` when the target's remote `path` doesn't exist → **report an error and create nothing**;
   the message tells the user to create the folder. Why: a missing path is most likely a typo,
   and creating it would make every later sync "succeed" into the wrong folder while the live
   site never changes. `sync` still creates subfolders under the target path as needed.

## Scope
- In: fallback config files (`.syncodemayo.json`, `sync-config.json`) actually load; load
  errors vs. parse errors are classified correctly; the remote path no longer depends on
  `String.replace` of `local.path`; no `process.exit` inside library code; `new Buffer` removed;
  `init` checks that the remote path exists without creating it.
- Out: new features.

## Acceptance sketch
- No `todo` tests remain.
- `init` against a target whose `path` doesn't exist fails with a clear message, and nothing is
  created on the server.

## Contract calls
None.

## Open
None.
