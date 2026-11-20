# DESIGN_NOTES

The spec is in `SPEC.md`. This file records **assumptions I made** where the spec left something open, plus structural decisions. Edit or remove anything you disagree with.

## Milestone 1 — project setup

### Assumptions
- **Phaser version**: pinned to Phaser **3.90** (the latest 3.x), as the spec says Phaser 3. Phaser 4 is out but has a different API.
- **Title**: placeholder name "CLASH DUEL / 무한 합 모드". To avoid IP problems, the game uses **original names and placeholder art only**: no Limbus Company character names, logos, art or music. It borrows only the clash *mechanics*. Assets are your own files, added through the manifest (milestone 7).
- **Minimum touch size**: on a ~400 CSS-px-wide phone, 48 CSS px is about **130 game px** at the 1080 reference width. This is `MIN_TOUCH` in `src/config/display.ts`.
- **Button firing**: buttons fire on *pointer up inside the button*, so sliding your finger off cancels the tap. There is a 250 ms debounce against double taps.
- **Balance numbers**: every number from spec §2 is already in `src/data/balance.json`. The engine will read only from there (milestone 2). Values that were open:
  - `sanity.clashWinPerClashCount = 1`: +1 extra sanity per clash count on a win. The spec says "add based on clash count", but the amount was unspecified.
  - `sanity.clashLosePerClashCount = 0`
  - `stagger.recoverAfterTurns = 1`: a staggered unit recovers at the end of the *next* turn.
  - `sanity.panicBehavior = "random"`: panic picks a random action. `"skip"` will also be supported.
  - `clash.maxTieRerolls = 50`: a safety cap on endless ties. What happens when the cap is hit gets decided in milestone 2.
  - `features.sinAndEgo = false`: off by default (spec §2.9).

### Structure / security decisions
- **No vite-plugin-pwa / workbox.** Its build-time dependency tree had 4 moderate `npm audit` advisories (glob/minimatch). Instead, `vite.config.ts` contains a small plugin. After each build it hashes `dist/` and writes `dist/sw.js` from `src/platform/sw-template.js`. Result: `npm audit` reports 0 vulnerabilities, and the only runtime dependency is `phaser`.
- **Service worker scope**: it caches only same-origin `GET` requests. It never touches other origins or non-GET requests. Old caches are deleted when a new version activates.
- **Content-Security-Policy** (production build only, injected as a `<meta>`): `default-src 'self'`, no inline scripts, no `eval`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`. `data:`/`blob:` are allowed only for images and media, because Phaser builds its default textures that way. The dev server runs without CSP because Vite's hot-reload needs inline scripts.
- **No network at runtime**: the game never calls any server. Everything is local, and saves go to `localStorage`.
- **Saves (planned for milestone 6)**: everything read back from `localStorage` will be treated as untrusted input. It will be parsed inside try/catch, validated against a schema version and value ranges, and dropped (not crashed on) if invalid.
- **Two tsconfigs**: `tsconfig.json` for browser code and tests, with no Node types, so browser code can't import Node APIs by mistake. `tsconfig.node.json` is for `vite.config.ts`.
- **Relative `base: './'`**: the build works from any sub-path, e.g. GitHub Pages.
- **RNG**: mulberry32, with its full state held in one 32-bit integer. A run can be saved and resumed with exactly the same random sequence. `randomSeed()` uses `crypto.getRandomValues` (not security-critical).
