# Dye

React terminal UI framework with mouse support, text selection, and double-buffered rendering.

Fork of [Ink](https://github.com/vadimdemedes/ink) v7, extended with:

- **Double-buffered rendering** — front/back screen buffers with cell-level ANSI diffing
- **Cell pooling** — allocation-free steady-state rendering via character/style/hyperlink interning
- **Mouse support** — SGR mouse protocol with hit-testing and click/hover event dispatch
- **Text selection** — character/word/line modes with multi-click and clipboard copy
- **Hardware scroll** — DECSTBM scroll regions for efficient viewport updates
- **Performance instrumentation** — frame timing breakdown via onFrame callback

Dye is an API superset of Ink v7 — existing Ink apps work by changing the import.

## Install

```
npm install @sauerapple/dye
```

## Usage

```jsx
import React from 'react';
import {render, Text} from '@sauerapple/dye';

function App() {
  return <Text>Hello from Dye</Text>;
}

render(<App />);
```

## API

Dye re-exports all of Ink v7's public API. See the [Ink documentation](https://github.com/vadimdemedes/ink) for the base API reference.

Additional APIs for mouse, selection, scroll, and performance instrumentation will be documented as they are implemented.

## License

MIT — see [license](license) for details.

Based on [Ink](https://github.com/vadimdemedes/ink) by Vadim Demedes.
