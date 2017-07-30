import { Client } from './Client'


export async function changes(configPath?: string, target?: string) {
  const client = await Client.create(configPath)
  const changeset = await client.getTargetServer(target).sync(true)
  if (changeset == null) throw new Error("Change detection failed.")

  const added = changeset.added.length
  const changed = changeset.changed.length
  const removed = changeset.removed.length

  if (added + changed + removed === 0) {
    console.log("\nNo changes detected.")
    return true
  }

  if (added > 0) {
    console.log("\nNew Local Files: (%s)", changeset.added.length)
    changeset.added.forEach(f => console.log(" -", f))
  }
  if (changed > 0) {
    console.log("\nChanged Local Files: (%s)", changeset.changed.length)
    changeset.changed.forEach(f => console.log(" -", f))
  }
  if (removed > 0) {
    console.log(`\nRemoved Local Files${client.config.local.deleteRemoteFiles ? '' : ' (disabled)'}: (%s)`, changeset.removed.length)
    changeset.removed.forEach(f => console.log(" -", f))
  }

  return true
}

export async function check(configPath?: string, target?: string) {
  const client = await Client.create(configPath)

  if (client.hasError) {
    throw client.loadError
  }

  if (!client.hasConfig && !client.hasError) {
    console.log("This directory isn't configured for SyncoDeMayo!")
    return false
  }

  const targetServer = client.getTargetServer(target)
  const isServerConfigured = await targetServer.verify()

  if (isServerConfigured) {
    console.log("Target", JSON.stringify(targetServer.name), "is ready for syncing.")
  }
  else {
    console.log("Target", JSON.stringify(targetServer.name), "isn't configured, run init.")
    return false
  }

  return true
}

export async function init(configPath?: string, target?: string) {
  const client = await Client.create(configPath)

  if (!client.hasConfig) {
    await client.createConfig(configPath)
    console.log("Created local config at", configPath)
    return true
  }

  const targetServer = client.getTargetServer(target)
  const isServerConfigured = await targetServer.verify()

  if (!isServerConfigured) {
    await targetServer.prepare()
    console.log("Created", targetServer.config.cache, "on server target", targetServer.config._name)
    return true
  }

  console.log("Everything seems to be configured correctly.")
  return false
}

export async function ls(configPath?: string) {
  const client = await Client.create(configPath)
  const targets = await client.getTargetNames()

  console.log("Defined server targets:")
  targets.forEach(name => {
    const target = client.config.targets[name]
    const bullet = client.config.local.defaultTarget === target._name
      ? " *"
      : " -"
    console.log(bullet, name, `\t(${target.user}@${target.host}:${target.path})`)
  })

  return true
}

export async function sync(configPath?: string, target?: string, forceConfirmation: boolean = false) {
  const client = await Client.create(configPath)
  const changes = await client.getTargetServer(target).sync(false, forceConfirmation)

  if (changes != null) {
    console.log("\nSummary:")
    console.log("- %s files uploaded.", changes.added.length + changes.changed.length)
    console.log(`- %s files removed. ${client.config.local.deleteRemoteFiles ? '' : '(disabled)'}`, changes.removed.length)
  }

  return true
}
