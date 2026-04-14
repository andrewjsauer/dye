import React, {forwardRef, useContext, type PropsWithChildren} from 'react';
import {type Except} from 'type-fest';
import {type Styles} from '../styles.js';
import {type DOMElement} from '../dom.js';
import {type ClickEvent} from '../events/click-event.js';
import {accessibilityContext} from './AccessibilityContext.js';
import {backgroundContext} from './BackgroundContext.js';

export type Props = Except<Styles, 'textWrap'> & {
	/**
	Handler called when the element is clicked (mouse button press).
	Requires mouse tracking to be enabled (via AlternateScreen with mouseTracking).
	*/
	readonly onClick?: (event: ClickEvent) => void;

	/**
	Handler called when the mouse enters this element's bounds.
	Non-bubbling. No event argument.
	*/
	readonly onMouseEnter?: () => void;

	/**
	Handler called when the mouse leaves this element's bounds.
	Non-bubbling. No event argument.
	*/
	readonly onMouseLeave?: () => void;
	/**
	A label for the element for screen readers.
	*/
	readonly 'aria-label'?: string;

	/**
	Hide the element from screen readers.
	*/
	readonly 'aria-hidden'?: boolean;

	/**
	The role of the element.
	*/
	readonly 'aria-role'?:
		| 'button'
		| 'checkbox'
		| 'combobox'
		| 'list'
		| 'listbox'
		| 'listitem'
		| 'menu'
		| 'menuitem'
		| 'option'
		| 'progressbar'
		| 'radio'
		| 'radiogroup'
		| 'tab'
		| 'tablist'
		| 'table'
		| 'textbox'
		| 'timer'
		| 'toolbar';

	/**
	The state of the element.
	*/
	readonly 'aria-state'?: {
		readonly busy?: boolean;
		readonly checked?: boolean;
		readonly disabled?: boolean;
		readonly expanded?: boolean;
		readonly multiline?: boolean;
		readonly multiselectable?: boolean;
		readonly readonly?: boolean;
		readonly required?: boolean;
		readonly selected?: boolean;
	};
};

/**
`<Box>` is an essential Ink component to build your layout. It's like `<div style="display: flex">` in the browser.
*/
const Box = forwardRef<DOMElement, PropsWithChildren<Props>>((
	{
		children,
		backgroundColor,
		onClick,
		onMouseEnter,
		onMouseLeave,
		'aria-label': ariaLabel,
		'aria-hidden': ariaHidden,
		'aria-role': role,
		'aria-state': ariaState,
		...style
	},
	ref,
) => {
	const {isScreenReaderEnabled} = useContext(accessibilityContext);
	const label = ariaLabel ? <ink-text>{ariaLabel}</ink-text> : undefined;
	if (isScreenReaderEnabled && ariaHidden) {
		return null;
	}

	const boxElement = (
		<ink-box
			ref={ref}
			style={{
				flexWrap: 'nowrap',
				flexDirection: 'row',
				flexGrow: 0,
				flexShrink: 1,
				...style,
				backgroundColor,
				overflowX: style.overflowX ?? style.overflow ?? 'visible',
				overflowY: style.overflowY ?? style.overflow ?? 'visible',
			}}
			internal_accessibility={{
				role,
				state: ariaState,
			}}
			onClick={onClick}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
		>
			{isScreenReaderEnabled && label ? label : children}
		</ink-box>
	);

	// If this Box has a background color, provide it to children via context
	if (backgroundColor) {
		return (
			<backgroundContext.Provider value={backgroundColor}>
				{boxElement}
			</backgroundContext.Provider>
		);
	}

	return boxElement;
});

Box.displayName = 'Box';

export default Box;
