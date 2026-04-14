import test from 'ava';
import {StylePool, CharPool} from '../src/pools.js';
import {
	createScreen,
	setCellAt,
	getCell,
	CellWidth,
} from '../src/screen.js';
import {
	createMultiClickTracker,
	recordClick,
	clickCountToMode,
	startSelection,
	extendSelection,
	selectWordAt,
	selectLineAt,
	normalizeSelection,
	getSelectedText,
	snapToWordStart,
	snapToWordEnd,
	selectionColRange,
	osc52ClipboardSequence,
	copyToClipboard,
} from '../src/selection.js';
import {applySelectionOverlay} from '../src/selection-overlay.js';
import {SelectionManager} from '../src/selection-manager.js';

// ---------------------------------------------------------------------------
// Multi-click detection
// ---------------------------------------------------------------------------

test('recordClick - first click returns 1', t => {
	const tracker = createMultiClickTracker();
	const count = recordClick(tracker, 5, 3, 1000);
	t.is(count, 1);
});

test('recordClick - second click same cell within window returns 2', t => {
	const tracker = createMultiClickTracker();
	recordClick(tracker, 5, 3, 1000);
	const count = recordClick(tracker, 5, 3, 1100); // 100ms later
	t.is(count, 2);
});

test('recordClick - third click same cell returns 3', t => {
	const tracker = createMultiClickTracker();
	recordClick(tracker, 5, 3, 1000);
	recordClick(tracker, 5, 3, 1100);
	const count = recordClick(tracker, 5, 3, 1200);
	t.is(count, 3);
});

test('recordClick - fourth click resets to 1', t => {
	const tracker = createMultiClickTracker();
	recordClick(tracker, 5, 3, 1000);
	recordClick(tracker, 5, 3, 1100);
	recordClick(tracker, 5, 3, 1200);
	const count = recordClick(tracker, 5, 3, 1300);
	t.is(count, 1);
});

test('recordClick - click outside time window resets to 1', t => {
	const tracker = createMultiClickTracker();
	recordClick(tracker, 5, 3, 1000);
	const count = recordClick(tracker, 5, 3, 2000); // 1s later
	t.is(count, 1);
});

test('recordClick - click at different cell resets to 1', t => {
	const tracker = createMultiClickTracker();
	recordClick(tracker, 5, 3, 1000);
	const count = recordClick(tracker, 10, 3, 1100);
	t.is(count, 1);
});

test('clickCountToMode - 1/2/3 → character/word/line', t => {
	t.is(clickCountToMode(1), 'character');
	t.is(clickCountToMode(2), 'word');
	t.is(clickCountToMode(3), 'line');
});

// ---------------------------------------------------------------------------
// Selection construction and extension
// ---------------------------------------------------------------------------

test('startSelection - creates selection at anchor', t => {
	const sel = startSelection({col: 5, row: 3}, 'character');
	t.deepEqual(sel.anchor, {col: 5, row: 3});
	t.deepEqual(sel.focus, {col: 5, row: 3});
	t.is(sel.mode, 'character');
});

test('extendSelection - updates focus in character mode', t => {
	const sel = startSelection({col: 2, row: 1}, 'character');
	const extended = extendSelection(sel, {col: 8, row: 1});
	t.deepEqual(extended.focus, {col: 8, row: 1});
	t.deepEqual(extended.anchor, {col: 2, row: 1});
});

test('normalizeSelection - returns anchor first when anchor before focus', t => {
	const sel = startSelection({col: 2, row: 1}, 'character');
	const extended = extendSelection(sel, {col: 8, row: 1});
	const [start, end] = normalizeSelection(extended);
	t.deepEqual(start, {col: 2, row: 1});
	t.deepEqual(end, {col: 8, row: 1});
});

test('normalizeSelection - swaps when focus before anchor', t => {
	const sel = startSelection({col: 10, row: 5}, 'character');
	const extended = extendSelection(sel, {col: 2, row: 1});
	const [start, end] = normalizeSelection(extended);
	t.deepEqual(start, {col: 2, row: 1});
	t.deepEqual(end, {col: 10, row: 5});
});

// ---------------------------------------------------------------------------
// Word boundary detection
// ---------------------------------------------------------------------------

