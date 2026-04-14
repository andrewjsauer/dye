// Copied from https://github.com/enquirer/enquirer/blob/36785f3399a41cd61e9d28d1eb9c2fcd73d69b4c/lib/keypress.js
import {kittyModifiers} from './kitty-keyboard.js';

const textDecoder = new TextDecoder();

const metaKeyCodeRe = /^\u001B([a-zA-Z\d])$/;

const fnKeyRe
	= /^\u001B+(O|N|\[|\[\[)(?:(\d+)(?:;(\d+))?([~^$])|(?:1;)?(\d+)?([a-zA-Z]))/;

const keyName: Record<string, string> = {
	/* Xterm/gnome ESC O letter */
	OP: 'f1',
	OQ: 'f2',
	OR: 'f3',
	OS: 'f4',
	/* Vt220-style ESC [ letter (e.g. Ctrl+F1 sends ESC [ 1 ; 5 P) */
	'[P': 'f1',
	'[Q': 'f2',
	'[R': 'f3',
	'[S': 'f4',
	/* Xterm/rxvt ESC [ number ~ */
	'[11~': 'f1',
	'[12~': 'f2',
	'[13~': 'f3',
	'[14~': 'f4',
	/* From Cygwin and used in libuv */
	'[[A': 'f1',
	'[[B': 'f2',
	'[[C': 'f3',
	'[[D': 'f4',
	'[[E': 'f5',
	/* Common */
	'[15~': 'f5',
	'[17~': 'f6',
	'[18~': 'f7',
	'[19~': 'f8',
	'[20~': 'f9',
	'[21~': 'f10',
	'[23~': 'f11',
	'[24~': 'f12',
	/* Xterm ESC [ letter */
	'[A': 'up',
	'[B': 'down',
	'[C': 'right',
	'[D': 'left',
	'[E': 'clear',
	'[F': 'end',
	'[H': 'home',
	/* Xterm/gnome ESC O letter */
	OA: 'up',
	OB: 'down',
	OC: 'right',
	OD: 'left',
	OE: 'clear',
	OF: 'end',
	OH: 'home',
	/* Xterm/rxvt ESC [ number ~ */
	'[1~': 'home',
	'[2~': 'insert',
	'[3~': 'delete',
	'[4~': 'end',
	'[5~': 'pageup',
	'[6~': 'pagedown',
	/* Putty */
	'[[5~': 'pageup',
	'[[6~': 'pagedown',
	/* Rxvt */
	'[7~': 'home',
	'[8~': 'end',
	/* Rxvt keys with modifiers */
	'[a': 'up',
	'[b': 'down',
	'[c': 'right',
	'[d': 'left',
	'[e': 'clear',

	'[2$': 'insert',
	'[3$': 'delete',
	'[5$': 'pageup',
	'[6$': 'pagedown',
	'[7$': 'home',
	'[8$': 'end',

	Oa: 'up',
	Ob: 'down',
	Oc: 'right',
	Od: 'left',
	Oe: 'clear',

	'[2^': 'insert',
	'[3^': 'delete',
	'[5^': 'pageup',
	'[6^': 'pagedown',
	'[7^': 'home',
	'[8^': 'end',
	/* Misc. */
	'[Z': 'tab',
};

export const nonAlphanumericKeys = [...Object.values(keyName), 'backspace'];

const isShiftKey = (code: string) => [
	'[a',
	'[b',
	'[c',
	'[d',
	'[e',
	'[2$',
	'[3$',
	'[5$',
	'[6$',
	'[7$',
	'[8$',
	'[Z',
].includes(code);

const isCtrlKey = (code: string) => [
	'Oa',
	'Ob',
	'Oc',
	'Od',
	'Oe',
	'[2^',
	'[3^',
	'[5^',
	'[6^',
	'[7^',
	'[8^',
].includes(code);

type ParsedKey = {
	name: string;
	ctrl: boolean;
	meta: boolean;
	shift: boolean;
	sequence: string;
	raw: string | undefined;
	code?: string;
	super?: boolean;
	hyper?: boolean;
	capsLock?: boolean;
	numLock?: boolean;
	eventType?: 'press' | 'repeat' | 'release';
	isKittyProtocol?: boolean;
	text?: string;
	// Whether this key represents printable text input.
	// When false, the key is a control/function/modifier key that should not
	// produce text input (e.g., arrows, function keys, capslock, media keys).
	// Only set by the kitty protocol parser.
	isPrintable?: boolean;
};

// Kitty keyboard protocol: CSI codepoint ; modifiers [: eventType] [; text-as-codepoints] u
const kittyKeyRe = /^\u001B\[(\d+)(?:;(\d+)(?::(\d+))?(?:;([\d:]+))?)?u$/;

// Kitty-enhanced special keys: CSI number ; modifiers : eventType {letter|~}
// These are legacy CSI sequences enhanced with the :eventType field.
// Examples: \x1b[1;1:1A (up arrow press), \x1b[3;1:3~ (delete release)
const kittySpecialKeyRe = /^\u001B\[(\d+);(\d+):(\d+)([A-Za-z~])$/;

// Letter-terminated special key names (CSI 1 ; mods letter)
const kittySpecialLetterKeys: Record<string, string> = {
	A: 'up',
	B: 'down',
	C: 'right',
	D: 'left',
	E: 'clear',
	F: 'end',
	H: 'home',
	P: 'f1',
	Q: 'f2',
	R: 'f3',
	S: 'f4',
};

// Number-terminated special key names (CSI number ; mods ~)
const kittySpecialNumberKeys: Record<number, string> = {
	2: 'insert',
	3: 'delete',
	5: 'pageup',
	6: 'pagedown',
	7: 'home',
	8: 'end',
	11: 'f1',
	12: 'f2',
	13: 'f3',
	14: 'f4',
	15: 'f5',
	17: 'f6',
	18: 'f7',
	19: 'f8',
	20: 'f9',
	21: 'f10',
	23: 'f11',
	24: 'f12',
};

// Map of special codepoints to key names in kitty protocol
const kittyCodepointNames: Record<number, string> = {
	27: 'escape',
	// 13 (return) and 32 (space) are handled before this lookup
	// in parseKittyKeypress so they can be marked as printable.
	9: 'tab',
	127: 'backspace',
	8: 'backspace',
	57_358: 'capslock',
	57_359: 'scrolllock',
	57_360: 'numlock',
	57_361: 'printscreen',
	57_362: 'pause',
	57_363: 'menu',
	57_376: 'f13',
	57_377: 'f14',
	57_378: 'f15',
	57_379: 'f16',
	57_380: 'f17',
	57_381: 'f18',
	57_382: 'f19',
	57_383: 'f20',
	57_384: 'f21',
	57_385: 'f22',
	57_386: 'f23',
	57_387: 'f24',
	57_388: 'f25',
	57_389: 'f26',
	57_390: 'f27',
	57_391: 'f28',
	57_392: 'f29',
	57_393: 'f30',
	57_394: 'f31',
	57_395: 'f32',
	57_396: 'f33',
	57_397: 'f34',
	57_398: 'f35',
	57_399: 'kp0',
	57_400: 'kp1',
	57_401: 'kp2',
	57_402: 'kp3',
	57_403: 'kp4',
	57_404: 'kp5',
	57_405: 'kp6',
	57_406: 'kp7',
	57_407: 'kp8',
	57_408: 'kp9',
	57_409: 'kpdecimal',
	57_410: 'kpdivide',
	57_411: 'kpmultiply',
	57_412: 'kpsubtract',
	57_413: 'kpadd',
	57_414: 'kpenter',
	57_415: 'kpequal',
	57_416: 'kpseparator',
	57_417: 'kpleft',
	57_418: 'kpright',
	57_419: 'kpup',
	57_420: 'kpdown',
	57_421: 'kppageup',
	57_422: 'kppagedown',
	57_423: 'kphome',
	57_424: 'kpend',
	57_425: 'kpinsert',
	57_426: 'kpdelete',
	57_427: 'kpbegin',
	57_428: 'mediaplay',
	57_429: 'mediapause',
	57_430: 'mediaplaypause',
	57_431: 'mediareverse',
	57_432: 'mediastop',
	57_433: 'mediafastforward',
	57_434: 'mediarewind',
	57_435: 'mediatracknext',
	57_436: 'mediatrackprevious',
	57_437: 'mediarecord',
	57_438: 'lowervolume',
	57_439: 'raisevolume',
	57_440: 'mutevolume',
	57_441: 'leftshift',
	57_442: 'leftcontrol',
	57_443: 'leftalt',
	57_444: 'leftsuper',
	57_445: 'lefthyper',
	57_446: 'leftmeta',
	57_447: 'rightshift',
	57_448: 'rightcontrol',
	57_449: 'rightalt',
	57_450: 'rightsuper',
	57_451: 'righthyper',
	57_452: 'rightmeta',
	57_453: 'isoLevel3Shift',
	57_454: 'isoLevel5Shift',
};

// Valid Unicode codepoint range, excluding surrogates
const isValidCodepoint = (cp: number): boolean =>
	cp >= 0 && cp <= 0x10_FF_FF && !(cp >= 0xD8_00 && cp <= 0xDF_FF);

const safeFromCodePoint = (cp: number): string =>
	isValidCodepoint(cp) ? String.fromCodePoint(cp) : '?';

type EventType = 'press' | 'repeat' | 'release';

function resolveEventType(value: number): EventType {
	if (value === 3) {
		return 'release';
	}

	if (value === 2) {
		return 'repeat';
	}

	return 'press';
}

function parseKittyModifiers(modifiers: number): Pick<
	ParsedKey,
	'ctrl' | 'shift' | 'meta' | 'super' | 'hyper' | 'capsLock' | 'numLock'
> {
	return {
		ctrl: Boolean(modifiers & kittyModifiers.ctrl),
		shift: Boolean(modifiers & kittyModifiers.shift),
		meta: Boolean(modifiers & (kittyModifiers.meta | kittyModifiers.alt)),
		super: Boolean(modifiers & kittyModifiers.super),
		hyper: Boolean(modifiers & kittyModifiers.hyper),
		capsLock: Boolean(modifiers & kittyModifiers.capsLock),
		numLock: Boolean(modifiers & kittyModifiers.numLock),
	};
}

const parseKittyKeypress = (s: string): ParsedKey | undefined => {
	const match = kittyKeyRe.exec(s);
	if (!match) {
		return undefined;
	}

	const codepoint = Number.parseInt(match[1]!, 10);
	const modifiers = match[2] ? Math.max(0, Number.parseInt(match[2], 10) - 1) : 0;
	const eventType = match[3] ? Number.parseInt(match[3], 10) : 1;
	const textField = match[4];

	// Bail on invalid primary codepoint
	if (!isValidCodepoint(codepoint)) {
		return undefined;
	}

	// Parse text-as-codepoints field (colon-separated Unicode codepoints)
	let text: string | undefined;
	if (textField) {
		text = textField
			.split(':')
			.map(cp => safeFromCodePoint(Number.parseInt(cp, 10)))
			.join('');
	}

	// Determine key name from codepoint
	let name: string;
	let isPrintable: boolean;
	if (codepoint === 32) {
		name = 'space';
		isPrintable = true;
	} else if (codepoint === 13) {
		name = 'return';
		isPrintable = true;
	} else if (kittyCodepointNames[codepoint]) {
		name = kittyCodepointNames[codepoint]!;
		isPrintable = false;
	} else if (codepoint >= 1 && codepoint <= 26) {
		// Ctrl+letter comes as codepoint 1-26
		name = String.fromCodePoint(codepoint + 96); // 'a' is 97
		isPrintable = false;
	} else {
		name = safeFromCodePoint(codepoint).toLowerCase();
		isPrintable = true;
	}

	// Default text to the character from the codepoint when not explicitly
	// provided by the protocol, so keys like space and return produce their
	// expected text input (' ' and '\r' respectively).
	if (isPrintable && !text) {
		text = safeFromCodePoint(codepoint);
	}

	return {
		name,
		...parseKittyModifiers(modifiers),
		eventType: resolveEventType(eventType),
		sequence: s,
		raw: s,
		isKittyProtocol: true,
		isPrintable,
		text,
	};
};

// Parse kitty-enhanced special key sequences (arrow keys, function keys, etc.)
// These use the legacy CSI format but with an added :eventType field.
const parseKittySpecialKey = (s: string): ParsedKey | undefined => {
	const match = kittySpecialKeyRe.exec(s);
	if (!match) {
		return undefined;
	}

	const number = Number.parseInt(match[1]!, 10);
	const modifiers = Math.max(0, Number.parseInt(match[2]!, 10) - 1);
	const eventType = Number.parseInt(match[3]!, 10);
	const terminator = match[4]!;

	const name
		= terminator === '~'
			? kittySpecialNumberKeys[number]
			: kittySpecialLetterKeys[terminator];

	if (!name) {
		return undefined;
	}

	return {
		name,
		...parseKittyModifiers(modifiers),
		eventType: resolveEventType(eventType),
		sequence: s,
		raw: s,
		isKittyProtocol: true,
		isPrintable: false,
	};
};

const parseKeypress = (s: Uint8Array | string = ''): ParsedKey => {
	let parts;

	if (s instanceof Uint8Array) {
		if (s[0]! > 127 && s[1] === undefined) {
			(s[0] as unknown as number) -= 128;
			s = '\u001B' + textDecoder.decode(s);
		} else {
			s = textDecoder.decode(s);
		}
	} else if (s !== undefined && typeof s !== 'string') {
		s = String(s);
	} else {
		s ||= '';
	}

	// Try kitty keyboard protocol parsers first
	const kittyResult = parseKittyKeypress(s);
	if (kittyResult) {
		return kittyResult;
	}

	const kittySpecialResult = parseKittySpecialKey(s);
	if (kittySpecialResult) {
		return kittySpecialResult;
	}

	// If the input matched the kitty CSI-u pattern but was rejected (e.g.,
	// invalid codepoint), return a safe empty keypress instead of falling
	// through to legacy parsing which can produce unsafe states (undefined name)
	if (kittyKeyRe.test(s)) {
		return {
			name: '',
			ctrl: false,
			meta: false,
			shift: false,
			sequence: s,
			raw: s,
			isKittyProtocol: true,
			isPrintable: false,
		};
	}

	const key: ParsedKey = {
		name: '',
		ctrl: false,
		meta: false,
		shift: false,
		sequence: s,
		raw: s,
	};

	key.sequence = key.sequence || s || key.name;

	switch (s) {
		case '\r':
		case '\u001B\r': {
		// Carriage return (or meta+return on macOS)
			key.raw = undefined;
			key.name = 'return';
			key.meta = s.length === 2;

			break;
		}

		case '\n': {
		// Enter, should have been called linefeed
			key.name = 'enter';

			break;
		}

		case '\t': {
		// Tab
			key.name = 'tab';

			break;
		}

		case '\b':
		case '\u001B\b': {
		// Backspace or ctrl+h
			key.name = 'backspace';
			key.meta = s.startsWith('\u001B');

			break;
		}

		case '\u007F':
		case '\u001B\u007F': {
		// Backspace
			key.name = 'backspace';
			key.meta = s.startsWith('\u001B');

			break;
		}

		case '\u001B':
		case '\u001B\u001B': {
		// Escape key
			key.name = 'escape';
			key.meta = s.length === 2;

			break;
		}

		case ' ':
		case '\u001B ': {
			key.name = 'space';
			key.meta = s.length === 2;

			break;
		}

		default: {if (s.length === 1 && s <= '\u001A') {
		// Ctrl+letter
			key.name = String.fromCharCode(s.charCodeAt(0) + 'a'.charCodeAt(0) - 1);
			key.ctrl = true;
		} else if (s.length === 1 && s >= '0' && s <= '9') {
		// Number
			key.name = 'number';
		} else if (s.length === 1 && s >= 'a' && s <= 'z') {
		// Lowercase letter
			key.name = s;
		} else if (s.length === 1 && s >= 'A' && s <= 'Z') {
		// Shift+letter
			key.name = s.toLowerCase();
			key.shift = true;
		} else if ((parts = metaKeyCodeRe.exec(s))) {
		// Meta+character key
			key.name = parts[1]!.toLowerCase();
			key.meta = true;
			key.shift = /^[A-Z]$/.test(parts[1]!);
		} else if ((parts = fnKeyRe.exec(s))) {
			const segs = [...s];

			if (segs[0] === '\u001B' && segs[1] === '\u001B') {
				key.meta = true;
			}

			// Ansi escape sequence
			// reassemble the key code leaving out leading \x1b's,
			// the modifier key bitflag and any meaningless "1;" sequence
			const code = [parts[1], parts[2], parts[4], parts[6]]
				.filter(Boolean)
				.join('');

			const modifier = ((parts[3] || parts[5] || 1) as number) - 1;

			// Parse the key modifier
			key.ctrl = Boolean(modifier & 4);
			key.meta = key.meta || Boolean(modifier & 10);
			key.shift = Boolean(modifier & 1);
			key.code = code;

			key.name = keyName[code] ?? '';
			key.shift = isShiftKey(code) || key.shift;
			key.ctrl = isCtrlKey(code) || key.ctrl;
		}
		}
	}

	return key;
};

export default parseKeypress;
