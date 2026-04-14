import React, {useState, useEffect} from 'react';
import {render, Box, Text, type FrameEvent} from '../../src/index.js';

type Stats = {
	count: number;
	avgMs: number;
	maxMs: number;
};

function Tick() {
	const [n, setN] = useState(0);
	useEffect(() => {
		const interval = setInterval(() => setN(x => x + 1), 50);
		return () => clearInterval(interval);
	}, []);
	return <Text>Tick: {n}</Text>;
}

function App({stats}: {stats: Stats}) {
	return (
		<Box flexDirection="column" padding={1} gap={1} borderStyle="round">
			<Text bold color="cyan">Dye Performance Demo</Text>
			<Tick />
			<Box flexDirection="column">
				<Text>Frames: <Text color="yellow">{stats.count}</Text></Text>
				<Text>Avg: <Text color="green">{stats.avgMs.toFixed(2)}ms</Text></Text>
				<Text>Max: <Text color="red">{stats.maxMs.toFixed(2)}ms</Text></Text>
			</Box>
			<Text dimColor>Press Ctrl+C to exit</Text>
		</Box>
	);
}

let total = 0;
let count = 0;
let max = 0;

const instance = render(<App stats={{count: 0, avgMs: 0, maxMs: 0}} />, {
	onFrame(event: FrameEvent) {
		total += event.durationMs;
		count++;
		max = Math.max(max, event.durationMs);
		// Re-render with updated stats every 10 frames
		if (count % 10 === 0) {
			instance.rerender(
				<App stats={{count, avgMs: total / count, maxMs: max}} />,
			);
		}
	},
});