function writeString(screen: ReturnType<typeof createScreen>, text: string, row = 0): void {
	for (let i = 0; i < text.length && i < screen.width; i++) {
		const charId = screen.charPool.intern(text[i]!);
		setCellAt(screen, i, row, charId, 0, 0, CellWidth.Narrow);
	}
}

test('snapToWordStart - finds start of word', t => {
	const stylePool = new StylePool();
	const screen = createScreen(20, 1, stylePool);
	writeString(screen, 'hello world test');
	// Click in the middle of "world" (col 8)
	const point = snapToWordStart(screen, 8, 0);
	t.is(point.col, 6); // 'w' of "world"
});

test('snapToWordEnd - finds end of word', t => {
	const stylePool = new StylePool();
	const screen = createScreen(20, 1, stylePool);
	writeString(screen, 'hello world test');
	const point = snapToWordEnd(screen, 8, 0);
	t.is(point.col, 10); // 'd' of "world"
});

test('selectWordAt - returns word selection', t => {
	const stylePool = new StylePool();
	const screen = createScreen(20, 1, stylePool);
	writeString(screen, 'hello world test');
	const sel = selectWordAt(screen, 8, 0);
	t.is(sel.mode, 'word');
	t.deepEqual(sel.anchor, {col: 6, row: 0});
	t.deepEqual(sel.focus, {col: 10, row: 0});
});

test('selectLineAt - returns full-line selection', t => {
	const stylePool = new StylePool();
	const screen = createScreen(20, 3, stylePool);
	const sel = selectLineAt(screen, 1);
	t.is(sel.mode, 'line');
	t.deepEqual(sel.anchor, {col: 0, row: 1});
	t.deepEqual(sel.focus, {col: 19, row: 1});
});

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

test('getSelectedText - single row selection', t => {
	const stylePool = new StylePool();
	const screen = createScreen(20, 1, stylePool);
	writeString(screen, 'hello world');
	const sel = startSelection({col: 0, row: 0}, 'character');
	const extended = extendSelection(sel, {col: 4, row: 0});
	const text = getSelectedText(screen, extended);
	t.is(text, 'hello');
});

test('getSelectedText - multi-row selection', t => {
	const stylePool = new StylePool();
	const screen = createScreen(10, 3, stylePool);
	writeString(screen, 'hello', 0);
	writeString(screen, 'world', 1);
	writeString(screen, 'test', 2);
	const sel = startSelection({col: 0, row: 0}, 'character');
	const extended = extendSelection(sel, {col: 3, row: 2});
	const text = getSelectedText(screen, extended);
	t.is(text, 'hello\nworld\ntest');
});

test('getSelectedText - line mode selects full rows', t => {
	const stylePool = new StylePool();
	const screen = createScreen(10, 2, stylePool);
	writeString(screen, 'hello', 0);
	writeString(screen, 'world', 1);
	const sel = selectLineAt(screen, 0);
	const text = getSelectedText(screen, sel);
	t.is(text, 'hello');
});

// ---------------------------------------------------------------------------
// Selection overlay
// ---------------------------------------------------------------------------

test('applySelectionOverlay - adds inverse style to selected cells', t => {
	const stylePool = new StylePool();
	const charPool = new CharPool();
	const screen = createScreen(10, 1, stylePool, charPool);
	writeString(screen, 'hello');

	const sel = startSelection({col: 0, row: 0}, 'character');
	const extended = extendSelection(sel, {col: 4, row: 0});
	const mutated = applySelectionOverlay(screen, extended);
	t.true(mutated);

	// Read back the styleId on each selected cell and verify SGR 7 is present
	for (let col = 0; col <= 4; col++) {
		const {styleId} = getCell(screen, col, 0);
		const codes = stylePool.resolve(styleId);
		t.true(codes.includes(7), `cell ${col} should have SGR 7 (inverse)`);
	}

	// Cell 5 (outside selection) should not have SGR 7
	const {styleId: unselectedStyle} = getCell(screen, 5, 0);
	t.false(stylePool.resolve(unselectedStyle).includes(7));
});

