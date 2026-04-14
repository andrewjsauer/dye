/**
 * Hardware scroll via DECSTBM (DEC set top/bottom margins).
 *
 * When a scrollable region's content shifts by a known delta, we can use
 * the terminal's scroll region feature to move rows in hardware instead of
 * redrawing the entire viewport. Only the newly revealed rows need to be
 * written after the scroll.
 *
 * Protocol:
 *   CSI top ; bottom r       — Set scroll region (DECSTBM)
 *   CSI n S                  — Scroll up n lines (content moves up)
 *   CSI n T                  — Scroll down n lines (content moves down)
 *   CSI r                    — Reset scroll region
 *   CSI H                    — Cursor home (after scroll-region ops)
 *
 * Preconditions:
 * - Must be in alt-screen mode (scroll region unreliable on main screen
 *   because of scrollback buffer interaction)
 * - top/bottom are 1-indexed row numbers
 * - delta > 0 scrolls up (content moves up, blank rows at bottom)
 * - delta < 0 scrolls down (content moves down, blank rows at top)
 *
 * After hardware scroll, the caller should also shift the corresponding
 * rows in the Screen buffer via shiftRows() so the next diff only writes
 * the newly revealed rows.
 *
 * Reference: ECMA-48 (DECSTBM), xterm control sequences.
 */

import {type Screen, shiftRows} from './screen.js';

export type ScrollHint = {
	/** First row of the scroll region (0-indexed, inclusive). */
	readonly top: number;
	/** Last row of the scroll region (0-indexed, exclusive). */
	readonly bottom: number;
	/**
	 * Number of rows to scroll.
	 * Positive = content moves up (blank rows appear at bottom).
	 * Negative = content moves down (blank rows appear at top).
	 */
	readonly delta: number;
};

export type ScrollOptions = {
	/** Whether the alt-screen is currently active. DECSTBM is only safe there. */
	readonly altScreen: boolean;
	/** Viewport height in rows (used to validate the scroll region). */
	readonly viewportHeight: number;
};

/**
 * Generate the ANSI escape sequence for a hardware scroll.
 * Returns an empty string if the scroll can't be performed in hardware
 * (e.g., not in alt-screen, or delta exceeds region height).
 *
 * Also mutates prevScreen's cells via shiftRows() to simulate the hardware
 * scroll, so the next diff only writes newly revealed rows.
 */
export function applyScrollHint(
	prevScreen: Screen,
	hint: ScrollHint,
	options: ScrollOptions,
): string {
	if (!options.altScreen) return '';
	if (hint.delta === 0) return '';

	const top = Math.max(0, hint.top);
	const bottom = Math.min(options.viewportHeight, hint.bottom);

	if (top >= bottom) return '';

	const regionHeight = bottom - top;
	const absDelta = Math.abs(hint.delta);

	// If delta >= region height, a full redraw is simpler than DECSTBM
	if (absDelta >= regionHeight) return '';

	// Mutate prev screen to simulate the hardware scroll
	shiftRows(prevScreen, top, bottom, hint.delta);

	// Build the ANSI sequence
	// DECSTBM is 1-indexed and inclusive on both ends
	const top1 = top + 1;
	const bottom1 = bottom; // CSI <top>;<bottom>r where bottom is inclusive
	const setRegion = `\x1b[${top1};${bottom1}r`;
	const scroll = hint.delta > 0
		? `\x1b[${absDelta}S` // Scroll up (content moves up)
		: `\x1b[${absDelta}T`; // Scroll down
	const resetRegion = '\x1b[r';
	const cursorHome = '\x1b[H';

	return setRegion + scroll + resetRegion + cursorHome;
}

/**
 * Given a previous scrollTop and a new scrollTop for a scroll region,
 * compute the ScrollHint needed to move the rendered content.
 */
export function computeScrollHint(
	top: number,
	bottom: number,
	prevScrollTop: number,
	nextScrollTop: number,
): ScrollHint | undefined {
	const delta = nextScrollTop - prevScrollTop;
	if (delta === 0) return undefined;
	return {top, bottom, delta};
}
