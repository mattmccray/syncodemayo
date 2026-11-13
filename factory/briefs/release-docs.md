# Release docs for 2.0

- Status: ready
- Sources: factory/epics/syncodemayo-v2.md
- Date: 2026-11-13

## Intent
Get the package ready to publish as 2.0.0: docs that match the new behavior, and migration
notes for v1 users.

## Decisions
1. Publishing → **manual, by the owner**. This job prepares the release; it never runs `npm publish`.
2. `prepublishOnly` → **build and run the tests; no automatic version bump**. Why: v1's
   `npm version patch` would publish 2.0.0 as 2.0.1 and bump every later release on its own. The
   version is set on purpose before each release, and a failing build or test blocks the publish.

## Scope
- In: README (Node ≥22, FTPS, dotfiles, `.env`); a CHANGELOG with 2.0 migration notes
  listing every behavior change; version 2.0.0; `prepublishOnly` changed to build and test
  (the `version:bump` script removed); `npm pack` contents checked; a smoke test of
  the packed tarball.
- Out: publishing; git tags.

## Acceptance sketch
- Installing the packed tarball into a scratch folder and running `syncodemayo --help` and
  `--version` works.

## Contract calls
None.

## Open
None.
