/**
 * SelectionManager — stateful controller for text selection in a Dye app.
 *
 * Owns the current SelectionState, multi-click tracker, and listener list.
 * Integrated with the mouse event pipeline:
 *   - mouse press: start selection (word/line mode from multi-click count)
 *   - mouse drag: extend selection
 *   - mouse release: end selection (keep it visible until cleared)
 *   - escape or new click: clear selection
 *
 * The hook useSelection() subscribes to state changes.
 */

import {
	type MultiClickTracker,
	type SelectionState,
	type SelectionMode,
	type Point,
	createMultiClickTracker,
	recordClick,
	clickCountToMode,
	startSelection,
	extendSelection,
	selectWordAt,
	selectLineAt,
	getSelectedText,
	copyToClipboard,
} from './selection.js';
import {type Screen} from './screen.js';

type Listener = () => void;

export class SelectionManager {
	private selection: SelectionState | undefined;
	private readonly tracker: MultiClickTracker = createMultiClickTracker();
	private readonly listeners = new Set<Listener>();
	private screen: Screen | undefined;
	private dragging = false;

	/** Update the screen reference. Called after each render. */
	setScreen(screen: Screen | undefined): void {
		this.screen = screen;
	}

	/** Get the current selection state (may be undefined). */
	getSelection(): SelectionState | undefined {
		return this.selection;
	}

	/** Check if there is an active selection. */
	hasSelection(): boolean {
		return this.selection !== undefined;
	}

	/** Get the text content of the current selection. */
	getSelectedText(): string {
		if (!this.selection || !this.screen) return '';
		return getSelectedText(this.screen, this.selection);
	}

	/** Clear the current selection and notify listeners. */
	clearSelection(): void {
		if (this.selection === undefined) return;
		this.selection = undefined;
		this.dragging = false;
		this.notify();
	}

	/**
	 * Handle a mouse press at (col, row). Starts or extends a selection
	 * based on multi-click count.
	 */
	handleMousePress(col: number, row: number, now: number = performance.now()): void {
		const count = recordClick(this.tracker, col, row, now);
		const mode: SelectionMode = clickCountToMode(count);

		if (mode === 'word' && this.screen) {
			this.selection = selectWordAt(this.screen, col, row);
		} else if (mode === 'line' && this.screen) {
			this.selection = selectLineAt(this.screen, row);
		} else {
			this.selection = startSelection({col, row}, 'character');
		}

		this.dragging = true;
		this.notify();
	}

	/** Extend the selection during a drag event. */
	handleMouseDrag(col: number, row: number): void {
		if (!this.dragging || !this.selection) return;
		const focus: Point = {col, row};
		this.selection = extendSelection(this.selection, focus, this.screen);
		this.notify();
	}

	/** End a drag. Keeps the selection visible; clipboard copy is separate. */
	handleMouseRelease(): void {
		this.dragging = false;
	}

	/** Copy the current selection to the system clipboard. */
	async copy(): Promise<boolean> {
		const text = this.getSelectedText();
		if (!text) return false;
		try {
			await copyToClipboard(text);
			return true;
		} catch {
			return false;
		}
	}

	/** Subscribe to selection changes. Returns an unsubscribe function. */
	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private notify(): void {
		for (const listener of this.listeners) {
			try {
				listener();
			} catch {
				// Ignore listener errors
			}
		}
	}
}
