import React, {useState} from 'react';
import {
	render,
	Box,
	Text,
	AlternateScreen,
	useApp,
	useInput,
	type ClickEvent,
} from '../../src/index.js';

function Button({
	label,
	onClick,
	hovered,
}: {
	readonly label: string;
	readonly onClick: (e: ClickEvent) => void;
	readonly hovered: boolean;
}) {
	return (
		<Box
			paddingX={2}
			borderStyle='round'
			borderColor={hovered ? 'cyan' : 'gray'}
			onClick={onClick}
		>
			<Text color={hovered ? 'cyan' : 'white'}>{label}</Text>
		</Box>
	);
}

function App() {
	const [count, setCount] = useState(0);
	const [hovered, setHovered] = useState<string | undefined>();
	const {exit} = useApp();

	// useInput puts stdin in raw mode so the SGR mouse sequences reach Dye,
	// and keeps the process alive (otherwise Node exits once render returns).
	useInput((input, key) => {
		if (key.escape || input === 'q' || (input === 'c' && key.ctrl)) {
			exit();
		}
	});

	return (
		<AlternateScreen mouseTracking>
			<Box flexDirection='column' padding={1} gap={1}>
				<Text bold>Click the buttons below</Text>
				<Text color='gray'>Count: {count}</Text>
				<Box gap={1}>
					<Box
						onMouseEnter={() => {
							setHovered('inc');
						}}
						onMouseLeave={() => {
							setHovered(undefined);
						}}
					>
						<Button
							label='+ Increment'
							hovered={hovered === 'inc'}
							onClick={() => {
								setCount(c => c + 1);
							}}
						/>
					</Box>
					<Box
						onMouseEnter={() => {
							setHovered('dec');
						}}
						onMouseLeave={() => {
							setHovered(undefined);
						}}
					>
						<Button
							label='- Decrement'
							hovered={hovered === 'dec'}
							onClick={() => {
								setCount(c => c - 1);
							}}
						/>
					</Box>
					<Box
						onMouseEnter={() => {
							setHovered('reset');
						}}
						onMouseLeave={() => {
							setHovered(undefined);
						}}
					>
						<Button
							label='Reset'
							hovered={hovered === 'reset'}
							onClick={() => {
								setCount(0);
							}}
						/>
					</Box>
				</Box>
				<Text dimColor color='gray'>
					Press q or Esc to exit
				</Text>
			</Box>
		</AlternateScreen>
	);
}

render(<App />, {alternateScreen: true});
