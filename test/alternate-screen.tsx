import test from 'ava';
import React from 'react';
import {render, Text, AlternateScreen} from '../src/index.js';
import createStdout from './helpers/create-stdout.js';

test('AlternateScreen with mouseTracking enables mouse modes', t => {
	const stdout = createStdout(80, true);

	render(
		<AlternateScreen mouseTracking>
			<Text>Hello</Text>
		</AlternateScreen>,
		{stdout, debug: false},
	);

	const writes = stdout.getWrites();
	const allOutput = writes.join('');

	t.true(allOutput.includes('\u001B[?1000h'));
	t.true(allOutput.includes('\u001B[?1002h'));
	t.true(allOutput.includes('\u001B[?1006h'));
});

test('AlternateScreen without mouseTracking does not enable mouse', t => {
	const stdout = createStdout(80, true);

	render(
		<AlternateScreen>
			<Text>Hello</Text>
		</AlternateScreen>,
		{stdout, debug: false},
	);

	const writes = stdout.getWrites();
	const allOutput = writes.join('');

	t.false(allOutput.includes('\u001B[?1000h'));
});

test('AlternateScreen does not write DEC 1049 itself (use {alternateScreen: true} render option)', t => {
	const stdout = createStdout(80, true);

	render(
		<AlternateScreen>
			<Text>Hello</Text>
		</AlternateScreen>,
		{stdout, debug: false},
	);

	// AlternateScreen component is now mouse-only. The DEC 1049 enter
	// sequence is written by Ink itself when {alternateScreen: true} is
	// passed to render() — the only ordering that doesn't clear the
	// app's own first-frame output.
	const writes = stdout.getWrites();
	const allOutput = writes.join('');

	t.false(allOutput.includes('\u001B[?1049h'));
});
