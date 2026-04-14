import {createContext} from 'react';
import {SelectionManager} from '../selection-manager.js';

export type SelectionContextValue = {
	readonly manager: SelectionManager;
};

/**
 * Context providing the SelectionManager instance to components.
 * Created by the Ink render root.
 */
const SelectionContext = createContext<SelectionContextValue>({
	manager: new SelectionManager(),
});

SelectionContext.displayName = 'DyeSelectionContext';

export default SelectionContext;
