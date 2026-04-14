/**
 * Event dispatch — routes mouse events through the component tree.
 *
 * Click events bubble from the deepest hit node up through parentNode.
 * Hover events (mouseEnter/mouseLeave) are non-bubbling.
 */

import {type DOMElement} from '../dom.js';
import {hitTest, getNodeRect} from '../node-cache.js';
import {ClickEvent} from './click-event.js';

/**
 * Dispatch a click event at screen coordinates (col, row).
 *
 * 1. Hit-test to find the deepest node at (col, row)
 * 2. Create a ClickEvent
 * 3. Bubble from the hit node up through parentNode
 * 4. At each node, update localCol/localRow and invoke onClick handler
 *
 * Returns true if any handler was invoked.
 */
export function dispatchClick(
	root: DOMElement,
	col: number,
	row: number,
	options?: {
		button?: 'left' | 'middle' | 'right';
		shift?: boolean;
		alt?: boolean;
		ctrl?: boolean;
	},
): boolean {
	const target = hitTest(root, col, row);
	if (!target) {
		return false;
	}

	const event = new ClickEvent({
		col,
		row,
		button: options?.button,
		shift: options?.shift,
		alt: options?.alt,
		ctrl: options?.ctrl,
	});

	event.target = target;

	// Bubble from target up through ancestors
	let node: DOMElement | undefined = target;
	let handled = false;

	while (node) {
		if (event.isImmediatePropagationStopped()) {
			break;
		}

		if (event.isPropagationStopped() && node !== target) {
			break;
		}

		event.currentTarget = node;

		// Update local coordinates relative to this node's rect
		const rect = getNodeRect(node);
		if (rect) {
			event.updateLocalCoords(rect);
		}

		// Invoke onClick handler if present
		const handler = node._eventHandlers?.['onClick'];
		if (handler) {
			handler(event);
			handled = true;
		}

		node = node.parentNode;
	}

	return handled;
}

/**
 * Track hover state and dispatch mouseEnter/mouseLeave events.
 *
 * Call this on every mouse motion event with the current coordinates.
 * It computes the new hover node via hit-test, diffs against the
 * previous hover set, and fires enter/leave callbacks.
 *
 * mouseEnter/mouseLeave are non-bubbling (like DOM mouseenter/mouseleave).
 */
let currentHoverNode: DOMElement | undefined;

export function dispatchHover(
	root: DOMElement,
	col: number,
	row: number,
): void {
	const newHoverNode = hitTest(root, col, row) ?? undefined;

	if (newHoverNode === currentHoverNode) {
		return;
	}

	// Collect ancestor chains for old and new hover nodes
	const oldChain = getAncestorChain(currentHoverNode);
	const newChain = getAncestorChain(newHoverNode);

	// Find the common ancestor
	const oldSet = new Set(oldChain);

	// Fire onMouseLeave on nodes that are no longer hovered
	for (const node of oldChain) {
		if (!newChain.includes(node)) {
			const handler = node._eventHandlers?.['onMouseLeave'];
			if (handler) {
				handler();
			}
		}
	}

	// Fire onMouseEnter on newly hovered nodes
	for (const node of newChain) {
		if (!oldSet.has(node)) {
			const handler = node._eventHandlers?.['onMouseEnter'];
			if (handler) {
				handler();
			}
		}
	}

	currentHoverNode = newHoverNode;
}

/**
 * Reset the hover state (e.g., when mouse tracking is disabled).
 */
export function resetHoverState(): void {
	currentHoverNode = undefined;
}

function getAncestorChain(node: DOMElement | undefined): DOMElement[] {
	const chain: DOMElement[] = [];
	let current = node;
	while (current) {
		chain.push(current);
		current = current.parentNode;
	}

	return chain;
}
