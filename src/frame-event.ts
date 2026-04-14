/**
 * Frame event — performance instrumentation data emitted after each render.
 *
 * Captures timing breakdown across render phases so consumers can profile
 * their app. Emitted via the onFrame callback in render() options.
 *
 * All times are in milliseconds, measured via performance.now().
 * Phase times can sum to slightly less than durationMs due to
 * instrumentation overhead not being counted in any phase.
 */

export type FramePhases = {
	/** React reconciliation + commit (includes component rendering). */
	readonly reconcile: number;
	/** Yoga layout calculation. */
	readonly layout: number;
	/** Walking the DOM tree and populating the Screen buffer. */
	readonly render: number;
	/** Cell-level diff against the previous frame. */
	readonly diff: number;
	/** Patch optimization pass (merge, dedupe, cancel no-ops). */
	readonly optimize: number;
	/** Writing ANSI bytes to stdout. */
	readonly write: number;
};

export type FrameEvent = {
	/** Wall-clock time from frame start to end, in milliseconds. */
	readonly durationMs: number;
	/** Per-phase timing breakdown. Sums approximately to durationMs. */
	readonly phases: FramePhases;
	/** Number of patches produced by the diff (after optimization). */
	readonly patchCount: number;
	/** Number of cells that differed between frames. */
	readonly changedCellCount: number;
	/** Performance.now() timestamp when the frame started. */
	readonly timestamp: number;
};

/**
 * Mutable builder for a FrameEvent. Lets the render loop accumulate
 * phase timings progressively without rebuilding the object each time.
 */
export class FrameTimer {
	private readonly startTime: number;
	private phaseStart: number;
	private readonly phases: {
		reconcile: number;
		layout: number;
		render: number;
		diff: number;
		optimize: number;
		write: number;
	} = {
		reconcile: 0,
		layout: 0,
		render: 0,
		diff: 0,
		optimize: 0,
		write: 0,
	};

	patchCount = 0;
	changedCellCount = 0;

	constructor() {
		this.startTime = performance.now();
		this.phaseStart = this.startTime;
	}

	/**
	 * Record the elapsed time since the last mark() or construction
	 * into the named phase, then reset the phase start time.
	 */
	mark(phase: keyof FrameTimer['phases']): void {
		const now = performance.now();
		this.phases[phase] += now - this.phaseStart;
		this.phaseStart = now;
	}

	/**
	 * Finalize and return the FrameEvent. Callable multiple times —
	 * each call snapshots the current accumulated totals.
	 */
	finish(): FrameEvent {
		const durationMs = performance.now() - this.startTime;
		return {
			durationMs,
			phases: {...this.phases},
			patchCount: this.patchCount,
			changedCellCount: this.changedCellCount,
			timestamp: this.startTime,
		};
	}
}
