import { createInterface } from 'node:readline/promises'

export interface ConfirmStreams {
  input?: NodeJS.ReadableStream
  output?: NodeJS.WritableStream
}

/**
 * True when an answer confirms: `y` or `yes` in any case, after trimming. Anything else,
 * including an empty answer, declines.
 */
export function isYes(answer: string): boolean {
  const normalized = answer.trim().toLowerCase()
  return normalized === 'y' || normalized === 'yes'
}

/**
 * Asks `<message> - (Yes will upload)` and resolves whether the answer confirms (see `isYes`).
 * The input and output streams default to stdin and stdout, and can be injected for tests.
 * If input ends before an answer, it resolves false.
 */
export async function confirmUpload(message: string, streams: ConfirmStreams = {}): Promise<boolean> {
  const rl = createInterface({
    input: streams.input ?? process.stdin,
    output: streams.output ?? process.stdout,
  })
  try {
    const answer = await new Promise<string>((resolve, reject) => {
      rl.once('close', () => resolve(''))
      rl.question(`${message} - (Yes will upload) `).then(resolve, reject)
    })
    return isYes(answer)
  } finally {
    rl.close()
  }
}
