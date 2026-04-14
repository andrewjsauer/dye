import {useContext, useSyncExternalStore, useCallback} from 'react';
import SelectionContext from '../components/SelectionContext.js';
import {type SelectionState} from '../selection.js';

export type UseSelectionResult = {
	/** True if there is an active text selection. */
	hasSelection: boolean;
	/** The selected text, or empty string if no selection. */
	selectedText: string;
	/** The raw selection state (anchor, focus, mode) or undefined. */
	selection: SelectionState | undefined;
	/** Clear the selection. */
	clearSelection: () => void;
	/** Copy the selection to the system clipboard. Returns true on success. */
	copy: () => Promise<boolean>;
};

/**
 * React hook that subscribes to the current text selection state.
 *
 * Uses SelectionManager's frozen snapshot so that `selection` and
 * `selectedText` are always consistent with each other — no torn
 * state in concurrent mode.
 */
export default function useSelection(): UseSelectionResult {
	const {manager} = useContext(SelectionContext);

	const subscribe = useCallback(
		(listener: () => void) => manager.subscribe(listener),
		[manager],
	);

	const getSnapshot = useCallback(
		() => manager.getSnapshot(),
		[manager],
	);

	const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

	const clearSelection = useCallback(() => manager.clearSelection(), [manager]);
	const copy = useCallback(() => manager.copy(), [manager]);

	return {
		hasSelection: snapshot.selection !== undefined,
		selectedText: snapshot.selectedText,
		selection: snapshot.selection,
		clearSelection,
		copy,
	};
}
