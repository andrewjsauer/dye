/**
 * AlternateScreen — React component that enters the terminal's alternate
 * screen buffer (DEC 1049) on mount and restores the main screen on unmount.
 *
 * Optionally enables mouse tracking (SGR protocol) when mouseTracking is true.
 *
 * Usage:
 *   <AlternateScreen mouseTracking>
 *     <Box>Your full-screen app here</Box>
 *   </AlternateScreen>
 */
import React, {useEffect, useContext, type PropsWithChildren} from 'react';
import Box from './Box.js';
import StdoutContext from './StdoutContext.js';
import {MOUSE_ENABLE, MOUSE_DISABLE} from '../mouse.js';

export type AlternateScreenProps = {
	/**
	 * Enable SGR mouse tracking in the alternate screen.
	 * When true, mouse click, drag, and motion events are reported.
	 * @default false
	 */
	readonly mouseTracking?: boolean;
};

// DEC 1049: alternate screen buffer
const ENTER_ALT_SCREEN = '\x1b[?1049h';
const EXIT_ALT_SCREEN = '\x1b[?1049l';
const CLEAR_SCREEN = '\x1b[2J';
const CURSOR_HOME = '\x1b[H';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';

/**
 * AlternateScreen component.
 *
 * On mount: enters alt screen, clears, homes cursor, optionally enables mouse.
 * On unmount: disables mouse, exits alt screen, restores main screen.
 * Children are rendered inside a Box that fills the terminal height.
 */
const AlternateScreen = ({
	children,
	mouseTracking = false,
}: PropsWithChildren<AlternateScreenProps>) => {
	const {stdout} = useContext(StdoutContext);

	useEffect(() => {
		// Enter alternate screen
		let enterSequence = ENTER_ALT_SCREEN + CLEAR_SCREEN + CURSOR_HOME + HIDE_CURSOR;

		if (mouseTracking) {
			enterSequence += MOUSE_ENABLE;
		}

		stdout.write(enterSequence);

		// Cleanup: exit alternate screen
		return () => {
			let exitSequence = '';

			if (mouseTracking) {
				exitSequence += MOUSE_DISABLE;
			}

			exitSequence += SHOW_CURSOR + EXIT_ALT_SCREEN;
			stdout.write(exitSequence);
		};
	}, [stdout, mouseTracking]);

	return (
		<Box flexDirection="column" flexGrow={1}>
			{children}
		</Box>
	);
};

AlternateScreen.displayName = 'AlternateScreen';

export default AlternateScreen;
