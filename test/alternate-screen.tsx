import test from 'ava';
import React from 'react';
import {render, Text, AlternateScreen} from '../src/index.js';
import createStdout from './helpers/create-stdout.js';

test('AlternateScreen writes enter sequence on mount', t => {
	const stdout = createStdout(80, true);

	render(
		<AlternateScreen>
			<Text>Hello</Text>
		</AlternateScreen>,
		{stdout, debug: false},
	);

	const writes = stdout.getWrites();
	const allOutput = writes.join('');

	// Should contain DEC 1049 enter
	t.true(allOutput.includes('\u001B[?1049h'));
	// Should contain screen clear
	t.true(allOutput.includes('\u001B[2J'));
});

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

	// Should contain mouse enable sequences
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

	// Should NOT contain mouse enable sequences
	t.false(allOutput.includes('\u001B[?1000h'));
});
