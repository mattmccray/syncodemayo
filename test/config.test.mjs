// Characterization tests for v1 config loading: loadConfigFile, comment
// stripping, and the defaults that massageConfigData applies.
// Run from the repo root: v1 resolves config paths against process.cwd().
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { loadConfigFile } from '../lib/Config.js'

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
