import React, {useState, useEffect} from 'react';
import {render, Box, Text, type FrameEvent} from '../../src/index.js';

// Module-level stats accumulator. onFrame writes here; the React component
// reads from it on each interval tick (avoids the onFrame→rerender loop).
const stats = {count: 0, total: 0, max: 0, lastMs: 0};

function App() {
	const [, tick] = useState(0);

	// Force a re-render every 100ms so the displayed stats stay fresh
	useEffect(() => {
		const interval = setInterval(() => tick(t => t + 1), 100);
		return () => clearInterval(interval);
	}, []);

	const avgMs = stats.count > 0 ? stats.total / stats.count : 0;

	return (
		<Box flexDirection="column" padding={1} gap={1} borderStyle="round">
			<Text bold color="cyan">Dye Performance Demo</Text>
			<Box flexDirection="column">
				<Text>Frames rendered: <Text color="yellow">{stats.count}</Text></Text>
				<Text>Last frame:  <Text color="green">{stats.lastMs.toFixed(2)}ms</Text></Text>
				<Text>Average:     <Text color="green">{avgMs.toFixed(2)}ms</Text></Text>
				<Text>Max:         <Text color="red">{stats.max.toFixed(2)}ms</Text></Text>
			</Box>
			<Text dimColor>Press Ctrl+C to exit</Text>
		</Box>
	);
}

render(<App />, {
	onFrame(event: FrameEvent) {
		stats.count++;
		stats.total += event.durationMs;
		stats.lastMs = event.durationMs;
		if (event.durationMs > stats.max) stats.max = event.durationMs;
	},
});