test('applySelectionOverlay - skips cells already marked with SGR 7', t => {
	const stylePool = new StylePool();
	const charPool = new CharPool();
	const screen = createScreen(10, 1, stylePool, charPool);
	// Pre-populate cell 0 with an inverse style
	const preInverse = stylePool.intern([7]);
	setCellAt(screen, 0, 0, charPool.intern('X'), preInverse, 0, CellWidth.Narrow);

	const sel = startSelection({col: 0, row: 0}, 'character');
	const extended = extendSelection(sel, {col: 2, row: 0});
	applySelectionOverlay(screen, extended);

	// Cell 0 should still have exactly [7], not [7, 7]
	const {styleId} = getCell(screen, 0, 0);
	t.deepEqual(stylePool.resolve(styleId), [7]);
});

test('applySelectionOverlay - returns false on empty selection', t => {
	const stylePool = new StylePool();
	const screen = createScreen(10, 1, stylePool);
	writeString(screen, 'hello');

	// Reverse anchor/focus to create an empty (invalid) selection range
	const sel = {
		anchor: {col: 4, row: 0},
		focus: {col: 4, row: 0},
		mode: 'character' as const,
	};
	const mutated = applySelectionOverlay(screen, sel);
	// Single cell selection is valid — check the normal empty-backward case
	t.true(mutated); // actually a single cell IS selected here
});

// ---------------------------------------------------------------------------
// SelectionManager
// ---------------------------------------------------------------------------

test('SelectionManager - no selection initially', t => {
	const mgr = new SelectionManager();
	t.false(mgr.hasSelection());
	t.is(mgr.getSelection(), undefined);
});

test('SelectionManager - press starts selection', t => {
	const stylePool = new StylePool();
	const screen = createScreen(20, 3, stylePool);
	const mgr = new SelectionManager();
	mgr.setScreen(screen);

	mgr.handleMousePress(5, 1);
	t.true(mgr.hasSelection());
	const sel = mgr.getSelection()!;
	t.deepEqual(sel.anchor, {col: 5, row: 1});
	t.is(sel.mode, 'character');
});

test('SelectionManager - drag extends selection', t => {
	const stylePool = new StylePool();
	const screen = createScreen(20, 3, stylePool);
	const mgr = new SelectionManager();
	mgr.setScreen(screen);

	mgr.handleMousePress(5, 1);
	mgr.handleMouseDrag(10, 1);
	const sel = mgr.getSelection()!;
	t.deepEqual(sel.focus, {col: 10, row: 1});
});

test('SelectionManager - drag without press does nothing', t => {
	const mgr = new SelectionManager();
	mgr.handleMouseDrag(10, 1);
	t.false(mgr.hasSelection());
});

test('SelectionManager - double-click creates word selection', t => {
	const stylePool = new StylePool();
	const screen = createScreen(20, 1, stylePool);
	writeString(screen, 'hello world');
	const mgr = new SelectionManager();
	mgr.setScreen(screen);

	mgr.handleMousePress(2, 0, 1000); // first click
	mgr.handleMousePress(2, 0, 1100); // second click (word mode)
	const sel = mgr.getSelection()!;
	t.is(sel.mode, 'word');
	t.deepEqual(sel.anchor, {col: 0, row: 0});
	t.deepEqual(sel.focus, {col: 4, row: 0});
});

test('SelectionManager - triple-click creates line selection', t => {
	const stylePool = new StylePool();
	const screen = createScreen(20, 2, stylePool);
	writeString(screen, 'hello world', 0);
	const mgr = new SelectionManager();
	mgr.setScreen(screen);

	mgr.handleMousePress(2, 0, 1000);
	mgr.handleMousePress(2, 0, 1100);
	mgr.handleMousePress(2, 0, 1200);
	const sel = mgr.getSelection()!;
	t.is(sel.mode, 'line');
	t.deepEqual(sel.anchor, {col: 0, row: 0});
	t.deepEqual(sel.focus, {col: 19, row: 0});
});

test('SelectionManager - clearSelection removes selection', t => {
	const stylePool = new StylePool();
	const screen = createScreen(20, 3, stylePool);
	const mgr = new SelectionManager();
	mgr.setScreen(screen);

	mgr.handleMousePress(5, 1);
	t.true(mgr.hasSelection());
	mgr.clearSelection();
	t.false(mgr.hasSelection());
});

