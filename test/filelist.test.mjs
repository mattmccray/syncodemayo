// Golden test for v1 buildLocalFilelist: the exact keys and CRC32 values v1
// produces for the committed fixture folder. This file is the executable
// definition of the .synco-filelist cache format.
// Run from the repo root: v1 globs against process.cwd(), so keys are
// cwd-relative paths prefixed with local.path.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildLocalFilelist } from '../dist/lib/Filelist.js'

const SITE = 'test/fixtures/site'
const golden = JSON.parse(readFileSync('test/fixtures/site.filelist.json', 'utf8'))

const localConfig = () => ({
  path: SITE,
  files: '**/**', // the v1 default
  exclude: ['**/*.md', '**/drafts/**'],
  defaultTarget: 'staging',
  deleteRemoteFiles: false,
})

test('buildLocalFilelist matches the committed golden file list exactly', async () => {
  const filelist = await buildLocalFilelist(localConfig())
  assert.deepEqual(filelist, golden)
})

test('golden values are unsigned 32-bit CRC numbers', () => {
  for (const [key, crc] of Object.entries(golden)) {
    assert.equal(typeof crc, 'number', key)
    assert.ok(Number.isInteger(crc) && crc >= 0 && crc <= 0xffffffff, key)
  }
})

test('golden keys are glob paths prefixed with local.path', () => {
  for (const key of Object.keys(golden)) {
    assert.ok(key.startsWith(`${SITE}/`), key)
  }
})

test('golden list includes nested and binary files', () => {
  assert.ok(`${SITE}/nested/deep/page.html` in golden)
  assert.ok(`${SITE}/assets/img/pixel.png` in golden)
  assert.ok(`${SITE}/sub/visible.html` in golden)
})

test('golden list excludes dotfiles and files inside dot-directories (v1 behavior the epic changes on purpose)', () => {
  for (const key of Object.keys(golden)) {
    const segments = key.slice(SITE.length + 1).split('/')
    assert.ok(segments.every(segment => !segment.startsWith('.')), key)
  }
  assert.ok(!(`${SITE}/.htaccess` in golden))
  assert.ok(!(`${SITE}/.well-known/security.txt` in golden))
  assert.ok(!(`${SITE}/sub/.hidden` in golden))
})

test('golden list excludes files that match an exclude pattern', () => {
  assert.ok(!(`${SITE}/notes.md` in golden))
  assert.ok(!(`${SITE}/nested/README.md` in golden))
  assert.ok(!(`${SITE}/drafts/draft.html` in golden))
  for (const key of Object.keys(golden)) {
    assert.ok(!key.endsWith('.md') && !key.includes('/drafts/'), key)
  }
})

test('golden list has no directory entries', () => {
  for (const dir of ['', '/assets', '/assets/img', '/css', '/nested', '/nested/deep', '/sub', '/drafts', '/.well-known']) {
    assert.ok(!(`${SITE}${dir}` in golden), dir || '(root)')
  }
})
