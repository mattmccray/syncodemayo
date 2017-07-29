#!/usr/bin/env node

/**
 * TODO: Add support for usage like:
 * 
 *  syncodemayo [command] [-v -f -c config]
 * 
 *  command = defaults to sync (sync, check, init, changes*)
 *  -c = Config file, default: .syncdemayo.json
 *  -v = Verbose
 *  -f = Force
 * 
 *  *changes command in a later release
 */

/**
 * Module dependencies.
 */

const syncodemayo = require('./syncodemayo')
const program = require('commander');
const defaultTarget = 'staging'

let syncTarget = 'app'
let command = 'help'

program
  .version('1.0.0')
  .option('-c, --config [file]', 'Specify local config [file]', '.syncodemayo.json')
  .option('-v, --verbose', 'Verbose logging')
// .option('-t, --target [name]', 'Specify server [target]', 'staging')

program
  .command('init [target]')
  .description("Configure local folder and/or server to sync")
  .alias('i')
  .option('-f, --force', 'Force upload of initial cache file')
  .action((target) => {
    syncTarget = target || defaultTarget
    command = 'init'
  })

program
  .command('changes [target]')
  .alias('a')
  .description("Perform sync dry run and display the changes")
  .action((target) => {
    syncTarget = target || defaultTarget
    command = 'changes'
  })

program
  .command('check [target]')
  .alias('c')
  .description("Check if server is configured")
  .action((tgt) => {
    syncTarget = syncTarget || defaultTarget
    comand = 'check'
  })

program
  .command('sync [target]') //{ isDefault: true }
  .alias('s')
  .description("Perform sync to server")
  .action((target) => {
    syncTarget = target || defaultTarget
    command = 'sync'
  })

program
  .command('ls')
  .alias('l')
  .description("List defined targets in config")
  .action(() => {
    // syncTarget = target || defaultTarget
    command = "ls"
  })

// program
//   .command("*", { isDefault: true, noHelp: true })
//   .action(() => {
//     program.outputHelp((h) => {
//       console.log(h)
//     })
//   })

program.parse(process.argv);

console.log(`Performing '${command}' on target: ${syncTarget}`)

let action

switch (command) {

  case "changes":
    action = syncodemayo.changed({
      verbose: program.verbose,
      config: program.config,
      stage: syncTarget
    }).then(showDone).catch(showError)
    break

  case "check":
    action = syncodemayo.check({
      verbose: program.verbose,
      config: program.config,
      stage: syncTarget
    }).then(showDone).catch(showError)
    break

  case "init":
    action = syncodemayo.init({
      verbose: program.verbose,
      config: program.config,
      stage: syncTarget
    }).then(showDone).catch(showError)
    break

  case "ls":
    action = syncodemayo.listTargets({
      verbose: program.verbose,
      config: program.config
    }).then(showDone).catch(showError)
    break;

  case "sync":
    action = syncodemayo.run({
      verbose: program.verbose,
      config: program.config,
      stage: syncTarget
    }).then(showDone).catch(showError)
    break

  case "help":
  default:
    program.help()
}


function showDone() {
  console.log("\nDone.\n")
}
function showError(err) {
  console.error("\n(!)", err.message)
  if (program.verbose) {
    console.error(err)
  }
}

// console.log('Running SyncoDeMayo %s with options:, %o', command, options);
// if (program.verbose) console.log('  - verbose');
// if (program.force) console.log('  - force');
// console.log('  - Config: %s', program.config);