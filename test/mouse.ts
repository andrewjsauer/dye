import test from 'ava';
import {parseMouse, MOUSE_ENABLE, MOUSE_DISABLE} from '../src/mouse.js';
import {ClickEvent} from '../src/events/click-event.js';
import {DyeEvent} from '../src/events/event.js';
import {
	dispatchClick,
	dispatchHover,
	resetHoverState,
} from '../src/events/dispatch.js';
import {createNode} from '../src/dom.js';
import {recordNodeRect, clearNodeCache} from '../src/node-cache.js';

// ---------------------------------------------------------------------------
// Mouse parsing
// ---------------------------------------------------------------------------

test('parseMouse - left press', t => {
	const result = parseMouse('\u001B[<0;5;10M');
	t.truthy(result);
	t.is(result!.button, 'left');
	t.is(result!.action, 'press');
	t.is(result!.col, 4); // 5 - 1 (0-indexed)
	t.is(result!.row, 9); // 10 - 1
	t.false(result!.shift);
	t.false(result!.alt);
	t.false(result!.ctrl);
});

test('parseMouse - left release', t => {
	const result = parseMouse('\u001B[<0;5;10m');
	t.truthy(result);
	t.is(result!.button, 'left');
	t.is(result!.action, 'release');
});

test('parseMouse - middle press', t => {
	const result = parseMouse('\u001B[<1;1;1M');
	t.truthy(result);
	t.is(result!.button, 'middle');
	t.is(result!.action, 'press');
});

test('parseMouse - right press', t => {
	const result = parseMouse('\u001B[<2;1;1M');
	t.truthy(result);
	t.is(result!.button, 'right');
	t.is(result!.action, 'press');
});

test('parseMouse - wheel up', t => {
	const result = parseMouse('\u001B[<64;10;20M');
	t.truthy(result);
	t.is(result!.action, 'wheel-up');
	t.is(result!.button, 'none');
});

test('parseMouse - wheel down', t => {
	const result = parseMouse('\u001B[<65;10;20M');
	t.truthy(result);
	t.is(result!.action, 'wheel-down');
});

test('parseMouse - drag with left button', t => {
	const result = parseMouse('\u001B[<32;15;25M');
	t.truthy(result);
	t.is(result!.action, 'drag');
	t.is(result!.button, 'left');
});

test('parseMouse - shift modifier', t => {
	const result = parseMouse('\u001B[<4;1;1M');
	t.truthy(result);
	t.true(result!.shift);
	t.false(result!.alt);
	t.false(result!.ctrl);
});

test('parseMouse - alt modifier', t => {
	const result = parseMouse('\u001B[<8;1;1M');
	t.truthy(result);
	t.true(result!.alt);
});

test('parseMouse - ctrl modifier', t => {
	const result = parseMouse('\u001B[<16;1;1M');
	t.truthy(result);
	t.true(result!.ctrl);
});

test('parseMouse - combined modifiers', t => {
	// Shift (4) + alt (8) + ctrl (16) = 28
	const result = parseMouse('\u001B[<28;1;1M');
	t.truthy(result);
	t.true(result!.shift);
	t.true(result!.alt);
	t.true(result!.ctrl);
});

test('parseMouse - returns undefined for non-mouse input', t => {
	t.is(parseMouse('hello'), undefined);
	t.is(parseMouse('\u001B[A'), undefined); // Arrow key
	t.is(parseMouse(''), undefined);
});

test('parseMouse - large coordinates', t => {
	const result = parseMouse('\u001B[<0;300;200M');
	t.truthy(result);
	t.is(result!.col, 299);
	t.is(result!.row, 199);
});

// ---------------------------------------------------------------------------
// Mouse enable/disable sequences
// ---------------------------------------------------------------------------

test('MOUSE_ENABLE contains expected DEC private modes', t => {
	t.true(MOUSE_ENABLE.includes('\u001B[?1000h'));
	t.true(MOUSE_ENABLE.includes('\u001B[?1002h'));
	t.true(MOUSE_ENABLE.includes('\u001B[?1006h'));
});

test('MOUSE_DISABLE contains expected DEC private modes', t => {
	t.true(MOUSE_DISABLE.includes('\u001B[?1000l'));
	t.true(MOUSE_DISABLE.includes('\u001B[?1002l'));
	t.true(MOUSE_DISABLE.includes('\u001B[?1006l'));
});

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

test('DyeEvent - propagation control', t => {
	const event = new DyeEvent('test');
	t.false(event.isPropagationStopped());
	t.false(event.isImmediatePropagationStopped());
	event.stopPropagation();
	t.true(event.isPropagationStopped());
	t.false(event.isImmediatePropagationStopped());
});

test('DyeEvent - immediate propagation control', t => {
	const event = new DyeEvent('test');
	event.stopImmediatePropagation();
	t.true(event.isPropagationStopped());
	t.true(event.isImmediatePropagationStopped());
});

test('ClickEvent - stores coordinates', t => {
	const event = new ClickEvent({col: 10, row: 5});
	t.is(event.col, 10);
	t.is(event.row, 5);
	t.is(event.localCol, 10);
	t.is(event.localRow, 5);
	t.is(event.button, 'left'); // Default
	t.is(event.type, 'click');
});

