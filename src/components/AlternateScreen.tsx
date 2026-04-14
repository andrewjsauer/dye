/**
 * AlternateScreen — React component that enables SGR mouse tracking for the
 * lifetime of the component.
 *
 * For alt-screen buffer management, pass `{alternateScreen: true}` to render().
 * Ink writes the DEC 1049 enter sequence *before* any render output, which is
 * the only ordering that avoids clearing your own content.
 *
 * Usage:
 *   render(<AlternateScreen mouseTracking><App /></AlternateScreen>, {
 *     alternateScreen: true,
 *   });
 *
 * Or, if you only want mouse tracking without alt-screen:
 *   render(<AlternateScreen mouseTracking><App /></AlternateScreen>);
 */
import React, {useEffect, useContext, type PropsWithChildren} from 'react';
import {MOUSE_ENABLE, MOUSE_DISABLE} from '../mouse.js';
import Box from './Box.js';
import StdoutContext from './StdoutContext.js';

export type AlternateScreenProps = {
	/**
	 * Enable SGR mouse tracking (modes 1000/1002/1006) while this component
	 * is mounted. When true, mouse click, drag, and motion events are reported
	 * to the component tree via onClick / onMouseEnter / onMouseLeave handlers.
	 * @default false
	 */
	readonly mouseTracking?: boolean;
};

function AlternateScreen({
	children,
	mouseTracking = false,
}: PropsWithChildren<AlternateScreenProps>) {
	const {stdout} = useContext(StdoutContext);

	useEffect(() => {
		if (!mouseTracking) {
			return;
		}

		stdout.write(MOUSE_ENABLE);
		return () => {
			stdout.write(MOUSE_DISABLE);
		};
	}, [stdout, mouseTracking]);

	return (
		<Box flexDirection='column' flexGrow={1}>
			{children}
		</Box>
	);
}

AlternateScreen.displayName = 'AlternateScreen';

export default AlternateScreen;
