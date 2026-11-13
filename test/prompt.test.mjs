// The upload confirm helper (readline/promises, replacing yesno) and Sync._confirmUpload.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { confirmUpload, isYes } from '../dist/lib/Prompt.js'
import { Sync } from '../dist/lib/Sync.js'

// Answers `answer` (null = end input without answering) and collects what was written.
const streamsAnswering = (answer) => {
  const input = new PassThrough()
  const output = new PassThrough()
  let written = ''
  output.on('data', chunk => { written += chunk })
  output.once('data', () => {
    if (answer === null) input.end()
    else input.write(answer + '\n')
  })
  return { streams: { input, output }, written: () => written }
}

const ask = async (message, answer) => {
  const { streams, written } = streamsAnswering(answer)
  const result = await confirmUpload(message, streams)
  return { result, written: written() }
}

for (const answer of ['y', 'Y', 'yes', ' YES ', 'Yes']) {
  test(`answer ${JSON.stringify(answer)} confirms`, async () => {
    assert.equal((await ask('Upload?', answer)).result, true)
  })
}

for (const answer of ['n', 'no', '', '   ', 'yep', 'sure', 'y es', 'true']) {
  test(`answer ${JSON.stringify(answer)} declines`, async () => {
    assert.equal((await ask('Upload?', answer)).result, false)
  })
}

test('input that ends without an answer declines', async () => {
  assert.equal((await ask('Upload?', null)).result, false)
})

test('the question written to output is "<message> - (Yes will upload)"', async () => {
  const { written } = await ask('Ship it?', 'n')
  assert.equal(written.trimEnd(), 'Ship it? - (Yes will upload)')
})

test('isYes trims and ignores case', () => {
  assert.equal(isYes(' yEs\t'), true)
  assert.equal(isYes('nope'), false)
})

// Calls the private Sync._confirmUpload with injected streams.
const confirmFor = async (prompt, answer) => {
  const { streams, written } = streamsAnswering(answer)
  const result = await Sync.prototype._confirmUpload.call({}, { prompt }, 3, streams)
  return { result, written: written() }
}

for (const prompt of [false, undefined, '']) {
  test(`Sync._confirmUpload auto-confirms without asking when target.prompt is ${JSON.stringify(prompt)}`, async () => {
    const { result, written } = await confirmFor(prompt, 'n')
    assert.equal(result, true)
    assert.equal(written, '')
  })
}

test('Sync._confirmUpload asks "Confirm upload?" when target.prompt is true', async () => {
  const { result, written } = await confirmFor(true, 'yes')
  assert.equal(result, true)
  assert.equal(written.trimEnd(), 'Confirm upload? - (Yes will upload)')
})

test('Sync._confirmUpload asks the string prompt when target.prompt is a string', async () => {
  const { result, written } = await confirmFor('This will upload to PRODUCTION! Are you sure?', 'no')
  assert.equal(result, false)
  assert.equal(written.trimEnd(), 'This will upload to PRODUCTION! Are you sure? - (Yes will upload)')
})
