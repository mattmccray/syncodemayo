// Scans of the source and test trees for patterns the v2 code must not contain (fix-v1-bugs).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..')

// Every file under dir (relative to the repo root) whose name passes `keep`, with its source.
const sources = (dir, keep) =>
  readdirSync(join(REPO_ROOT, dir), { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && keep(entry.name))
    .map(entry => {
      const file = join(entry.parentPath, entry.name)
      return { file: relative(REPO_ROOT, file), source: readFileSync(file, 'utf8') }
    })

const matching = (files, pattern) =>
  files.filter(({ source }) => pattern.test(source)).map(({ file }) => file)

test('no file under src/lib/ calls process.exit (only src/cli.ts decides exit codes)', () => {
  const files = sources('src/lib', name => name.endsWith('.ts'))
  assert.ok(files.length > 0)
  assert.deepEqual(matching(files, /process\.exit/), [])
})

test('no file under src/ uses the deprecated new Buffer( constructor', () => {
  const files = sources('src', name => name.endsWith('.ts'))
  assert.ok(files.length > 0)
  assert.deepEqual(matching(files, /new\s+Buffer\s*\(/), [])
})

test('no test under test/ has a todo option or uses test.todo', () => {
  const files = sources('test', name => name.endsWith('.mjs'))
  assert.ok(files.length > 0)
  assert.deepEqual(matching(files, /\btodo\s*:|\.todo\s*\(/), [])
})
