// Loads `.env` from the working directory into process.env, as v1 did with dotenv.
// cli.ts imports this module first, so the variables are set before any other module
// reads process.env. Variables already in the environment are not overridden.
// Only a missing `.env` is ignored; any other read or parse error surfaces.

export function loadDotEnv(path = '.env'): boolean {
  try {
    process.loadEnvFile(path)
    return true
  }
  catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return false
    throw err
  }
}

loadDotEnv()
