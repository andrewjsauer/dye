import React from 'react';
import {
	render,
	Box,
	Text,
	AlternateScreen,
	useSelection,
	useInput,
} from '../../src/index.js';

function SelectionStatus() {
	const {hasSelection, selectedText, clearSelection, copy} = useSelection();

	useInput((input, key) => {
		if (key.escape) {
			clearSelection();
		}

		if ((input === 'c' && key.ctrl) || input === 'y') {
			void copy();
		}
	});

	if (!hasSelection) {
		return (
			<Text dimColor color='gray'>
				No selection. Click and drag to select text.
			</Text>
		);
	}

	return (
		<Box flexDirection='column'>
			<Text color='yellow'>Selected ({selectedText.length} chars):</Text>
			<Text color='cyan'>{JSON.stringify(selectedText)}</Text>
			<Text dimColor color='gray'>
				Press Ctrl+C or y to copy | Esc to clear | Triple-click for line select
			</Text>
		</Box>
	);
}

function App() {
	return (
		<AlternateScreen mouseTracking>
			<Box flexDirection='column' padding={1} gap={1}>
				<Text bold color='cyan'>
					Text Selection Demo
				</Text>
				<Box borderStyle='round' padding={1}>
					<Text>
						The quick brown fox jumps over the lazy dog.{'\n'}
						Click and drag to select text, double-click for word,{'\n'}
						triple-click for line. Mouse tracking must be enabled.
					</Text>
				</Box>
				<SelectionStatus />
			</Box>
		</AlternateScreen>
	);
}

render(<App />, {alternateScreen: true});
