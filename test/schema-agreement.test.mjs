// Agreement between the hand-written validateConfig and config.schema.json (compiled with ajv,
// a devDependency). Both must give the same accept/reject verdict on every config in the
// corpus, except the named v1 joi divergences, where validateConfig follows v1 joi
// (factory/jobs/003-replace-small-deps/rework-1.md) and config.schema.json is left as is.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import Ajv from 'ajv-draft-04'
import { validateConfig } from '../dist/lib/ConfigSchema.js'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const schema = JSON.parse(readFileSync(join(REPO_ROOT, 'config.schema.json'), 'utf8'))
const schemaAccepts = new Ajv({ allErrors: true }).compile(schema)

const validatorAccepts = async (config) => {
  try {
    await validateConfig(config)
    return true
  } catch (err) {
    assert.match(err.message, /^Config Schema Error: /)
    return false
  }
}

// The known exceptions: where v1 joi and config.schema.json disagree. Each corpus entry that
// hits one names it in `divergence`; validateConfig gives the v1 joi verdict there.
const DIVERGENCES = {
  'boolean-strings': 'v1 joi.bool() accepts the strings "true"/"false"; the schema wants a JSON boolean',
  'numeric-string-port': 'v1 joi.number() accepts a numeric string for port; the schema wants a JSON number',
  'empty-strings': 'v1 joi.string() rejects ""; the schema has no minLength',
  'unknown-nested-keys': 'v1 joi rejects unknown keys inside local and targets; the schema does not set additionalProperties there',
}

const target = (extra = {}) => ({ host: 'www.example.com', user: 'USERNAME', path: 'www', ...extra })
const config = ({ local = {}, targets, ...rest } = {}) => ({
  local: { path: 'public', ...local },
  targets: targets ?? { staging: target() },
  ...rest,
})
const without = (object, key) => {
  const copy = { ...object }
  delete copy[key]
  return copy
}

// [name, config, v1 verdict (true = accept), divergence?]
const CORPUS = [
  // Valid configs
  ['minimal', config(), true],
  ['no targets defined', config({ targets: {} }), true],
  ['every local field', config({ local: { files: '**/*.html', exclude: ['**/*.map'], defaultTarget: 'staging', deleteRemoteFiles: true } }), true],
  ['every target field', config({ targets: { s: target({ pass: 'x', port: 21, cache: '.c', prompt: true, enabled: false, type: 'ftp' }) } }), true],
  ['prompt as false', config({ targets: { s: target({ prompt: false }) } }), true],
  ['prompt as a string', config({ targets: { s: target({ prompt: 'Sure?' }) } }), true],
  ['empty exclude', config({ local: { exclude: [] } }), true],
  ['extra top-level keys', config({ $schema: './config.schema.json', extra: { anything: 1 } }), true],
  ['several targets', config({ targets: { a: target(), b: target({ port: 2121 }) } }), true],

  // Required fields
  ['config is not an object', [], false],
  ['missing local', without(config(), 'local'), false],
  ['missing targets', without(config(), 'targets'), false],
  ['missing local.path', { ...config(), local: {} }, false],
  ['target missing host', config({ targets: { s: without(target(), 'host') } }), false],
  ['target missing user', config({ targets: { s: without(target(), 'user') } }), false],
  ['target missing path', config({ targets: { s: without(target(), 'path') } }), false],

  // Field types
  ['local is not an object', { ...config(), local: 'public' }, false],
  ['targets is an array', config({ targets: [target()] }), false],
  ['a target is null', config({ targets: { s: null } }), false],
  ['local.path is a number', config({ local: { path: 7 } }), false],
  ['local.files is a number', config({ local: { files: 1 } }), false],
  ['local.defaultTarget is a boolean', config({ local: { defaultTarget: true } }), false],
  ['local.deleteRemoteFiles is a number', config({ local: { deleteRemoteFiles: 1 } }), false],
  ['local.deleteRemoteFiles is "yes"', config({ local: { deleteRemoteFiles: 'yes' } }), false],
  ['target.host is a number', config({ targets: { s: target({ host: 1 }) } }), false],
  ['target.user is null', config({ targets: { s: target({ user: null }) } }), false],
  ['target.path is an object', config({ targets: { s: target({ path: {} }) } }), false],
  ['target.pass is a number', config({ targets: { s: target({ pass: 1234 }) } }), false],
  ['target.port is a non-numeric string', config({ targets: { s: target({ port: 'twenty-one' }) } }), false],
  ['target.port is a boolean', config({ targets: { s: target({ port: true }) } }), false],
  ['target.cache is a number', config({ targets: { s: target({ cache: 1 }) } }), false],
  ['target.enabled is a number', config({ targets: { s: target({ enabled: 0 }) } }), false],
  ['target.type is a number', config({ targets: { s: target({ type: 1 }) } }), false],
  ['target.prompt is a number', config({ targets: { s: target({ prompt: 1 }) } }), false],
  ['target.prompt is null', config({ targets: { s: target({ prompt: null }) } }), false],

  // exclude items
  ['exclude is a string', config({ local: { exclude: '**/*.map' } }), false],
  ['exclude has a number item', config({ local: { exclude: ['**/*.map', 42] } }), false],
  ['exclude has a null item', config({ local: { exclude: [null] } }), false],

  // v1 joi divergences: validateConfig follows v1 joi, config.schema.json disagrees.
  ['local.deleteRemoteFiles is "true"', config({ local: { deleteRemoteFiles: 'true' } }), true, 'boolean-strings'],
  ['local.deleteRemoteFiles is "FALSE"', config({ local: { deleteRemoteFiles: 'FALSE' } }), true, 'boolean-strings'],
  ['target.enabled is "false"', config({ targets: { s: target({ enabled: 'false' }) } }), true, 'boolean-strings'],
  ['target.port is "21"', config({ targets: { s: target({ port: '21' }) } }), true, 'numeric-string-port'],
  ['target.port is "2121.0"', config({ targets: { s: target({ port: '2121.0' }) } }), true, 'numeric-string-port'],
  ['local.path is ""', config({ local: { path: '' } }), false, 'empty-strings'],
  ['target.host is ""', config({ targets: { s: target({ host: '' }) } }), false, 'empty-strings'],
  ['target.prompt is ""', config({ targets: { s: target({ prompt: '' }) } }), false, 'empty-strings'],
  ['exclude has an "" item', config({ local: { exclude: [''] } }), false, 'empty-strings'],
  ['unknown key inside local', config({ local: { unknownKey: true } }), false, 'unknown-nested-keys'],
  ['unknown key inside a target', config({ targets: { s: target({ unknownKey: true }) } }), false, 'unknown-nested-keys'],
]

