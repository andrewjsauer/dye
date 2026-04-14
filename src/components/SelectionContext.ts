import {createContext} from 'react';
import {SelectionManager} from '../selection-manager.js';

export type SelectionContextValue = {
	readonly manager: SelectionManager;
};

/**
 * Context providing the SelectionManager instance to components.
 * The Ink render root supplies the real manager; the default value is a
 * no-op manager that works outside of render (e.g., in renderToString)
 * so useSelection returns hasSelection=false instead of throwing.
 */
const defaultManager = new SelectionManager();

const SelectionContext = createContext<SelectionContextValue>({
	manager: defaultManager,
});

SelectionContext.displayName = 'DyeSelectionContext';

export default SelectionContext;
