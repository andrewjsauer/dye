/**
 * Interning pools for zero-allocation cell comparison.
 *
 * Three pools intern runtime values to integer IDs:
 * - CharPool: grapheme cluster strings → charId
 * - StylePool: ANSI SGR code arrays → styleId (with transition cache)
 * - HyperlinkPool: OSC 8 URI strings → hyperlinkId
 *
 * Index 0 is always the default/empty value in each pool.
 * All IDs are non-negative Int32 values suitable for packed storage.
 */

// ---------------------------------------------------------------------------
// CharPool — intern character/grapheme strings to integer IDs
// ---------------------------------------------------------------------------

export class CharPool {
	/** Index 0 = space (default cell), index 1 = '' (spacer for wide chars) */
	private readonly strings: string[] = [' ', ''];
	private readonly asciiTable = new Int32Array(128).fill(-1);
	private readonly map = new Map<string, number>();

	constructor() {
		// Pre-register space and empty string
		this.asciiTable[32] = 0; // ' '
		this.map.set(' ', 0);
		this.map.set('', 1);
	}

	/** Intern a string and return its integer ID. */
	intern(value: string): number {
		// ASCII fast-path: single byte, direct array lookup
		if (value.length === 1) {
			const code = value.charCodeAt(0);
			if (code < 128) {
				const existing = this.asciiTable[code]!;
				if (existing >= 0) return existing;
				const id = this.strings.length;
				this.strings.push(value);
				this.asciiTable[code] = id;
				return id;
			}
		}

		// General path: Map lookup
		const existing = this.map.get(value);
		if (existing !== undefined) return existing;

		const id = this.strings.length;
		this.strings.push(value);
		this.map.set(value, id);
		return id;
	}

	/** Resolve an ID back to its string value. */
	resolve(id: number): string {
		return this.strings[id]!;
	}

	get size(): number {
		return this.strings.length;
	}
}

// ---------------------------------------------------------------------------
// StylePool — intern ANSI style descriptors to integer IDs
// ---------------------------------------------------------------------------

/**
 * A style descriptor is an array of ANSI SGR parameter numbers.
 * For example, bold + red foreground = [1, 31].
 * An empty array means "no style" (reset / default).
 *
 * StylePool interns these to integer IDs. Bit 0 of the ID encodes whether
 * the style is "visible on space" (has background, underline, strikethrough,
 * overline, or inverse — attributes that show even on whitespace).
 *
 * The transition cache stores pre-serialized ANSI escape strings for going
 * from one styleId to another, enabling zero-allocation style switches.
 */

/** SGR parameter numbers that are visible on space characters. */
const VISIBLE_ON_SPACE_CODES = new Set([
	// Inverse
	7,
	// Underline variants
	4, 21,
	// Strikethrough
	9,
	// Overline
	53,
	// Background colors (40-47, 49, 100-107)
	40, 41, 42, 43, 44, 45, 46, 47,
	100, 101, 102, 103, 104, 105, 106, 107,
	// 48 = extended background (48;5;n or 48;2;r;g;b) — handled specially
	48,
]);

export type StyleDescriptor = readonly number[];

export class StylePool {
	/** Index 0 = empty style (no SGR). The actual ID stored is 0 (bit 0 = 0). */
	private readonly descriptors: StyleDescriptor[] = [[]];
	private readonly keys = new Map<string, number>();
	/** Cache: transition(fromId, toId) → pre-serialized ANSI string. */
	private readonly transitionCache = new Map<number, string>();

	constructor() {
		this.keys.set('', 0);
	}

	/** Intern a style descriptor and return its styleId. */
	intern(codes: StyleDescriptor): number {
		const key = codes.join(';');
		const existing = this.keys.get(key);
		if (existing !== undefined) return existing;

		const visibleOnSpace = codes.some(c => VISIBLE_ON_SPACE_CODES.has(c));
		// Encode visible-on-space in bit 0: actual index is id >> 1
		const rawIndex = this.descriptors.length;
		this.descriptors.push(codes);
		const id = (rawIndex << 1) | (visibleOnSpace ? 1 : 0);
		this.keys.set(key, id);
		return id;
	}

	/** Check if a styleId represents a style visible on space characters. */
	isVisibleOnSpace(id: number): boolean {
		return (id & 1) === 1;
	}

	/** Get the raw descriptor for a styleId. */
	resolve(id: number): StyleDescriptor {
		return this.descriptors[id >> 1]!;
	}

	/**
	 * Get the ANSI escape string to transition from one style to another.
	 * Returns '' if the styles are identical.
	 * Cached after first computation.
	 */
	transition(fromId: number, toId: number): string {
		if (fromId === toId) return '';

		const cacheKey = fromId * 0x100000 + toId;
		const cached = this.transitionCache.get(cacheKey);
		if (cached !== undefined) return cached;

		const result = this.computeTransition(fromId, toId);
		this.transitionCache.set(cacheKey, result);
		return result;
	}

	private computeTransition(fromId: number, toId: number): string {
		const toCodes = this.resolve(toId);

		// Going to default style: just reset
		if (toCodes.length === 0) {
			return '\x1b[0m';
		}

		const fromCodes = this.resolve(fromId);

		// Coming from default: just apply the target style
		if (fromCodes.length === 0) {
			return `\x1b[${toCodes.join(';')}m`;
		}

		// General case: reset then apply target.
		// A smarter approach would compute the minimal diff, but reset+apply
		// is always correct and the string is cached anyway.
		return `\x1b[0m\x1b[${toCodes.join(';')}m`;
	}

	get size(): number {
		return this.descriptors.length;
	}
}

// ---------------------------------------------------------------------------
// HyperlinkPool — intern OSC 8 hyperlink URIs to integer IDs
// ---------------------------------------------------------------------------

export class HyperlinkPool {
	/** Index 0 = no hyperlink. */
	private readonly uris: string[] = [''];
	private readonly map = new Map<string, number>();

	constructor() {
		this.map.set('', 0);
	}

	/** Intern a hyperlink URI and return its ID. 0 = no hyperlink. */
	intern(uri: string): number {
		if (!uri) return 0;

		const existing = this.map.get(uri);
		if (existing !== undefined) return existing;

		const id = this.uris.length;
		this.uris.push(uri);
		this.map.set(uri, id);
		return id;
	}

	/** Resolve an ID back to its URI string. */
	resolve(id: number): string {
		return this.uris[id]!;
	}

	get size(): number {
		return this.uris.length;
	}
}