test('the corpus has at least 15 configs, valid and invalid', () => {
  assert.ok(CORPUS.length >= 15)
  assert.ok(CORPUS.some(([, , valid]) => valid))
  assert.ok(CORPUS.some(([, , valid]) => !valid))
})

test('every divergence is named and covered by the corpus', () => {
  for (const name of Object.keys(DIVERGENCES)) {
    assert.ok(CORPUS.some(([, , , divergence]) => divergence === name), `no corpus entry for ${name}`)
  }
})

for (const [name, cfg, v1Verdict, divergence] of CORPUS) {
  if (divergence) {
    test(`known exception (${divergence}): ${name}: validateConfig follows v1 joi, the schema differs`, async () => {
      assert.ok(divergence in DIVERGENCES, `unknown divergence: ${divergence}`)
      assert.equal(await validatorAccepts(structuredClone(cfg)), v1Verdict, 'validateConfig verdict')
      assert.equal(schemaAccepts(structuredClone(cfg)), !v1Verdict, 'config.schema.json verdict')
    })
  } else {
    test(`agrees with config.schema.json: ${name}`, async () => {
      assert.equal(await validatorAccepts(structuredClone(cfg)), v1Verdict, 'validateConfig verdict')
      assert.equal(schemaAccepts(structuredClone(cfg)), v1Verdict, 'config.schema.json verdict')
    })
  }
}

// More v1 joi behavior that has no schema counterpart worth comparing.
test('validateConfig returns the config it was given, unconverted', async () => {
  const cfg = config({ local: { deleteRemoteFiles: 'true' }, targets: { s: target({ port: '21' }) } })
  const result = await validateConfig(cfg)
  assert.equal(result, cfg)
  assert.equal(result.local.deleteRemoteFiles, 'true')
  assert.equal(result.targets.s.port, '21')
})

test('validateConfig error details name the offending path', async () => {
  await assert.rejects(validateConfig(config({ targets: { prod: target({ port: 'x' }) } })), {
    message: /^Config Schema Error: .*targets\.prod\.port/,
  })
  await assert.rejects(validateConfig(config({ local: { exclude: ['a', 3] } })), {
    message: /^Config Schema Error: .*local\.exclude/,
  })
})

for (const port of [Infinity, NaN, 'Infinity', '']) {
  test(`validateConfig rejects port ${JSON.stringify(port) ?? String(port)} as v1 joi did`, async () => {
    assert.equal(await validatorAccepts(config({ targets: { s: target({ port }) } })), false)
  })
}
