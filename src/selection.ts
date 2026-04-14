/**
 * Text selection — state machine and utilities for terminal text selection.
 *
 * Supports three selection modes triggered by click count:
 * - character (1 click): cell-by-cell selection
 * - word (2 clicks): snap to word boundaries
 * - line (3 clicks): select entire row
 *
 * Selection is extended by dragging (mouse motion while button held).
 * Multi-click detection uses a configurable time threshold (default 300ms).
 *
 * Text is extracted from the Screen buffer cell content, respecting
 * wide characters and row boundaries.
 */

import {execFile} from 'node:child_process';
import {platform} from 'node:process';
import {
	type Screen,
	CellWidth,
	getCellCharId,
	getCellWord1,
	unpackWidth,
} from './screen.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Point = {
	readonly col: number;
	readonly row: number;
};

export type SelectionMode = 'character' | 'word' | 'line';

export type SelectionState = {
	/** The cell where the selection began (mouse-down position). */
	readonly anchor: Point;
	/** The cell where the selection currently ends (drag position). */
	readonly focus: Point;
	/** Selection granularity determined by click count. */
	readonly mode: SelectionMode;
};

// ---------------------------------------------------------------------------
// Multi-click detection
// ---------------------------------------------------------------------------

export type MultiClickTracker = {
	lastCol: number;
	lastRow: number;
	lastTime: number;
	count: number;
};

/**
 * Default time window (ms) within which clicks at the same cell
 * increment the multi-click counter.
 */
export const MULTI_CLICK_THRESHOLD_MS = 300;

export function createMultiClickTracker(): MultiClickTracker {
	return {lastCol: -1, lastRow: -1, lastTime: 0, count: 0};
}

/**
 * Record a click and return the current click count (1 = single, 2 = double, 3 = triple).
 * Resets to 1 after a triple-click or when the click is at a different cell
 * or outside the time threshold.
 */
export function recordClick(
	tracker: MultiClickTracker,
	col: number,
	row: number,
	now: number = performance.now(),
	thresholdMs: number = MULTI_CLICK_THRESHOLD_MS,
): number {
	const sameCell = tracker.lastCol === col && tracker.lastRow === row;
	const withinWindow = now - tracker.lastTime < thresholdMs;

	if (sameCell && withinWindow && tracker.count < 3) {
		tracker.count++;
	} else {
		tracker.count = 1;
	}

	tracker.lastCol = col;
	tracker.lastRow = row;
	tracker.lastTime = now;
	return tracker.count;
}

/**
 * Convert a click count to a selection mode.
 * 1 → character, 2 → word, 3 → line.
 */
export function clickCountToMode(count: number): SelectionMode {
	if (count >= 3) return 'line';
	if (count === 2) return 'word';
	return 'character';
}

// ---------------------------------------------------------------------------
// Selection construction
// ---------------------------------------------------------------------------

/**
 * Normalize a selection so anchor ≤ focus in reading order (top-to-bottom,
 * left-to-right). Returns [start, end] points.
 */
export function normalizeSelection(
	selection: SelectionState,
): readonly [Point, Point] {
	const {anchor, focus} = selection;
	if (anchor.row < focus.row || (anchor.row === focus.row && anchor.col <= focus.col)) {
		return [anchor, focus];
	}

	return [focus, anchor];
}

/**
 * Create a character-mode selection starting at the anchor point.
 */
export function startSelection(anchor: Point, mode: SelectionMode): SelectionState {
	return {anchor, focus: anchor, mode};
}

/**
 * Extend a selection to a new focus point.
 * In word/line mode, snaps to appropriate boundaries based on the Screen.
 */
export function extendSelection(
	selection: SelectionState,
	focus: Point,
	screen?: Screen,
): SelectionState {
	if (selection.mode === 'line') {
		// Line mode: focus row extends to full line
		return {...selection, focus};
	}

	if (selection.mode === 'word' && screen) {
		// Word mode: snap focus to word boundary
		const {anchor} = selection;
		const forward = focus.row > anchor.row
			|| (focus.row === anchor.row && focus.col >= anchor.col);
		const snapped = forward
			? snapToWordEnd(screen, focus.col, focus.row)
			: snapToWordStart(screen, focus.col, focus.row);
		return {...selection, focus: snapped};
	}

	return {...selection, focus};
}

// ---------------------------------------------------------------------------
// Word boundary detection
// ---------------------------------------------------------------------------

/**
 * A word character: alphanumeric, underscore, or part of common identifiers.
 * Non-word characters separate words (whitespace, punctuation).
 */
function isWordChar(char: string): boolean {
	if (char === '' || char === ' ') return false;
	// Letters, digits, underscore, and common identifier characters
	return /[\w-]/.test(char);
}

function getCharAt(screen: Screen, col: number, row: number): string {
	const charId = getCellCharId(screen, col, row);
	if (charId === 0) return ' ';
	return screen.charPool.resolve(charId);
}

