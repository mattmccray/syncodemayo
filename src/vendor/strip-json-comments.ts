/*
MIT License

Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

// Vendored from strip-json-comments 5.0.3 (https://github.com/sindresorhus/strip-json-comments),
// index.js and index.d.ts, converted to TypeScript. The logic is unchanged; only type annotations
// were added. Upstream is ESM-only, so it is vendored here instead of depended on.

export type Options = {
	/**
	Strip trailing commas in addition to comments.

	@default false
	*/
	readonly trailingCommas?: boolean;

	/**
	Replace comments and trailing commas with whitespace instead of stripping them entirely.

	@default true
	*/
	readonly whitespace?: boolean;
};

const singleComment = Symbol('singleComment');
const multiComment = Symbol('multiComment');

type CommentState = false | typeof singleComment | typeof multiComment;

const stripWithoutWhitespace = (_string: string, _start?: number, _end?: number): string => '';

// Replace all characters except ASCII spaces, tabs and line endings with regular spaces to ensure valid JSON output.
const stripWithWhitespace = (string: string, start?: number, end?: number): string => string.slice(start, end).replace(/[^ \t\r\n]/g, ' ');

const isEscaped = (jsonString: string, quotePosition: number): boolean => {
	let index = quotePosition - 1;
	let backslashCount = 0;

	while (jsonString[index] === '\\') {
		index -= 1;
		backslashCount += 1;
	}

	return Boolean(backslashCount % 2);
};

/**
Strip comments from JSON. Lets you use comments in your JSON files!

It will replace single-line comments `//` and multi-line comments `/**\/` with whitespace. This allows JSON error positions to remain as close as possible to the original source.

@param jsonString - Accepts a string with JSON.
@returns A JSON string without comments.
*/
export default function stripJsonComments(jsonString: string, {whitespace = true, trailingCommas = false}: Options = {}): string {
	if (typeof jsonString !== 'string') {
		throw new TypeError(`Expected argument \`jsonString\` to be a \`string\`, got \`${typeof jsonString}\``);
	}

	const strip = whitespace ? stripWithWhitespace : stripWithoutWhitespace;

	let isInsideString = false;
	let isInsideComment: CommentState = false;
	let offset = 0;
	let buffer = '';
	let result = '';
	let commaIndex = -1;

	for (let index = 0; index < jsonString.length; index++) {
		const currentCharacter = jsonString[index];
		const nextCharacter = jsonString[index + 1];

		if (!isInsideComment && currentCharacter === '"') {
			// Enter or exit string
			const escaped = isEscaped(jsonString, index);
			if (!escaped) {
				isInsideString = !isInsideString;
			}
		}

		if (isInsideString) {
			continue;
		}

		if (!isInsideComment && currentCharacter + nextCharacter === '//') {
			// Enter single-line comment
			buffer += jsonString.slice(offset, index);
			offset = index;
			isInsideComment = singleComment;
			index++;
		} else if (isInsideComment === singleComment && currentCharacter + nextCharacter === '\r\n') {
			// Exit single-line comment via \r\n
			index++;
			isInsideComment = false;
			buffer += strip(jsonString, offset, index);
			offset = index;
			continue;
		} else if (isInsideComment === singleComment && currentCharacter === '\n') {
			// Exit single-line comment via \n
			isInsideComment = false;
			buffer += strip(jsonString, offset, index);
			offset = index;
		} else if (!isInsideComment && currentCharacter + nextCharacter === '/*') {
			// Enter multiline comment
			buffer += jsonString.slice(offset, index);
			offset = index;
			isInsideComment = multiComment;
			index++;
			continue;
		} else if (isInsideComment === multiComment && currentCharacter + nextCharacter === '*/') {
			// Exit multiline comment
			index++;
			isInsideComment = false;
			buffer += strip(jsonString, offset, index + 1);
			offset = index + 1;
			continue;
		} else if (trailingCommas && !isInsideComment) {
			if (commaIndex !== -1) {
				if (currentCharacter === '}' || currentCharacter === ']') {
					// Strip trailing comma
					buffer += jsonString.slice(offset, index);
					result += strip(buffer, 0, 1) + buffer.slice(1);
					buffer = '';
					offset = index;
					commaIndex = -1;
				} else if (currentCharacter !== ' ' && currentCharacter !== '\t' && currentCharacter !== '\r' && currentCharacter !== '\n') {
					// Hit non-whitespace following a comma; comma is not trailing
					buffer += jsonString.slice(offset, index);
					offset = index;
					commaIndex = -1;
				}
			} else if (currentCharacter === ',') {
				// Flush buffer prior to this point, and save new comma index
				result += buffer + jsonString.slice(offset, index);
				buffer = '';
				offset = index;
				commaIndex = index;
			}
		}
	}

	const remaining = (isInsideComment === singleComment)
		? strip(jsonString, offset)
		: jsonString.slice(offset);

	return result + buffer + remaining;
}
