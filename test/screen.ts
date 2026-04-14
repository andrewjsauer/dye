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
import Output from '../src/output.js';

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
	const id = pool.intern([42]); // Green background
	t.true(pool.isVisibleOnSpace(id));
});

test('StylePool - visible-on-space bit not set for foreground-only', t => {
	const pool = new StylePool();
	const id = pool.intern([31]); // Red foreground
	t.false(pool.isVisibleOnSpace(id));
});

test('StylePool - transition from default to styled', t => {
	const pool = new StylePool();
	const boldId = pool.intern([1]);
	const result = pool.transition(0, boldId);
	t.is(result, '\u001B[1m');
});

test('StylePool - transition from styled to default', t => {
	const pool = new StylePool();
	const boldId = pool.intern([1]);
	const result = pool.transition(boldId, 0);
	t.is(result, '\u001B[0m');
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
	t.deepEqual(screen.damage, {
		x: 3, y: 2, width: 1, height: 1,
	});
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
	t.true(str.includes('\u001B[1m')); // Bold SGR
	t.true(str.includes('A'));
	t.true(str.includes('\u001B[0m')); // Reset at end
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
	const result = optimize([{type: 'cursorMove', x: 0, y: 0}]);
	t.is(result.length, 0);
});

test('optimizer - cancels cursorHide + cursorShow pair', t => {
	const result = optimize([{type: 'cursorHide'}, {type: 'cursorShow'}]);
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
	const result = optimize([{type: 'clear', count: 0}]);
	t.is(result.length, 0);
});

// ---------------------------------------------------------------------------
// Review finding tests — testing gaps identified during code review
// ---------------------------------------------------------------------------

// --- shiftRows negative delta (scroll down) ---

test('Screen - shiftRows scrolls down (negative delta)', t => {
	const stylePool = new StylePool();
	const screen = createScreen(3, 4, stylePool);
	const aId = screen.charPool.intern('A');
	// Write 'A' at row 0
	setCellAt(screen, 0, 0, aId, 0, 0, CellWidth.Narrow);
	// Scroll down by 1 in region [0, 4)
	shiftRows(screen, 0, 4, -1);
	// 'A' should now be at row 1
	t.is(screen.charPool.resolve(getCellCharId(screen, 0, 1)), 'A');
	// Row 0 (top) should be blank
	t.is(getCellCharId(screen, 0, 0), 0);
});

test('Screen - shiftRows scroll down by 2', t => {
	const stylePool = new StylePool();
	const screen = createScreen(3, 5, stylePool);
	const bId = screen.charPool.intern('B');
	setCellAt(screen, 1, 0, bId, 0, 0, CellWidth.Narrow);
	setCellAt(screen, 1, 1, bId, 0, 0, CellWidth.Narrow);
	shiftRows(screen, 0, 5, -2);
	// Row 0 and 1 should be blank
	t.is(getCellCharId(screen, 1, 0), 0);
	t.is(getCellCharId(screen, 1, 1), 0);
	// Original rows 0,1 should now be at rows 2,3
	t.is(screen.charPool.resolve(getCellCharId(screen, 1, 2)), 'B');
	t.is(screen.charPool.resolve(getCellCharId(screen, 1, 3)), 'B');
});

// --- StylePool general transition (non-zero to non-zero) ---

test('StylePool - transition between two non-default styles', t => {
	const pool = new StylePool();
	const boldId = pool.intern([1]);
	const redId = pool.intern([31]);
	const result = pool.transition(boldId, redId);
	// Should reset then apply new style
	t.is(result, '\u001B[0m\u001B[31m');
});

test('StylePool - transition caches result', t => {
	const pool = new StylePool();
	const boldId = pool.intern([1]);
	const redId = pool.intern([31]);
	const first = pool.transition(boldId, redId);
	const second = pool.transition(boldId, redId);
	t.is(first, second);
});

// --- diff with hyperlinks ---

test('diff - hyperlink transition produces OSC 8 patches', t => {
	const stylePool = new StylePool();
	const charPool = new CharPool();
	const prev = createScreen(5, 1, stylePool, charPool);
	const next = createScreen(5, 1, stylePool, charPool);
	const aId = charPool.intern('A');
	const linkId = next.hyperlinkPool.intern('https://example.com');
	setCellAt(next, 0, 0, aId, 0, linkId, CellWidth.Narrow);
	const diff = diffScreens(prev, next, {stylePool});
	const str = diffToString(optimize(diff));
	// Should contain OSC 8 open and close
	t.true(str.includes('\u001B]8;;https://example.com\u001B\\'));
	t.true(str.includes('A'));
	// Should close hyperlink at end
	t.true(str.includes('\u001B]8;;\u001B\\'));
});

