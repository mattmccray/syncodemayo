// Smoke test of the npm tarball: compiles, packs the package into a temporary folder,
// installs the tarball into a fresh scratch folder, and runs the installed `syncodemayo`
// bin with --help and --version. Removes both folders when done.
//
// Run with `npm run smoke:pack`. Not part of `npm test` or `prepublishOnly`, because
// installing the tarball fetches basic-ftp from the registry.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], shell: process.platform === 'win32' })

const check = (ok, message) => {
  if (!ok) throw new Error(message)
}

const packDir = mkdtempSync(join(tmpdir(), 'syncodemayo-pack-'))
const installDir = mkdtempSync(join(tmpdir(), 'syncodemayo-install-'))

try {
  run(NPM, ['run', 'compile'], REPO_ROOT)
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'))
  const { HELP } = await import(pathToFileURL(join(REPO_ROOT, 'dist', 'lib', 'Args.js')).href)

  const [{ filename }] = JSON.parse(run(NPM, ['pack', '--json', '--pack-destination', packDir], REPO_ROOT))
  const tarball = join(packDir, filename)
  console.log(`Packed ${tarball}`)

  writeFileSync(join(installDir, 'package.json'), JSON.stringify({ name: 'smoke-pack', private: true }))
  run(NPM, ['install', '--no-audit', '--no-fund', tarball], installDir)
  console.log(`Installed into ${installDir}`)

  const bin = join(installDir, 'node_modules', '.bin', process.platform === 'win32' ? 'syncodemayo.cmd' : 'syncodemayo')

  const help = run(bin, ['--help'], installDir)
  check(help === HELP, `--help output differs from HELP in src/lib/Args.ts:\n${help}`)
  console.log('syncodemayo --help: exit 0, output matches HELP')
  process.stdout.write(help)

  const version = run(bin, ['--version'], installDir)
  check(version === `${pkg.version}\n`, `--version printed ${JSON.stringify(version)}, expected ${pkg.version}`)
  console.log(`syncodemayo --version: exit 0, prints ${version.trim()}`)

  console.log('Smoke test passed.')
}
finally {
  rmSync(packDir, { recursive: true, force: true })
  rmSync(installDir, { recursive: true, force: true })
}
