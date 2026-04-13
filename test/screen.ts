import test from 'ava';
import {CharPool, StylePool, HyperlinkPool} from '../src/pools.js';
import {
	createScreen,
	setCellAt,
	getCellCharId,
	getCellWord1,
	getCell,
	clearScreen,
	clearRegion,
	shiftRows,
	blitRegion,
	screenToString,
	CellWidth,
	unpackStyleId,
	unpackHyperlinkId,
	unpackWidth,
} from '../src/screen.js';
import {diffScreens} from '../src/diff.js';
import {optimize, diffToString} from '../src/optimizer.js';

// ---------------------------------------------------------------------------
// CharPool
// ---------------------------------------------------------------------------

test('CharPool - interns space as 0', t => {
	const pool = new CharPool();
	t.is(pool.intern(' '), 0);
});

test('CharPool - interns empty string as 1', t => {
	const pool = new CharPool();
	t.is(pool.intern(''), 1);
});

test('CharPool - same string returns same id', t => {
	const pool = new CharPool();
	const id1 = pool.intern('hello');
	const id2 = pool.intern('hello');
	t.is(id1, id2);
});

test('CharPool - different strings return different ids', t => {
	const pool = new CharPool();
	const id1 = pool.intern('a');
	const id2 = pool.intern('b');
	t.not(id1, id2);
});

test('CharPool - ASCII fast path works', t => {
	const pool = new CharPool();
	const id = pool.intern('A');
	t.is(pool.resolve(id), 'A');
});

test('CharPool - Unicode graphemes work', t => {
	const pool = new CharPool();
	const id = pool.intern('🎨');
	t.is(pool.resolve(id), '🎨');
});

test('CharPool - resolve returns correct string', t => {
	const pool = new CharPool();
	t.is(pool.resolve(0), ' ');
	t.is(pool.resolve(1), '');
	const id = pool.intern('test');
	t.is(pool.resolve(id), 'test');
});

// ---------------------------------------------------------------------------
// StylePool
// ---------------------------------------------------------------------------

test('StylePool - empty codes intern as 0', t => {
	const pool = new StylePool();
	t.is(pool.intern([]), 0);
});

test('StylePool - same codes return same id', t => {
	const pool = new StylePool();
	const id1 = pool.intern([1, 31]);
	const id2 = pool.intern([1, 31]);
	t.is(id1, id2);
});

test('StylePool - visible-on-space bit set for background', t => {
	const pool = new StylePool();
	const id = pool.intern([42]); // green background
	t.true(pool.isVisibleOnSpace(id));
});

test('StylePool - visible-on-space bit not set for foreground-only', t => {
	const pool = new StylePool();
	const id = pool.intern([31]); // red foreground
	t.false(pool.isVisibleOnSpace(id));
});

test('StylePool - transition from default to styled', t => {
	const pool = new StylePool();
	const boldId = pool.intern([1]);
	const result = pool.transition(0, boldId);
	t.is(result, '\x1b[1m');
});

test('StylePool - transition from styled to default', t => {
	const pool = new StylePool();
	const boldId = pool.intern([1]);
	const result = pool.transition(boldId, 0);
	t.is(result, '\x1b[0m');
});

test('StylePool - transition between same id returns empty', t => {
	const pool = new StylePool();
	const id = pool.intern([1]);
	t.is(pool.transition(id, id), '');
});

// ---------------------------------------------------------------------------
// HyperlinkPool
// ---------------------------------------------------------------------------

test('HyperlinkPool - empty string returns 0', t => {
	const pool = new HyperlinkPool();
	t.is(pool.intern(''), 0);
});

test('HyperlinkPool - same URI returns same id', t => {
	const pool = new HyperlinkPool();
	const id1 = pool.intern('https://example.com');
	const id2 = pool.intern('https://example.com');
	t.is(id1, id2);
});

test('HyperlinkPool - resolve returns URI', t => {
	const pool = new HyperlinkPool();
	const id = pool.intern('https://example.com');
	t.is(pool.resolve(id), 'https://example.com');
	t.is(pool.resolve(0), '');
});

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

