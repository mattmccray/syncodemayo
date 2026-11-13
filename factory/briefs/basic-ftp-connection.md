# basic-ftp connection with FTPS

- Status: done
- Job: 005-basic-ftp-connection (merged ffda420 via epic syncodemayo-v2, 2026-11-13)
- Sources: factory/epics/syncodemayo-v2.md
- Date: 2026-11-13

## Intent
Replace the abandoned `jsftp` with the maintained `basic-ftp`, behind an interface that tests
can fake, and let targets connect over FTPS.

## Decisions
1. Library → **`basic-ftp`**, the only runtime dependency left. Why: it's maintained, has no
   dependencies of its own, and supports FTPS.
2. SFTP → **out of scope**: `basic-ftp` doesn't support it, and it would need `ssh2`. The
   interface leaves room for it later. Approved by the user on 2026-11-13.
3. FTPS settings → **two optional target fields**:
   - `secure`: `false` (default, plain FTP) | `true` (explicit FTPS) | `"implicit"` (implicit
     FTPS; `port` then defaults to 990 instead of 21). The same values as `basic-ftp`, passed
     straight through.
   - `rejectUnauthorized`: default `true`; `false` accepts self-signed or mismatched
     certificates, and the CLI prints a warning each time it does.
   Why: shared hosts often present a certificate for their own server name. Exposing
   `basic-ftp`'s full TLS options would tie the config format to Node's TLS settings, and
   almost nobody needs more than an on/off switch.

## Scope
- In: a `RemoteConnection` interface plus an in-memory fake used by the Sync tests; the
  `basic-ftp` implementation; connections that close reliably; FTPS target options in the
  config type, the validator and `config.schema.json`; an end-to-end test against an FTP server
  running inside the test process.
- Out: SFTP, S3, parallel uploads.

## Acceptance sketch
- `jsftp` and `jsftp-mkdirp` are gone.
- The end-to-end init → changes → sync → delete flow passes over plain FTP and FTPS.
- With `rejectUnauthorized: false`, a self-signed server connects and a warning is printed; with
  the default, it is refused with a clear error.

## Contract calls
"The config gains the `secure` and `rejectUnauthorized` target fields", approved by the user on 2026-11-13. The job updates
`config.schema.json` and the README.

## Open
None.
