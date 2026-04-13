/**
 * Click event — fired when a mouse button is pressed and released
 * on a component (or the press is detected via SGR mouse tracking).
 *
 * Contains both screen-space coordinates (col, row) and local coordinates
 * relative to the handler's component (localCol, localRow), updated as
 * the event bubbles through the tree.
 */

import {type CachedLayout} from '../node-cache.js';
import {DyeEvent} from './event.js';

export class ClickEvent extends DyeEvent {
	/** Screen column, 0-indexed. */
	readonly col: number;
	/** Screen row, 0-indexed. */
	readonly row: number;
	/** Column relative to the current handler's component. */
	localCol: number;
	/** Row relative to the current handler's component. */
	localRow: number;
	/** The mouse button that was clicked. */
	readonly button: 'left' | 'middle' | 'right';
	readonly shift: boolean;
	readonly alt: boolean;
	readonly ctrl: boolean;

	constructor(options: {
		col: number;
		row: number;
		button?: 'left' | 'middle' | 'right';
		shift?: boolean;
		alt?: boolean;
		ctrl?: boolean;
	}) {
		super('click');
		this.col = options.col;
		this.row = options.row;
		this.localCol = options.col;
		this.localRow = options.row;
		this.button = options.button ?? 'left';
		this.shift = options.shift ?? false;
		this.alt = options.alt ?? false;
		this.ctrl = options.ctrl ?? false;
	}

	/**
	 * Update local coordinates relative to a node's cached rect.
	 * Called by the dispatch system as the event bubbles through each node.
	 */
	updateLocalCoords(rect: CachedLayout): void {
		this.localCol = this.col - rect.x;
		this.localRow = this.row - rect.y;
	}
}
