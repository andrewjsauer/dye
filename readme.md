# Dye

React terminal UI framework with mouse support, text selection, and double-buffered rendering.

Dye is a fork of [Ink](https://github.com/vadimdemedes/ink) v7, extended with features that are difficult to retrofit onto Ink without replacing its renderer:

- **Mouse support** — SGR protocol with hit-testing, click bubbling, hover tracking
- **Text selection** — character/word/line modes, drag-to-extend, clipboard copy
- **Double-buffered rendering** — packed Int32Array screen buffer, cell-level diffing, interning pools
- **Hardware scroll** — DECSTBM scroll regions for O(delta) row updates
- **Performance instrumentation** — per-frame phase timing via `onFrame` callback
- **AlternateScreen component** — DEC 1049 mode management with mouse lifecycle

Dye is an **API superset** of Ink v7 — existing Ink apps work by changing the import.

## Install

```
npm install @sauerapple/dye
```

## Quick start

```jsx
import React from 'react';
import {render, Box, Text} from '@sauerapple/dye';

function App() {
  return (
    <Box padding={1} borderStyle="round">
      <Text color="cyan" bold>Hello from Dye</Text>
    </Box>
  );
}

render(<App />);
```

## Features

### Mouse support

Wrap your app in `<AlternateScreen mouseTracking>` and add `onClick`, `onMouseEnter`, `onMouseLeave` to any Box:

```jsx
import {render, Box, Text, AlternateScreen} from '@sauerapple/dye';

render(
  <AlternateScreen mouseTracking>
    <Box
      onClick={event => console.log('clicked at', event.col, event.row)}
      onMouseEnter={() => console.log('entered')}
      onMouseLeave={() => console.log('left')}
      padding={1}
      borderStyle="round"
    >
      <Text>Click me</Text>
    </Box>
  </AlternateScreen>
);
```

Click events bubble through parent boxes. Call `event.stopPropagation()` to prevent bubbling, or `event.stopImmediatePropagation()` to halt all further handlers.

See [examples/dye-mouse](examples/dye-mouse/dye-mouse.tsx) for a full interactive demo.

### Text selection

Text selection works automatically in any app with mouse tracking enabled. Users can:

- **Click and drag** — character-by-character selection
- **Double-click** — select a word
- **Triple-click** — select a line

Consumers access the current selection via the `useSelection` hook:

```jsx
import {useSelection, useInput} from '@sauerapple/dye';

function SelectionCopier() {
  const {hasSelection, selectedText, clearSelection, copy} = useSelection();

  useInput((input, key) => {
    if (input === 'c' && key.ctrl) void copy();
    if (key.escape) clearSelection();
  });

  return hasSelection
    ? <Text>Selected: {selectedText}</Text>
    : <Text dimColor>No selection</Text>;
}
```

Clipboard copy uses platform-native commands: `pbcopy` on macOS, `xclip → wl-copy` on Linux, `clip.exe` on Windows.

See [examples/dye-selection](examples/dye-selection/dye-selection.tsx).

### Performance instrumentation

Profile your app's render performance with the `onFrame` callback:

```jsx
import {render, type FrameEvent} from '@sauerapple/dye';

render(<App />, {
  onFrame(event: FrameEvent) {
    console.log(`Frame: ${event.durationMs.toFixed(2)}ms`);
    console.log(`  render: ${event.phases.render.toFixed(2)}ms`);
    console.log(`  patches: ${event.patchCount}`);
  },
});
```

`FrameEvent` includes per-phase timings (`reconcile`, `layout`, `render`, `diff`, `optimize`, `write`), patch counts, and a timestamp.

See [examples/dye-perf](examples/dye-perf/dye-perf.tsx).

### AlternateScreen

The `<AlternateScreen>` component enters the terminal's alternate screen buffer on mount and restores the main screen on unmount. Great for full-screen TUIs that shouldn't pollute scrollback.

```jsx
<AlternateScreen mouseTracking>
  <YourApp />
</AlternateScreen>
```

Pass `mouseTracking` to enable SGR mouse modes (1000/1002/1006) for the lifetime of the component.

### Hardware scroll

When rendering scrollable regions that shift by a known delta, use DECSTBM scroll regions instead of redrawing the whole viewport:

```ts
import {applyScrollHint, createScreen} from '@sauerapple/dye';

const ansi = applyScrollHint(
  prevScreen,
  {top: 2, bottom: 20, delta: 1},      // scroll up by 1 in rows 2-19
  {altScreen: true, viewportHeight: 24},
);

stdout.write(ansi);
```

The hint also mutates `prevScreen` via `shiftRows` so the next diff only writes newly revealed rows.

## API

Dye re-exports all of Ink v7's public API. See the [Ink documentation](https://github.com/vadimdemedes/ink) for the base API reference.

### Additional components

| Export | Description |
|--------|-------------|
| `AlternateScreen` | Enters/exits DEC 1049 alt-screen mode |

### Additional hooks

| Export | Description |
|--------|-------------|
| `useSelection()` | Returns `{hasSelection, selectedText, selection, clearSelection, copy}` |

### Additional Box props

| Prop | Description |
|------|-------------|
| `onClick(event: ClickEvent)` | Mouse click handler — bubbles through ancestors |
| `onMouseEnter()` | Fired when mouse enters the box — non-bubbling |
| `onMouseLeave()` | Fired when mouse leaves the box — non-bubbling |

### Render options

| Option | Description |
|--------|-------------|
| `onFrame(event: FrameEvent)` | Per-frame timing breakdown and patch stats |

### Types

- `ClickEvent` — `{col, row, localCol, localRow, button, shift, alt, ctrl}` plus `stopPropagation`, `stopImmediatePropagation`
- `FrameEvent` — `{durationMs, phases, patchCount, changedCellCount, timestamp}`
- `SelectionState` — `{anchor, focus, mode}` where mode is `'character' | 'word' | 'line'`
- `Screen` — packed Int32Array cell grid with `charPool`, `stylePool`, `hyperlinkPool`
- `Patch` — atomic terminal operation (stdout, cursorMove, styleStr, etc.)

### Low-level exports

For advanced use cases:

- `parseMouse(sequence)`, `MOUSE_ENABLE`, `MOUSE_DISABLE` — SGR mouse protocol
- `dispatchClick`, `dispatchHover` — manual event dispatch
- `hitTest(root, col, row)` — coordinate-to-node lookup
- `createScreen`, `setCellAt`, `getCell` — screen buffer primitives
- `CharPool`, `StylePool`, `HyperlinkPool` — interning pools
- `diffScreens`, `optimize`, `diffToString` — cell-level diff pipeline
- `applyScrollHint`, `computeScrollHint` — hardware scroll helpers

## Comparison with Ink

|                          | Ink v7 | Dye |
|--------------------------|:------:|:---:|
| React terminal rendering | ✓      | ✓   |
| Yoga flexbox layout      | ✓      | ✓   |
| Kitty keyboard protocol  | ✓      | ✓   |
| Bracketed paste          | ✓      | ✓   |
| Alternate screen option  | ✓      | ✓   |
| Mouse support            |        | ✓   |
| Text selection           |        | ✓   |
| Hit-testing              |        | ✓   |
| Double-buffered rendering|        | ✓   |
| Cell-level diffing       |        | ✓   |
| Hardware scroll (DECSTBM)|        | ✓   |
| Per-frame perf metrics   |        | ✓   |

## Examples

- [dye-hello](examples/dye-hello/dye-hello.tsx) — minimal starter
- [dye-mouse](examples/dye-mouse/dye-mouse.tsx) — click handlers, hover state
- [dye-selection](examples/dye-selection/dye-selection.tsx) — text selection with clipboard copy
- [dye-perf](examples/dye-perf/dye-perf.tsx) — `onFrame` profiling

Run an example with:

```
npm run example examples/dye-hello/dye-hello.tsx
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [license](license) for details.

Based on [Ink](https://github.com/vadimdemedes/ink) by Vadim Demedes.
