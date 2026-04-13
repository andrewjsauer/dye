/**
 * Patch optimizer.
 *
 * Takes a raw Diff (Patch array) from the diff algorithm and produces a
 * smaller, more efficient Diff by merging, deduplicating, and removing
 * no-op patches in a single left-to-right pass.
 *
 * Optimizations applied:
 * 1. Remove empty stdout patches (content === '')
 * 2. Merge consecutive cursorMove patches (add offsets)
 * 3. Remove no-op cursorMove patches (0, 0)
 * 4. Collapse consecutive cursorTo patches (keep last)
 * 5. Concatenate adjacent styleStr patches
 * 6. Deduplicate consecutive hyperlink patches (same URI)
 * 7. Cancel cursorHide + cursorShow pairs
 * 8. Remove clear patches with count 0
 */

import {type Diff, type Patch} from './frame.js';

export function optimize(diff: Diff): Diff {
	if (diff.length === 0) return diff;

	const result: Patch[] = [];

	for (let i = 0; i < diff.length; i++) {
		const patch = diff[i]!;

		switch (patch.type) {
			case 'stdout': {
				if (patch.content === '') continue;

				// Try to merge with previous stdout patch
				const prev = result[result.length - 1];
				if (prev?.type === 'stdout') {
					result[result.length - 1] = {
						type: 'stdout',
						content: prev.content + patch.content,
					};
				} else {
					result.push(patch);
				}

				break;
			}

			case 'cursorMove': {
				if (patch.x === 0 && patch.y === 0) continue;

				// Merge with previous cursorMove
				const prev = result[result.length - 1];
				if (prev?.type === 'cursorMove') {
					const merged = {
						type: 'cursorMove' as const,
						x: prev.x + patch.x,
						y: prev.y + patch.y,
					};

					if (merged.x === 0 && merged.y === 0) {
						result.pop();
					} else {
						result[result.length - 1] = merged;
					}
				} else {
					result.push(patch);
				}

				break;
			}

			case 'cursorTo': {
				// Collapse consecutive cursorTo: only last matters
				const prev = result[result.length - 1];
				if (prev?.type === 'cursorTo') {
					result[result.length - 1] = patch;
				} else {
					result.push(patch);
				}

				break;
			}

			case 'styleStr': {
				if (patch.str === '') continue;

				// Concatenate adjacent styleStr patches
				const prev = result[result.length - 1];
				if (prev?.type === 'styleStr') {
					result[result.length - 1] = {
						type: 'styleStr',
						str: prev.str + patch.str,
					};
				} else {
					result.push(patch);
				}

				break;
			}

			case 'hyperlink': {
				// Deduplicate consecutive hyperlink patches
				const prev = result[result.length - 1];
				if (prev?.type === 'hyperlink' && prev.uri === patch.uri) {
					continue;
				}

				result.push(patch);
				break;
			}

			case 'cursorHide': {
				// Check if next patch is cursorShow — cancel the pair
				const next = diff[i + 1];
				if (next?.type === 'cursorShow') {
					i++; // Skip the show
					continue;
				}

				result.push(patch);
				break;
			}

			case 'clear': {
				if (patch.count === 0) continue;
				result.push(patch);
				break;
			}

			default: {
				result.push(patch);
				break;
			}
		}
	}

	return result;
}

/**
 * Serialize a Diff to a single string for terminal output.
 * Converts each patch to its ANSI escape sequence representation.
 */
export function diffToString(diff: Diff): string {
	let result = '';

	for (const patch of diff) {
		switch (patch.type) {
			case 'stdout': {
				result += patch.content;
				break;
			}

			case 'clear': {
				// CSI n M — delete n lines
				for (let i = 0; i < patch.count; i++) {
					result += '\x1b[2K'; // Clear entire line
					if (i < patch.count - 1) {
						result += '\x1b[1A'; // Move up
					}
				}

				break;
			}

			case 'cursorHide': {
				result += '\x1b[?25l';
				break;
			}

			case 'cursorShow': {
				result += '\x1b[?25h';
				break;
			}

			case 'cursorMove': {
				if (patch.y > 0) result += `\x1b[${patch.y}B`; // CUD
				else if (patch.y < 0) result += `\x1b[${-patch.y}A`; // CUU

				if (patch.x > 0) result += `\x1b[${patch.x}C`; // CUF
				else if (patch.x < 0) result += `\x1b[${-patch.x}D`; // CUB
				break;
			}

			case 'cursorTo': {
				result += `\x1b[${patch.col}G`; // CHA (1-based)
				break;
			}

			case 'carriageReturn': {
				result += '\r';
				break;
			}

			case 'hyperlink': {
				if (patch.uri) {
					result += `\x1b]8;;${patch.uri}\x1b\\`;
				} else {
					result += '\x1b]8;;\x1b\\';
				}

				break;
			}

			case 'styleStr': {
				result += patch.str;
				break;
			}
		}
	}

	return result;
}
