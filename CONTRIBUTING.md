# Contributing to Dye

Thanks for your interest in Dye! This document covers the development setup and contribution workflow.

## Development setup

```
git clone https://github.com/sauerapple/dye.git
cd dye
npm install
```

### Requirements

- Node.js 22+
- npm 10+

## Running tests

```
npm test             # typecheck + lint + AVA
npx tsc --noEmit     # typecheck only
npx ava --serial     # tests only (serial mode required for pty-based tests)
```

Run a single test file:

```
npx ava test/selection.ts
```

## Running examples

```
npm run example examples/dye-hello/dye-hello.tsx
```

## Building

```
npm run build        # tsc → build/
```

The `prepare` npm lifecycle runs `build` automatically, so `npm install` produces a complete `build/` directory.

## Project structure

```
src/
  index.ts              # Public API re-exports
  ink.tsx               # Ink class — render lifecycle, mouse routing
  render.ts             # render() entry point
  renderer.ts           # React → DOM → Output
  output.ts             # StyledChar grid + Screen buffer
  screen.ts             # Packed Int32Array cell grid
  pools.ts              # CharPool, StylePool, HyperlinkPool
  frame.ts              # Frame, Patch, Diff types
  diff.ts               # Cell-level diff algorithm
  optimizer.ts          # Patch merging and serialization
  node-cache.ts         # Node rect cache + hitTest
  mouse.ts              # SGR mouse parsing + enable/disable
  selection.ts          # Multi-click + word/line snapping
  selection-manager.ts  # Stateful selection controller
  selection-overlay.ts  # Applies inverse SGR to selected cells
  scroll-hint.ts        # DECSTBM hardware scroll
  frame-event.ts        # FrameTimer + FrameEvent for onFrame
  events/
    event.ts            # Base DyeEvent with stopPropagation
    click-event.ts      # ClickEvent
    dispatch.ts         # dispatchClick + dispatchHover
  components/
    Box.tsx             # Adds onClick/onMouseEnter/onMouseLeave
    AlternateScreen.tsx # DEC 1049 + mouse lifecycle
    SelectionContext.ts # Provides SelectionManager
  hooks/
    use-selection.ts    # React hook for selection state

test/
  selection.ts          # Selection state machine + overlay
  mouse.ts              # SGR parser + dispatch
  scroll-hint.ts        # DECSTBM
  screen.ts             # Screen/pools/diff/optimizer
  frame-event.tsx       # FrameTimer + onFrame integration
  node-cache.tsx        # Node rect cache + hitTest
  alternate-screen.tsx  # AlternateScreen component
```

## Design principles

**Dye is a superset of Ink v7** — existing Ink apps should work by changing the import. We do not remove or rename Ink APIs. Dye-specific features are additive.

**Bridge, don't replace.** The Output class dual-writes to both the StyledChar grid (backward compatible, used by terminal output) and the Screen buffer (used by hit-testing, selection, and the new diff pipeline). Breaking the StyledChar path would break existing Ink tests.

**Performance matters.** Screen cells are packed Int32Array (2 ints per cell). Interning pools avoid per-frame allocations for common strings. Avoid heap allocations in render hot paths.

**Clean-room from specs.** Novel features are implemented fresh from terminal protocol documentation (ECMA-48, xterm SGR mouse, DEC private modes), not copied from prior implementations.

## Adding a feature

1. Open a discussion or issue first if the change is non-trivial
2. Follow existing patterns — read a similar module before writing new code
3. Add tests (AVA) for new behavior; keep coverage for edge cases
4. Run `npm test` — all tests must pass
5. Update the README if the change affects the public API
6. Use conventional commit messages: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`

## Code style

- TypeScript strict mode — no `any`, explicit return types on public functions
- Tabs for indentation (matches Ink upstream)
- Prefer `const` arrow exports for functions that are values
- Prefer named types over inline anonymous ones for anything exported
- No comments that describe *what* the code does — only *why* if non-obvious
- Don't add error handling for impossible states

## Releasing

Releases are triggered by git tags matching `v*`. CI runs full tests + lint + typecheck on Node 22 and 24, then publishes to npm if the tag is on main.

```
npm version patch   # or minor, or major
git push && git push --tags
```

## Questions

Open an issue or discussion on GitHub.
