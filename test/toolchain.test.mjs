// Checks the build and packaging toolchain: the TypeScript 5 src/ -> dist/ ESM
// build, package.json metadata, the npm tarball contents, the CLI shebang, and
// that CommonJS consumers can require() the ESM library. Runs after `npm test`
// has compiled dist/.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

// What --help must list: every command with its [target] argument, and every option.
// The wording may differ from v1 (replace-small-deps), but not the commands and options.
const HELP_MUST_LIST = [
  'init [target]',
  'changes|diff [target]',
  'verify [target]',
  'sync [options] [target]',
  'ls',
  '-c, --config <file>',
  '-v, --verbose',
  '-q, --quiet',
  '-V, --version',
  '-h, --help',
  '-f, --force',
]

// Runtime dependencies left after replace-small-deps removed commander, dotenv, joi,
// strip-json-comments, and yesno, basic-ftp-connection replaced jsftp and jsftp-mkdirp
// with basic-ftp, and builtin-filelist replaced glob, minimatch, and crc with Node built-ins.
const DEPENDENCIES = {
  'basic-ftp': '^6.2.6',
}

// Removed by replace-small-deps, basic-ftp-connection, and builtin-filelist: no longer
// dependencies, imported, or declared.
const REMOVED_DEPENDENCIES = [
  'commander', 'dotenv', 'joi', 'strip-json-comments', 'yesno', 'jsftp', 'jsftp-mkdirp',
  'glob', 'minimatch', 'crc',
]

// The in-process FTP server the end-to-end tests run (basic-ftp-connection): dev only.
const TEST_FTP_SERVER = 'ftp-srv'

const listFiles = (dir) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name))

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

test('package.json runtime dependencies are exactly the ones that remain', () => {
  assert.deepEqual(pkg.dependencies, DEPENDENCIES)
})

test('package.json runtime dependencies drop glob, minimatch, and crc (replaced by Node built-ins)', () => {
  for (const name of ['glob', 'minimatch', 'crc']) {
    assert.ok(!(name in (pkg.dependencies ?? {})), `${name} should be removed from dependencies`)
  }
})

test('the removed dependencies are not imported under src/ nor declared in missing-types.d.ts', () => {
  for (const file of listFiles(join(REPO_ROOT, 'src'))) {
    const source = readFileSync(file, 'utf8')
    for (const name of REMOVED_DEPENDENCIES) {
      const imported = new RegExp(`(from\\s+|import\\s*\\(?\\s*|require\\s*\\(\\s*)['"]${name}['"]`)
      assert.ok(!imported.test(source), `${relative(REPO_ROOT, file)} imports ${name}`)
    }
  }
  const missingTypes = readFileSync(join(REPO_ROOT, 'src', 'missing-types.d.ts'), 'utf8')
  for (const name of REMOVED_DEPENDENCIES) {
    assert.ok(!missingTypes.includes(`'${name}'`), `missing-types.d.ts still declares ${name}`)
  }
})

test('jsftp and jsftp-mkdirp are not in yarn.lock', () => {
  const lock = readFileSync(join(REPO_ROOT, 'yarn.lock'), 'utf8')
  for (const name of ['jsftp', 'jsftp-mkdirp']) {
    assert.ok(!new RegExp(`(^|\\n)"?${name}@`).test(lock), `yarn.lock still lists ${name}`)
  }
  assert.ok(!lock.includes('jsftp'), 'yarn.lock still mentions jsftp')
  assert.match(lock, /(^|\n)basic-ftp@/)
})

test('the in-process FTP server used by the tests is a devDependency only', () => {
  assert.ok(TEST_FTP_SERVER in pkg.devDependencies, `${TEST_FTP_SERVER} should be a devDependency`)
  assert.ok(!(TEST_FTP_SERVER in pkg.dependencies), `${TEST_FTP_SERVER} should not be a runtime dependency`)
})

test('ajv and its draft-04 helper are devDependencies only', () => {
  for (const name of ['ajv', 'ajv-draft-04']) {
    assert.ok(name in pkg.devDependencies, `${name} should be a devDependency`)
    assert.ok(!(name in pkg.dependencies), `${name} should not be a runtime dependency`)
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

for (const args of [['--help'], ['-h'], []]) {
  test(`dist/cli.js ${args.join(' ') || '(no arguments)'}, run through its shebang, exits 0 and lists every command and option`, () => {
    const output = execFileSync(join(REPO_ROOT, 'dist', 'cli.js'), args, { cwd: REPO_ROOT, encoding: 'utf8' })
    for (const item of HELP_MUST_LIST) assert.ok(output.includes(item), `help does not list: ${item}`)
  })
}

for (const flag of ['--version', '-V']) {
  test(`dist/cli.js ${flag}, run through its shebang, prints the package.json version`, () => {
    const output = execFileSync(join(REPO_ROOT, 'dist', 'cli.js'), [flag], { cwd: REPO_ROOT, encoding: 'utf8' })
    assert.equal(output, `${pkg.version}\n`)
  })
}

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
