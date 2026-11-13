// The vendored strip-json-comments (src/vendor/), replacing the npm package.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import stripJsonComments from '../dist/vendor/strip-json-comments.js'

const REPO_ROOT = resolve(import.meta.dirname, '..')

test('removes // and /* */ comments', () => {
  const source = '{\n  // line\n  "a": 1, /* block */ "b": /* inline */ 2\n}'
  assert.deepEqual(JSON.parse(stripJsonComments(source)), { a: 1, b: 2 })
  assert.doesNotMatch(stripJsonComments(source), /line|block|inline/)
})

test('keeps comment-like text inside JSON strings', () => {
  const source = '{"url": "http://example.com/*x*/", "path": "a//b", "quote": "say \\"//hi\\""}'
  assert.equal(stripJsonComments(source), source)
  assert.deepEqual(JSON.parse(stripJsonComments(source)), {
    url: 'http://example.com/*x*/',
    path: 'a//b',
    quote: 'say "//hi"',
  })
})

test('keeps the input line breaks and length, so JSON.parse errors point at the right line', () => {
  // The trailing comma makes `}` on line 5 the bad token.
  const source = '{\n  /* one\n     two */\n  "a": 1, // three\n}'
  const stripped = stripJsonComments(source)
  assert.equal(stripped.length, source.length)
  assert.deepEqual(stripped.split('\n').length, source.split('\n').length)

  let error
  try { JSON.parse(stripped) } catch (err) { error = err }
  assert.ok(error instanceof SyntaxError)
  // Node reports "(line L column C)".
  assert.match(error.message, /line 5/)
})

test('handles \\r\\n line endings after a // comment', () => {
  assert.deepEqual(JSON.parse(stripJsonComments('{"a": 1 // c\r\n}')), { a: 1 })
})

// The upstream license file of strip-json-comments 5.0.3, verbatim.
const UPSTREAM_LICENSE = `MIT License

Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
`

test('the vendored file starts with the upstream MIT license header, verbatim', () => {
  const source = readFileSync(join(REPO_ROOT, 'src', 'vendor', 'strip-json-comments.ts'), 'utf8')
  assert.ok(source.startsWith('/*\n' + UPSTREAM_LICENSE + '*/\n'), 'license header is missing or altered')
})
