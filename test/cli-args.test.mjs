// The CLI argument parser (util.parseArgs, replacing commander) and how dist/cli.js handles
// a command line it can't run.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { CliArgsError, parseCliArgs } from '../dist/lib/Args.js'
import { LogLevel } from '../dist/lib/Log.js'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const CLI = join(REPO_ROOT, 'dist', 'cli.js')

const D = LogLevel.Default

// argv -> what v1 dispatched (`syncf` in v1 is { command: 'sync', force: true } here).
const CASES = [
  ['changes stage', { command: 'changes', target: 'stage', logLevel: D, force: false }],
  ['diff stage', { command: 'changes', target: 'stage', logLevel: D, force: false }],
  ['changes', { command: 'changes', logLevel: D, force: false }],
  ['verify', { command: 'check', logLevel: D, force: false }],
  ['verify prod', { command: 'check', target: 'prod', logLevel: D, force: false }],
  ['init prod', { command: 'init', target: 'prod', logLevel: D, force: false }],
  ['sync stage', { command: 'sync', target: 'stage', logLevel: D, force: false }],
  ['sync -f stage', { command: 'sync', target: 'stage', logLevel: D, force: true }],
  ['sync stage --force', { command: 'sync', target: 'stage', logLevel: D, force: true }],
  ['sync --force', { command: 'sync', logLevel: D, force: true }],
  ['ls', { command: 'ls', logLevel: D, force: false }],
  ['-c x.json -v ls', { command: 'ls', config: 'x.json', logLevel: LogLevel.Debug, force: false }],
  ['--config=x.json sync stage', { command: 'sync', target: 'stage', config: 'x.json', logLevel: D, force: false }],
  ['--quiet changes', { command: 'changes', logLevel: LogLevel.Info, force: false }],
  ['-q -v changes', { command: 'changes', logLevel: LogLevel.Debug, force: false }],
  ['', { command: 'help', logLevel: D, force: false }],
  ['--help', { command: 'help', logLevel: D, force: false }],
  ['-h sync', { command: 'help', logLevel: D, force: false }],
  ['--version', { command: 'version', logLevel: D, force: false }],
  ['-V', { command: 'version', logLevel: D, force: false }],
]

for (const [line, expected] of CASES) {
  test(`parseCliArgs(${JSON.stringify(line)})`, () => {
    assert.deepEqual(parseCliArgs(line ? line.split(' ') : []), expected)
  })
}

for (const line of ['--bogus ls', 'ls -x', 'frobnicate', 'ls extra', 'changes a b', 'verify -f', '-c']) {
  test(`parseCliArgs(${JSON.stringify(line)}) throws CliArgsError`, () => {
    assert.throws(() => parseCliArgs(line.split(' ')), CliArgsError)
  })
}

for (const args of [['--bogus'], ['ls', '--nope'], ['frobnicate']]) {
  test(`dist/cli.js ${args.join(' ')} exits non-zero with an error on stderr`, () => {
    const result = spawnSync(process.execPath, [CLI, ...args], { cwd: REPO_ROOT, encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /error/i)
    assert.match(result.stderr, new RegExp(args.at(-1)))
    assert.equal(result.stdout, '')
  })
}
