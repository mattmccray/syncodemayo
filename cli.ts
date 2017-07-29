#!/usr/bin/env node

import * as syncodemayo from './syncodemayo'
import * as program from 'commander'

const defaultTarget = 'staging'

let syncTarget = 'app'
let command = 'help'
let options

program
  .version('1.0.0')
  .option('-c, --config [file]', 'Specify local config [file]', '.syncodemayo.json')
  .option('-v, --verbose', 'Verbose logging')

program
  .command('init [target]')
  .description("Configure local folder and/or server to sync")
  .alias('i')
  .option('-f, --force', 'Force upload of initial cache file')
  .action((target: string | null) => {
    syncTarget = target || defaultTarget
    command = 'init'
  })

program
  .command('changes [target]')
  .alias('a')
  .description("Perform sync dry run and display the changes")
  .action((target: string | null) => {
    syncTarget = target || defaultTarget
    command = 'changes'
  })

program
  .command('check [target]')
  .alias('c')
  .description("Check if server is configured")
  .action((target: string | null) => {
    syncTarget = target || defaultTarget
    command = 'check'
  })

program
  .command('sync [target]')
  .alias('s')
  .description("Perform sync to server")
  .action((target: string | null) => {
    syncTarget = target || defaultTarget
    command = 'sync'
  })

program
  .command('ls')
  .alias('l')
  .description("List defined targets in config")
  .action(() => {
    command = "ls"
  })

program.parse(process.argv);

console.log(`Performing '${command}' on target: ${syncTarget}`)

options = {
  verbose: program.verbose,
  config: program.config,
  stage: syncTarget
}

switch (command) {

  case "changes":
    syncodemayo.changed(options).then(showDone).catch(showError)
    break

  case "check":
    syncodemayo.check(options).then(showDone).catch(showError)
    break

  case "init":
    syncodemayo.init(options).then(showDone).catch(showError)
    break

  case "ls":
    syncodemayo.listTargets(options).then(showDone).catch(showError)
    break;

  case "sync":
    syncodemayo.run(options).then(showDone).catch(showError)
    break

  case "help":
  default:
    program.help()
}


function showDone() {
  console.log("\nDone.\n")
}

function showError(err: any) {
  console.error("\n(!)", err.message)
  if (program.verbose) {
    console.error(err)
  }
}