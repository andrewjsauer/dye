/**
 * Node rect cache — records screen-space bounding rects for DOM elements.
 *
 * During renderNodeToOutput(), after yoga layout computes each node's
 * position/size, the final screen-space rect (with all parent offsets
 * applied) is stored in a WeakMap keyed by DOMElement.
 *
 * The cache is cleared at the start of each render cycle and consumed
 * by hit-testing (Unit 4) to map screen coordinates to component tree nodes.
 */

import {type DOMElement} from './dom.js';

export type CachedLayout = {
	/** Screen-space X coordinate (with all parent offsets applied). */
	x: number;
	/** Screen-space Y coordinate (with all parent offsets applied). */
	y: number;
	/** Computed width from yoga layout. */
	width: number;
	/** Computed height from yoga layout. */
	height: number;
};

const nodeCache = new WeakMap<DOMElement, CachedLayout>();

/**
 * Tracks which nodes have cached rects so we can clear
 * the WeakMap between render cycles (WeakMap has no clear()).
 */
const trackedNodes = new Set<DOMElement>();

/**
 * Get a node's cached screen-space bounding rect.
 * Returns undefined if the node was not rendered in the last cycle
 * (e.g., display: none, or not yet rendered).
 */
export function getNodeRect(node: DOMElement): CachedLayout | undefined {
	return nodeCache.get(node);
}

/**
 * Clear the entire cache. Called at the start of each render cycle.
 */
export function clearNodeCache(): void {
	for (const node of trackedNodes) {
		nodeCache.delete(node);
	}

	trackedNodes.clear();
}

/**
 * Record a node's screen-space bounding rect and track it for cache clearing.
 * Called during renderNodeToOutput() after computing the node's position.
 */
export function recordNodeRect(
	node: DOMElement,
	x: number,
	y: number,
	width: number,
	height: number,
): void {
	nodeCache.set(node, {x, y, width, height});
	trackedNodes.add(node);
}

/**
 * Hit-test: find the deepest node containing screen coordinates (col, row).
 * Traverses the cache in reverse child order (topmost/last-painted wins).
 * Returns the deepest DOMElement containing the point, or undefined.
 */
export function hitTest(
	root: DOMElement,
	col: number,
	row: number,
): DOMElement | undefined {
	return hitTestNode(root, col, row);
}

function hitTestNode(
	node: DOMElement,
	col: number,
	row: number,
): DOMElement | undefined {
	const rect = nodeCache.get(node);

	// Skip nodes not in the cache (not rendered, display: none)
	if (!rect) {
		return undefined;
	}

	// Check if the point is within this node's rect
	if (
		col < rect.x ||
		col >= rect.x + rect.width ||
		row < rect.y ||
		row >= rect.y + rect.height
	) {
		return undefined;
	}

	// Check children in reverse order (last child is topmost/painted last)
	for (let i = node.childNodes.length - 1; i >= 0; i--) {
		const child = node.childNodes[i] as DOMElement;
		const result = hitTestNode(child, col, row);
		if (result) {
			return result;
		}
	}

	// No child contains the point, but this node does
	return node;
}
