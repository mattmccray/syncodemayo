// Golden test for v1 buildLocalFilelist: the exact keys and CRC32 values v1
// produces for the committed fixture folder. This file is the executable
// definition of the .synco-filelist cache format.
// Run from the repo root: v1 globs against process.cwd(), so keys are
// cwd-relative paths prefixed with local.path.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  buildLocalFilelist,
  fileCrc32,
  filelistKey,
  matchesGlobDot,
  toPosixPath,
} from '../dist/lib/Filelist.js'

const SITE = 'test/fixtures/site'
const golden = JSON.parse(readFileSync('test/fixtures/site.filelist.json', 'utf8'))
// The list v1 wrote for the same folder: no dotfiles. Remote .synco-filelists in the wild look like this.
const v1Golden = JSON.parse(readFileSync('test/fixtures/site.filelist.v1.json', 'utf8'))

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

test('golden list includes dotfiles and files inside dot-directories (v1 skipped them; the epic changes this on purpose)', () => {
  assert.ok(`${SITE}/.htaccess` in golden)
  assert.ok(`${SITE}/.well-known/security.txt` in golden)
  assert.ok(`${SITE}/sub/.hidden` in golden)
})

test('golden list is the v1 golden, keys and CRCs unchanged, plus exactly the three dotfiles', () => {
  const added = Object.keys(golden).filter(key => !(key in v1Golden)).sort()
  assert.deepEqual(added, [
    `${SITE}/.htaccess`,
    `${SITE}/.well-known/security.txt`,
    `${SITE}/sub/.hidden`,
  ])
  assert.equal(Object.keys(v1Golden).length, 7)
  for (const [key, crc] of Object.entries(v1Golden)) assert.equal(golden[key], crc, key)
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

// Built-in replacements for glob, minimatch, and crc (builtin-filelist).

const REPO_ROOT = resolve(import.meta.dirname, '..')

// Runs fn with a temp dir holding `files` ({ relative path: contents }).
const withTempSite = async (files, fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'syncodemayo-filelist-'))
  try {
    for (const [relative, contents] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, relative)), { recursive: true })
      writeFileSync(join(dir, relative), contents)
    }
    return await fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('CRC values equal crc 3.4.1 crc32 as unsigned 32-bit integers (known vectors)', async () => {
  // Expected values computed with crc@3.4.1 crc32().
  await withTempSite({ 'check.txt': '123456789', 'empty.txt': '', 'crlf.txt': 'a\r\nb' }, async (dir) => {
    assert.equal(fileCrc32(join(dir, 'check.txt')), 0xcbf43926)
    assert.equal(fileCrc32(join(dir, 'empty.txt')), 0)
    assert.equal(fileCrc32(join(dir, 'crlf.txt')), 4082447575)
    const filelist = await buildLocalFilelist({ ...localConfig(), path: dir, exclude: [] })
    assert.deepEqual(filelist, {
      [`${dir}/check.txt`]: 3421780262,
      [`${dir}/crlf.txt`]: 4082447575,
      [`${dir}/empty.txt`]: 0,
    })
  })
  assert.equal(fileCrc32(`${SITE}/assets/img/pixel.png`), 127247398)
  assert.equal(fileCrc32(`${SITE}/nested/crlf.txt`), 3666142676)
})

test('golden keys use POSIX separators', () => {
  for (const key of Object.keys(golden)) assert.ok(!key.includes('\\'), key)
})

test('filelistKey normalizes Windows-style paths to POSIX keys prefixed with local.path', () => {
  assert.equal(toPosixPath('a\\b\\c.html', '\\'), 'a/b/c.html')
  assert.equal(toPosixPath('a/b/c.html', '/'), 'a/b/c.html')
  assert.equal(filelistKey('public', 'css\\style.css', '\\'), 'public/css/style.css')
  assert.equal(filelistKey('site\\public', '.well-known\\security.txt', '\\'), 'site/public/.well-known/security.txt')
  assert.equal(filelistKey('public', 'css/style.css', '/'), 'public/css/style.css')
})

test('filelistKey keeps the v1 (glob 7) prefix: repeated and trailing slashes collapse, ./ stays', () => {
  assert.equal(filelistKey('public/', 'index.html', '/'), 'public/index.html')
  assert.equal(filelistKey('test//fixtures/site', 'index.html', '/'), 'test/fixtures/site/index.html')
  assert.equal(filelistKey('./public', 'index.html', '/'), './public/index.html')
})

test('matchesGlobDot matches dot segments like minimatch { dot: true }', () => {
  assert.ok(matchesGlobDot('x/.well-known/a.md', '**/*.md'))
  assert.ok(matchesGlobDot('x/drafts/.x', '**/drafts/**'))
  assert.ok(matchesGlobDot('x/.env', '**/.env*'))
  assert.ok(matchesGlobDot('x/.env.local', '**/.env*'))
  assert.ok(matchesGlobDot('x/.gitignore', '**/.git*'))
  assert.ok(matchesGlobDot('x/.DS_Store', '**/.DS_Store'))
  assert.ok(matchesGlobDot('.a/.b/c.map', '**/*.map'))
  assert.ok(matchesGlobDot('.htaccess', '**/**'))
  assert.ok(matchesGlobDot('.well-known/security.txt', '**/**'))
  assert.ok(matchesGlobDot('x/.a/b.txt', 'x/?a/*.txt'))
  assert.ok(matchesGlobDot('x/.env', '**/{.env,.git}*'))
  assert.ok(matchesGlobDot('.y/.git', '**/{.env,.git}*'))
})

