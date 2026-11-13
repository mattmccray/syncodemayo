// Characterization tests for the v1 changeset diff: Sync.run(true) (dry run)
// against a stub connection. No real Connection or network is used.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadConfigFile } from '../dist/lib/Config.js'
import { Sync } from '../dist/lib/Sync.js'

const SITE = 'test/fixtures/site'
const golden = () => JSON.parse(readFileSync('test/fixtures/site.filelist.json', 'utf8'))

// site.json points local.path at the fixture with the golden exclude patterns.
const loadSiteConfig = () => loadConfigFile('test/fixtures/config/site.json')

const stubConnection = (remoteFilelist) => {
  const requested = []
  return {
    requested,
    getRemoteFile: async (path) => {
      requested.push(path)
      return JSON.stringify(remoteFilelist)
    },
  }
}

const dryRun = async (remoteFilelist) => {
  const config = await loadSiteConfig()
  const conn = stubConnection(remoteFilelist)
  const changeset = await new Sync(conn, config, 'staging').run(true)
  return { changeset, conn }
}

test('a remote list equal to the golden file list gives an empty changeset (a v1 .synco-filelist diffs clean)', async () => {
  const { changeset } = await dryRun(golden())
  assert.deepEqual(changeset, { added: [], removed: [], changed: [] })
})

test('the dry run reads the remote list from <target.path>/<target.cache>', async () => {
  const { conn } = await dryRun(golden())
  assert.deepEqual(conn.requested, ['www/stage/.synco-filelist'])
})

test('an empty remote list marks every local file as added', async () => {
  const { changeset } = await dryRun({})
  assert.deepEqual([...changeset.added].sort(), Object.keys(golden()).sort())
  assert.deepEqual(changeset.changed, [])
  assert.deepEqual(changeset.removed, [])
})

test('changeset classifies local-only as added, differing CRC as changed, and remote-only as removed', async () => {
  const remote = golden()
  delete remote[`${SITE}/index.html`]
  remote[`${SITE}/css/style.css`] = remote[`${SITE}/css/style.css`] + 1
  remote[`${SITE}/gone.html`] = 12345
  remote[`${SITE}/old/dir/file.txt`] = 67890

  const { changeset } = await dryRun(remote)
  assert.deepEqual(changeset, {
    added: [`${SITE}/index.html`],
    changed: [`${SITE}/css/style.css`],
    removed: [`${SITE}/gone.html`, `${SITE}/old/dir/file.txt`],
  })
})

test('a CRC stored as a numeric string equals the number (v1 compares with !=)', async () => {
  const remote = golden()
  remote[`${SITE}/assets/img/pixel.png`] = String(remote[`${SITE}/assets/img/pixel.png`])
  remote[`${SITE}/nested/crlf.txt`] = String(remote[`${SITE}/nested/crlf.txt`])

  const { changeset } = await dryRun(remote)
  assert.deepEqual(changeset, { added: [], removed: [], changed: [] })
})

test('a v1 .synco-filelist (no dotfiles) diffs to only the three new dotfiles as additions', async () => {
  const v1Remote = JSON.parse(readFileSync('test/fixtures/site.filelist.v1.json', 'utf8'))
  const { changeset } = await dryRun(v1Remote)
  assert.deepEqual(changeset, {
    added: [`${SITE}/.htaccess`, `${SITE}/.well-known/security.txt`, `${SITE}/sub/.hidden`],
    changed: [],
    removed: [],
  })
})