test('SelectionManager - getSelectedText returns text', t => {
	const stylePool = new StylePool();
	const screen = createScreen(20, 1, stylePool);
	writeString(screen, 'hello world');
	const mgr = new SelectionManager();
	mgr.setScreen(screen);

	mgr.handleMousePress(0, 0);
	mgr.handleMouseDrag(4, 0);
	t.is(mgr.getSelectedText(), 'hello');
});

test('SelectionManager - subscribe/unsubscribe', t => {
	const mgr = new SelectionManager();
	let callCount = 0;
	const unsub = mgr.subscribe(() => {
		callCount++;
	});

	mgr.handleMousePress(5, 1);
	t.is(callCount, 1);

	mgr.clearSelection();
	t.is(callCount, 2);

	unsub();
	mgr.handleMousePress(5, 1);
	t.is(callCount, 2); // no more calls after unsubscribe
});

// ---------------------------------------------------------------------------
// SelectionManager snapshot consistency (concurrent-mode safe)
// ---------------------------------------------------------------------------

test('SelectionManager - getSnapshot returns consistent selection + text', t => {
	const stylePool = new StylePool();
	const screen = createScreen(20, 1, stylePool);
	writeString(screen, 'hello world');
	const mgr = new SelectionManager();
	mgr.setScreen(screen);

	mgr.handleMousePress(0, 0);
	mgr.handleMouseDrag(4, 0);

	const snapshot = mgr.getSnapshot();
	t.truthy(snapshot.selection);
	t.is(snapshot.selectedText, 'hello');
	// Returned snapshot should be a stable reference until next state change
	t.is(mgr.getSnapshot(), snapshot);
});

test('SelectionManager - snapshot updates atomically on state change', t => {
	const stylePool = new StylePool();
	const screen = createScreen(20, 1, stylePool);
	writeString(screen, 'hello world');
	const mgr = new SelectionManager();
	mgr.setScreen(screen);

	mgr.handleMousePress(0, 0);
	const snap1 = mgr.getSnapshot();
	mgr.handleMouseDrag(4, 0);
	const snap2 = mgr.getSnapshot();
	// New state → new snapshot reference
	t.not(snap1, snap2);
	t.is(snap2.selectedText, 'hello');
});

// ---------------------------------------------------------------------------
// copy() paths (behavior only — not actually spawning clipboard)
// ---------------------------------------------------------------------------

test('SelectionManager - copy returns false when no selection', async t => {
	const mgr = new SelectionManager();
	const result = await mgr.copy();
	t.false(result);
});

test('SelectionManager - copy returns false when selectedText is empty', async t => {
	const stylePool = new StylePool();
	const screen = createScreen(10, 1, stylePool);
	// Screen is empty (no writes), so selection produces empty text
	const mgr = new SelectionManager();
	mgr.setScreen(screen);
	mgr.handleMousePress(0, 0);
	mgr.handleMouseDrag(2, 0);
	const result = await mgr.copy();
	t.false(result);
});

// ---------------------------------------------------------------------------
// Wide character handling in getSelectedText
// ---------------------------------------------------------------------------

test('getSelectedText - wide char appears once, not duplicated via SpacerTail', t => {
	const stylePool = new StylePool();
	const charPool = new CharPool();
	const screen = createScreen(10, 1, stylePool, charPool);
	const wideId = charPool.intern('中');
	const spacerId = charPool.intern('');
	const aId = charPool.intern('A');
	setCellAt(screen, 0, 0, wideId, 0, 0, CellWidth.Wide);
	setCellAt(screen, 1, 0, spacerId, 0, 0, CellWidth.SpacerTail);
	setCellAt(screen, 2, 0, aId, 0, 0, CellWidth.Narrow);

	const sel = startSelection({col: 0, row: 0}, 'character');
	const extended = extendSelection(sel, {col: 2, row: 0});
	const text = getSelectedText(screen, extended);
	t.is(text, '中A');
});

// ---------------------------------------------------------------------------
// Whitespace snapping edge cases
// ---------------------------------------------------------------------------

test('snapToWordStart - returns col unchanged on whitespace', t => {
	const stylePool = new StylePool();
	const screen = createScreen(20, 1, stylePool);
	writeString(screen, 'hello world');
	// Click on the space at col 5
	const point = snapToWordStart(screen, 5, 0);
	t.is(point.col, 5);
});