// --- diff with different dimensions ---

test('diff - height increase includes new rows', t => {
	const stylePool = new StylePool();
	const charPool = new CharPool();
	const prev = createScreen(5, 2, stylePool, charPool);
	const next = createScreen(5, 4, stylePool, charPool);
	const xId = charPool.intern('X');
	setCellAt(next, 0, 3, xId, 0, 0, CellWidth.Narrow);
	const diff = diffScreens(prev, next, {stylePool});
	const str = diffToString(optimize(diff));
	t.true(str.includes('X'));
});

test('diff - width increase includes new columns', t => {
	const stylePool = new StylePool();
	const charPool = new CharPool();
	const prev = createScreen(3, 2, stylePool, charPool);
	const next = createScreen(6, 2, stylePool, charPool);
	const yId = charPool.intern('Y');
	setCellAt(next, 4, 0, yId, 0, 0, CellWidth.Narrow);
	const diff = diffScreens(prev, next, {stylePool});
	const str = diffToString(optimize(diff));
	t.true(str.includes('Y'));
});

// --- diff with wide characters ---

test('diff - wide character advances cursor by 2', t => {
	const stylePool = new StylePool();
	const charPool = new CharPool();
	const prev = createScreen(6, 1, stylePool, charPool);
	const next = createScreen(6, 1, stylePool, charPool);
	const wideId = charPool.intern('中');
	const spacerId = charPool.intern('');
	const aId = charPool.intern('A');
	// Wide char at col 0, spacer at col 1, narrow char at col 2
	setCellAt(next, 0, 0, wideId, 0, 0, CellWidth.Wide);
	setCellAt(next, 1, 0, spacerId, 0, 0, CellWidth.SpacerTail);
	setCellAt(next, 2, 0, aId, 0, 0, CellWidth.Narrow);
	const diff = diffScreens(prev, next, {stylePool});
	const str = diffToString(optimize(diff));
	t.true(str.includes('中'));
	t.true(str.includes('A'));
});

// --- screenToString with SpacerTail ---

test('Screen - screenToString skips SpacerTail cells for wide chars', t => {
	const stylePool = new StylePool();
	const screen = createScreen(4, 1, stylePool);
	const wideId = screen.charPool.intern('中');
	const spacerId = screen.charPool.intern('');
	setCellAt(screen, 0, 0, wideId, 0, 0, CellWidth.Wide);
	setCellAt(screen, 1, 0, spacerId, 0, 0, CellWidth.SpacerTail);
	const str = screenToString(screen);
	// Should have the wide char once, not duplicated
	t.is(str.split('中').length, 2); // One occurrence means 2 parts after split
	// Should not contain the empty spacer as visible character
	t.false(str.includes('  中')); // No leading double-space
});

// --- optimizer cursorMove cancellation ---

test('optimizer - cancels cursorMove pair that sums to zero', t => {
	const result = optimize([
		{type: 'cursorMove', x: 3, y: 2},
		{type: 'cursorMove', x: -3, y: -2},
	]);
	t.is(result.length, 0);
});

// --- optimizer styleStr concatenation ---

test('optimizer - concatenates adjacent styleStr patches', t => {
	const result = optimize([
		{type: 'styleStr', str: '\u001B[1m'},
		{type: 'styleStr', str: '\u001B[31m'},
	]);
	t.is(result.length, 1);
	t.deepEqual(result[0], {type: 'styleStr', str: '\u001B[1m\u001B[31m'});
});

test('optimizer - removes empty styleStr patches', t => {
	const result = optimize([
		{type: 'styleStr', str: ''},
		{type: 'styleStr', str: '\u001B[1m'},
	]);
	t.is(result.length, 1);
	t.deepEqual(result[0], {type: 'styleStr', str: '\u001B[1m'});
});

// --- optimizer cursorTo collapse ---

test('optimizer - collapses consecutive cursorTo to last one', t => {
	const result = optimize([
		{type: 'cursorTo', col: 5},
		{type: 'cursorTo', col: 10},
	]);
	t.is(result.length, 1);
	t.deepEqual(result[0], {type: 'cursorTo', col: 10});
});

// --- optimizer cursorHide/Show non-adjacent should NOT cancel ---

