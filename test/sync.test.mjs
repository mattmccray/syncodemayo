// Sync and TargetServer against the in-memory FakeConnection: what gets uploaded, deleted and
// written, and that every TargetServer operation closes the connection it opened.
// Run from the repo root: the local file list is globbed against process.cwd().
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadConfigFile } from '../dist/lib/Config.js'
import { filelistKey, remotePathForKey } from '../dist/lib/Filelist.js'
import { Sync } from '../dist/lib/Sync.js'
import { TargetServer } from '../dist/lib/TargetServer.js'
import { LogLevel, setLogLevel } from '../dist/lib/Log.js'
import { FakeConnection, WRITE_OPS } from './fake-connection.mjs'

setLogLevel(LogLevel.Urgent)

const SITE = 'test/fixtures/site'
const REMOTE = 'www/stage'
const CACHE = `${REMOTE}/.synco-filelist`
const golden = JSON.parse(readFileSync('test/fixtures/site.filelist.json', 'utf8'))

// site.json: local.path test/fixtures/site, excludes *.md and drafts; target staging at www/stage.
const loadSiteConfig = async ({ deleteRemoteFiles = false, localPath, targetPath } = {}) => {
  const config = await loadConfigFile('test/fixtures/config/site.json')
  config.local.deleteRemoteFiles = deleteRemoteFiles
  if (localPath !== undefined) config.local.path = localPath
  if (targetPath !== undefined) config.targets.staging.path = targetPath
  return config
}

// The v1-written remote list, edited so the local fixture has one added, one changed and one
// removed file against it.
const ADDED = `${SITE}/index.html`
const CHANGED = `${SITE}/nested/deep/page.html`
const REMOVED = `${SITE}/old/gone.html`
const remoteListWithChanges = () => {
  const list = { ...golden }
  delete list[ADDED]
  list[CHANGED] = 1
  list[REMOVED] = 2
  return list
}

// The remote side: the file list, plus the removed file when the list names it.
const fakeWithRemoteList = (list) => new FakeConnection({
  [CACHE]: JSON.stringify(list, null, 2),
  ...(REMOVED in list ? { [`${REMOTE}/old/gone.html`]: 'gone' } : {}),
})

test('Sync.run uploads added and changed files to <target.path>/<relative path>', async () => {
  const conn = fakeWithRemoteList(remoteListWithChanges())
  const config = await loadSiteConfig()
  const changeset = await new Sync(conn, config, 'staging').run(false, true)

  assert.deepEqual(changeset, { added: [ADDED], changed: [CHANGED], removed: [REMOVED] })
  assert.deepEqual(
    conn.callsTo('putFile').map(({ args: [, remotePath] }) => remotePath),
    [`${REMOTE}/index.html`, `${REMOTE}/nested/deep/page.html`],
  )
  assert.deepEqual(
    conn.callsTo('putFile').map(({ args: [localPath] }) => localPath),
    [ADDED, CHANGED].map(f => `${process.cwd()}/${f}`),
  )
  assert.deepEqual(conn.files.get(`${REMOTE}/index.html`), readFileSync(ADDED))
  assert.ok(conn.dirs.has(REMOTE))
  assert.ok(conn.dirs.has(`${REMOTE}/nested/deep`))
})

test('Sync.run does not delete removed files when deleteRemoteFiles is false', async () => {
  const conn = fakeWithRemoteList(remoteListWithChanges())
  await new Sync(conn, await loadSiteConfig(), 'staging').run(false, true)
  assert.deepEqual(conn.callsTo('deleteRemoteFile'), [])
})

test('Sync.run deletes removed files when deleteRemoteFiles is true', async () => {
  const conn = fakeWithRemoteList(remoteListWithChanges())
  await new Sync(conn, await loadSiteConfig({ deleteRemoteFiles: true }), 'staging').run(false, true)
  assert.deepEqual(conn.callsTo('deleteRemoteFile').map(({ args }) => args), [[`${REMOTE}/old/gone.html`]])
  assert.ok(!conn.files.has(`${REMOTE}/old/gone.html`))
})

test('Sync.run writes the new file list to <target.path>/<cache> after the uploads and deletes', async () => {
  const conn = fakeWithRemoteList(remoteListWithChanges())
  await new Sync(conn, await loadSiteConfig({ deleteRemoteFiles: true }), 'staging').run(false, true)

  const writes = conn.callsTo('putContent')
  assert.equal(writes.length, 1)
  const [content, remotePath] = writes[0].args
  assert.equal(remotePath, CACHE)
  assert.deepEqual(JSON.parse(content), golden)

  const cacheIndex = conn.calls.findIndex(call => call.op === 'putContent')
  const lastChange = conn.calls.findLastIndex(call => call.op === 'putFile' || call.op === 'deleteRemoteFile')
  assert.ok(lastChange >= 0 && cacheIndex > lastChange, 'the file list is written after the uploads')
})

