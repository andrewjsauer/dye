/**
 * Cell-level diff algorithm.
 *
 * Compares two Screen buffers (previous and next frame) and produces a Diff
 * (array of Patches) containing only the terminal operations needed to
 * transform the visible output from prev to next.
 *
 * Key optimizations:
 * - Damage-region limiting: only scan cells within the union of both screens' damage
 * - Packed Int32 comparison: 2 int comparisons per cell (charId + word1)
 * - Cursor-relative movement: minimize CSI sequences by tracking virtual cursor
 * - Style transition caching: StylePool.transition() returns pre-serialized ANSI
 */

import {type Diff, type Patch} from './frame.js';
import {type StylePool} from './pools.js';
import {
	type Screen,
	type Rectangle,
	CellWidth,
	getCellCharId,
	getCellWord1,
	unpackStyleId,
	unpackHyperlinkId,
	unpackWidth,
} from './screen.js';

// ---------------------------------------------------------------------------
// Damage union
// ---------------------------------------------------------------------------

function unionRect(a: Rectangle | undefined, b: Rectangle | undefined): Rectangle | undefined {
	if (!a) return b;
	if (!b) return a;
	const x1 = Math.min(a.x, b.x);
	const y1 = Math.min(a.y, b.y);
	const x2 = Math.max(a.x + a.width, b.x + b.width);
	const y2 = Math.max(a.y + a.height, b.y + b.height);
	return {x: x1, y: y1, width: x2 - x1, height: y2 - y1};
}

// ---------------------------------------------------------------------------
// Virtual cursor
// ---------------------------------------------------------------------------

/**
 * Tracks a virtual cursor position to generate relative movement patches.
 * This avoids absolute positioning (CSI H) which is more bytes.
 */
class VirtualCursor {
	x = 0;
	y = 0;
	private readonly patches: Patch[] = [];

	/**
	 * Move the virtual cursor to (x, y), emitting movement patches.
	 * Uses CR for returning to column 0, relative moves otherwise.
	 */
	moveTo(x: number, y: number): void {
		if (this.x === x && this.y === y) return;

		const dy = y - this.y;
		const dx = x - this.x;

		if (dy !== 0) {
			if (x === 0) {
				// Moving to a different row, column 0: emit CR + vertical move
				this.patches.push({type: 'carriageReturn'});
				if (dy !== 0) {
					this.patches.push({type: 'cursorMove', x: 0, y: dy});
				}
			} else {
				// Move vertically first, then horizontally
				this.patches.push({type: 'cursorMove', x: 0, y: dy});
				if (this.x !== x) {
					this.patches.push({type: 'cursorTo', col: x + 1}); // 1-based
				}
			}
		} else if (dx !== 0) {
			if (x === 0) {
				this.patches.push({type: 'carriageReturn'});
			} else if (dx > 0 && dx <= 4) {
				// Small forward move: CUF
				this.patches.push({type: 'cursorMove', x: dx, y: 0});
			} else {
				// Large or backward move: absolute column
				this.patches.push({type: 'cursorTo', col: x + 1}); // 1-based
			}
		}

		this.x = x;
		this.y = y;
	}

	/** Emit a content patch and advance the cursor. */
	write(content: string, advanceCols: number): void {
		this.patches.push({type: 'stdout', content});
		this.x += advanceCols;
	}

	/** Emit a style transition patch. */
	style(str: string): void {
		if (str) {
			this.patches.push({type: 'styleStr', str});
		}
	}

	/** Emit a hyperlink transition patch. */
	hyperlink(uri: string): void {
		this.patches.push({type: 'hyperlink', uri});
	}

	/** Get all accumulated patches. */
	drain(): Patch[] {
		return this.patches;
	}
}

// ---------------------------------------------------------------------------
// diffScreens — main entry point
// ---------------------------------------------------------------------------

export type DiffOptions = {
	stylePool: StylePool;
	/** If true, force a full diff (ignore damage regions). */
	fullDiff?: boolean;
};

