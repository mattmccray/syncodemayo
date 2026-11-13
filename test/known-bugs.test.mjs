// Known v1 bugs, first recorded as todo tests that assert the FIXED behavior.
// fix-v1-bugs fixed them and removed the markers; each title still names its
// bug so it can be found.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { loadConfigFile } from '../dist/lib/Config.js'
import { Client } from '../dist/lib/Client.js'
import * as CLI from '../dist/lib/Cli.js'
import { LogLevel, setLogLevel } from '../dist/lib/Log.js'

setLogLevel(LogLevel.Urgent)

const REPO_ROOT = resolve(import.meta.dirname, '..')

const MINIMAL_CONFIG = JSON.stringify({
  local: { path: 'public' },
  targets: { staging: { host: 'h', user: 'u', path: 'p' } },
})

// Runs fn with the cwd set to a temp dir that contains only the config files named.
const inDirWith = async (filenames, fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'syncodemayo-test-'))
  const previous = process.cwd()
  for (const filename of filenames) writeFileSync(join(dir, filename), MINIMAL_CONFIG)
  process.chdir(dir)
  try {
    return await fn(dir)
  } finally {
    process.chdir(previous)
    rmSync(dir, { recursive: true, force: true })
  }
}

for (const fallback of ['.syncodemayo.json', 'sync-config.json']) {
  test(`bug: fallback config files never load (only ${fallback} in cwd)`, () => inDirWith([fallback], async () => {
    const config = await loadConfigFile()
    assert.equal(config._path, resolve(process.cwd(), fallback))
  }))
}

test('bug: fallback config files never load (syncodemayo.json wins, then .syncodemayo.json)', async () => {
  await inDirWith(['syncodemayo.json', '.syncodemayo.json', 'sync-config.json'], async () => {
    assert.equal((await loadConfigFile())._path, resolve(process.cwd(), 'syncodemayo.json'))
  })
  await inDirWith(['.syncodemayo.json', 'sync-config.json'], async () => {
    assert.equal((await loadConfigFile())._path, resolve(process.cwd(), '.syncodemayo.json'))
  })
  await inDirWith(['syncodemayo.json', 'sync-config.json'], async () => {
    assert.equal((await loadConfigFile())._path, resolve(process.cwd(), 'syncodemayo.json'))
  })
})

test('bug: Client indexOf error misclassification (schema error sets only loadError)', async () => {
  const client = await Client.create('test/fixtures/config/schema-error.json')
  assert.equal(client.hasConfig, false)
  assert.match(client.loadError.message, /^Config Schema Error: /)
  assert.equal(client.parseError, undefined)
})

test('bug: Client indexOf error misclassification (JSON parse error sets only parseError)', async () => {
  const client = await Client.create('test/fixtures/config/parse-error.json')
  assert.equal(client.hasConfig, false)
  assert.ok(client.parseError instanceof SyntaxError)
  assert.equal(client.loadError, undefined)
})

test('bug: Client indexOf error misclassification (no config sets neither error, and init creates syncodemayo.json)', () =>
  inDirWith([], async (dir) => {
    const client = await Client.create(undefined)
    assert.equal(client.hasConfig, false)
    assert.equal(client.loadError, undefined)
    assert.equal(client.parseError, undefined)
    assert.equal(client.hasError, false)

    assert.equal(await CLI.init(), true)
    assert.ok(existsSync(join(dir, 'syncodemayo.json')))
    const written = await loadConfigFile()
    assert.equal(written._path, resolve(process.cwd(), 'syncodemayo.json'))
  }))

test('bug: Client indexOf error misclassification (a missing preferred path sets neither error)', async () => {
  const client = await Client.create('test/fixtures/config/does-not-exist.json')
  assert.equal(client.hasConfig, false)
  assert.equal(client.hasError, false)
})

test('bug: hard-coded --version in cli.ts (prints package.json version)', () => {
  const { version } = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'))
  const output = execFileSync(process.execPath, [join(REPO_ROOT, 'dist', 'cli.js'), '--version'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  assert.equal(output.trim(), version)
})