test('Sync.run(true), a dry run, reports the changes and makes no write, upload or delete calls', async () => {
  const conn = fakeWithRemoteList(remoteListWithChanges())
  const changeset = await new Sync(conn, await loadSiteConfig({ deleteRemoteFiles: true }), 'staging').run(true)

  assert.deepEqual(changeset, { added: [ADDED], changed: [CHANGED], removed: [REMOVED] })
  assert.deepEqual(conn.calls.map(call => call.op), ['getRemoteFile'])
  for (const op of WRITE_OPS) assert.deepEqual(conn.callsTo(op), [], op)
})

test('Sync.run diffs a v1-written remote file list: an unchanged site has no changes and no writes', async () => {
  const conn = fakeWithRemoteList(golden)
  const changeset = await new Sync(conn, await loadSiteConfig({ deleteRemoteFiles: true }), 'staging').run(false, true)

  assert.deepEqual(changeset, { added: [], changed: [], removed: [] })
  for (const op of WRITE_OPS) assert.deepEqual(conn.callsTo(op), [], op)
})

// TargetServer with an injected connection factory.

const serverWith = async (makeConn, options) => {
  const opened = []
  const factory = (target) => {
    const conn = makeConn(target)
    opened.push(conn)
    return conn
  }
  const server = TargetServer.create(await loadSiteConfig(options), 'staging', factory)
  return { server, opened }
}

const assertClosedOnce = (opened) => {
  assert.equal(opened.length, 1, 'one connection opened')
  assert.equal(opened[0].closeCount, 1, 'closed exactly once')
  assert.equal(opened[0].calls.at(-1).op, 'close', 'close is the last call')
}

test('TargetServer passes the resolved target to the connection factory', async () => {
  let seen
  const { server } = await serverWith((target) => (seen = target, fakeWithRemoteList(golden)))
  await server.verify()
  assert.equal(seen, server.config)
  assert.equal(seen._name, 'staging')
})

test('TargetServer.verify closes its connection once when it succeeds', async () => {
  const { server, opened } = await serverWith(() => fakeWithRemoteList(golden))
  assert.equal(await server.verify(), true)
  assertClosedOnce(opened)
})

test('TargetServer.verify closes its connection once when it throws', async () => {
  const { server, opened } = await serverWith(() => new FakeConnection().failOn('remoteFileExists', 1))
  await assert.rejects(server.verify(), /fake remoteFileExists failure/)
  assertClosedOnce(opened)
})

test('TargetServer.prepare closes its connection once when it succeeds', async () => {
  const { server, opened } = await serverWith(() => new FakeConnection({}, { dirs: [REMOTE] }))
  assert.equal(await server.prepare(), true)
  assert.equal(opened[0].files.get(CACHE).toString(), '{}')
  assertClosedOnce(opened)
})

test('TargetServer.prepare closes its connection once when the target is already prepared', async () => {
  const { server, opened } = await serverWith(() => fakeWithRemoteList(golden))
  assert.equal(await server.prepare(), false)
  assertClosedOnce(opened)
})

test('TargetServer.prepare closes its connection once when it throws', async () => {
  const { server, opened } = await serverWith(() => new FakeConnection({}, { dirs: [REMOTE] }).failOn('putContent', 1))
  await assert.rejects(server.prepare(), /fake putContent failure/)
  assertClosedOnce(opened)
})

test('TargetServer.sync closes its connection once when it succeeds', async () => {
  const { server, opened } = await serverWith(() => fakeWithRemoteList(remoteListWithChanges()))
  const changeset = await server.sync(false, true)
  assert.deepEqual(changeset.added, [ADDED])
  assertClosedOnce(opened)
})

test('TargetServer.sync (dry run) closes its connection once', async () => {
  const { server, opened } = await serverWith(() => fakeWithRemoteList(remoteListWithChanges()))
  await server.sync(true)
  assertClosedOnce(opened)
})

test('TargetServer.sync closes its connection once when an upload rejects partway', async () => {
  const { server, opened } = await serverWith(() =>
    fakeWithRemoteList(remoteListWithChanges()).failOn('putFile', 2, new Error('upload failed')))
  await assert.rejects(server.sync(false, true), /upload failed/)
  assertClosedOnce(opened)
  assert.equal(opened[0].callsTo('putFile').length, 2)
  assert.deepEqual(opened[0].callsTo('putContent'), [], 'no file list written after a failed upload')
})

test('each TargetServer operation opens its own connection', async () => {
  const { server, opened } = await serverWith(() => fakeWithRemoteList(golden))
  await server.verify()
  await server.verify()
  await server.sync(true)
  assert.equal(opened.length, 3)
  for (const conn of opened) assert.equal(conn.closeCount, 1)
})

// The remote path for a cache key (fix-v1-bugs): <target.path without trailing slash>/<path
// relative to local.path>, never String.replace of local.path.