/**
 * Diff two screens and produce a Patch array.
 *
 * The prev screen represents what's currently on the terminal.
 * The next screen represents what should be on the terminal.
 * The returned Diff transforms prev into next with minimal writes.
 */
export function diffScreens(
	prev: Screen,
	next: Screen,
	options: DiffOptions,
): Diff {
	const {stylePool} = options;
	const cursor = new VirtualCursor();

	// Compute scan region from damage
	let scanRegion: Rectangle | undefined;
	if (!options.fullDiff) {
		scanRegion = unionRect(prev.damage, next.damage);

		// Also include any rows that exist in one screen but not the other
		if (prev.height !== next.height) {
			const minH = Math.min(prev.height, next.height);
			const maxH = Math.max(prev.height, next.height);
			const maxW = Math.max(prev.width, next.width);
			scanRegion = unionRect(scanRegion, {x: 0, y: minH, width: maxW, height: maxH - minH});
		}

		if (prev.width !== next.width) {
			// Width change: scan all rows for the changed columns
			const minW = Math.min(prev.width, next.width);
			const maxW = Math.max(prev.width, next.width);
			const maxH = Math.max(prev.height, next.height);
			scanRegion = unionRect(scanRegion, {x: minW, y: 0, width: maxW - minW, height: maxH});
		}
	}

	// If no damage at all and same dimensions, no patches needed
	if (!scanRegion && !options.fullDiff && prev.width === next.width && prev.height === next.height) {
		return [];
	}

	// Fall back to full scan if no damage info
	if (!scanRegion) {
		scanRegion = {x: 0, y: 0, width: Math.max(prev.width, next.width), height: Math.max(prev.height, next.height)};
	}

	// Clamp scan region
	const startY = Math.max(0, scanRegion.y);
	const endY = Math.min(Math.max(prev.height, next.height), scanRegion.y + scanRegion.height);
	const startX = Math.max(0, scanRegion.x);
	const endX = Math.min(Math.max(prev.width, next.width), scanRegion.x + scanRegion.width);

	let currentStyleId = 0;
	let currentHyperlinkId = 0;

	for (let y = startY; y < endY; y++) {
		for (let x = startX; x < endX; x++) {
			// Read cells from both screens (out of bounds = empty)
			const prevCharId = (x < prev.width && y < prev.height) ? getCellCharId(prev, x, y) : 0;
			const prevWord1 = (x < prev.width && y < prev.height) ? getCellWord1(prev, x, y) : 0;
			const nextCharId = (x < next.width && y < next.height) ? getCellCharId(next, x, y) : 0;
			const nextWord1 = (x < next.width && y < next.height) ? getCellWord1(next, x, y) : 0;

			// Fast path: cell unchanged
			if (prevCharId === nextCharId && prevWord1 === nextWord1) {
				continue;
			}

			const nextWidth = unpackWidth(nextWord1);

			// Skip spacer tail cells — terminal auto-advances for wide chars
			if (nextWidth === CellWidth.SpacerTail) {
				continue;
			}

			const nextStyleId = unpackStyleId(nextWord1);
			const nextHyperlinkId = unpackHyperlinkId(nextWord1);

			// Move cursor to this cell
			cursor.moveTo(x, y);

			// Transition style if needed
			if (nextStyleId !== currentStyleId) {
				const transition = stylePool.transition(currentStyleId, nextStyleId);
				cursor.style(transition);
				currentStyleId = nextStyleId;
			}

			// Transition hyperlink if needed
			if (nextHyperlinkId !== currentHyperlinkId) {
				const uri = next.hyperlinkPool.resolve(nextHyperlinkId);
				cursor.hyperlink(uri);
				currentHyperlinkId = nextHyperlinkId;
			}

			// Write the character
			const char = next.charPool.resolve(nextCharId);
			const advance = nextWidth === CellWidth.Wide ? 2 : 1;
			cursor.write(char, advance);
		}
	}

	// Reset style at end if we changed it
	if (currentStyleId !== 0) {
		cursor.style('\x1b[0m');
	}

	// Close hyperlink if open
	if (currentHyperlinkId !== 0) {
		cursor.hyperlink('');
	}

	return cursor.drain();
}
