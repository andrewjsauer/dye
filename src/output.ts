import sliceAnsi from 'slice-ansi';
import stringWidth from 'string-width';
import {
	type StyledChar,
	styledCharsFromTokens,
	styledCharsToString,
	tokenize,
} from '@alcalzone/ansi-tokenize';
import {type OutputTransformer} from './render-node-to-output.js';
import {CharPool, StylePool, HyperlinkPool} from './pools.js';
import {
	type Screen,
	createScreen,
	setCellAt,
	CellWidth,
} from './screen.js';

/**
"Virtual" output class

Handles the positioning and saving of the output of each node in the tree.
Also responsible for applying transformations to each character of the output.

Used to generate the final output of all nodes before writing it to actual
output stream (e.g. stdout).

In Dye, Output populates a Screen buffer (packed Int32Array cells) alongside
the traditional StyledChar grid. The Screen is available via getScreen() for
the cell-level diff pipeline, while get() returns the same string output as
before for backward compatibility.
*/

type Options = {
	width: number;
	height: number;
	stylePool?: StylePool;
};

type Operation = WriteOperation | ClipOperation | UnclipOperation;

type WriteOperation = {
	type: 'write';
	x: number;
	y: number;
	text: string;
	transformers: OutputTransformer[];
};

type ClipOperation = {
	type: 'clip';
	clip: Clip;
};

type Clip = {
	x1: number | undefined;
	x2: number | undefined;
	y1: number | undefined;
	y2: number | undefined;
};

type UnclipOperation = {
	type: 'unclip';
};

class OutputCaches {
	widths = new Map<string, number>();
	blockWidths = new Map<string, number>();
	styledChars = new Map<string, StyledChar[]>();

	getStyledChars(line: string): StyledChar[] {
		let cached = this.styledChars.get(line);
		if (cached === undefined) {
			cached = styledCharsFromTokens(tokenize(line));
			this.styledChars.set(line, cached);
		}

		return cached;
	}

	getStringWidth(text: string): number {
		let cached = this.widths.get(text);
		if (cached === undefined) {
			cached = stringWidth(text);
			this.widths.set(text, cached);
		}

		return cached;
	}

	getWidestLine(text: string): number {
		let cached = this.blockWidths.get(text);
		if (cached === undefined) {
			let lineWidth = 0;
			for (const line of text.split('\n')) {
				lineWidth = Math.max(lineWidth, this.getStringWidth(line));
			}

			cached = lineWidth;
			this.blockWidths.set(text, cached);
		}

		return cached;
	}
}

export default class Output {
	width: number;
	height: number;

	private readonly operations: Operation[] = [];
	private readonly caches: OutputCaches = new OutputCaches();

	// Dye additions: interning pools and screen buffer
	readonly charPool: CharPool;
	readonly stylePool: StylePool;
	readonly hyperlinkPool: HyperlinkPool;
	private screen: Screen | undefined;

	constructor(options: Options) {
		const {width, height} = options;

		this.width = width;
		this.height = height;
		this.charPool = new CharPool();
		this.stylePool = options.stylePool ?? new StylePool();
		this.hyperlinkPool = new HyperlinkPool();
	}

	write(
		x: number,
		y: number,
		text: string,
		options: {transformers: OutputTransformer[]},
	): void {
		const {transformers} = options;

		if (!text) {
			return;
		}

		this.operations.push({
			type: 'write',
			x,
			y,
			text,
			transformers,
		});
	}

	clip(clip: Clip) {
		this.operations.push({
			type: 'clip',
			clip,
		});
	}

	unclip() {
		this.operations.push({
			type: 'unclip',
		});
	}

