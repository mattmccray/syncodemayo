import { Client } from './Client'


export async function changed(configPath?: string, target?: string) {
  const client = await Client.create(configPath)
  const changeset = await client.getTargetServer(target).sync(true)

  if (changeset.added.length > 0) {
    console.log("New Local Files: (%s)", changeset.added.length)
    changeset.added.forEach(f => console.log(" -", f))
  }
  if (changeset.changed.length > 0) {
    console.log("Changed Local Files: (%s)", changeset.changed.length)
    changeset.changed.forEach(f => console.log(" -", f))
  }
  if (changeset.removed.length > 0) {
    console.log("Removed Local Files (not handled yet): (%s)", changeset.removed.length)
    changeset.removed.forEach(f => console.log(" -", f))
  }

  return true
}

export async function check(configPath?: string, target?: string) {
  const client = await Client.create(configPath)
  const isServerConfigured = await client.getTargetServer(target).verify()

  if (isServerConfigured) {
    console.log("You're server is ready for syncing.")
  }
  else {
    console.log("That server isn't configured, run init.")
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
    console.log(" -", name)
  })

  return true
}

export async function sync(configPath?: string, target?: string) {
  const client = await Client.create(configPath)
  const changes = await client.getTargetServer(target).sync(false)

  console.log("- %s files uploaded.", changes.added.length + changes.changed.length)
  console.log("- %s files removed. (not yet)", changes.removed.length)

  return true
}
