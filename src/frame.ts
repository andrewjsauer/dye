/**
 * Frame — the output of a single render cycle.
 *
 * Contains the screen buffer (cell grid), cursor position, and viewport
 * dimensions. The renderer produces frames; the diff algorithm compares
 * consecutive frames to produce patches.
 */

import {type Screen} from './screen.js';

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

export type Cursor = {
	readonly x: number;
	readonly y: number;
	readonly visible: boolean;
};

// ---------------------------------------------------------------------------
// Viewport
// ---------------------------------------------------------------------------

export type Viewport = {
	readonly width: number;
	readonly height: number;
};

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

export type Frame = {
	readonly screen: Screen;
	readonly viewport: Viewport;
	readonly cursor: Cursor;
};

// ---------------------------------------------------------------------------
// Patch — atomic terminal write operations produced by the diff algorithm
// ---------------------------------------------------------------------------

export type Patch =
	| {readonly type: 'stdout'; readonly content: string}
	| {readonly type: 'clear'; readonly count: number}
	| {readonly type: 'cursorHide'}
	| {readonly type: 'cursorShow'}
	| {readonly type: 'cursorMove'; readonly x: number; readonly y: number}
	| {readonly type: 'cursorTo'; readonly col: number}
	| {readonly type: 'carriageReturn'}
	| {readonly type: 'hyperlink'; readonly uri: string}
	| {readonly type: 'styleStr'; readonly str: string};

export type Diff = Patch[];
