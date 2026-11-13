// Characterization tests for v1 resolveTarget and resolvePassword.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadConfigFile, resolveTarget, resolvePassword } from '../dist/lib/Config.js'

// explicit.json: defaultTarget "production"; targets staging, production, and archive (disabled).
const loadMassaged = () => loadConfigFile('test/fixtures/config/explicit.json')

const withEnv = async (name, value, fn) => {
  const had = Object.prototype.hasOwnProperty.call(process.env, name)
  const previous = process.env[name]
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
  try {
    return await fn()
  } finally {
    if (had) process.env[name] = previous
    else delete process.env[name]
  }
}

test('resolveTarget returns the default target when the name is undefined', async () => {
  const config = await loadMassaged()
  assert.equal(resolveTarget(config, undefined), config.targets.production)
})

test('resolveTarget returns an object argument unchanged', async () => {
  const config = await loadMassaged()
  const target = { _name: 'adhoc', host: 'h', user: 'u', path: 'p', enabled: false }
  assert.equal(resolveTarget(config, target), target)
})

test('resolveTarget matches names case-insensitively', async () => {
  const config = await loadMassaged()
  assert.equal(resolveTarget(config, 'STAGING'), config.targets.staging)
  assert.equal(resolveTarget(config, 'Production'), config.targets.production)
})

test('resolveTarget throws for an unknown name', async () => {
  const config = await loadMassaged()
  assert.throws(() => resolveTarget(config, 'nowhere'), { message: "Target 'nowhere' not found." })
})

test('resolveTarget throws for a disabled target', async () => {
  const config = await loadMassaged()
  assert.throws(() => resolveTarget(config, 'Archive'), { message: "Target 'Archive' not enabled." })
})

test('resolvePassword returns pass when it is set, even if the env var is set', () =>
  withEnv('STAGING_PWD', 'from-env', () => {
    assert.equal(resolvePassword({ _name: 'staging', pass: 'from-config' }), 'from-config')
  }))

test('resolvePassword falls back to <NAME>_PWD with the target name uppercased', () =>
  withEnv('MIXEDCASE_PWD', 'from-env', () => {
    assert.equal(resolvePassword({ _name: 'mixedCase' }), 'from-env')
  }))

test('resolvePassword throws when there is no pass and no env var', () =>
  withEnv('NOPASS_PWD', undefined, () => {
    assert.throws(() => resolvePassword({ _name: 'nopass' }), {
      message: 'Cannot find password for target: nopass',
    })
  }))
