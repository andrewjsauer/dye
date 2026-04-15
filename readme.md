# Dye

**The terminal is a canvas. Dye is the brush.**

> **Status: alpha (v0.1.0-alpha.0).** Core is stable, tested, and passes every upstream Ink v7 test. Install with `npm install @sauerapple/dye@alpha`. The API may shift before v1; see *What's wired vs. what's foundation* below.

Dye is a React framework for building terminal UIs that feel like applications, not logs — with a mouse that works, text you can actually select, and a renderer fast enough to animate. It is a drop-in superset of [Ink](https://github.com/vadimdemedes/ink) v7: change the import, keep your app.

```jsx
import {render, Box, Text, AlternateScreen} from '@sauerapple/dye';

render(
  <AlternateScreen mouseTracking>
    <Box padding={1} borderStyle="round" onClick={() => console.log('hi')}>
      <Text color="cyan" bold>Hello from Dye</Text>
    </Box>
  </AlternateScreen>,
  {alternateScreen: true},
);
```

## Why Dye

Ink made React-in-the-terminal feel obvious. But the moment you try to build something with the ambition of a real app — a file manager, a coding agent, a monitoring dashboard — you hit the same wall: no mouse, no selection, full-screen repaints, no way to see which frame was slow. Dye is what Ink becomes when you stop treating the terminal like a log and start treating it like a display.

- **Click anything.** Boxes take `onClick`, `onMouseEnter`, `onMouseLeave`. Events bubble like the DOM.
- **Select anything.** Drag to select, double-click a word, triple-click a line. `useSelection()` hands you the string.
- **Render like a game engine.** Double-buffered `Int32Array` screen with interned character/style/hyperlink pools powers hit-testing and selection today; the same buffer will drive cell-level terminal diffing in v0.2.
- **Scroll in hardware.** DECSTBM scroll regions move rows with a single terminal op instead of 200 line rewrites. Available as `applyScrollHint()` for consumers that own their output; fully automatic in v0.2.
- **Measure what you ship.** `onFrame` callback gives you per-phase timings (reconcile, layout, render, diff, write).
- **Own the whole screen.** `<AlternateScreen>` manages the DEC 1049 alt buffer and mouse lifecycle, and restores the terminal cleanly on exit, signal, or crash.

Everything Ink exports, Dye exports. Your existing `<Box>` and `<Text>` trees keep rendering. The new capabilities are opt-in.

## Install

```
npm install @sauerapple/dye
```

Requires Node 22+ and React 19. Also runs on Bun.

## A five-minute tour

### Mouse

```jsx
<AlternateScreen mouseTracking>
  <Box
    onClick={e => console.log('clicked at', e.col, e.row)}
    onMouseEnter={() => setHover(true)}
    onMouseLeave={() => setHover(false)}
    borderStyle={hover ? 'double' : 'round'}
  >
    <Text>Hover me</Text>
  </Box>
</AlternateScreen>
```

Clicks bubble through ancestors. Use `event.stopPropagation()` or `event.stopImmediatePropagation()` to control delivery. Hit-testing is O(depth) via a rect cache populated during layout.

### Selection

Once mouse tracking is on, users can select text the way they'd expect — drag, double-click, triple-click, shift-extend. You read it with a hook:

```jsx
import {useSelection, useInput} from '@sauerapple/dye';

function Copier() {
  const {hasSelection, selectedText, copy, clearSelection} = useSelection();

  useInput((input, key) => {
    if (input === 'c' && key.ctrl) void copy();
    if (key.escape) clearSelection();
  });

  return hasSelection
    ? <Text>{selectedText.length} chars selected</Text>
    : <Text dimColor>Drag to select</Text>;
}
```

`copy()` emits OSC 52 to the terminal by default — this is the clipboard mechanism that actually works inside tmux and over SSH, and it's supported by WezTerm, Kitty, iTerm2, Ghostty, Alacritty, and foot. For terminals without OSC 52 or for very large payloads, Dye falls back to `pbcopy` / `xclip` → `wl-copy` / `clip.exe`.

### Performance

```jsx
render(<App />, {
  onFrame(event) {
    if (event.durationMs > 8) {
      console.log(`slow frame: ${event.durationMs.toFixed(2)}ms`, event.phases);
    }
  },
});
```

`FrameEvent` carries `durationMs`, per-phase breakdown (`reconcile`, `layout`, `render`, `diff`, `optimize`, `write`), `patchCount`, and `changedCellCount`. In v0.1, `reconcile`/`layout`/`render` are accumulated as a single `render` phase and `patchCount`/`changedCellCount` remain 0 until the cell-level diff is wired into the terminal output path in v0.2.

### Hardware scroll

When a scroll by a known delta is the right mental model (lists, logs, virtualized panes), emit a DECSTBM hint and let the terminal do the work:

```ts
import {applyScrollHint} from '@sauerapple/dye';

stdout.write(applyScrollHint(prev, {top: 2, bottom: 20, delta: 1}, {
  altScreen: true,
  viewportHeight: 24,
}));
```

The next diff then only writes the newly revealed rows.

## API

Dye re-exports all of Ink v7's public API — see the [Ink docs](https://github.com/vadimdemedes/ink) for the base. Dye adds:

**Components** — `AlternateScreen`

**Hooks** — `useSelection`, `usePaste`, `useBoxMetrics`, `useAnimation`, `useCursor`, `useIsScreenReaderEnabled`

**Box props** — `onClick`, `onMouseEnter`, `onMouseLeave`

**Render options** — `onFrame`

**Types** — `ClickEvent`, `FrameEvent`, `SelectionState`, `Screen`, `Patch`

**Low-level (advanced)** — `parseMouse`, `MOUSE_ENABLE`, `MOUSE_DISABLE`, `dispatchClick`, `dispatchHover`, `hitTest`, `createScreen`, `setCellAt`, `getCell`, `CharPool`, `StylePool`, `HyperlinkPool`, `diffScreens`, `optimize`, `diffToString`, `applyScrollHint`, `computeScrollHint`

## What's wired vs. what's foundation

Dye ships 9 units of work; a few are foundation that consumers can use directly but that aren't yet driving the default terminal output path. Honest breakdown for v0.1 alpha:

| Feature | Status in v0.1 |
|---|---|
| Mouse input + hit-testing | Wired. `onClick`, `onMouseEnter`, `onMouseLeave` work in `<AlternateScreen mouseTracking>`. |
| Text selection + `useSelection` | Wired. Multi-click modes, drag extension, OSC 52 clipboard. |
| `AlternateScreen` component | Wired. DEC 1049, mouse lifecycle, restore on unmount. |
| `onFrame` performance callback | Wired. Fires every frame with `durationMs`. |
| Screen buffer + interning pools | Wired (populated every render, consumed by selection + hit-test). |
| Node rect cache | Wired (drives hit-testing). |
| **Cell-level diff → terminal output** | **Foundation.** `diffScreens` / `optimize` / `diffToString` are available to consumers; the default terminal output still uses Ink's line-level `log-update`. Automatic wiring lands in v0.2. |
| **DECSTBM hardware scroll** | **Foundation.** `applyScrollHint()` works for consumers that own their output; not yet invoked automatically by the renderer. v0.2. |
| **Per-phase `FrameEvent` timings** | Foundation. `durationMs` is accurate; `phases.render` includes reconcile+layout+render-to-screen (not split); `phases.diff`/`optimize`/`write` and `patchCount`/`changedCellCount` populate in v0.2 when the diff is wired. |

## Dye vs Ink

|                           | Ink v7 | Dye |
| ------------------------- | :----: | :-: |
| React terminal rendering  |   ✓    |  ✓  |
| Yoga flexbox layout       |   ✓    |  ✓  |
| Kitty keyboard protocol   |   ✓    |  ✓  |
| Bracketed paste           |   ✓    |  ✓  |
| Alternate screen          |   ✓    |  ✓  |
| Mouse input               |        |  ✓  |
| Text selection            |        |  ✓  |
| OSC 52 clipboard          |        |  ✓  |
| Hit-testing               |        |  ✓  |
| Double-buffered screen    |        |  ✓  |
| Cell-level diffing        |        |  ~  |
| DECSTBM hardware scroll   |        |  ~  |
| Per-frame perf metrics    |        |  ✓  |

`~` = foundation shipped in v0.1; wired to default output path in v0.2.

For a file-by-file breakdown of what was added, replaced, or deliberately left out, see [docs/DIFF-FROM-INK.md](docs/DIFF-FROM-INK.md).


## Examples

- [dye-hello](examples/dye-hello/dye-hello.tsx) — minimal starter
- [dye-mouse](examples/dye-mouse/dye-mouse.tsx) — click handlers, hover state
- [dye-selection](examples/dye-selection/dye-selection.tsx) — text selection + clipboard copy
- [dye-perf](examples/dye-perf/dye-perf.tsx) — `onFrame` profiling

```
npm run example examples/dye-hello/dye-hello.tsx
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits

Dye is a fork of [Ink](https://github.com/vadimdemedes/ink) by Vadim Demedes, extended with a double-buffered renderer, mouse support, text selection, hardware scroll, and per-frame performance instrumentation — all released under Ink's MIT license.

## License

MIT — see [license](license).
