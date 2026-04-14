import test from 'ava';
import {StylePool} from '../src/pools.js';
import {
	createScreen,
	setCellAt,
	getCellCharId,
	CellWidth,
} from '../src/screen.js';
import {applyScrollHint, computeScrollHint} from '../src/scroll-hint.js';

// ---------------------------------------------------------------------------
// computeScrollHint
// ---------------------------------------------------------------------------

test('computeScrollHint - returns undefined when no delta', t => {
	const hint = computeScrollHint(0, 10, 5, 5);
	t.is(hint, undefined);
});

test('computeScrollHint - positive delta for downward scroll', t => {
	const hint = computeScrollHint(0, 10, 5, 8);
	t.deepEqual(hint, {top: 0, bottom: 10, delta: 3});
});

test('computeScrollHint - negative delta for upward scroll', t => {
	const hint = computeScrollHint(0, 10, 5, 2);
	t.deepEqual(hint, {top: 0, bottom: 10, delta: -3});
});

// ---------------------------------------------------------------------------
// applyScrollHint
// ---------------------------------------------------------------------------

test('applyScrollHint - returns empty string when not in alt-screen', t => {
	const stylePool = new StylePool();
	const screen = createScreen(10, 5, stylePool);
	const seq = applyScrollHint(
		screen,
		{top: 0, bottom: 5, delta: 1},
		{altScreen: false, viewportHeight: 5},
	);
	t.is(seq, '');
});

test('applyScrollHint - returns empty string for zero delta', t => {
	const stylePool = new StylePool();
	const screen = createScreen(10, 5, stylePool);
	const seq = applyScrollHint(
		screen,
		{top: 0, bottom: 5, delta: 0},
		{altScreen: true, viewportHeight: 5},
	);
	t.is(seq, '');
});

test('applyScrollHint - scroll up emits DECSTBM + S sequence', t => {
	const stylePool = new StylePool();
	const screen = createScreen(10, 5, stylePool);
	const seq = applyScrollHint(
		screen,
		{top: 0, bottom: 5, delta: 1},
		{altScreen: true, viewportHeight: 5},
	);
	// Scroll region set: CSI 1;5 r
	t.true(seq.includes('\u001B[1;5r'));
	// Scroll up by 1: CSI 1 S
	t.true(seq.includes('\u001B[1S'));
	// Reset region: CSI r
	t.true(seq.includes('\u001B[r'));
	// Cursor home: CSI H
	t.true(seq.includes('\u001B[H'));
});

test('applyScrollHint - scroll down emits DECSTBM + T sequence', t => {
	const stylePool = new StylePool();
	const screen = createScreen(10, 5, stylePool);
	const seq = applyScrollHint(
		screen,
		{top: 0, bottom: 5, delta: -2},
		{altScreen: true, viewportHeight: 5},
	);
	t.true(seq.includes('\u001B[1;5r'));
	t.true(seq.includes('\u001B[2T')); // Scroll down by 2
	t.true(seq.includes('\u001B[r'));
});

test('applyScrollHint - returns empty when delta >= region height', t => {
	const stylePool = new StylePool();
	const screen = createScreen(10, 5, stylePool);
	const seq = applyScrollHint(
		screen,
		{top: 0, bottom: 5, delta: 5}, // Delta == region height (5)
		{altScreen: true, viewportHeight: 5},
	);
	t.is(seq, '');
});

test('applyScrollHint - mutates prev screen via shiftRows (scroll up)', t => {
	const stylePool = new StylePool();
	const screen = createScreen(3, 5, stylePool);
	const aId = screen.charPool.intern('A');
	// Write 'A' at row 2
	setCellAt(screen, 0, 2, aId, 0, 0, CellWidth.Narrow);

	applyScrollHint(
		screen,
		{top: 0, bottom: 5, delta: 1}, // Scroll up by 1
		{altScreen: true, viewportHeight: 5},
	);

	// 'A' should now be at row 1 (moved up by 1)
	t.is(screen.charPool.resolve(getCellCharId(screen, 0, 1)), 'A');
	// Original row 2 should be blank... wait, shiftRows moves row[top+delta..bottom) -> row[top..bottom-delta)
	// So row 2 moves to row 1, and the bottom row (4) gets blanked
	t.is(getCellCharId(screen, 0, 4), 0);
});

test('applyScrollHint - mutates prev screen via shiftRows (scroll down)', t => {
	const stylePool = new StylePool();
	const screen = createScreen(3, 5, stylePool);
	const bId = screen.charPool.intern('B');
	setCellAt(screen, 0, 0, bId, 0, 0, CellWidth.Narrow);

	applyScrollHint(
		screen,
		{top: 0, bottom: 5, delta: -1}, // Scroll down by 1
		{altScreen: true, viewportHeight: 5},
	);

	// 'B' should now be at row 1
	t.is(screen.charPool.resolve(getCellCharId(screen, 0, 1)), 'B');
	// Row 0 should be blank (revealed)
	t.is(getCellCharId(screen, 0, 0), 0);
});

test('applyScrollHint - clamps region to viewport', t => {
	const stylePool = new StylePool();
	const screen = createScreen(5, 10, stylePool);
	const seq = applyScrollHint(
		screen,
		{top: 0, bottom: 20, delta: 1}, // Bottom exceeds viewport
		{altScreen: true, viewportHeight: 10},
	);
	// Should clamp bottom to 10
	t.true(seq.includes('\u001B[1;10r'));
});

test('applyScrollHint - scroll sub-region', t => {
	const stylePool = new StylePool();
	const screen = createScreen(5, 10, stylePool);
	const seq = applyScrollHint(
		screen,
		{top: 2, bottom: 7, delta: 1},
		{altScreen: true, viewportHeight: 10},
	);
	// DECSTBM: top=3 (1-indexed from 2), bottom=7
	t.true(seq.includes('\u001B[3;7r'));
});
