/**
 * Mouse debug tool — bypasses Dye's mouse handler and logs raw input bytes
 * via useInput. Tells us whether the terminal sends SGR mouse events at all.
 *
 * Usage: node --import=tsx examples/dye-mouse-debug.tsx
 * Press q to exit.
 *
 * Interpretation:
 *   - You see `\x1b[<0;col;rowM` / `m` when clicking → terminal sends SGR
 *   - You see `\x1b[Mabc` (3-byte binary) → terminal sent X10 mouse (older)
 *   - You see nothing when clicking → terminal isn't reporting mouse at all
 *     (likely need to enable in Preferences → Profiles → Terminal)
 */
import process from 'node:process';
import React, {useState, useEffect} from 'react';
import {
	render,
	Box,
	Text,
	useApp,
	useInput,
} from '../src/index.js';

// Raw SGR mouse enable — bypasses AlternateScreen component entirely
const MOUSE_ENABLE = '\u001B[?1000h\u001B[?1002h\u001B[?1006h';
const MOUSE_DISABLE = '\u001B[?1006l\u001B[?1002l\u001B[?1000l';

function App() {
	const [events, setEvents] = useState<string[]>([]);
	const {exit} = useApp();

	useEffect(() => {
		process.stdout.write(MOUSE_ENABLE);
		return () => {
			process.stdout.write(MOUSE_DISABLE);
		};
	}, []);

	useInput((input, key) => {
		if (input === 'q' || key.escape || (input === 'c' && key.ctrl)) {
			exit();
			return;
		}

		const hex = [...input]
			.map(c => {
				const code = c.charCodeAt(0);
				return code < 32 || code > 126
					? `\\x${code.toString(16).padStart(2, '0')}`
					: c;
			})
			.join('');
		setEvents(prev => [...prev.slice(-15), hex]);
	});

	return (
		<Box flexDirection='column' padding={1} gap={1}>
			<Text bold color='cyan'>
				Mouse input probe — click / scroll / move the mouse, press q to exit
			</Text>
			<Text dimColor>Expected: \x1b[&lt;0;col;rowM on left-click press</Text>
			<Box flexDirection='column' borderStyle='round' padding={1}>
				<Text bold>Raw inputs received:</Text>
				{events.length === 0 ? (
					<Text dimColor>(none yet — try clicking inside this window)</Text>
				) : (
					events.map((e, i) => <Text key={i}>{e}</Text>)
				)}
			</Box>
		</Box>
	);
}

render(<App />, {alternateScreen: true});
