import { IConfig } from './Config.js'

/*
 * A hand-written validator for the config file. It accepts and rejects what the v1 joi schema did,
 * including where v1 joi and config.schema.json disagree (rework-1.md):
 *   - boolean fields also accept the strings "true" and "false" (in any case);
 *   - `port` also accepts a numeric string (parsed the way v1 joi did);
 *   - strings must not be empty;
 *   - unknown keys inside `local` and inside a target reject.
 * Unknown top-level keys are allowed. The config is returned as given: nothing is converted.
 */

type FieldCheck = (value: unknown) => string | undefined

interface FieldRule {
  check: FieldCheck
  required?: boolean
}

type Shape = { [key: string]: FieldRule }

const isPlainObject = (value: unknown): value is { [key: string]: unknown } =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const string: FieldCheck = (value) => {
  if (typeof value !== 'string') return 'must be a string'
  if (value === '') return 'must not be empty'
  return undefined
}

// v1 joi.bool(): a boolean, or the string "true"/"false" in any case.
const boolean: FieldCheck = (value) => {
  if (typeof value === 'boolean') return undefined
  if (typeof value === 'string' && ['true', 'false'].includes(value.toLowerCase())) return undefined
  return 'must be a boolean'
}

// v1 joi.number(): a finite number, or a string that parseFloat reads and isFinite accepts.
const number: FieldCheck = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? undefined : 'must be a finite number'
  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    if (!Number.isNaN(parsed) && isFinite(value as unknown as number)) return undefined
  }
  return 'must be a number'
}

const stringArray: FieldCheck = (value) => {
  if (!Array.isArray(value)) return 'must be an array'
  for (let i = 0; i < value.length; i++) {
    const problem = string(value[i])
    if (problem) return `item ${i} ${problem}`
  }
  return undefined
}

const booleanOrString: FieldCheck = (value) =>
  (boolean(value) && string(value)) ? 'must be a boolean or a non-empty string' : undefined

const localShape: Shape = {
  path: { check: string, required: true },
  files: { check: string },
  exclude: { check: stringArray },
  defaultTarget: { check: string },
  deleteRemoteFiles: { check: boolean },
}

const targetShape: Shape = {
  host: { check: string, required: true },
  user: { check: string, required: true },
  path: { check: string, required: true },
  pass: { check: string },
  port: { check: number },
  cache: { check: string },
  prompt: { check: booleanOrString },
  enabled: { check: boolean },
  // For future use...
  type: { check: string },
}

// Returns the first problem with `value` against `shape`, as `<path> <problem>`, or undefined.
function checkShape(value: unknown, shape: Shape, path: string): string | undefined {
  if (!isPlainObject(value)) return `${path} must be an object`

  for (const key of Object.keys(shape)) {
    const rule = shape[key]
    const fieldValue = value[key]
    if (fieldValue === undefined) {
      if (rule.required) return `${path}.${key} is required`
      continue
    }
    const problem = rule.check(fieldValue)
    if (problem) return `${path}.${key} ${problem}`
  }

  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(shape, key) && value[key] !== undefined) return `${path}.${key} is not allowed`
  }

  return undefined
}

function findProblem(config: unknown): string | undefined {
  if (!isPlainObject(config)) return 'config must be an object'

  if (config.local === undefined) return 'local is required'
  const localProblem = checkShape(config.local, localShape, 'local')
  if (localProblem) return localProblem

  if (config.targets === undefined) return 'targets is required'
  if (!isPlainObject(config.targets)) return 'targets must be an object'
  for (const name of Object.keys(config.targets)) {
    const targetProblem = checkShape(config.targets[name], targetShape, `targets.${name}`)
    if (targetProblem) return targetProblem
  }

  return undefined
}

export async function validateConfig(config: IConfig): Promise<IConfig> {
  const problem = findProblem(config)
  if (problem) throw new Error("Config Schema Error: " + problem)
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
