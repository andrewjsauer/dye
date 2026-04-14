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

/**
 * A frozen snapshot of the manager's state at a point in time.
 * Returned by getSnapshot() so useSyncExternalStore consumers see
 * a consistent view of (selection, selectedText) without tearing.
 */
export type SelectionSnapshot = {
	readonly selection: SelectionState | undefined;
	readonly selectedText: string;
};

export class SelectionManager {
	private selection: SelectionState | undefined;
	private readonly tracker: MultiClickTracker = createMultiClickTracker();
	private readonly listeners = new Set<Listener>();
	private screen: Screen | undefined;
	private stdout: NodeJS.WriteStream | undefined;
	private dragging = false;
	/**
	 * Frozen snapshot of the current state. Recomputed on every state
	 * change so useSyncExternalStore can return a stable reference
	 * between renders and consumers see (selection, text) together.
	 */
	private snapshot: SelectionSnapshot = {
		selection: undefined,
		selectedText: '',
	};

	/** Update the screen reference. Called after each render. */
	setScreen(screen: Screen | undefined): void {
		this.screen = screen;
		// Screen changes can affect selectedText even when selection itself hasn't
		// moved (e.g., content under the selection was re-rendered).
		this.refreshSnapshot();
	}

	/**
	 * Set the stdout stream used for OSC 52 clipboard writes.
	 * Called by the Ink render root so copy() can emit escapes to the right TTY.
	 */
	setStdout(stdout: NodeJS.WriteStream | undefined): void {
		this.stdout = stdout;
	}

	/** Get the current selection state (may be undefined). */
	getSelection(): SelectionState | undefined {
		return this.snapshot.selection;
	}

	/** Check if there is an active selection. */
	hasSelection(): boolean {
		return this.snapshot.selection !== undefined;
	}

	/** Get the text content of the current selection. */
	getSelectedText(): string {
		return this.snapshot.selectedText;
	}

	/**
	 * Return a frozen snapshot of (selection, selectedText). Stable between
	 * state changes so useSyncExternalStore can use reference equality to
	 * skip unnecessary renders.
	 */
	getSnapshot(): SelectionSnapshot {
		return this.snapshot;
	}

	/** Clear the current selection and notify listeners. */
	clearSelection(): void {
		if (this.selection === undefined) {
			return;
		}

		this.selection = undefined;
		this.dragging = false;
		this.refreshSnapshot();
		this.notify();
	}

	/**
	 * Handle a mouse press at (col, row). Starts or extends a selection
	 * based on multi-click count.
	 */
	handleMousePress(
		col: number,
		row: number,
		now: number = performance.now(),
	): void {
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
		this.refreshSnapshot();
		this.notify();
	}

	/** Extend the selection during a drag event. */
	handleMouseDrag(col: number, row: number): void {
		if (!this.dragging || !this.selection) {
			return;
		}

		const focus: Point = {col, row};
		this.selection = extendSelection(this.selection, focus, this.screen);
		this.refreshSnapshot();
		this.notify();
	}

	/** End a drag. Keeps the selection visible; clipboard copy is separate. */
	handleMouseRelease(): void {
		this.dragging = false;
	}

	/** Copy the current selection to the system clipboard. */
	async copy(): Promise<boolean> {
		const text = this.getSelectedText();
		if (!text) {
			return false;
		}

		try {
			await copyToClipboard(text, {stdout: this.stdout});
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

	private refreshSnapshot(): void {
		const selectedText
			= this.selection && this.screen
				? getSelectedText(this.screen, this.selection)
				: '';
		this.snapshot = {selection: this.selection, selectedText};
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
