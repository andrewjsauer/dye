/**
 * SGR mouse protocol parser.
 *
 * Parses SGR-encoded mouse events (DEC 1006) from terminal input.
 * Format: CSI < button ; col ; row M (press) or CSI < button ; col ; row m (release)
 *
 * Button encoding (binary flags):
 *   Bits 0-1: button (0=left, 1=middle, 2=right)
 *   Bit 5 (0x20): motion/drag flag
 *   Bit 6 (0x40): wheel flag (0x40=up, 0x41=down)
 *   Bit 3 (0x08): alt modifier
 *   Bit 4 (0x10): ctrl modifier
 *   Bit 2 (0x04): shift modifier
 *
 * Reference: xterm SGR mouse tracking (DECSET 1006)
 */

export type MouseButton = 'left' | 'middle' | 'right' | 'none';
export type MouseAction = 'press' | 'release' | 'drag' | 'wheel-up' | 'wheel-down';

export type ParsedMouse = {
	readonly button: MouseButton;
	readonly action: MouseAction;
	/** Screen column, 0-indexed. */
	readonly col: number;
	/** Screen row, 0-indexed. */
	readonly row: number;
	readonly shift: boolean;
	readonly alt: boolean;
	readonly ctrl: boolean;
	readonly sequence: string;
};

/**
 * Regex matching SGR mouse sequences.
 * CSI < button ; col ; row M/m
 */
const SGR_MOUSE_RE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/;

/**
 * Try to parse an SGR mouse sequence from a terminal input string.
 * Returns undefined if the string is not a mouse sequence.
 */
export function parseMouse(sequence: string): ParsedMouse | undefined {
	const match = SGR_MOUSE_RE.exec(sequence);
	if (!match) return undefined;

	const rawButton = Number(match[1]);
	const col = Number(match[2]) - 1; // Convert 1-indexed to 0-indexed
	const row = Number(match[3]) - 1;
	const isRelease = match[4] === 'm';

	// Extract modifier flags
	const shift = (rawButton & 0x04) !== 0;
	const alt = (rawButton & 0x08) !== 0;
	const ctrl = (rawButton & 0x10) !== 0;

	// Determine action and button
	const isWheel = (rawButton & 0x40) !== 0;
	const isDrag = (rawButton & 0x20) !== 0;
	const baseButton = rawButton & 0x03;

	let action: MouseAction;
	let button: MouseButton;

	if (isWheel) {
		action = baseButton === 0 ? 'wheel-up' : 'wheel-down';
		button = 'none';
	} else if (isDrag) {
		action = 'drag';
		button = buttonFromCode(baseButton);
	} else if (isRelease) {
		action = 'release';
		button = buttonFromCode(baseButton);
	} else {
		action = 'press';
		button = buttonFromCode(baseButton);
	}

	return {button, action, col, row, shift, alt, ctrl, sequence};
}

function buttonFromCode(code: number): MouseButton {
	switch (code) {
		case 0: return 'left';
		case 1: return 'middle';
		case 2: return 'right';
		default: return 'none';
	}
}

/**
 * ANSI sequences to enable SGR mouse tracking.
 * Enables basic tracking (1000), button-event/drag tracking (1002),
 * and SGR extended mode (1006) for coordinates > 223.
 */
export const MOUSE_ENABLE =
	'\x1b[?1000h' +
	'\x1b[?1002h' +
	'\x1b[?1006h';

/**
 * ANSI sequences to disable SGR mouse tracking.
 * Disables in reverse order of enable.
 */
export const MOUSE_DISABLE =
	'\x1b[?1006l' +
	'\x1b[?1002l' +
	'\x1b[?1000l';
