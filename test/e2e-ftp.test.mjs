// End-to-end tests against an FTP/FTPS server running in this test process (ftp-srv, a
// devDependency). TLS uses the test-only self-signed certificate for localhost in
// test/fixtures/tls/. Each server serves a fresh temp directory as the login directory.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import FtpSrv, { FileSystem } from 'ftp-srv'
import { Client } from '../dist/lib/Client.js'
import { Connection } from '../dist/lib/Connection.js'
import { buildLocalFilelist } from '../dist/lib/Filelist.js'
import { LogLevel, setLogLevel } from '../dist/lib/Log.js'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const CLI = join(REPO_ROOT, 'dist', 'cli.js')
const TLS = {
  key: readFileSync(join(REPO_ROOT, 'test', 'fixtures', 'tls', 'localhost.key')),
  cert: readFileSync(join(REPO_ROOT, 'test', 'fixtures', 'tls', 'localhost.crt')),
}
const USER = 'tester'
const PASS = 'secret'
const REMOTE_PATH = 'www/site' // relative to the login directory, with a nested subdirectory
const CACHE = '.synco-filelist'

setLogLevel(LogLevel.Urgent)

const tempDirs = []
const makeTempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), `syncodemayo-e2e-${prefix}-`))
  tempDirs.push(dir)
  return dir
}
after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

// ftp-srv logs through bunyan by default; keep it quiet.
const quietLog = {
  child: () => quietLog,
  trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {},
}

/**
 * Starts an in-process server on 127.0.0.1 and a free port.
 * mode: 'plain' (FTP), 'explicit' (AUTH TLS required before login), or 'implicit' (TLS listener).
 * `logins` records, per login, whether the control connection was upgraded to TLS.
 * A STOR to a path ending in one of `failWrites` is refused (550).
 */
async function startServer(mode) {
  const root = makeTempDir(`root-${mode}`)
  const failWrites = new Set()
  class TestFileSystem extends FileSystem {
    write(fileName, options) {
      if ([...failWrites].some(suffix => fileName.endsWith(suffix))) throw new Error('Refused by the test server')
      return super.write(fileName, options)
    }
  }
  const ftp = new FtpSrv({
    url: `${mode === 'implicit' ? 'ftps' : 'ftp'}://127.0.0.1:0`,
    pasv_url: '127.0.0.1',
    tls: mode === 'plain' ? false : TLS,
    log: quietLog,
  })
  const logins = []
  ftp.on('login', ({ connection, username, password }, resolveLogin, rejectLogin) => {
    if (mode === 'explicit' && !connection.secure) return rejectLogin(new Error('TLS required'))
    if (username !== USER || password !== PASS) return rejectLogin(new Error('Bad login'))
    logins.push({ secure: Boolean(connection.secure), encrypted: connection.commandSocket.encrypted === true })
    resolveLogin({ fs: new TestFileSystem(connection, { root, cwd: '/' }) })
  })
  await ftp.listen()
  const port = ftp.server.address().port
  return {
    root,
    port,
    logins,
    failWrites,
    openConnections: () => Object.keys(ftp.connections).length,
    close: () => ftp.close(),
  }
}

// Every file under dir, as sorted paths relative to it.
const listTree = (dir) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => relative(dir, join(entry.parentPath, entry.name)))
    .sort()

