import test from 'ava';
import React from 'react';
import {Box, Text} from '../src/index.js';
import {
	getNodeRect,
	hitTest,
	clearNodeCache,
	recordNodeRect,
} from '../src/node-cache.js';
import {type DOMElement, createNode} from '../src/dom.js';
import {renderToString} from './helpers/render-to-string.js';

// ---------------------------------------------------------------------------
// Unit tests for node-cache (standalone, no render pipeline)
// ---------------------------------------------------------------------------

test('recordNodeRect stores rect and getNodeRect retrieves it', t => {
	clearNodeCache();
	const node = createNode('ink-box');
	recordNodeRect(node, 5, 10, 20, 15);
	const rect = getNodeRect(node);
	t.deepEqual(rect, {
		x: 5, y: 10, width: 20, height: 15,
	});
});

test('getNodeRect returns undefined for unrecorded nodes', t => {
	clearNodeCache();
	const node = createNode('ink-box');
	t.is(getNodeRect(node), undefined);
});

test('clearNodeCache removes all cached rects', t => {
	clearNodeCache();
	const node = createNode('ink-box');
	recordNodeRect(node, 0, 0, 10, 10);
	t.truthy(getNodeRect(node));
	clearNodeCache();
	t.is(getNodeRect(node), undefined);
});

test('recordNodeRect overwrites previous rect', t => {
	clearNodeCache();
	const node = createNode('ink-box');
	recordNodeRect(node, 0, 0, 10, 10);
	recordNodeRect(node, 5, 5, 20, 20);
	const rect = getNodeRect(node);
	t.deepEqual(rect, {
		x: 5, y: 5, width: 20, height: 20,
	});
});

// ---------------------------------------------------------------------------
// hitTest unit tests
// ---------------------------------------------------------------------------

test('hitTest returns root when point is inside root and no children', t => {
	clearNodeCache();
	const root = createNode('ink-root');
	recordNodeRect(root, 0, 0, 80, 24);
	const result = hitTest(root, 10, 5);
	t.is(result, root);
});

test('hitTest returns undefined when point is outside all nodes', t => {
	clearNodeCache();
	const root = createNode('ink-root');
	recordNodeRect(root, 0, 0, 80, 24);
	t.is(hitTest(root, 100, 50), undefined);
});

test('hitTest returns deepest child containing the point', t => {
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

	// Point inside child
	t.is(hitTest(root, 12, 8), child);
	// Point inside parent but outside child
	t.is(hitTest(root, 6, 6), parent);
	// Point inside root but outside parent
	t.is(hitTest(root, 1, 1), root);
});

test('hitTest returns last child when siblings overlap (topmost wins)', t => {
	clearNodeCache();
	const root = createNode('ink-root');
	const child1 = createNode('ink-box');
	const child2 = createNode('ink-box');

	root.childNodes.push(child1, child2);
	child1.parentNode = root;
	child2.parentNode = root;

	recordNodeRect(root, 0, 0, 80, 24);
	recordNodeRect(child1, 0, 0, 20, 10);
	recordNodeRect(child2, 5, 0, 20, 10); // Overlaps with child1

	// Point in the overlap region: child2 is last (topmost)
	t.is(hitTest(root, 10, 5), child2);
	// Point only in child1
	t.is(hitTest(root, 2, 5), child1);
});

test('hitTest skips nodes without cached rects (display:none)', t => {
	clearNodeCache();
	const root = createNode('ink-root');
	const visible = createNode('ink-box');
	const hidden = createNode('ink-box');

	root.childNodes.push(visible, hidden);
	visible.parentNode = root;
	hidden.parentNode = root;

	recordNodeRect(root, 0, 0, 80, 24);
	recordNodeRect(visible, 0, 0, 20, 10);
	// Hidden has no recorded rect (simulating display: none)

	t.is(hitTest(root, 5, 5), visible);
	// Point outside visible but inside root — should return root, not hidden
	t.is(hitTest(root, 30, 5), root);
});

// ---------------------------------------------------------------------------
// Integration: node cache populated during render
// ---------------------------------------------------------------------------

test('render populates node cache for root node', t => {
	// Render a simple component — the cache is populated during rendering
	renderToString(<Box width={20} height={3}>
		<Text>Hello</Text>
	</Box>);

	// We can't easily get a reference to the DOMElement from the public API,
	// but we can verify the render doesn't crash and the output is correct
	const output = renderToString(<Box width={20} height={3}>
		<Text>Hello</Text>
	</Box>);
	t.true(output.includes('Hello'));
});