test('Screen - createScreen with valid dimensions', t => {
	const stylePool = new StylePool();
	const screen = createScreen(80, 24, stylePool);
	t.is(screen.width, 80);
	t.is(screen.height, 24);
	t.is(screen.cells.length, 80 * 24 * 2);
});

test('Screen - setCellAt and getCellCharId', t => {
	const stylePool = new StylePool();
	const screen = createScreen(10, 5, stylePool);
	const charId = screen.charPool.intern('A');
	setCellAt(screen, 3, 2, charId, 0, 0, CellWidth.Narrow);
	t.is(getCellCharId(screen, 3, 2), charId);
});

test('Screen - setCellAt tracks damage', t => {
	const stylePool = new StylePool();
	const screen = createScreen(10, 5, stylePool);
	t.is(screen.damage, undefined);
	setCellAt(screen, 3, 2, 1, 0, 0, CellWidth.Narrow);
	t.deepEqual(screen.damage, {x: 3, y: 2, width: 1, height: 1});
});

test('Screen - getCell unpacks all fields', t => {
	const stylePool = new StylePool();
	const screen = createScreen(10, 5, stylePool);
	const boldId = stylePool.intern([1]);
	const linkId = screen.hyperlinkPool.intern('https://example.com');
	setCellAt(screen, 0, 0, 42, boldId, linkId, CellWidth.Wide);
	const cell = getCell(screen, 0, 0);
	t.is(cell.charId, 42);
	t.is(cell.styleId, boldId);
	t.is(cell.hyperlinkId, linkId);
	t.is(cell.width, CellWidth.Wide);
});

test('Screen - out of bounds reads return 0', t => {
	const stylePool = new StylePool();
	const screen = createScreen(5, 5, stylePool);
	t.is(getCellCharId(screen, -1, 0), 0);
	t.is(getCellCharId(screen, 5, 0), 0);
	t.is(getCellCharId(screen, 0, 5), 0);
});

test('Screen - clearScreen resets all cells', t => {
	const stylePool = new StylePool();
	const screen = createScreen(5, 3, stylePool);
	setCellAt(screen, 2, 1, 10, 5, 0, CellWidth.Narrow);
	clearScreen(screen);
	t.is(getCellCharId(screen, 2, 1), 0);
	t.is(screen.damage, undefined);
});

test('Screen - clearRegion clears a rectangle', t => {
	const stylePool = new StylePool();
	const screen = createScreen(10, 5, stylePool);
	setCellAt(screen, 3, 2, 10, 0, 0, CellWidth.Narrow);
	setCellAt(screen, 4, 2, 11, 0, 0, CellWidth.Narrow);
	clearRegion(screen, 3, 2, 2, 1);
	t.is(getCellCharId(screen, 3, 2), 0);
	t.is(getCellCharId(screen, 4, 2), 0);
});

test('Screen - shiftRows scrolls up', t => {
	const stylePool = new StylePool();
	const screen = createScreen(3, 4, stylePool);
	// Write 'A' at row 2
	const aId = screen.charPool.intern('A');
	setCellAt(screen, 0, 2, aId, 0, 0, CellWidth.Narrow);
	// Scroll up by 1 in region [0, 4)
	shiftRows(screen, 0, 4, 1);
	// 'A' should now be at row 1
	t.is(screen.charPool.resolve(getCellCharId(screen, 0, 1)), 'A');
	// Row 3 (bottom) should be blank
	t.is(getCellCharId(screen, 0, 3), 0);
});

test('Screen - blitRegion copies cells', t => {
	const stylePool = new StylePool();
	const src = createScreen(5, 3, stylePool);
	const dst = createScreen(5, 3, stylePool, src.charPool);
	const xId = src.charPool.intern('X');
	setCellAt(src, 1, 1, xId, 0, 0, CellWidth.Narrow);
	blitRegion(src, dst, 0, 0, 0, 0, 5, 3);
	t.is(getCellCharId(dst, 1, 1), xId);
});

test('Screen - screenToString produces readable output', t => {
	const stylePool = new StylePool();
	const screen = createScreen(5, 2, stylePool);
	const hId = screen.charPool.intern('H');
	const iId = screen.charPool.intern('i');
	setCellAt(screen, 0, 0, hId, 0, 0, CellWidth.Narrow);
	setCellAt(screen, 1, 0, iId, 0, 0, CellWidth.Narrow);
	const str = screenToString(screen);
	t.is(str, 'Hi\n');
});

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

