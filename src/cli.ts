#!/usr/bin/env node

// Must be the first import: loads .env before any other module reads process.env.
import './env.js'

import { readFileSync } from 'node:fs'
import * as CLI from './lib/Cli.js'
import * as Log from './lib/Log.js'
import { CliArgs, CliArgsError, HELP, parseCliArgs } from './lib/Args.js'

let args: CliArgs
try {
  args = parseCliArgs(process.argv.slice(2))
}
catch (err) {
  if (!(err instanceof CliArgsError)) throw err
  process.stderr.write(`error: ${err.message}\n\nRun 'syncodemayo --help' for usage.\n`)
  process.exit(1)
}

CLI.setFlags({ logLevel: args.logLevel })

const { config, target } = args

switch (args.command) {

  case "changes":
    Log.debug(`Performing '${args.command}' on target: ${target || '(default)'}...\n`)
    CLI.changes(config, target).then(showDone).catch(showError)
    break

  case "check":
    Log.debug(`Performing '${args.command}' on target: ${target || '(default)'}...\n`)
    CLI.check(config, target).then(showDone).catch(showError)
    break

  case "init":
    Log.debug(`Performing '${args.command}' on target: ${target || '(default)'}...\n`)
    CLI.init(config, target).then(showDone).catch(showError)
    break

  case "ls":
    Log.debug(`Performing '${args.command}'...\n`)
    CLI.ls(config).then(showDone).catch(showError)
    break

  case "sync":
    if (args.force) {
      Log.debug(`Performing (forced) 'sync' on target: ${target || '(default)'}\n...`)
    }
    else {
      Log.debug(`Performing '${args.command}' on target: ${target || '(default)'}\n...`)
    }
    CLI.sync(config, target, args.force).then(showDone).catch(showError)
    break

  case "version":
    process.stdout.write(readPackageVersion() + "\n")
    break

  case "help":
  default:
    process.stdout.write(HELP)
}

// The version of this package, read from its package.json (one level above dist/).
function readPackageVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  return String(pkg.version)
}

function showDone() {
  Log.log("\nDone.")
  process.exit(0)
}

function showError(err: any) {
  console.error("\n(!)", err.message, "\n\n", err)
  process.exit(1)
}
