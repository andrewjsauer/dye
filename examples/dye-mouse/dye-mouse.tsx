import React, {useState} from 'react';
import {
	render,
	Box,
	Text,
	AlternateScreen,
	type ClickEvent,
} from '../../src/index.js';

function Button({label, onClick, hovered}: {
	label: string;
	onClick: (e: ClickEvent) => void;
	hovered: boolean;
}) {
	return (
		<Box
			onClick={onClick}
			paddingX={2}
			borderStyle="round"
			borderColor={hovered ? 'cyan' : 'gray'}
		>
			<Text color={hovered ? 'cyan' : 'white'}>{label}</Text>
		</Box>
	);
}

function App() {
	const [count, setCount] = useState(0);
	const [hovered, setHovered] = useState<string | undefined>();

	return (
		<AlternateScreen mouseTracking>
			<Box flexDirection="column" padding={1} gap={1}>
				<Text bold>Click the buttons below</Text>
				<Text color="gray">Count: {count}</Text>
				<Box gap={1}>
					<Box
						onMouseEnter={() => setHovered('inc')}
						onMouseLeave={() => setHovered(undefined)}
					>
						<Button
							label="+ Increment"
							hovered={hovered === 'inc'}
							onClick={() => setCount(c => c + 1)}
						/>
					</Box>
					<Box
						onMouseEnter={() => setHovered('dec')}
						onMouseLeave={() => setHovered(undefined)}
					>
						<Button
							label="- Decrement"
							hovered={hovered === 'dec'}
							onClick={() => setCount(c => c - 1)}
						/>
					</Box>
					<Box
						onMouseEnter={() => setHovered('reset')}
						onMouseLeave={() => setHovered(undefined)}
					>
						<Button
							label="Reset"
							hovered={hovered === 'reset'}
							onClick={() => setCount(0)}
						/>
					</Box>
				</Box>
				<Text color="gray" dimColor>Press Ctrl+C to exit</Text>
			</Box>
		</AlternateScreen>
	);
}

render(<App />);