const waitFor = async (condition, what, timeout = 5000) => {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${what}`)
    await new Promise(r => setTimeout(r, 10))
  }
}

const LOCAL_FILES = {
  'index.html': '<h1>Home</h1>\n',
  'css/site.css': 'body { margin: 0 }\n',
  'nested/deep/page.html': '<p>Deep</p>\n',
  'old.html': '<p>Going away</p>\n',
}

/**
 * A project directory with a local site and a config whose target "ftp" points at `server`.
 * Returns the paths, and the config path relative to the cwd (as loadConfigFile wants it).
 */
function makeProject(server, targetFields = {}) {
  const dir = makeTempDir('project')
  const site = join(dir, 'site')
  for (const [file, content] of Object.entries(LOCAL_FILES)) {
    mkdirSync(dirname(join(site, file)), { recursive: true })
    writeFileSync(join(site, file), content)
  }
  const configFile = join(dir, 'syncodemayo.json')
  writeFileSync(configFile, JSON.stringify({
    local: { path: site, defaultTarget: 'ftp', deleteRemoteFiles: true },
    targets: {
      ftp: {
        host: '127.0.0.1',
        port: server.port,
        user: USER,
        pass: PASS,
        path: REMOTE_PATH,
        prompt: false,
        ...targetFields,
      },
    },
  }, null, 2))
  return { dir, site, configFile, configPath: relative(process.cwd(), configFile) }
}

const targetServer = async (project) => (await Client.create(project.configPath)).getTargetServer(undefined)

const local = (project, ...files) => files.map(f => join(project.site, f)).sort()
const sorted = ({ added, changed, removed }) => ({ added: [...added].sort(), changed: [...changed].sort(), removed: [...removed].sort() })

// The AC5 flow: init -> changes -> sync -> (edit a file, delete a local file) -> changes -> sync.
async function runSyncFlow(server, targetFields) {
  const project = makeProject(server, targetFields)
  const remoteDir = join(server.root, REMOTE_PATH)
  const settled = () => waitFor(() => server.openConnections() === 0, 'the server to see every connection closed')

  // init: the target isn't configured, so prepare() creates the remote path and an empty list.
  const target = await targetServer(project)
  assert.equal(await target.verify(), false)
  await settled()
  assert.equal(await target.prepare(), true)
  await settled()
  assert.equal(readFileSync(join(remoteDir, CACHE), 'utf8'), '{}')
  assert.equal(await (await targetServer(project)).verify(), true)
  await settled()

  // changes: everything is new.
  const allFiles = local(project, ...Object.keys(LOCAL_FILES))
  assert.deepEqual(sorted(await (await targetServer(project)).sync(true)), { added: allFiles, changed: [], removed: [] })
  await settled()
  assert.deepEqual(listTree(server.root), [`${REMOTE_PATH}/${CACHE}`], 'a dry run uploads nothing')

  // sync: everything is uploaded, into nested directories under the relative remote path.
  assert.deepEqual(sorted(await (await targetServer(project)).sync(false, true)), { added: allFiles, changed: [], removed: [] })
  await settled()
  assert.deepEqual(listTree(remoteDir), [CACHE, ...Object.keys(LOCAL_FILES)].sort())
  for (const [file, content] of Object.entries(LOCAL_FILES)) {
    assert.equal(readFileSync(join(remoteDir, file), 'utf8'), content, file)
  }

  // Edit a file and delete one locally.
  writeFileSync(join(project.site, 'index.html'), '<h1>Home, edited</h1>\n')
  unlinkSync(join(project.site, 'old.html'))

  // changes: one changed, one removed.
  const expected = { added: [], changed: local(project, 'index.html'), removed: local(project, 'old.html') }
  assert.deepEqual(sorted(await (await targetServer(project)).sync(true)), expected)
  await settled()

  // sync with deleteRemoteFiles: true.
  assert.deepEqual(sorted(await (await targetServer(project)).sync(false, true)), expected)
  await settled()

  // The server has exactly the local files plus the file list, and the list matches.
  const localFiles = listTree(project.site)
  assert.deepEqual(listTree(remoteDir), [CACHE, ...localFiles].sort())
  assert.deepEqual(listTree(server.root), [CACHE, ...localFiles].map(f => `${REMOTE_PATH}/${f}`).sort())
  assert.ok(!localFiles.includes('old.html'))
  for (const file of localFiles) {
    assert.deepEqual(readFileSync(join(remoteDir, file)), readFileSync(join(project.site, file)), file)
  }
  const config = (await Client.create(project.configPath)).config
  assert.deepEqual(JSON.parse(readFileSync(join(remoteDir, CACHE), 'utf8')), await buildLocalFilelist(config.local))

  // Nothing changed is left.
  assert.deepEqual(sorted(await (await targetServer(project)).sync(true)), { added: [], changed: [], removed: [] })
  await settled()
  return project
}

// Captures console.log output (Log writes through it) while fn runs.
async function captureLog(fn) {
  const lines = []
  const original = console.log
  console.log = (...args) => { lines.push(args.map(String).join(' ')) }
  try {
    const result = await fn()
    return { lines, result }
  } catch (err) {
    err.logLines = lines
    throw err
  } finally {
    console.log = original
  }
}

// Runs the built CLI as a child process; resolves its exit code and output. Times out (and
// fails) if the process does not exit on its own.
const runCli = (args, cwd) => new Promise((resolveRun) => {
  execFile(process.execPath, [CLI, ...args], { cwd, timeout: 20000, env: { ...process.env, SYNCODEMAYO_LOG_LEVEL: '' } },
    (err, stdout, stderr) => {
      resolveRun({ code: err ? err.code : 0, killed: err?.killed === true, signal: err?.signal ?? null, output: stdout + stderr })
    })
})

// The TCP/TLS handles open in this process.
const socketHandles = () => process.getActiveResourcesInfo().filter(r => /TCP|TLS|Pipe/.test(r)).length

describe('plain FTP', () => {
  let server
  before(async () => { server = await startServer('plain') })
  after(() => server.close())

  test('init -> changes -> sync -> edit and delete -> changes -> sync (deleteRemoteFiles: true)', async () => {
    await runSyncFlow(server)
    assert.ok(server.logins.length > 0)
    assert.ok(server.logins.every(login => !login.secure && !login.encrypted))
  })

  test('a Connection runs operations called concurrently one at a time, relative to the login directory', async () => {
    const conn = new Connection({ host: '127.0.0.1', port: server.port, user: USER, pass: PASS })
    try {
      const results = await Promise.all([
        conn.remoteDirectoryExists('www/concurrent/a/b'),
        conn.putContent('one', 'www/concurrent/a/b/one.txt'),
        conn.remoteDirectoryExists('www/concurrent/c'),
        conn.putContent('two', 'www/concurrent/c/two.txt'),
        conn.remoteFileExists('www/concurrent/a/b/one.txt'),
        conn.getRemoteFile('www/concurrent/a/b/one.txt'),
        conn.deleteRemoteFile('www/concurrent/missing.txt'),
      ])
      assert.deepEqual(results, [true, true, true, true, true, 'one', false])
    } finally {
      await conn.close()
    }
    assert.deepEqual(listTree(join(server.root, 'www/concurrent')), ['a/b/one.txt', 'c/two.txt'])
    await waitFor(() => server.openConnections() === 0, 'the server to see the connection closed')
  })

  test('each TargetServer operation leaves no socket open in this process', async () => {
    const project = makeProject(server, { path: 'www/handles' })
    const baseline = socketHandles()
    const target = await targetServer(project)
    await target.prepare()
    await target.verify()
    await target.sync(false, true)
    await target.sync(true)
    await waitFor(() => server.openConnections() === 0, 'the server to see every connection closed')
    await waitFor(() => socketHandles() <= baseline, 'the client sockets to close')
  })

  test('a failing sync still closes its connection', async () => {
    const project = makeProject(server, { path: 'www/failing' })
    const target = await targetServer(project)
    await target.prepare()
    // Make an upload fail partway.
    server.failWrites.add('www/failing/index.html')
    await assert.rejects(target.sync(false, true), /Refused by the test server/)
    await waitFor(() => server.openConnections() === 0, 'the server to see the connection closed')
    assert.equal(readFileSync(join(server.root, 'www/failing', CACHE), 'utf8'), '{}', 'no file list written')
  })

  test('the syncodemayo CLI exits on its own after init, changes, verify, sync and diff', async () => {
    const project = makeProject(server, { path: 'www/cli' })
    for (const args of [['init'], ['changes'], ['verify'], ['sync', '-f'], ['diff']]) {
      const { code, killed, signal, output } = await runCli(args, project.dir)
      assert.equal(killed, false, `${args.join(' ')} did not exit on its own:\n${output}`)
      assert.equal(signal, null, output)
      assert.equal(code, 0, `${args.join(' ')} failed:\n${output}`)
      await waitFor(() => server.openConnections() === 0, `the server to see the ${args[0]} connection closed`)
    }
    assert.deepEqual(listTree(join(server.root, 'www/cli')), [CACHE, ...Object.keys(LOCAL_FILES)].sort())
  })
})

describe('explicit FTPS (secure: true)', () => {
  let server
  before(async () => { server = await startServer('explicit') })
  after(() => server.close())

  test('the AC5 flow passes with rejectUnauthorized: false, over TLS-upgraded control connections', async () => {
    const { lines } = await captureLog(() => runSyncFlow(server, { secure: true, rejectUnauthorized: false }))
    assert.ok(server.logins.length > 0)
    assert.ok(server.logins.every(login => login.secure && login.encrypted), 'every login was on a TLS control connection')
    assert.equal(lines.filter(line => line.includes('rejectUnauthorized: false')).length, server.logins.length,
      'one warning per connection made')
  })

  test('with the default rejectUnauthorized, verify and init fail naming the host and the opt-out, and upload nothing', async () => {
    const project = makeProject(server, { path: 'www/untrusted', secure: true })
    const before = listTree(server.root)
    const logins = server.logins.length
    const expectedError = (err) => {
      assert.match(err.message, /127\.0\.0\.1/)
      assert.match(err.message, /certificate/)
      assert.match(err.message, /not trusted/)
      assert.match(err.message, /"rejectUnauthorized": false/)
      return true
    }
    await assert.rejects((await targetServer(project)).verify(), expectedError)
    await assert.rejects((await targetServer(project)).prepare(), expectedError)
    assert.equal(server.logins.length, logins, 'never logged in')
    assert.deepEqual(listTree(server.root), before, 'nothing uploaded')
  })

  test('with the default rejectUnauthorized, the CLI sync and verify commands fail and upload nothing', async () => {
    const project = makeProject(server, { path: 'www/untrusted-cli', secure: true })
    const before = listTree(server.root)
    for (const args of [['verify'], ['sync', '-f']]) {
      const { code, killed, output } = await runCli(args, project.dir)
      assert.equal(killed, false, output)
      assert.notEqual(code, 0, `${args.join(' ')} should fail:\n${output}`)
      assert.match(output, /TLS certificate of 127\.0\.0\.1 was not trusted/)
      assert.match(output, /"rejectUnauthorized": false/)
    }
    assert.deepEqual(listTree(server.root), before, 'nothing uploaded')
  })

  test('rejectUnauthorized: false warns through Log.urgent, naming the target, once per connection, even under -q', async () => {
    const project = makeProject(server, { path: 'www/warned', secure: true, rejectUnauthorized: false })
    setLogLevel(LogLevel.Info) // what -q sets
    try {
      const { lines } = await captureLog(async () => {
        const target = await targetServer(project)
        await target.verify()
        await target.verify()
        await target.prepare()
      })
      const warnings = lines.filter(line => line.includes('rejectUnauthorized: false'))
      assert.equal(warnings.length, 3)
      for (const warning of warnings) {
        assert.match(warning, /target "ftp"/)
        assert.match(warning, /certificate/)
      }
    } finally {
      setLogLevel(LogLevel.Urgent)
    }
  })

  test('the CLI under -q still prints the warning', async () => {
    const project = makeProject(server, { path: 'www/warned-cli', secure: true, rejectUnauthorized: false })
    const { code, output } = await runCli(['-q', 'init'], project.dir)
    assert.equal(code, 0, output)
    assert.match(output, /Warning: TLS certificate checks are off for target "ftp"/)
  })
})

describe('implicit FTPS (secure: "implicit")', () => {
  let server
  before(async () => { server = await startServer('implicit') })
  after(() => server.close())

  test('verify connects over implicit TLS and succeeds', async () => {
    mkdirSync(join(server.root, REMOTE_PATH), { recursive: true })
    writeFileSync(join(server.root, REMOTE_PATH, CACHE), '{}')
    const project = makeProject(server, { secure: 'implicit', rejectUnauthorized: false })
    await captureLog(async () => {
      assert.equal(await (await targetServer(project)).verify(), true)
    })
    assert.equal(server.logins.length, 1)
    assert.deepEqual(server.logins[0], { secure: true, encrypted: true })
  })
})
