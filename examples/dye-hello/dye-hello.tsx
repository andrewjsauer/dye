import React from 'react';
import {render, Box, Text} from '../../src/index.js';

function App() {
	return (
		<Box flexDirection="column" padding={1} borderStyle="round">
			<Text color="cyan" bold>Hello from Dye</Text>
			<Text>React terminal UI with mouse, selection, and scroll.</Text>
		</Box>
	);
}

render(<App />);