test('matchesGlobDot does not match what minimatch { dot: true } would not', () => {
  assert.ok(!matchesGlobDot('x/a.mdx', '**/*.md'))
  assert.ok(!matchesGlobDot('x/draftsy/a', '**/drafts/**'))
  assert.ok(!matchesGlobDot('x/env', '**/.env*'))
  assert.ok(!matchesGlobDot('x/a.env', '**/.env*'))
  // **/.git* matches .gitignore but not files inside a .git/ directory.
  assert.ok(!matchesGlobDot('x/.git/config', '**/.git*'))
  assert.ok(!matchesGlobDot('x/b.txt', 'x/?a/*.txt'))
})

test('buildLocalFilelist lists files inside nested dot-directories and applies dot-aware files and exclude patterns', async () => {
  await withTempSite({
    'index.html': 'i',
    '.a/.b/deep.html': 'd',
    '.a/plain.html': 'p',
    '.a/notes.md': 'n',
    '.env': 'SECRET=1',
    'sub/.env.local': 'SECRET=2',
    '.gitignore': 'x',
    '.git/config': 'c',
    'app.js.map': 'm',
    'other.txt': 't',
  }, async (dir) => {
    const filelist = await buildLocalFilelist({
      ...localConfig(),
      path: dir,
      files: '**/*.{html,md,map}',
      exclude: ['**/*.md', '**/*.map', '**/.DS_Store', '**/.git*', '**/.env*'],
    })
    assert.deepEqual(Object.keys(filelist).sort(), [
      `${dir}/.a/.b/deep.html`,
      `${dir}/.a/plain.html`,
      `${dir}/index.html`,
    ])
    const all = await buildLocalFilelist({ ...localConfig(), path: dir, exclude: ['**/.git*', '**/.env*'] })
    assert.deepEqual(Object.keys(all).sort(), [
      `${dir}/.a/.b/deep.html`,
      `${dir}/.a/notes.md`,
      `${dir}/.a/plain.html`,
      `${dir}/.git/config`,
      `${dir}/app.js.map`,
      `${dir}/index.html`,
      `${dir}/other.txt`,
    ])
  })
})

// public/uploads -> ../shared (a symlinked directory with nested files and its
// own symlink), public/a/loop -> .. (a loop), and public/filelink -> a file.
const withSymlinkedSite = (extra, fn) => withTempSite({
  'public/index.html': 'i',
  'public/a/z.txt': 'z',
  'shared/top.txt': 't',
  'shared/img/p.png': 'p',
  'shared/img/deeper/q.txt': 'q',
  'other/x/y.txt': 'y',
}, async (dir) => {
  symlinkSync('../shared', join(dir, 'public/uploads'))
  symlinkSync('../other', join(dir, 'shared/link2'))
  symlinkSync('..', join(dir, 'public/a/loop'))
  symlinkSync('../other/x/y.txt', join(dir, 'public/filelink'))
  extra(dir)
  return fn(dir)
})

const symlinkTest = process.platform === 'win32' ? test.skip : test

symlinkTest('buildLocalFilelist follows symlinks the way v1 (glob 7, **/**) did', () =>
  withSymlinkedSite(() => {}, async (dir) => {
    const local = `${dir}/public`
    const filelist = await buildLocalFilelist({ ...localConfig(), path: local, exclude: [] })
    // The exact file keys glob@7.1.2 sync('<path>/**/**') gave for this tree.
    assert.deepEqual(Object.keys(filelist).sort(), [
      'a/loop/a/z.txt',
      'a/loop/filelink',
      'a/loop/index.html',
      'a/z.txt',
      'filelink',
      'index.html',
      'uploads/img/deeper/q.txt',
      'uploads/img/p.png',
      'uploads/top.txt',
    ].map(relative => `${local}/${relative}`))
  }))

symlinkTest('buildLocalFilelist finishes on a dot-named symlink loop and lists its files once through it', () =>
  withSymlinkedSite((dir) => symlinkSync('..', join(dir, 'public/a/.loop')), async (dir) => {
    const local = `${dir}/public`
    const filelist = await buildLocalFilelist({ ...localConfig(), path: local, exclude: [] })
    const keys = Object.keys(filelist)
    for (const relative of ['a/.loop/index.html', 'a/.loop/a/z.txt', 'uploads/img/deeper/q.txt']) {
      assert.ok(keys.includes(`${local}/${relative}`), relative)
    }
    assert.ok(!keys.some(key => key.includes('/.loop/a/.loop/') || key.includes('/loop/a/loop/')))
  }))

test('buildLocalFilelist of a missing folder is empty', async () => {
  assert.deepEqual(await buildLocalFilelist({ ...localConfig(), path: 'test/fixtures/does-not-exist' }), {})
})

test('building the file list and a dry-run diff print no ExperimentalWarning on this Node', () => {
  const script = `
    import { buildLocalFilelist } from './dist/lib/Filelist.js'
    import { loadConfigFile } from './dist/lib/Config.js'
    import { Sync } from './dist/lib/Sync.js'
    const config = await loadConfigFile('test/fixtures/config/site.json')
    await buildLocalFilelist(config.local)
    const conn = { getRemoteFile: async () => '{}' }
    await new Sync(conn, config, 'staging').run(true)
  `
  const { status, stderr } = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  assert.equal(status, 0, stderr)
  assert.doesNotMatch(stderr, /ExperimentalWarning/)
})