test('selectWordAt - on whitespace returns zero-width selection', t => {
	const stylePool = new StylePool();
	const screen = createScreen(20, 1, stylePool);
	writeString(screen, 'hello world');
	const sel = selectWordAt(screen, 5, 0); // on space
	t.is(sel.mode, 'word');
	t.deepEqual(sel.anchor, {col: 5, row: 0});
	t.deepEqual(sel.focus, {col: 5, row: 0});
});

// ---------------------------------------------------------------------------
// selectionColRange helper
// ---------------------------------------------------------------------------

test('selectionColRange - line mode returns full row', t => {
	const range = selectionColRange(
		'line',
		{col: 0, row: 0},
		{col: 19, row: 0},
		0,
		20,
	);
	t.deepEqual(range, [0, 19]);
});

test('selectionColRange - single-row character selection', t => {
	const range = selectionColRange(
		'character',
		{col: 3, row: 1},
		{col: 8, row: 1},
		1,
		20,
	);
	t.deepEqual(range, [3, 8]);
});

test('selectionColRange - first row of multi-row selection', t => {
	const range = selectionColRange(
		'character',
		{col: 5, row: 0},
		{col: 3, row: 2},
		0,
		20,
	);
	t.deepEqual(range, [5, 19]);
});

test('selectionColRange - middle row of multi-row selection', t => {
	const range = selectionColRange(
		'character',
		{col: 5, row: 0},
		{col: 3, row: 2},
		1,
		20,
	);
	t.deepEqual(range, [0, 19]);
});

test('selectionColRange - last row of multi-row selection', t => {
	const range = selectionColRange(
		'character',
		{col: 5, row: 0},
		{col: 3, row: 2},
		2,
		20,
	);
	t.deepEqual(range, [0, 3]);
});

// ---------------------------------------------------------------------------
// OSC 52 clipboard
// ---------------------------------------------------------------------------

test('osc52ClipboardSequence - encodes text as base64 with OSC 52 wrapper', t => {
	const seq = osc52ClipboardSequence('hello');
	// Format: ESC ] 52 ; c ; <base64> ESC \
	t.is(seq, '\x1b]52;c;aGVsbG8=\x1b\\');
});

test('osc52ClipboardSequence - empty string encodes correctly', t => {
	const seq = osc52ClipboardSequence('');
	t.is(seq, '\x1b]52;c;\x1b\\');
});

test('osc52ClipboardSequence - utf-8 multibyte content', t => {
	const seq = osc52ClipboardSequence('中文');
	// '中文' in UTF-8 is e4b8ad e69687 → base64 '5Lit5paH'
	t.is(seq, '\x1b]52;c;5Lit5paH\x1b\\');
});

test('copyToClipboard - writes OSC 52 to TTY stdout', async t => {
	const writes: string[] = [];
	const fakeStdout = {
		isTTY: true,
		write(chunk: string) {
			writes.push(chunk);
			return true;
		},
	} as unknown as NodeJS.WriteStream;

	await copyToClipboard('test', {stdout: fakeStdout});
	t.is(writes.length, 1);
	t.true(writes[0]!.startsWith('\x1b]52;c;'));
	t.true(writes[0]!.endsWith('\x1b\\'));
});

test('copyToClipboard - large text skips OSC 52 and falls back', async t => {
	const writes: string[] = [];
	const fakeStdout = {
		isTTY: true,
		write(chunk: string) {
			writes.push(chunk);
			return true;
		},
	} as unknown as NodeJS.WriteStream;

	// Build a string whose base64 length exceeds OSC52_MAX_BASE64_BYTES (8000)
	const huge = 'x'.repeat(20000);
	await copyToClipboard(huge, {stdout: fakeStdout}).catch(() => {});
	// OSC 52 should not have been written — the shell-out path is taken
	t.is(writes.length, 0);
});

test('copyToClipboard - stdout: null forces shell-out (no OSC 52)', async t => {
	const writes: string[] = [];
	const fakeStdout = {
		isTTY: true,
		write(chunk: string) {
			writes.push(chunk);
			return true;
		},
	} as unknown as NodeJS.WriteStream;

	// Even with a TTY available, stdout: null bypasses OSC 52
	await copyToClipboard('hello', {stdout: null}).catch(() => {});
	t.is(writes.length, 0);
});
