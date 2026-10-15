# Facet

**Pressure finds the flaw.** A self-contained, browser-playable gem-matching puzzle on a dark lapidary’s bench. Swap neighboring stones into lines, build strain around each clear, and spend a corner of flawed gems on a cascading chain. Four-stone lines earn brilliants, crossing lines earn stars, and five-stone lines earn kindless prisms.

## Run

Requires Node.js 22+ and npm.

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. No backend, account, network service, or API key is needed.

## Production

```sh
npm ci
npm run build
npm run preview
```

`dist/` is the complete static site. Serve its contents from an HTTP server, either at an origin root or at a sub-path. All shipped asset URLs are page-relative. The production build only type-checks and bundles committed files; it never runs an asset-generation tool.

## Controls

- **Mouse, pen, or touch:** press a stone, drag onto an orthogonal neighbor, then release. Moving back to the original stone withdraws the offer. You can also tap one stone, then press and release on its neighbor.
- **Menus:** use their on-screen controls, or **↑ / ↓** and **Enter / Space**.
- **Pause / resume:** on-screen **PAUSE**, **Escape**, or **P**.
- **Sound:** **M** toggles all audio. Audio unlocks on the first interaction.
- **Back:** on-screen **BACK** or **Escape** in the handbook; Escape also returns from the end of a round.
- **Diagnostics:** **`** (backtick) toggles the engine’s read-only overlay.

Three matching stones shatter. Stones next to a clear gain strain; at three strain they become flawed. Flawed stones join a touching clear and score double. A brilliant takes its surrounding ring, a star its row and column, and a prism exchanged with a stone takes every stone of that kind. Chains multiply points up to ×8. Each level has a larger target, and a round ends when no legal swap remains.

## Checks

```sh
npx tsc --noEmit
npx eslint .
npx prettier --check .
npx vitest run --coverage
```

The suite includes pure rule/pose tests and real Simple 2D engine tests over native CPU canvases, counted clocks, ordered pointer samples, file-backed asset loading, drawing, recording, cue events, pause behavior, and delta-time partitioning. Browser-only image/audio decoding is adapted for the Node test host; the game loads and plays the actual committed files in the browser.

## Project map

- `src/game.ts` — the readonly state contract, initialization, and frame transitions.
- `src/model.ts` — runs, legal swaps, closure waves, cuts, pressure, scoring, gravity, menus, and pointer transitions.
- `src/debug.ts` — validated, immediate state poses and pure snapshots, returned only through `engine.debug`.
- `src/view.ts` — canvas chrome, sprite animation, and live particle simulation.
- `src/assets.ts` — initialization-time loading of every shipped visual and audio source.
- `public/assets/` — original produced sprites, animation frames, particle systems, PCM audio, and MIDI scores.
- `showcase/` — player description, actual screenshots, and a 280-frame engine-recorded live chain.

## Asset production

The game’s assets were authored for this build, not downloaded. `tools/produce.py` records authored scanline polygons, facet edges, damage cracks, fragment frames, and prism-turn frames through **draw / draw-sheet**; authors four live systems through **particle-2d**; synthesizes the cue set and ascending chain ladder through **sfx-synth**; layers glass and debris through **sfx-sample**; and sequences the two original pieces through **music**. The seven silhouettes have distinct facet tables, and every damage state is a separate sprite. Particle systems are simulated with the supplied particle runtime rather than played as baked flashes.

The producer is a one-time authoring utility and requires those tools. **It is not a dependency of installation, development, or production builds.** All its finished outputs are committed. `tools/capture.mjs`, run while the development server is running, recaptures showcase media using the game’s own engine and recorder. Nothing in the shipped game publishes a global debugging handle.
