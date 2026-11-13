// Characterization tests for v1 config loading: loadConfigFile, comment
// stripping, and the defaults that massageConfigData applies.
// Run from the repo root: v1 resolves config paths against process.cwd().
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { loadConfigFile } from '../dist/lib/Config.js'

const COMMENTED = 'test/fixtures/config/commented.json'
const EXPLICIT = 'test/fixtures/config/explicit.json'
const DELETE_TRUE = 'test/fixtures/config/delete-true.json'

test('loadConfigFile strips // and /* */ comments from a cwd-relative path', async () => {
  const config = await loadConfigFile(COMMENTED)
  assert.equal(config.local.path, 'test/fixtures/site')
  assert.deepEqual(Object.keys(config.targets), ['staging'])
  assert.equal(config.targets.staging.host, 'staging.example.com')
  assert.equal(config.targets.staging.path, 'www/stage')
})

test('loadConfigFile sets _path to the absolute path of the config file', async () => {
  const config = await loadConfigFile(COMMENTED)
  assert.equal(config._path, resolve(process.cwd(), COMMENTED))
})

test('loadConfigFile applies v1 local defaults', async () => {
  const { local } = await loadConfigFile(COMMENTED)
  assert.deepEqual(local, {
    path: 'test/fixtures/site',
    files: '**/**',
    exclude: [],
    defaultTarget: 'staging',
    deleteRemoteFiles: false,
  })
})

test('loadConfigFile applies v1 per-target defaults', async () => {
  const { targets } = await loadConfigFile(COMMENTED)
  assert.deepEqual(targets.staging, {
    host: 'staging.example.com',
    user: 'stage-user',
    path: 'www/stage',
    _name: 'staging',
    port: 21,
    cache: '.synco-filelist',
    enabled: true,
    type: 'ftp',
    prompt: true,
    // Added by basic-ftp-connection: the FTPS defaults.
    secure: false,
    rejectUnauthorized: true,
  })
})

test('loadConfigFile keeps explicit local values', async () => {
  const { local } = await loadConfigFile(EXPLICIT)
  assert.equal(local.files, '**/*.html')
  assert.deepEqual(local.exclude, ['**/drafts/**'])
  assert.equal(local.defaultTarget, 'production')
})

test('loadConfigFile keeps explicit target values, including enabled: false, prompt: false, and a string prompt', async () => {
  const { targets } = await loadConfigFile(EXPLICIT)

  assert.equal(targets.staging._name, 'staging')
  assert.equal(targets.staging.port, 2121)
  assert.equal(targets.staging.cache, '.custom-filelist')
  assert.equal(targets.staging.prompt, false)
  assert.equal(targets.staging.type, 'sftp')
  assert.equal(targets.staging.enabled, true)

  assert.equal(targets.production._name, 'production')
  assert.equal(targets.production.prompt, 'This will upload to PRODUCTION! Are you sure?')

  assert.equal(targets.archive._name, 'archive')
  assert.equal(targets.archive.enabled, false)
  assert.equal(targets.archive.prompt, true)
})

test('deleteRemoteFiles is false unless it is literally true (the string "true" passes the schema but becomes false)', async () => {
  const explicit = await loadConfigFile(EXPLICIT)
  assert.equal(explicit.local.deleteRemoteFiles, false)

  const literal = await loadConfigFile(DELETE_TRUE)
  assert.equal(literal.local.deleteRemoteFiles, true)
})

test('loadConfigFile rejects when the preferred path does not exist', async () => {
  await assert.rejects(loadConfigFile('test/fixtures/config/does-not-exist.json'))
})

// FTPS target fields (basic-ftp-connection): `secure` and `rejectUnauthorized`.

// Loads a config whose one target, "s", has the given extra fields.
const tempDir = mkdtempSync(join(tmpdir(), 'syncodemayo-config-'))
after(() => rmSync(tempDir, { recursive: true, force: true }))
let configCount = 0
const loadWithTarget = (fields) => {
  const file = join(tempDir, `config-${++configCount}.json`)
  writeFileSync(file, JSON.stringify({
    local: { path: 'public' },
    targets: { s: { host: 'h', user: 'u', path: 'p', ...fields } },
  }))
  return loadConfigFile(relative(process.cwd(), file))
}

for (const secure of [true, false, 'implicit']) {
  test(`loadConfigFile accepts secure: ${JSON.stringify(secure)}`, async () => {
    const { targets } = await loadWithTarget({ secure })
    assert.equal(targets.s.secure, secure)
  })
}

for (const rejectUnauthorized of [true, false]) {
  test(`loadConfigFile accepts rejectUnauthorized: ${rejectUnauthorized}`, async () => {
    const { targets } = await loadWithTarget({ rejectUnauthorized })
    assert.equal(targets.s.rejectUnauthorized, rejectUnauthorized)
  })
}

for (const [field, value] of [
  ['secure', 'explicit'],
  ['secure', 'true'],
  ['secure', 'false'],
  ['secure', 'IMPLICIT'],
  ['secure', 1],
  ['secure', null],
  ['rejectUnauthorized', 'false'],
  ['rejectUnauthorized', 'true'],
  ['rejectUnauthorized', 0],
  ['rejectUnauthorized', null],
]) {
  test(`loadConfigFile rejects ${field}: ${JSON.stringify(value)} with a schema error naming the field`, async () => {
    await assert.rejects(loadWithTarget({ [field]: value }), {
      message: new RegExp(`^Config Schema Error: targets\\.s\\.${field} `),
    })
  })
}

test('the FTPS defaults are secure: false and rejectUnauthorized: true, with port 21', async () => {
  const { targets } = await loadWithTarget({})
  assert.equal(targets.s.secure, false)
  assert.equal(targets.s.rejectUnauthorized, true)
  assert.equal(targets.s.port, 21)
})

test('port defaults to 21 for secure: true (explicit FTPS)', async () => {
  const { targets } = await loadWithTarget({ secure: true })
  assert.equal(targets.s.port, 21)
})

test('port defaults to 990 for secure: "implicit"', async () => {
  const { targets } = await loadWithTarget({ secure: 'implicit' })
  assert.equal(targets.s.port, 990)
})

for (const secure of [false, true, 'implicit']) {
  test(`an explicit port is kept with secure: ${JSON.stringify(secure)}`, async () => {
    const { targets } = await loadWithTarget({ secure, port: 2121 })
    assert.equal(targets.s.port, 2121)
  })
}
