/**
 * Base event class with propagation control.
 *
 * Provides stopImmediatePropagation() and stopPropagation() to control
 * event bubbling through the component tree.
 */

import {type DOMElement} from '../dom.js';

export class DyeEvent {
	readonly type: string;
	readonly timeStamp: number;

	/**
	 * The deepest node that the event targets.
	 * Set by the dispatch system before handler invocation.
	 */
	target: DOMElement | undefined;

	/**
	 * The node whose handler is currently being invoked.
	 * Updated as the event bubbles up the tree.
	 */
	currentTarget: DOMElement | undefined;

	private propagationStopped = false;
	private immediatePropagationStopped = false;

	constructor(type: string) {
		this.type = type;
		this.timeStamp = performance.now();
	}

	/**
	 * Prevent the event from bubbling to ancestor nodes.
	 * Remaining handlers on the current node still fire.
	 */
	stopPropagation(): void {
		this.propagationStopped = true;
	}

	/**
	 * Stop all propagation immediately — no further handlers fire,
	 * even on the current node.
	 */
	stopImmediatePropagation(): void {
		this.propagationStopped = true;
		this.immediatePropagationStopped = true;
	}

	/** Check if stopPropagation() was called. */
	isPropagationStopped(): boolean {
		return this.propagationStopped;
	}

	/** Check if stopImmediatePropagation() was called. */
	isImmediatePropagationStopped(): boolean {
		return this.immediatePropagationStopped;
	}
}
