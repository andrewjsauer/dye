import test from 'ava';
import React from 'react';
import {render, Text, type FrameEvent} from '../src/index.js';
import {FrameTimer} from '../src/frame-event.js';
import createStdout from './helpers/create-stdout.js';

// ---------------------------------------------------------------------------
// FrameTimer unit tests
// ---------------------------------------------------------------------------

test('FrameTimer - mark accumulates into named phase', t => {
	const timer = new FrameTimer();
	// Busy-wait briefly to accumulate measurable time
	const start = performance.now();
	while (performance.now() - start < 2) { /* spin */ }
	timer.mark('render');
	const event = timer.finish();
	t.true(event.phases.render > 0);
	t.is(event.phases.diff, 0);
	t.is(event.phases.optimize, 0);
});

test('FrameTimer - multiple marks for different phases', t => {
	const timer = new FrameTimer();
	const spin = (ms: number) => {
		const start = performance.now();
		while (performance.now() - start < ms) { /* spin */ }
	};

	spin(1);
	timer.mark('render');
	spin(1);
	timer.mark('diff');
	spin(1);
	timer.mark('write');

	const event = timer.finish();
	t.true(event.phases.render > 0);
	t.true(event.phases.diff > 0);
	t.true(event.phases.write > 0);
});

test('FrameTimer - finish returns durationMs approximately equal to phase sum', t => {
	const timer = new FrameTimer();
	const spin = (ms: number) => {
		const start = performance.now();
		while (performance.now() - start < ms) { /* spin */ }
	};

	spin(1);
	timer.mark('render');
	spin(1);
	timer.mark('write');

	const event = timer.finish();
	const phaseSum
		= event.phases.reconcile
		+ event.phases.layout
		+ event.phases.render
		+ event.phases.diff
		+ event.phases.optimize
		+ event.phases.write;
	// Phase sum should be ≤ durationMs (sum only covers marked phases)
	t.true(phaseSum <= event.durationMs + 0.1); // small tolerance
	// Should be reasonably close — no more than 5ms overhead
	t.true(event.durationMs - phaseSum < 5);
});

test('FrameTimer - patchCount and changedCellCount default to 0', t => {
	const timer = new FrameTimer();
	const event = timer.finish();
	t.is(event.patchCount, 0);
	t.is(event.changedCellCount, 0);
});

test('FrameTimer - timestamp captures start time', t => {
	const before = performance.now();
	const timer = new FrameTimer();
	const after = performance.now();
	const event = timer.finish();
	t.true(event.timestamp >= before);
	t.true(event.timestamp <= after);
});

test('FrameTimer - finish callable multiple times', t => {
	const timer = new FrameTimer();
	const e1 = timer.finish();
	// Small delay
	const start = performance.now();
	while (performance.now() - start < 1) { /* spin */ }
	const e2 = timer.finish();
	// Second call returns a later durationMs
	t.true(e2.durationMs >= e1.durationMs);
});

// ---------------------------------------------------------------------------
// onFrame integration
// ---------------------------------------------------------------------------

test('onFrame fires on render', t => {
	const stdout = createStdout(80, false);
	const events: FrameEvent[] = [];

	render(<Text>Hello</Text>, {
		stdout,
		debug: true,
		onFrame(event) {
			events.push(event);
		},
	});

	t.true(events.length >= 1);
	const first = events[0]!;
	t.true(first.durationMs > 0);
	t.true(first.phases.render > 0);
});

test('onFrame not required — render works without it', t => {
	const stdout = createStdout(80, false);
	t.notThrows(() => {
		render(<Text>Hello</Text>, {stdout, debug: true});
	});
});

test('onFrame errors do not break render', t => {
	const stdout = createStdout(80, false);
	t.notThrows(() => {
		render(<Text>Hello</Text>, {
			stdout,
			debug: true,
			onFrame() {
				throw new Error('boom');
			},
		});
	});
});