test('optimizer - does not cancel cursorHide/Show with patches between', t => {
	const result = optimize([
		{type: 'cursorHide'},
		{type: 'stdout', content: 'x'},
		{type: 'cursorShow'},
	]);
	t.is(result.length, 3);
	t.deepEqual(result[0], {type: 'cursorHide'});
	t.deepEqual(result[2], {type: 'cursorShow'});
});

// ---------------------------------------------------------------------------
// Output dual-write tests — verify Screen buffer matches string output
// ---------------------------------------------------------------------------

test('Output - getScreen returns undefined before get()', t => {
	const output = new Output({width: 5, height: 1});
	t.is(output.getScreen(), undefined);
});

test('Output - getScreen returns Screen after get()', t => {
	const output = new Output({width: 5, height: 1});
	output.write(0, 0, 'hi', {transformers: []});
	output.get();
	const screen = output.getScreen();
	t.truthy(screen);
	t.is(screen!.width, 5);
	t.is(screen!.height, 1);
});

test('Output - Screen contains correct characters after write', t => {
	const output = new Output({width: 10, height: 1});
	output.write(0, 0, 'ABC', {transformers: []});
	output.get();
	const screen = output.getScreen()!;
	t.is(screen.charPool.resolve(getCellCharId(screen, 0, 0)), 'A');
	t.is(screen.charPool.resolve(getCellCharId(screen, 1, 0)), 'B');
	t.is(screen.charPool.resolve(getCellCharId(screen, 2, 0)), 'C');
	// Unwritten cell should be space (charId 0)
	t.is(getCellCharId(screen, 3, 0), 0);
});

test('Output - Screen handles multiline write', t => {
	const output = new Output({width: 5, height: 3});
	output.write(0, 0, 'ab\ncd\nef', {transformers: []});
	output.get();
	const screen = output.getScreen()!;
	t.is(screen.charPool.resolve(getCellCharId(screen, 0, 0)), 'a');
	t.is(screen.charPool.resolve(getCellCharId(screen, 1, 0)), 'b');
	t.is(screen.charPool.resolve(getCellCharId(screen, 0, 1)), 'c');
	t.is(screen.charPool.resolve(getCellCharId(screen, 1, 1)), 'd');
	t.is(screen.charPool.resolve(getCellCharId(screen, 0, 2)), 'e');
	t.is(screen.charPool.resolve(getCellCharId(screen, 1, 2)), 'f');
});

test('Output - Screen and string output agree on plain text content', t => {
	const output = new Output({width: 10, height: 2});
	output.write(1, 0, 'hello', {transformers: []});
	output.write(0, 1, 'world', {transformers: []});
	const {output: str} = output.get();
	const screen = output.getScreen()!;
	const screenStr = screenToString(screen);
	// Both should contain the same text (screen stripped of styles)
	t.true(str.includes('hello'));
	t.true(str.includes('world'));
	t.true(screenStr.includes('hello'));
	t.true(screenStr.includes('world'));
});

test('Output - Screen handles overlapping writes', t => {
	const output = new Output({width: 10, height: 1});
	output.write(0, 0, 'AAAA', {transformers: []});
	output.write(2, 0, 'BB', {transformers: []});
	output.get();
	const screen = output.getScreen()!;
	t.is(screen.charPool.resolve(getCellCharId(screen, 0, 0)), 'A');
	t.is(screen.charPool.resolve(getCellCharId(screen, 1, 0)), 'A');
	t.is(screen.charPool.resolve(getCellCharId(screen, 2, 0)), 'B');
	t.is(screen.charPool.resolve(getCellCharId(screen, 3, 0)), 'B');
});

test('Output - Screen clipping works', t => {
	const output = new Output({width: 10, height: 3});
	output.clip({
		x1: 2, x2: 5, y1: 0, y2: 2,
	});
	output.write(0, 0, 'ABCDEFGH', {transformers: []});
	output.unclip();
	output.get();
	const screen = output.getScreen()!;
	// Cells outside clip region should be empty (space)
	t.is(getCellCharId(screen, 0, 0), 0); // Before clip
	t.is(getCellCharId(screen, 1, 0), 0); // Before clip
	// Cells inside clip region should have content
	t.not(getCellCharId(screen, 2, 0), 0); // Inside clip
	t.not(getCellCharId(screen, 3, 0), 0); // Inside clip
	t.not(getCellCharId(screen, 4, 0), 0); // Inside clip
});
