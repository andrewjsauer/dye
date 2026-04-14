/**
 * Selection overlay — applies a visual highlight to selected Screen cells.
 *
 * Mutates the Screen buffer in-place by replacing each selected cell's
 * styleId with a new styleId that has the inverse SGR code (SGR 7).
 * This produces a high-contrast selection that works on any terminal.
 *
 * After applying the overlay, callers should mark the frame as contaminated
 * so the next diff doesn't blit stale highlighted cells.
 */

import {
	type Screen,
	getCellWord1,
	unpackStyleId,
	unpackHyperlinkId,
	unpackWidth,
	setCellAt,
	getCellCharId,
} from './screen.js';
import {
	normalizeSelection,
	selectionColRange,
	type SelectionState,
} from './selection.js';

/**
 * Apply the selection overlay to a Screen buffer.
 * Replaces the styleId of each selected cell with a "selected" variant
 * (original style + inverse SGR code 7).
 *
 * Must be called AFTER the main render has populated the Screen.
 * Returns true if any cells were modified.
 */
export function applySelectionOverlay(
	screen: Screen,
	selection: SelectionState,
): boolean {
	const [start, end] = normalizeSelection(selection);
	if (start.row > end.row || (start.row === end.row && start.col > end.col)) {
		return false;
	}

	let mutated = false;

	for (let {row} = start; row <= end.row; row++) {
		if (row < 0 || row >= screen.height) {
			continue;
		}

		const [startCol, endCol] = selectionColRange(
			selection.mode,
			start,
			end,
			row,
			screen.width,
		);

		for (let col = startCol; col <= endCol && col < screen.width; col++) {
			if (col < 0) {
				continue;
			}

			const charId = getCellCharId(screen, col, row);
			const word1 = getCellWord1(screen, col, row);
			const currentStyleId = unpackStyleId(word1);
			const currentHyperlinkId = unpackHyperlinkId(word1);
			const width = unpackWidth(word1);

			// Get the original style codes and append SGR 7 (inverse)
			const currentCodes = screen.stylePool.resolve(currentStyleId);
			// Avoid adding duplicate inverse codes
			if (currentCodes.includes(7)) {
				continue;
			}

			const selectedCodes = [...currentCodes, 7];
			const selectedStyleId = screen.stylePool.intern(selectedCodes);

			setCellAt(
				screen,
				col,
				row,
				charId,
				selectedStyleId,
				currentHyperlinkId,
				width,
			);
			mutated = true;
		}
	}

	return mutated;
}
