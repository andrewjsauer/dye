/**
 * Screen — a 2D cell buffer backed by packed Int32Arrays.
 *
 * Each cell occupies 2 Int32s (8 bytes):
 *   word0: charId (full 32-bit, index into CharPool)
 *   word1: packed styleId (bits 31-17) | hyperlinkId (bits 16-2) | width (bits 1-0)
 *
 * CellWidth encoding (2 bits):
 *   0 = Narrow (normal single-column character)
 *   1 = Wide (first column of a double-width character like CJK)
 *   2 = SpacerTail (second column of a wide character — never rendered directly)
 *   3 = SpacerHead (reserved)
 *
 * An unwritten/empty cell has both words = 0 (charId=0 is space, styleId=0 is
 * no style, hyperlinkId=0 is no hyperlink, width=0 is narrow).
 */

import {CharPool, type StylePool, HyperlinkPool} from './pools.js';

// ---------------------------------------------------------------------------
// Cell width enum
// ---------------------------------------------------------------------------

export const CellWidth = {
	Narrow: 0,
	Wide: 1,
	SpacerTail: 2,
	SpacerHead: 3,
} as const;

export type CellWidth = (typeof CellWidth)[keyof typeof CellWidth];

// ---------------------------------------------------------------------------
// Packing helpers
// ---------------------------------------------------------------------------

const STYLE_SHIFT = 17;
const HYPERLINK_SHIFT = 2;
const WIDTH_MASK = 0b11;
const HYPERLINK_MASK = 0x7fff; // 15 bits
const STYLE_MASK = 0x7fff; // 15 bits

export function packWord1(
	styleId: number,
	hyperlinkId: number,
	width: CellWidth,
): number {
	return ((styleId & STYLE_MASK) << STYLE_SHIFT)
		| ((hyperlinkId & HYPERLINK_MASK) << HYPERLINK_SHIFT)
		| (width & WIDTH_MASK);
}

export function unpackStyleId(word1: number): number {
	return (word1 >>> STYLE_SHIFT) & STYLE_MASK;
}

export function unpackHyperlinkId(word1: number): number {
	return (word1 >>> HYPERLINK_SHIFT) & HYPERLINK_MASK;
}

export function unpackWidth(word1: number): CellWidth {
	return (word1 & WIDTH_MASK) as CellWidth;
}

// ---------------------------------------------------------------------------
// Rectangle (damage tracking)
// ---------------------------------------------------------------------------

export type Rectangle = {
	x: number;
	y: number;
	width: number;
	height: number;
};