	/**
	 * Process all operations and return the string output.
	 * This maintains full backward compatibility with the original Ink output.
	 * Internally, also populates the Screen buffer for cell-level diffing.
	 */
	get(): {output: string; height: number; screen: Screen} {
		// Initialize output array with a specific set of rows, so that margin/padding at the bottom is preserved
		const output: StyledChar[][] = [];

		for (let y = 0; y < this.height; y++) {
			const row: StyledChar[] = [];

			for (let x = 0; x < this.width; x++) {
				row.push({
					type: 'char',
					value: ' ',
					fullWidth: false,
					styles: [],
				});
			}

			output.push(row);
		}

		// Also create the Screen buffer
		this.screen = createScreen(
			this.width,
			this.height,
			this.stylePool,
			this.charPool,
			this.hyperlinkPool,
		);

		const clips: Clip[] = [];

		for (const operation of this.operations) {
			if (operation.type === 'clip') {
				clips.push(operation.clip);
			}

			if (operation.type === 'unclip') {
				clips.pop();
			}

			if (operation.type === 'write') {
				const {text, transformers} = operation;
				let {x, y} = operation;
				let lines = text.split('\n');

				const clip = clips.at(-1);

				if (clip) {
					const clipHorizontally =
						typeof clip?.x1 === 'number' && typeof clip?.x2 === 'number';

					const clipVertically =
						typeof clip?.y1 === 'number' && typeof clip?.y2 === 'number';

					// If text is positioned outside of clipping area altogether,
					// skip to the next operation to avoid unnecessary calculations
					if (clipHorizontally) {
						const width = this.caches.getWidestLine(text);

						if (x + width < clip.x1! || x > clip.x2!) {
							continue;
						}
					}

					if (clipVertically) {
						const height = lines.length;

						if (y + height < clip.y1! || y > clip.y2!) {
							continue;
						}
					}

					if (clipHorizontally) {
						lines = lines.map(line => {
							const from = x < clip.x1! ? clip.x1! - x : 0;
							const width = this.caches.getStringWidth(line);
							const to = x + width > clip.x2! ? clip.x2! - x : width;

							return sliceAnsi(line, from, to);
						});

						if (x < clip.x1!) {
							x = clip.x1!;
						}
					}

					if (clipVertically) {
						const from = y < clip.y1! ? clip.y1! - y : 0;
						const height = lines.length;
						const to = y + height > clip.y2! ? clip.y2! - y : height;

						lines = lines.slice(from, to);

						if (y < clip.y1!) {
							y = clip.y1!;
						}
					}
				}

				let offsetY = 0;

				for (let [index, line] of lines.entries()) {
					const currentLine = output[y + offsetY];

					// Line can be missing if `text` is taller than height of pre-initialized `this.output`
					if (!currentLine) {
						continue;
					}

					for (const transformer of transformers) {
						line = transformer(line, index);
					}

					const characters = this.caches.getStyledChars(line);
					let offsetX = x;

					// Nothing to write (e.g. line was clipped away).
					if (characters.length === 0) {
						offsetY++;
						continue;
					}

					const spaceCell: StyledChar = {
						type: 'char',
						value: ' ',
						fullWidth: false,
						styles: [],
					};

					// Wide characters (e.g. CJK) occupy two cells: a leading
					// cell with the character and a trailing placeholder with
					// value ''. When an overlapping write lands in the middle
					// of a wide character, the boundary cells need cleanup so
					// the terminal never renders a half-visible wide character.
					if (
						currentLine[offsetX]?.value === '' &&
						offsetX > 0 &&
						this.caches.getStringWidth(currentLine[offsetX - 1]?.value ?? '') >
							1
					) {
						currentLine[offsetX - 1] = spaceCell;

						// Also clean in Screen
						setCellAt(this.screen, offsetX - 1, y + offsetY, 0, 0, 0, CellWidth.Narrow);
					}

					for (const character of characters) {
						currentLine[offsetX] = character;

						// Write to Screen buffer too
						const charId = this.charPool.intern(character.value);
						const styleCodes: number[] = [];
						for (const s of character.styles) {
							// Match SGR sequences: \x1b[Nm, \x1b[N;N;...m, or bare \x1b[m (reset)
							const match = s.code.match(/\x1b\[(\d+(?:;\d+)*)?m/);
							if (match) {
								if (match[1]) {
									for (const n of match[1].split(';')) {
										const code = Number(n);
										if (Number.isInteger(code)) {
											styleCodes.push(code);
										}
									}
								} else {
									// Bare \x1b[m is equivalent to \x1b[0m (reset)
									styleCodes.push(0);
								}
							}
						}

						const styleId = this.stylePool.intern(styleCodes);
						const characterWidth = Math.max(
							1,
							this.caches.getStringWidth(character.value),
						);
						const cellWidth = characterWidth > 1 ? CellWidth.Wide : CellWidth.Narrow;
						setCellAt(this.screen, offsetX, y + offsetY, charId, styleId, 0, cellWidth);

						// For multi-column characters, clear following cells to avoid stray spaces/artifacts
						if (characterWidth > 1) {
							for (let index = 1; index < characterWidth; index++) {
								currentLine[offsetX + index] = {
									type: 'char',
									value: '',
									fullWidth: false,
									styles: character.styles,
								};

								// Spacer tail in Screen
								setCellAt(
									this.screen,
									offsetX + index,
									y + offsetY,
									this.charPool.intern(''),
									styleId,
									0,
									CellWidth.SpacerTail,
								);
							}
						}

						offsetX += characterWidth;
					}

					if (currentLine[offsetX]?.value === '') {
						currentLine[offsetX] = spaceCell;
						setCellAt(this.screen, offsetX, y + offsetY, 0, 0, 0, CellWidth.Narrow);
					}

					offsetY++;
				}
			}
		}

		const generatedOutput = output
			.map(line => {
				// See https://github.com/vadimdemedes/ink/pull/564#issuecomment-1637022742
				const lineWithoutEmptyItems = line.filter(item => item !== undefined);

				return styledCharsToString(lineWithoutEmptyItems).trimEnd();
			})
			.join('\n');

		return {
			output: generatedOutput,
			height: output.length,
			screen: this.screen!,
		};
	}

	/**
	 * Return the Screen buffer populated during the last get() call.
	 * @deprecated Use the `screen` property from get() return value instead.
	 */
	getScreen(): Screen | undefined {
		return this.screen;
	}
}