test('ClickEvent - updateLocalCoords', t => {
	const event = new ClickEvent({col: 10, row: 5});
	event.updateLocalCoords({
		x: 3, y: 2, width: 20, height: 10,
	});
	t.is(event.localCol, 7); // 10 - 3
	t.is(event.localRow, 3); // 5 - 2
});

// ---------------------------------------------------------------------------
// Click dispatch
// ---------------------------------------------------------------------------

test('dispatchClick - fires onClick on hit node', t => {
	clearNodeCache();
	const root = createNode('ink-root');
	const box = createNode('ink-box');
	root.childNodes.push(box);
	box.parentNode = root;

	recordNodeRect(root, 0, 0, 80, 24);
	recordNodeRect(box, 5, 5, 20, 10);

	let clicked = false;
	box._eventHandlers = {
		onClick() {
			clicked = true;
		},
	};

	const handled = dispatchClick(root, 10, 8);
	t.true(handled);
	t.true(clicked);
});

test('dispatchClick - bubbles to parent', t => {
	clearNodeCache();
	const root = createNode('ink-root');
	const parent = createNode('ink-box');
	const child = createNode('ink-box');

	root.childNodes.push(parent);
	parent.parentNode = root;
	parent.childNodes.push(child);
	child.parentNode = parent;

	recordNodeRect(root, 0, 0, 80, 24);
	recordNodeRect(parent, 5, 5, 30, 10);
	recordNodeRect(child, 10, 7, 15, 5);

	let parentClicked = false;
	parent._eventHandlers = {
		onClick() {
			parentClicked = true;
		},
	};

	// Click on child — should bubble to parent
	dispatchClick(root, 12, 8);
	t.true(parentClicked);
});

test('dispatchClick - stopImmediatePropagation prevents parent', t => {
	clearNodeCache();
	const root = createNode('ink-root');
	const parent = createNode('ink-box');
	const child = createNode('ink-box');

	root.childNodes.push(parent);
	parent.parentNode = root;
	parent.childNodes.push(child);
	child.parentNode = parent;

	recordNodeRect(root, 0, 0, 80, 24);
	recordNodeRect(parent, 0, 0, 80, 24);
	recordNodeRect(child, 5, 5, 20, 10);

	let parentClicked = false;
	child._eventHandlers = {
		onClick(event: ClickEvent) {
			event.stopImmediatePropagation();
		},
	};
	parent._eventHandlers = {
		onClick() {
			parentClicked = true;
		},
	};

	dispatchClick(root, 10, 8);
	t.false(parentClicked);
});

test('dispatchClick - returns false when clicking empty space', t => {
	clearNodeCache();
	const root = createNode('ink-root');
	recordNodeRect(root, 0, 0, 80, 24);

	// Click on root with no handlers
	const handled = dispatchClick(root, 10, 10);
	t.false(handled);
});

test('dispatchClick - updates localCol/localRow per node', t => {
	clearNodeCache();
	const root = createNode('ink-root');
	const box = createNode('ink-box');
	root.childNodes.push(box);
	box.parentNode = root;

	recordNodeRect(root, 0, 0, 80, 24);
	recordNodeRect(box, 10, 5, 20, 10);

	let localCol = -1;
	let localRow = -1;
	box._eventHandlers = {
		onClick(event: ClickEvent) {
			localCol = event.localCol;
			localRow = event.localRow;
		},
	};

	dispatchClick(root, 15, 8);
	t.is(localCol, 5); // 15 - 10
	t.is(localRow, 3); // 8 - 5
});

// ---------------------------------------------------------------------------
// Hover dispatch
// ---------------------------------------------------------------------------

test('dispatchHover - fires onMouseEnter and onMouseLeave', t => {
	clearNodeCache();
	resetHoverState();

	const root = createNode('ink-root');
	const box = createNode('ink-box');
	root.childNodes.push(box);
	box.parentNode = root;

	recordNodeRect(root, 0, 0, 80, 24);
	recordNodeRect(box, 5, 5, 20, 10);

	let entered = false;
	let left = false;
	box._eventHandlers = {
		onMouseEnter() {
			entered = true;
		},
		onMouseLeave() {
			left = true;
		},
	};

	// Move into box
	dispatchHover(root, 10, 8);
	t.true(entered);
	t.false(left);

	// Move out of box
	entered = false;
	dispatchHover(root, 1, 1);
	t.true(left);
});

test('dispatchHover - no redundant events on same node', t => {
	clearNodeCache();
	resetHoverState();

	const root = createNode('ink-root');
	const box = createNode('ink-box');
	root.childNodes.push(box);
	box.parentNode = root;

	recordNodeRect(root, 0, 0, 80, 24);
	recordNodeRect(box, 0, 0, 40, 12);

	let enterCount = 0;
	box._eventHandlers = {
		onMouseEnter() {
			enterCount++;
		},
	};

	dispatchHover(root, 5, 5);
	dispatchHover(root, 10, 8); // Still in same box
	t.is(enterCount, 1); // Only entered once
});