for (const localPath of ['public', 'public/', 'public//', './public', 'test/fixtures/site']) {
  for (const targetPath of ['www/stage', 'www/stage/', '/abs/www']) {
    test(`remotePathForKey maps local.path ${JSON.stringify(localPath)} to target.path ${JSON.stringify(targetPath)}`, () => {
      const base = targetPath.replace(/\/$/, '')
      for (const relative of ['a.html', 'css/site.css', 'nested/deep/page.html', '.htaccess']) {
        const key = filelistKey(localPath, relative, '/')
        assert.equal(remotePathForKey(localPath, targetPath, key, '/'), `${base}/${relative}`, key)
      }
    })
  }
}

test('remotePathForKey resolves null for a key outside the current local.path', () => {
  assert.equal(remotePathForKey('public', 'www', 'other/a.html', '/'), null)
  assert.equal(remotePathForKey('public', 'www', 'publicity/a.html', '/'), null)
  assert.equal(remotePathForKey('www', 'www', 'wwwa.html', '/'), null)
})

test('Sync.run uploads and deletes to the right remote paths with trailing slashes on local.path and target.path', async () => {
  // The file list path is `${target.path}/${cache}` as given (out of this job's scope), so the
  // fake holds it at the path Sync reads.
  const conn = new FakeConnection({
    [`${REMOTE}//.synco-filelist`]: JSON.stringify(remoteListWithChanges()),
    [`${REMOTE}/old/gone.html`]: 'gone',
  })
  const config = await loadSiteConfig({ deleteRemoteFiles: true, localPath: `${SITE}//`, targetPath: `${REMOTE}/` })
  const changeset = await new Sync(conn, config, 'staging').run(false, true)

  assert.deepEqual(changeset, { added: [ADDED], changed: [CHANGED], removed: [REMOVED] })
  assert.deepEqual(
    conn.callsTo('putFile').map(({ args: [, remotePath] }) => remotePath),
    [`${REMOTE}/index.html`, `${REMOTE}/nested/deep/page.html`],
  )
  assert.deepEqual(conn.callsTo('deleteRemoteFile').map(({ args }) => args), [[`${REMOTE}/old/gone.html`]])
})

test('Sync.run skips, with a warning, a removed key outside the current local.path', async () => {
  const list = { ...golden, 'old-site/page.html': 3 }
  const conn = fakeWithRemoteList(list)
  const lines = []
  const original = console.log
  console.log = (...args) => { lines.push(args.map(String).join(' ')) }
  let changeset
  try {
    changeset = await new Sync(conn, await loadSiteConfig({ deleteRemoteFiles: true }), 'staging').run(false, true)
  } finally {
    console.log = original
  }
  assert.deepEqual(changeset.removed, ['old-site/page.html'])
  assert.deepEqual(conn.callsTo('deleteRemoteFile'), [])
  assert.ok(lines.some(line => line.includes('old-site/page.html')), 'a warning names the skipped key')
})

// A missing or unreadable remote file list rejects; the library never calls process.exit.

const withProcessExitStub = async (fn) => {
  const original = process.exit
  const exits = []
  process.exit = (code) => { exits.push(code) }
  try {
    return { exits, result: await fn() }
  } finally {
    process.exit = original
  }
}

for (const [label, files] of [
  ['no remote file list', {}],
  ['a remote file list that is not valid JSON', { [CACHE]: '{ not json' }],
]) {
  test(`Sync.run rejects, mentioning syncodemayo init, given ${label}`, async () => {
    const conn = new FakeConnection(files, { dirs: [REMOTE] })
    const config = await loadSiteConfig()
    const { exits } = await withProcessExitStub(() =>
      assert.rejects(new Sync(conn, config, 'staging').run(false, true), (err) => {
        assert.ok(err instanceof Error)
        assert.match(err.message, /syncodemayo init/)
        return true
      }))
    assert.deepEqual(exits, [], 'process.exit is never called')
    for (const op of WRITE_OPS) assert.deepEqual(conn.callsTo(op), [], op)
  })
}

// init (TargetServer.prepare) never creates target.path.

test('TargetServer.prepare rejects when target.path is missing, naming it, and writes nothing', async () => {
  const { server, opened } = await serverWith(() => new FakeConnection())
  await assert.rejects(server.prepare(), (err) => {
    assert.ok(err.message.includes(REMOTE), err.message)
    assert.match(err.message, /create the folder/)
    return true
  })
  for (const op of WRITE_OPS) assert.deepEqual(opened[0].callsTo(op), [], op)
  assert.ok(!opened[0]._hasDir(REMOTE), 'target.path was not created')
  assertClosedOnce(opened)
})

test('TargetServer.prepare writes {} to <path>/<cache> when target.path exists, without mkdir -p', async () => {
  const { server, opened } = await serverWith(() => new FakeConnection({}, { dirs: [REMOTE] }))
  assert.equal(await server.prepare(), true)
  assert.equal(opened[0].files.get(CACHE).toString(), '{}')
  assert.deepEqual(opened[0].callsTo('remoteDirectoryExists'), [])
  assert.deepEqual(opened[0].callsTo('remoteDirectoryFound').map(({ args }) => args), [[REMOTE]])
  assertClosedOnce(opened)
})
