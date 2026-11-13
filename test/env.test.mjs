// .env loading at CLI startup (process.loadEnvFile, replacing dotenv).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const CLI = join(REPO_ROOT, 'dist', 'cli.js')
const CONFIG_MODULE = join(REPO_ROOT, 'dist', 'lib', 'Config.js')

const CONFIG = JSON.stringify({
  local: { path: 'public' },
  targets: { staging: { host: 'h', user: 'u', path: 'p' } },
})

// Runs fn with a temp dir that holds `files` (name -> contents).
const withTempDir = (files, fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'syncodemayo-env-'))
  try {
    for (const [name, contents] of Object.entries(files)) writeFileSync(join(dir, name), contents)
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// An env with no STAGING_PWD, plus `extra`.
const childEnv = (extra = {}) => {
  const env = { ...process.env, ...extra }
  if (!('STAGING_PWD' in extra)) delete env.STAGING_PWD
  return env
}

// Starts dist/cli.js (with --version, so it runs no command) inside a node process in `cwd`,
// then prints what resolvePassword sees for the `staging` target.
const passwordSeenByCli = (cwd, env) => {
  const script = `
    process.argv = [process.execPath, ${JSON.stringify(CLI)}, '--version']
    await import(${JSON.stringify(pathToFileURL(CLI).href)})
    const { resolvePassword } = await import(${JSON.stringify(pathToFileURL(CONFIG_MODULE).href)})
    let seen
    try { seen = resolvePassword({ _name: 'staging' }) } catch (err) { seen = 'ERROR: ' + err.message }
    console.log('PASSWORD=' + seen)
  `
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd, env, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.split('\n').find(line => line.startsWith('PASSWORD=')).slice('PASSWORD='.length)
}

test('a .env in the working directory makes STAGING_PWD visible to resolvePassword', () => {
  withTempDir({ '.env': 'STAGING_PWD=from-dotenv\n', 'syncodemayo.json': CONFIG }, (dir) => {
    assert.equal(passwordSeenByCli(dir, childEnv()), 'from-dotenv')
  })
})

test('a variable already in the environment is not overridden by .env', () => {
  withTempDir({ '.env': 'STAGING_PWD=from-dotenv\n', 'syncodemayo.json': CONFIG }, (dir) => {
    assert.equal(passwordSeenByCli(dir, childEnv({ STAGING_PWD: 'from-env' })), 'from-env')
  })
})

for (const args of [['ls'], ['--help']]) {
  test(`with no .env, dist/cli.js ${args.join(' ')} runs without an env-related error`, () => {
    withTempDir({ 'syncodemayo.json': CONFIG }, (dir) => {
      const result = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, env: childEnv(), encoding: 'utf8' })
      assert.equal(result.status, 0, result.stderr)
      assert.equal(result.stderr, '')
    })
  })
}

test('a .env that exists but cannot be read still surfaces an error', () => {
  withTempDir({ 'syncodemayo.json': CONFIG }, (dir) => {
    mkdirSync(join(dir, '.env'))
    const result = spawnSync(process.execPath, [CLI, 'ls'], { cwd: dir, env: childEnv(), encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /\.env/)
  })
})