/** Find the start of the word containing (col, row). */
export function snapToWordStart(screen: Screen, col: number, row: number): Point {
	if (col < 0 || col >= screen.width || row < 0 || row >= screen.height) {
		return {col, row};
	}

	// If the clicked cell is not a word char, return as-is
	if (!isWordChar(getCharAt(screen, col, row))) {
		return {col, row};
	}

	let c = col;
	while (c > 0 && isWordChar(getCharAt(screen, c - 1, row))) {
		c--;
	}

	return {col: c, row};
}

/** Find the end of the word containing (col, row). Returns exclusive end. */
export function snapToWordEnd(screen: Screen, col: number, row: number): Point {
	if (col < 0 || col >= screen.width || row < 0 || row >= screen.height) {
		return {col, row};
	}

	if (!isWordChar(getCharAt(screen, col, row))) {
		return {col, row};
	}

	let c = col;
	while (c < screen.width - 1 && isWordChar(getCharAt(screen, c + 1, row))) {
		c++;
	}

	return {col: c, row};
}

/**
 * Select the entire word at (col, row). Returns a {anchor, focus} pair.
 */
export function selectWordAt(screen: Screen, col: number, row: number): SelectionState {
	return {
		anchor: snapToWordStart(screen, col, row),
		focus: snapToWordEnd(screen, col, row),
		mode: 'word',
	};
}

/**
 * Select the entire line at row. Returns a {anchor, focus} pair
 * spanning columns 0 to width-1.
 */
export function selectLineAt(screen: Screen, row: number): SelectionState {
	return {
		anchor: {col: 0, row},
		focus: {col: Math.max(0, screen.width - 1), row},
		mode: 'line',
	};
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

/**
 * Compute the [startCol, endCol] range (inclusive) for a given row in
 * a normalized selection. Shared by getSelectedText and the overlay
 * renderer so the geometry is defined in one place.
 */
export function selectionColRange(
	mode: SelectionMode,
	start: Point,
	end: Point,
	row: number,
	screenWidth: number,
): readonly [number, number] {
	if (mode === 'line') {
		return [0, screenWidth - 1];
	}

	if (row === start.row && row === end.row) {
		return [start.col, end.col];
	}

	if (row === start.row) {
		return [start.col, screenWidth - 1];
	}

	if (row === end.row) {
		return [0, end.col];
	}

	return [0, screenWidth - 1];
}

/**
 * Get the text content of the selected cells.
 * Trims trailing whitespace from each row and joins rows with '\n'.
 * Skips SpacerTail cells (they're part of the preceding wide char).
 */
export function getSelectedText(
	screen: Screen,
	selection: SelectionState,
): string {
	const [start, end] = normalizeSelection(selection);
	const lines: string[] = [];

	for (let row = start.row; row <= end.row; row++) {
		if (row < 0 || row >= screen.height) continue;

		const [startCol, endCol] = selectionColRange(
			selection.mode,
			start,
			end,
			row,
			screen.width,
		);

		let line = '';
		for (let col = startCol; col <= endCol && col < screen.width; col++) {
			const charId = getCellCharId(screen, col, row);
			const word1 = getCellWord1(screen, col, row);
			const width = unpackWidth(word1);

			// Skip spacer cells (they're part of the preceding wide char)
			if (width === CellWidth.SpacerTail) continue;

			const char = charId === 0 ? ' ' : screen.charPool.resolve(charId);
			line += char;
		}

		lines.push(line.trimEnd());
	}

	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------

/**
 * Copy text to the system clipboard using the platform-appropriate command.
 * Returns a promise that resolves when the copy completes.
 *
 * Platforms:
 * - macOS: pbcopy
 * - Linux: xclip (X11), falling back to wl-copy (Wayland)
 * - Windows: clip.exe
 *
 * The command name is selected from a fixed allowlist — only hard-coded
 * strings reach execFile. No caller input influences the command or args.
 */
const CLIPBOARD_ALLOWLIST = new Set(['pbcopy', 'clip', 'xclip', 'wl-copy']);

function runClipboardCommand(
	command: string,
	args: string[],
	text: string,
): Promise<void> {
	// Defence in depth: prevent a future refactor from passing non-literal commands
	if (!CLIPBOARD_ALLOWLIST.has(command)) {
		return Promise.reject(new Error(`Clipboard command not allowed: ${command}`));
	}

	return new Promise((resolve, reject) => {
		const child = execFile(command, args, error => {
			if (error) {
				reject(error);
			} else {
				resolve();
			}
		});

		child.on('error', reject);
		child.stdin?.on('error', reject);
		child.stdin?.write(text);
		child.stdin?.end();
	});
}

export function copyToClipboard(text: string): Promise<void> {
	if (platform === 'darwin') {
		return runClipboardCommand('pbcopy', [], text);
	}

	if (platform === 'win32') {
		return runClipboardCommand('clip', [], text);
	}

	// Linux/other: try xclip first, fall back to wl-copy on Wayland
	return runClipboardCommand('xclip', ['-selection', 'clipboard'], text)
		.catch(() => runClipboardCommand('wl-copy', [], text));
}
