# Differences from Ink

Dye is a fork of [Ink](https://github.com/vadimdemedes/ink) v7.0.0. The public API is a superset: existing Ink apps work by swapping the import. This document enumerates what Dye adds, changes, or replaces, with pointers into the source.

## Summary table

| Area                          | Ink v7                                | Dye                                                   |
| ----------------------------- | ------------------------------------- | ----------------------------------------------------- |
| Renderer output               | String diff via `log-update`          | Packed `Int32Array` screen buffer + cell-level diff   |
| Frame lifecycle               | Render → stringify → write            | Build → diff → emit ANSI → optional scroll hint       |
| Mouse                         | Not supported                         | SGR 1006 parser, hit-testing, bubbling dispatch       |
| Text selection                | Terminal-native only (no app control) | App-controlled overlay, multi-click modes, clipboard  |
| Scroll                        | Full-screen repaint                   | DECSTBM scroll regions for O(delta) row updates       |
| Alt-screen management         | Manual ANSI escapes                   | `<AlternateScreen>` component with mouse lifecycle    |
| Per-frame instrumentation     | None                                  | `onFrame` callback with phase timings                 |
| Rect cache / hit-test         | None                                  | `node-cache.ts` + `hitTest(root, col, row)`           |
| Object allocation per frame   | High (strings, arrays, objects)       | Interning pools for styles, cells, runs               |
| Kitty keyboard protocol       | Partial                               | Full disambiguated-keys parser                        |
| Paste bracketing              | No                                    | `usePaste` hook                                       |

## Added source files (not in upstream Ink)

These files have no counterpart in Ink v7:

- `src/screen.ts` — double-buffered `Screen` class backing every frame
- `src/frame.ts` — frame representation consumed by the diff
- `src/diff.ts` — cell-level diff producing minimal ANSI output
- `src/pools.ts` — interning pools for styles, cells, and text runs
- `src/node-cache.ts` — per-node rect cache populated during layout
- `src/mouse.ts` — SGR 1006 mouse sequence parser
- `src/events/click-event.ts`, `events/dispatch.ts`, `events/event.ts` — event objects and bubbling dispatcher
- `src/selection.ts`, `selection-manager.ts`, `selection-overlay.ts` — text-selection model, state machine, and render overlay
- `src/scroll-hint.ts` — DECSTBM scroll-region detection and emission
- `src/frame-event.ts` — `onFrame` callback payload and phase timer
- `src/kitty-keyboard.ts` — Kitty keyboard protocol parser
- `src/components/AlternateScreen.tsx` — alt-screen + mouse-tracking component
- `src/hooks/use-selection.ts`, `use-paste.ts`, `use-box-metrics.ts`, `use-animation.ts`, `use-cursor.ts`, `use-is-screen-reader-enabled.ts`

## Replaced / rewritten files

- `src/renderer.ts` — writes a `Frame` via `Screen` + diff, not a single escaped string. Emits scroll hints before the diff when applicable.
- `src/reconciler.ts` — populates the node rect cache as layout commits so hit-tests are O(depth).
- `src/log-update.ts` — retained as a fallback path only; the primary write path is `write-synchronized.ts` which uses DEC 2026 synchronized output when the terminal advertises it.
- `src/components/Box.tsx` — accepts `onClick`, `onMouseEnter`, `onMouseLeave`, `onMouseDown`, `onMouseUp` props that dispatch through `events/dispatch.ts`.

## Feature notes

### Double-buffered rendering
Ink rebuilds the full output string every frame and hands it to `log-update`, which diffs by line. Dye keeps two `Screen` instances (front/back), writes each cell as a packed `Int32Array` record (char + style index), diffs cell-by-cell in `src/diff.ts`, and emits only the changed regions. Styles and cells are interned in `src/pools.ts` so steady-state frames allocate almost nothing.

### Mouse
`src/mouse.ts` parses SGR 1006 sequences off stdin. `src/node-cache.ts` records every laid-out node's rect during reconciliation; `hitTest` walks it top-down to find the target. `src/events/dispatch.ts` bubbles `ClickEvent`, `MouseEnterEvent`, `MouseLeaveEvent` from that target up the tree, with `stopPropagation()` semantics matching the DOM.

### Text selection
Ink delegates to the terminal's native selection, which can't reflect app-level state (scroll, virtualized lists, overlays). Dye ships a full model in `selection-manager.ts` (idle/selecting/selected states, character/word/line click modes, shift-drag extension), rendered as a block-inverted overlay in `selection-overlay.ts`, and exposed via `useSelection()` with a clipboard-copy helper.

### Hardware scroll
When the renderer detects a vertically-shifted region between frames, `scroll-hint.ts` emits DECSTBM + index/reverse-index to move rows with a single terminal op, then diffs only the delta region. Without this, scrolling a 200-line list forces 200 line rewrites per frame.

### AlternateScreen
`components/AlternateScreen.tsx` owns the DEC 1049 enter/leave sequences and — when `mouseTracking` is set — the SGR 1006 mouse enable/disable. It guarantees the terminal state is restored on unmount, signal, and uncaught exception.

### `onFrame` instrumentation
`frame-event.ts` exposes per-phase timings (reconcile, layout, build, diff, write). Pass `onFrame` to `render()` to get a callback per frame with byte counts and millisecond timings — useful for identifying which phase dominates in a given app.

## Public API superset

Everything exported from Ink v7 is exported from Dye with compatible signatures. Dye adds:

- Components: `AlternateScreen`
- Hooks: `useSelection`, `usePaste`, `useBoxMetrics`, `useAnimation`, `useCursor`, `useIsScreenReaderEnabled`
- Box props: `onClick`, `onMouseEnter`, `onMouseLeave`, `onMouseDown`, `onMouseUp`
- `render` options: `onFrame`, `mouseTracking` (when used inside `<AlternateScreen>`)

## Deliberately out of scope for v0.1

Some surface area was considered and intentionally left out of the core package to keep it focused on renderer features rather than application-level widgets:

- Higher-level components like `Button`, `Link`, `ScrollBox`, `NoSelect`, `RawAnsi` — application-level components, not renderer features
- Product-specific hooks like `useSearchHighlight`, `useTabStatus`, `useTerminalTitle`, `useTerminalViewport`
- A full event class hierarchy (focus/input/keyboard/terminal events) — simplified to `event.ts` + `click-event.ts` for the v0.1 surface
- Scheduling/clock and terminal-focus contexts — not generally useful without an opinionated scheduling model

These may return as separate opt-in packages; they are deliberately out of `@sauerapple/dye` core.

## Version mapping

- Forked from: Ink **v7.0.0** (commit matching `npm view ink@7.0.0`)
- Dye commits on top of fork point: **18**
- Dye current version: **0.1.0**

See `docs/plans/` in the reference repo for the original implementation plan (`2026-04-13-001-feat-dye-open-source-clean-room-plan.md`) if you want the unit-by-unit build order.