function expandRect(rect: Rectangle | undefined, x: number, y: number, w: number, h: number): Rectangle {
	if (!rect) {
		return {x, y, width: w, height: h};
	}

	const x1 = Math.min(rect.x, x);
	const y1 = Math.min(rect.y, y);
	const x2 = Math.max(rect.x + rect.width, x + w);
	const y2 = Math.max(rect.y + rect.height, y + h);
	return {x: x1, y: y1, width: x2 - x1, height: y2 - y1};
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export type Screen = {
	readonly width: number;
	readonly height: number;
	/** Packed cell data: 2 Int32s per cell. Index = (y * width + x) * 2. */
	readonly cells: Int32Array;
	readonly charPool: CharPool;
	readonly hyperlinkPool: HyperlinkPool;
	/** The styleId for empty/unstyled cells (always 0). */
	readonly emptyStyleId: number;
	/** Bounding box of cells written this frame (not blitted). */
	damage: Rectangle | undefined;
};

export function createScreen(
	width: number,
	height: number,
	_stylePool: StylePool,
	charPool?: CharPool,
	hyperlinkPool?: HyperlinkPool,
): Screen {
	const w = Math.max(0, Math.floor(width));
	const h = Math.max(0, Math.floor(height));
	return {
		width: w,
		height: h,
		cells: new Int32Array(w * h * 2),
		charPool: charPool ?? new CharPool(),
		hyperlinkPool: hyperlinkPool ?? new HyperlinkPool(),
		emptyStyleId: 0,
		damage: undefined,
	};
}

// ---------------------------------------------------------------------------
// Cell access
// ---------------------------------------------------------------------------

/** Get the index into the cells array for a given (x, y) coordinate. */
function cellIndex(screen: Screen, x: number, y: number): number {
	return (y * screen.width + x) * 2;
}

/** Set a cell's data. Tracks damage. */
export function setCellAt(
	screen: Screen,
	x: number,
	y: number,
	charId: number,
	styleId: number,
	hyperlinkId: number,
	width: CellWidth,
): void {
	if (x < 0 || x >= screen.width || y < 0 || y >= screen.height) return;

	const idx = cellIndex(screen, x, y);
	screen.cells[idx] = charId;
	screen.cells[idx + 1] = packWord1(styleId, hyperlinkId, width);

	// Track damage
	screen.damage = expandRect(screen.damage, x, y, 1, 1);
}

/** Read a cell's charId. */
export function getCellCharId(screen: Screen, x: number, y: number): number {
	if (x < 0 || x >= screen.width || y < 0 || y >= screen.height) return 0;
	return screen.cells[cellIndex(screen, x, y)]!;
}

/** Read a cell's packed word1. */
export function getCellWord1(screen: Screen, x: number, y: number): number {
	if (x < 0 || x >= screen.width || y < 0 || y >= screen.height) return 0;
	return screen.cells[cellIndex(screen, x, y) + 1]!;
}

/** Read full cell data. */
export function getCell(
	screen: Screen,
	x: number,
	y: number,
): {charId: number; styleId: number; hyperlinkId: number; width: CellWidth} {
	const w1 = getCellWord1(screen, x, y);
	return {
		charId: getCellCharId(screen, x, y),
		styleId: unpackStyleId(w1),
		hyperlinkId: unpackHyperlinkId(w1),
		width: unpackWidth(w1),
	};
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

/** Clear an entire screen (reset all cells to 0). */
export function clearScreen(screen: Screen): void {
	screen.cells.fill(0);
	screen.damage = undefined;
}

/** Clear a rectangular region. Tracks damage. */
export function clearRegion(
	screen: Screen,
	x: number,
	y: number,
	width: number,
	height: number,
): void {
	const x1 = Math.max(0, x);
	const y1 = Math.max(0, y);
	const x2 = Math.min(screen.width, x + width);
	const y2 = Math.min(screen.height, y + height);

	for (let row = y1; row < y2; row++) {
		const start = cellIndex(screen, x1, row);
		const end = cellIndex(screen, x2, row);
		screen.cells.fill(0, start, end);
	}

	if (x2 > x1 && y2 > y1) {
		screen.damage = expandRect(screen.damage, x1, y1, x2 - x1, y2 - y1);
	}
}

/**
 * Shift rows within a region (for DECSTBM scroll simulation).
 * Positive delta = scroll up (content moves up, blank rows appear at bottom).
 * Negative delta = scroll down.
 */
export function shiftRows(
	screen: Screen,
	top: number,
	bottom: number,
	delta: number,
): void {
	if (delta === 0) return;

	const t = Math.max(0, top);
	const b = Math.min(screen.height, bottom);
	if (t >= b) return;

	const rowSize = screen.width * 2; // Int32s per row

	if (delta > 0) {
		// Scroll up: move rows [t+delta..b) → [t..b-delta), blank [b-delta..b)
		const srcStart = (t + delta) * rowSize;
		const dstStart = t * rowSize;
		const count = Math.max(0, (b - t - delta)) * rowSize;
		if (count > 0) {
			screen.cells.copyWithin(dstStart, srcStart, srcStart + count);
		}

		// Blank the revealed rows at the bottom
		const blankStart = Math.max(t, b - delta) * rowSize;
		const blankEnd = b * rowSize;
		screen.cells.fill(0, blankStart, blankEnd);
	} else {
		// Scroll down: move rows [t..b+delta) → [t-delta..b), blank [t..t-delta)
		const absDelta = -delta;
		const srcStart = t * rowSize;
		const dstStart = (t + absDelta) * rowSize;
		const count = Math.max(0, (b - t - absDelta)) * rowSize;
		if (count > 0) {
			screen.cells.copyWithin(dstStart, srcStart, srcStart + count);
		}

		// Blank the revealed rows at the top
		const blankStart = t * rowSize;
		const blankEnd = Math.min(b, t + absDelta) * rowSize;
		screen.cells.fill(0, blankStart, blankEnd);
	}

	screen.damage = expandRect(screen.damage, 0, t, screen.width, b - t);
}

/**
 * Copy a rectangular region from one screen to another (blit).
 * Used for restoring cached content from the previous frame.
 */
export function blitRegion(
	src: Screen,
	dst: Screen,
	srcX: number,
	srcY: number,
	dstX: number,
	dstY: number,
	width: number,
	height: number,
): void {
	const w = Math.min(
		width,
		src.width - srcX,
		dst.width - dstX,
	);
	const h = Math.min(
		height,
		src.height - srcY,
		dst.height - dstY,
	);

	if (w <= 0 || h <= 0) return;

	for (let row = 0; row < h; row++) {
		const srcIdx = cellIndex(src, srcX, srcY + row);
		const dstIdx = cellIndex(dst, dstX, dstY + row);
		// Fast TypedArray copy for the row
		dst.cells.set(src.cells.subarray(srcIdx, srcIdx + w * 2), dstIdx);
	}

	// Blit does NOT track damage — blitted content is unchanged
}

/**
 * Render a screen to a string (for debugging and test assertions).
 * Strips styles, just returns character content.
 */
export function screenToString(screen: Screen): string {
	const lines: string[] = [];

	for (let y = 0; y < screen.height; y++) {
		let line = '';
		for (let x = 0; x < screen.width; x++) {
			const charId = getCellCharId(screen, x, y);
			const w1 = getCellWord1(screen, x, y);
			const width = unpackWidth(w1);

			if (width === CellWidth.SpacerTail) {
				// Skip spacer cells — the wide char already contributed
				continue;
			}

			line += screen.charPool.resolve(charId);
		}

		lines.push(line.trimEnd());
	}

	return lines.join('\n');
}
