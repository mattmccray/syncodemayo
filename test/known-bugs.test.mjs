// Known v1 bugs, recorded as `todo` tests that assert the FIXED behavior.
// They run but do not fail `npm test`. The fix-v1-bugs job removes the todo
// marker when it fixes each one; each title names its bug so it can be found.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { loadConfigFile } from '../dist/lib/Config.js'
import { Client } from '../dist/lib/Client.js'

const REPO_ROOT = resolve(import.meta.dirname, '..')

const MINIMAL_CONFIG = JSON.stringify({
  local: { path: 'public' },
  targets: { staging: { host: 'h', user: 'u', path: 'p' } },
})

// Runs fn with the cwd set to a temp dir that contains only `filename`.
const inDirWithOnly = async (filename, fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'syncodemayo-test-'))
  const previous = process.cwd()
  writeFileSync(join(dir, filename), MINIMAL_CONFIG)
  process.chdir(dir)
  try {
    return await fn(dir)
  } finally {
    process.chdir(previous)
    rmSync(dir, { recursive: true, force: true })
  }
}

for (const fallback of ['.syncodemayo.json', 'sync-config.json']) {
  test(`bug: fallback config files never load (only ${fallback} in cwd)`, {
    todo: 'fix-v1-bugs: localFileExists returns a Promise, so the SKIP to the next fallback never happens',
  }, () => inDirWithOnly(fallback, async () => {
    const config = await loadConfigFile()
    assert.equal(config._path, resolve(process.cwd(), fallback))
  }))
}

test('bug: Client indexOf error misclassification (schema error sets only loadError)', {
  todo: 'fix-v1-bugs: Client.ts tests err.message.indexOf(...) for truthiness instead of !== -1',
}, async () => {
  const client = await Client.create('test/fixtures/config/schema-error.json')
  assert.equal(client.hasConfig, false)
  assert.match(client.loadError.message, /^Config Schema Error: /)
  assert.equal(client.parseError, undefined)
})

test('bug: Client indexOf error misclassification (JSON parse error sets only parseError)', {
  todo: 'fix-v1-bugs: Client.ts tests err.message.indexOf(...) for truthiness instead of !== -1',
}, async () => {
  const client = await Client.create('test/fixtures/config/parse-error.json')
  assert.equal(client.hasConfig, false)
  assert.ok(client.parseError instanceof SyntaxError)
  assert.equal(client.loadError, undefined)
})

test('bug: hard-coded --version in cli.ts (prints package.json version)', {
  todo: "fix-v1-bugs: cli.ts calls program.version('1.0.0') instead of reading package.json",
}, () => {
  const { version } = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'))
  const output = execFileSync(process.execPath, [join(REPO_ROOT, 'dist', 'cli.js'), '--version'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  assert.equal(output.trim(), version)
})
