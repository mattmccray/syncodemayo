// Characterization tests for v1 validateConfig (the joi schema).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateConfig } from '../lib/ConfigSchema.js'

const minimal = () => ({
  local: { path: 'public' },
  targets: {
    staging: { host: 'www.example.com', user: 'USERNAME', path: 'www' },
  },
})

const SCHEMA_ERROR = /^Config Schema Error: /

const rejectsWith = (mutate) => {
  const config = minimal()
  mutate(config)
  return assert.rejects(validateConfig(config), { message: SCHEMA_ERROR })
}

test('a minimal valid config resolves unchanged', async () => {
  const config = minimal()
  const result = await validateConfig(config)
  assert.equal(result, config)
  assert.deepEqual(result, minimal())
})

test('unknown top-level keys are accepted', async () => {
  const config = { ...minimal(), $schema: './config.schema.json', extra: { anything: 1 } }
  const result = await validateConfig(config)
  assert.equal(result, config)
})

test('missing local rejects', () => rejectsWith(c => { delete c.local }))

test('missing local.path rejects', () => rejectsWith(c => { delete c.local.path }))

test('missing targets rejects', () => rejectsWith(c => { delete c.targets }))

for (const field of ['host', 'user', 'path']) {
  test(`a target missing ${field} rejects`, () => rejectsWith(c => { delete c.targets.staging[field] }))
}

test('a non-numeric string port rejects', () => rejectsWith(c => { c.targets.staging.port = 'twenty-one' }))

test('exclude that is not an array rejects', () => rejectsWith(c => { c.local.exclude = '**/*.map' }))

test('exclude with a non-string item rejects', () => rejectsWith(c => { c.local.exclude = ['**/*.map', 42] }))

test('a non-string local.path rejects', () => rejectsWith(c => { c.local.path = 7 }))

test('a non-boolean, non-string prompt rejects', () => rejectsWith(c => { c.targets.staging.prompt = 1 }))

test('an unknown key inside local rejects', () => rejectsWith(c => { c.local.unknownKey = true }))

test('an unknown key inside a target rejects', () => rejectsWith(c => { c.targets.staging.unknownKey = true }))
