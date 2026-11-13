// Checks the build and packaging toolchain: the TypeScript 5 src/ -> dist/ ESM
// build, package.json metadata, the npm tarball contents, the CLI shebang, and
// that CommonJS consumers can require() the ESM library. Runs after `npm test`
// has compiled dist/.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const TSC = join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'))

const tsc = (...args) =>
  execFileSync(process.execPath, [TSC, ...args], { cwd: REPO_ROOT, encoding: 'utf8' })

const withTempDir = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'syncodemayo-toolchain-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// --help and --version output of the v1 build (TypeScript 2.4, CommonJS), byte for byte.
const V1_HELP = `
  Usage: cli [options] [command]


  Options:

    -V, --version        output the version number
    -c, --config [file]  Specify local config [file]
    -v, --verbose        Verbose logging
    -q, --quiet          Minimal logging
    -h, --help           output usage information


  Commands:

    init [target]            Configure local folder and/or server to sync
    changes|diff [target]    Perform sync dry run and display the changes
    verify [target]          Verify server is configured
    sync [options] [target]  Perform sync to server
    ls                       List defined targets in config
`
const V1_VERSION = '1.0.0\n'

test('tsc is TypeScript 5.x', () => {
  assert.match(tsc('--version'), /^Version 5\./)
})

test('tsconfig keeps strict and noUnusedLocals, compiles src/ into dist/ with NodeNext', () => {
  const { compilerOptions: opts } = JSON.parse(tsc('-p', 'tsconfig.json', '--showConfig'))
  assert.equal(opts.strict, true)
  assert.equal(opts.noUnusedLocals, true)
  assert.equal(opts.module.toLowerCase(), 'nodenext')
  assert.equal(opts.moduleResolution.toLowerCase(), 'nodenext')
  assert.equal(resolve(REPO_ROOT, opts.rootDir), join(REPO_ROOT, 'src'))
  assert.equal(resolve(REPO_ROOT, opts.outDir), join(REPO_ROOT, 'dist'))
  assert.equal(opts.declarationDir, undefined)
  assert.equal(opts.outFile, undefined)
})

test('tsc compiles only src/ (nothing under factory/ or test/)', () => {
  const files = tsc('-p', 'tsconfig.json', '--listFilesOnly')
    .split('\n')
    .filter(Boolean)
    .map(f => relative(REPO_ROOT, f))
    .filter(f => !f.startsWith('node_modules' + sep) && !f.startsWith('..'))
  assert.ok(files.length > 0)
  for (const f of files) assert.ok(f.startsWith('src' + sep), `compiled outside src/: ${f}`)
})

test('tsc exits 0 and emits only into its outDir, with the expected entry points', () => {
  withTempDir((out) => {
    const emitted = tsc('-p', 'tsconfig.json', '--outDir', out, '--listEmittedFiles')
      .split('\n')
      .filter(line => line.startsWith('TSFILE: '))
      .map(line => relative(out, line.slice('TSFILE: '.length)))
    for (const f of emitted) assert.ok(!f.startsWith('..'), `emitted outside outDir: ${f}`)
    for (const f of ['cli.js', 'index.js', 'index.d.ts', join('lib', 'index.js'), join('lib', 'Sync.js')]) {
      assert.ok(emitted.includes(f), `missing emitted file: ${f}`)
    }
  })
})

test('package.json describes the ESM dist/ build', () => {
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.engines?.node, '>=22.17')
  assert.equal(pkg.bin?.syncodemayo, './dist/cli.js')
  assert.equal(pkg.main, './dist/index.js')
  assert.equal(pkg.types, './dist/index.d.ts')
  assert.ok(pkg.files?.includes('dist'))
})

test('package.json drops eslint and the six obsolete @types packages', () => {
  const dev = { ...pkg.dependencies, ...pkg.devDependencies }
  for (const name of [
    'eslint',
    '@types/commander',
    '@types/crc',
    '@types/dotenv',
    '@types/glob',
    '@types/joi',
    '@types/minimatch',
  ]) {
    assert.ok(!(name in dev), `${name} should be removed`)
  }
})

test('package.json runtime dependencies drop glob, minimatch, and crc (replaced by Node built-ins)', () => {
  for (const name of ['glob', 'minimatch', 'crc']) {
    assert.ok(!(name in (pkg.dependencies ?? {})), `${name} should be removed from dependencies`)
  }
})

test('nothing under src/ imports or declares glob, minimatch, or crc', () => {
  const sources = execFileSync('git', ['ls-files', 'src'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(f => f.endsWith('.ts'))
  assert.ok(sources.length > 0)
  for (const file of sources) {
    const source = readFileSync(join(REPO_ROOT, file), 'utf8')
    for (const name of ['glob', 'minimatch', 'crc']) {
      const quoted = `['"]${name}['"]`
      assert.doesNotMatch(source, new RegExp(`(from|import|require\\(|declare module)\\s*${quoted}`), `${file} uses ${name}`)
    }
  }
})

test('npm pack ships dist/ and no sources, tests, factory, or tsconfig', () => {
  const [{ files }] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }))
  const paths = files.map(f => f.path)
  for (const f of ['dist/cli.js', 'dist/index.js', 'dist/index.d.ts']) {
    assert.ok(paths.includes(f), `missing from package: ${f}`)
  }
  for (const p of paths) {
    assert.ok(!(p.endsWith('.ts') && !p.endsWith('.d.ts')), `.ts source in package: ${p}`)
    assert.ok(!/^(test|factory|\.vscode)\//.test(p), `excluded path in package: ${p}`)
    assert.ok(!/(^|\/)tsconfig[^/]*\.json$/.test(p), `tsconfig in package: ${p}`)
  }
})

test('dist/cli.js starts with a portable node shebang', () => {
  const firstLine = readFileSync(join(REPO_ROOT, 'dist', 'cli.js'), 'utf8').split('\n')[0]
  assert.equal(firstLine, '#!/usr/bin/env node')
})

test('dist/cli.js --help, run through its shebang, matches v1 byte for byte', () => {
  const output = execFileSync(join(REPO_ROOT, 'dist', 'cli.js'), ['--help'], { cwd: REPO_ROOT, encoding: 'utf8' })
  assert.equal(output, V1_HELP)
})

test('dist/cli.js --version, run through its shebang, matches v1 byte for byte', () => {
  const output = execFileSync(join(REPO_ROOT, 'dist', 'cli.js'), ['--version'], { cwd: REPO_ROOT, encoding: 'utf8' })
  assert.equal(output, V1_VERSION)
})

test('require() of dist/index.js gets the same exports as an ESM import', async () => {
  const esmNames = Object.keys(await import('../dist/index.js')).sort()
  const cjsNames = withTempDir((dir) => {
    const script = join(dir, 'consumer.cjs')
    writeFileSync(script, `console.log(JSON.stringify(Object.keys(require(${JSON.stringify(join(REPO_ROOT, 'dist', 'index.js'))}))))`)
    return JSON.parse(execFileSync(process.execPath, [script], { encoding: 'utf8' })).sort()
  })
  assert.deepEqual(cjsNames, esmNames)
  for (const name of ['Client', 'loadConfigFile', 'resolveTarget', 'validateConfig', 'Sync', 'buildLocalFilelist']) {
    assert.ok(cjsNames.includes(name), `missing export: ${name}`)
  }
})
