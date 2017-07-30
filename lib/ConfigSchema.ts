import { IConfig } from './Config'
import * as joi from 'joi'

export const localSchema = joi.object({
  path: joi.string().required(),
  files: joi.string(),
  exclude: joi.array().items(joi.string()),
  defaultTarget: joi.string(),
  deleteRemoteFiles: joi.bool(),
})

export const targetSchema = joi.object({
  host: joi.string().required(),
  user: joi.string().required(),
  path: joi.string().required(),
  pass: joi.string(),
  port: joi.number(),
  cache: joi.string(),
  prompt: joi.alternatives([joi.bool(), joi.string()]),
})

export const configSchema = joi.object({
  local: localSchema.required(),
  targets: joi.object().pattern(/.*/, targetSchema).required()
}).unknown(true)

export async function validateConfig(config: IConfig): Promise<IConfig> {
  const result = configSchema.validate(config)
  if (!!result.error) throw new Error("Config Schema Error: " + result.error.message)
  return config
}

export const DefaultConfig: any = {
  local: {
    path: "public",
    files: "**/**",
    exclude: ["**/*.map", "**/.DS_Store", "**/.git*"],
    defaultTarget: "staging"
  },
  targets: {
    staging: {
      path: "Example/www/stage",
      host: "www.example.com",
      user: "USERNAME"
    },
    production: {
      path: "Example/www",
      host: "www.example.com",
      user: "USERNAME",
      prompt: "This will upload to PRODUCTION! Are you sure?"
    }
  }
}