test('diff - identical screens produce no patches', t => {
	const stylePool = new StylePool();
	const a = createScreen(5, 3, stylePool);
	const b = createScreen(5, 3, stylePool);
	const diff = diffScreens(a, b, {stylePool});
	t.is(diff.length, 0);
});

test('diff - single cell change produces patches', t => {
	const stylePool = new StylePool();
	const charPool = new CharPool();
	const prev = createScreen(5, 3, stylePool, charPool);
	const next = createScreen(5, 3, stylePool, charPool);
	const aId = charPool.intern('A');
	setCellAt(next, 2, 1, aId, 0, 0, CellWidth.Narrow);
	const diff = diffScreens(prev, next, {stylePool});
	t.true(diff.length > 0);
	// Should contain at least a cursor move and the character 'A'
	const str = diffToString(optimize(diff));
	t.true(str.includes('A'));
});

test('diff - style change produces style transition', t => {
	const stylePool = new StylePool();
	const charPool = new CharPool();
	const prev = createScreen(5, 1, stylePool, charPool);
	const next = createScreen(5, 1, stylePool, charPool);
	const aId = charPool.intern('A');
	const boldId = stylePool.intern([1]);
	setCellAt(next, 0, 0, aId, boldId, 0, CellWidth.Narrow);
	const diff = diffScreens(prev, next, {stylePool});
	const str = diffToString(optimize(diff));
	t.true(str.includes('\x1b[1m')); // Bold SGR
	t.true(str.includes('A'));
	t.true(str.includes('\x1b[0m')); // Reset at end
});

test('diff - full diff mode scans everything', t => {
	const stylePool = new StylePool();
	const charPool = new CharPool();
	const prev = createScreen(3, 1, stylePool, charPool);
	const next = createScreen(3, 1, stylePool, charPool);
	const xId = charPool.intern('X');
	setCellAt(next, 1, 0, xId, 0, 0, CellWidth.Narrow);
	// Clear damage to simulate no damage info
	next.damage = undefined;
	const diff = diffScreens(prev, next, {stylePool, fullDiff: true});
	const str = diffToString(optimize(diff));
	t.true(str.includes('X'));
});

// ---------------------------------------------------------------------------
// Optimizer
// ---------------------------------------------------------------------------

test('optimizer - merges consecutive stdout patches', t => {
	const result = optimize([
		{type: 'stdout', content: 'a'},
		{type: 'stdout', content: 'b'},
		{type: 'stdout', content: 'c'},
	]);
	t.is(result.length, 1);
	t.deepEqual(result[0], {type: 'stdout', content: 'abc'});
});

test('optimizer - removes empty stdout patches', t => {
	const result = optimize([
		{type: 'stdout', content: ''},
		{type: 'stdout', content: 'a'},
	]);
	t.is(result.length, 1);
});

test('optimizer - merges consecutive cursorMove', t => {
	const result = optimize([
		{type: 'cursorMove', x: 3, y: 0},
		{type: 'cursorMove', x: 0, y: 2},
	]);
	t.is(result.length, 1);
	t.deepEqual(result[0], {type: 'cursorMove', x: 3, y: 2});
});

test('optimizer - removes no-op cursorMove', t => {
	const result = optimize([
		{type: 'cursorMove', x: 0, y: 0},
	]);
	t.is(result.length, 0);
});

test('optimizer - cancels cursorHide + cursorShow pair', t => {
	const result = optimize([
		{type: 'cursorHide'},
		{type: 'cursorShow'},
	]);
	t.is(result.length, 0);
});

test('optimizer - deduplicates consecutive hyperlinks', t => {
	const result = optimize([
		{type: 'hyperlink', uri: 'https://example.com'},
		{type: 'hyperlink', uri: 'https://example.com'},
	]);
	t.is(result.length, 1);
});

test('optimizer - removes clear with count 0', t => {
	const result = optimize([
		{type: 'clear', count: 0},
	]);
	t.is(result.length, 0);
});
