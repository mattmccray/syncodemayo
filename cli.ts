#!/usr/bin/env node --harmony

import * as dotenv from 'dotenv'
import * as CLI from './lib/Cli'
import * as program from 'commander'

dotenv.config()

const defaultTarget = undefined
let syncTarget: string | undefined = undefined
let command = 'help'

program
  .version('1.0.0')
  .option('-c, --config [file]', 'Specify local config [file]')
// .option('-v, --verbose', 'Verbose logging')

program
  .command('init [target]')
  .description("Configure local folder and/or server to sync")
  // .option('-f, --force', 'Force upload of initial cache file')
  .action((target: string | null) => {
    syncTarget = target || defaultTarget
    command = 'init'
  })

program
  .command('changes [target]')
  .alias('diff')
  .description("Perform sync dry run and display the changes")
  .action((target: string | null) => {
    syncTarget = target || defaultTarget
    command = 'changes'
  })

program
  .command('verify [target]')
  .description("Verify server is configured")
  .action((target: string | null) => {
    syncTarget = target || defaultTarget
    command = 'check'
  })

program
  .command('sync [target]')
  .description("Perform sync to server")
  .option('-f, --force', "Don't prompt before uploading.", false)
  .action((target: string | null, options: any) => {
    syncTarget = target || defaultTarget
    command = options.force ? 'syncf' : 'sync'
  })

program
  .command('ls')
  .description("List defined targets in config")
  .action(() => {
    command = "ls"
  })

program.parse(process.argv);

switch (command) {

  case "changes":
    console.log(`Performing '${command}' on target: ${syncTarget || '(default)'}...\n`)
    CLI.changes(program.config, syncTarget).then(showDone).catch(showError)
    break

  case "check":
    console.log(`Performing '${command}' on target: ${syncTarget || '(default)'}...\n`)
    CLI.check(program.config, syncTarget).then(showDone).catch(showError)
    break

  case "init":
    console.log(`Performing '${command}' on target: ${syncTarget || '(default)'}...\n`)
    CLI.init(program.config, syncTarget).then(showDone).catch(showError)
    break

  case "ls":
    console.log(`Performing '${command}'...\n`)
    CLI.ls(program.config).then(showDone).catch(showError)
    break;

  case "sync":
    console.log(`Performing '${command}' on target: ${syncTarget || '(default)'}\n...`)
    CLI.sync(program.config, syncTarget, false).then(showDone).catch(showError)
    break
  case "syncf":
    console.log(`Performing (forced) 'sync' on target: ${syncTarget || '(default)'}\n...`)
    CLI.sync(program.config, syncTarget, true).then(showDone).catch(showError)
    break

  case "help":
  default:
    syncTarget = "app"
    program.help()
}

function showDone() {
  console.log("\nDone.")
  process.exit(0)
}

function showError(err: any) {
  console.error("\n(!)", err.message, "\n", err)
  // if (program.verbose) {
  //   console.error(err)
  // }
  process.exit(1)
}