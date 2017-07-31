import * as Log from './Log'
import { Client } from './Client'

export interface CLIFlags {
  logLevel: Log.LogLevel
}

export function setFlags(flags: CLIFlags) {
  Log.setLogLevel(flags.logLevel)
}

export async function changes(configPath?: string, target?: string) {
  const client = await Client.create(configPath)
  const changeset = await client.getTargetServer(target).sync(true)
  if (changeset == null) throw new Error("Change detection failed.")

  const added = changeset.added.length
  const changed = changeset.changed.length
  const removed = changeset.removed.length

  if (added + changed + removed === 0) {
    Log.log("\nNo changes detected.")
    return true
  }

  if (added > 0) {
    Log.info("\nNew Local Files: (%s)", added)
    changeset.added.forEach(f => Log.log(" -", f))
  }
  if (changed > 0) {
    Log.info("\nChanged Local Files: (%s)", changeset.changed.length)
    changeset.changed.forEach(f => Log.log(" -", f))
  }
  if (removed > 0) {
    Log.info(`\nRemoved Local Files${client.config.local.deleteRemoteFiles ? '' : ' (disabled)'}: (%s)`, changeset.removed.length)
    changeset.removed.forEach(f => Log.log(" -", f))
  }

  return true
}

export async function check(configPath?: string, target?: string) {
  const client = await Client.create(configPath)

  if (client.hasError) {
    throw client.loadError || client.parseError
  }

  if (!client.hasConfig && !client.hasError) {
    Log.urgent("This directory isn't configured for SyncoDeMayo!")
    return false
  }

  const targetServer = client.getTargetServer(target)
  const isServerConfigured = await targetServer.verify()

  if (isServerConfigured) {
    Log.info("Target", JSON.stringify(targetServer.name), "is ready for syncing.")
  }
  else {
    Log.urgent("Target", JSON.stringify(targetServer.name), "isn't configured, run init.")
    return false
  }

  return true
}

export async function init(configPath?: string, target?: string) {
  const client = await Client.create(configPath)

  if (!client.hasConfig && client.hasError) {
    throw client.loadError || client.parseError
  }

  if (!client.hasConfig) {
    await client.createConfig(configPath)
    Log.info("Created local config at", configPath)
    return true
  }

  const targetServer = client.getTargetServer(target)
  const isServerConfigured = await targetServer.verify()

  if (!isServerConfigured) {
    await targetServer.prepare()
    Log.info("Created", targetServer.config.cache, "on server target", targetServer.config._name)
    return true
  }

  Log.info("Everything seems to be configured correctly.")
  return false
}

export async function ls(configPath?: string) {
  const client = await Client.create(configPath)
  const targets = await client.getTargetNames()

  Log.urgent("Defined server targets:")
  targets.forEach(name => {
    const target = client.config.targets[name]
    const bullet = client.config.local.defaultTarget === target._name
      ? " *"
      : " -"
    Log.urgent(bullet, name, `\t(${target.user}@${target.host}:${target.path})`)
  })

  return true
}

export async function sync(configPath?: string, target?: string, forceConfirmation: boolean = false) {
  const client = await Client.create(configPath)

  if (!client.hasConfig) {
    if (client.hasError) throw client.loadError || client.parseError
    else throw new Error("This directory isn't configured for SyncoDeMayo!")
  }

  const changes = await client.getTargetServer(target).sync(false, forceConfirmation)

  if (changes != null) {
    Log.info("\nSummary:")

    Log.info(" %s files uploaded.", changes.added.length + changes.changed.length)
    changes.added.forEach(path => Log.log("  +", path))
    changes.changed.forEach(path => Log.log("  -", path))

    Log.info(` %s files removed. ${client.config.local.deleteRemoteFiles ? '' : '(disabled)'}`, changes.removed.length)
    changes.removed.forEach(path => Log.log("  x", path))
  }

  return true
}
