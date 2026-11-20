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

## Milestone 2 — battle engine

### User requests for this milestone
- **3 clash wins = you beat that opponent and move on.** Bringing the enemy's HP to 0 also wins. In the other direction, **you lose if the enemy reaches 3 clash wins first, or if your HP hits 0.** Settings: `balance.json → battle.playerClashWinsToWin / enemyClashWinsToWin`. Setting either to `null` turns that rule off, so the battle is decided by HP only.
- **Victory rewards** in `src/data/rewards.json`:
  - "최소 합 위력 증가" = `basePower` +N. Raises both min and max power.
  - "최대 합 위력 증가" = `coinPower` +N. Raises max power only.
  - Also heal and max HP up. Each can target all skills (`all`) or one random slot (`one`).
  - The engine (generate offers / apply) is done now. The picking screen comes in milestone 6.
- **Hard difficulty**: tuned with `npm run sim`, results below.

### Assumptions
- **HP carries over between battles within a run.** It only recovers through rewards. Sanity, stagger, panic and clash-win counts reset at each battle start.
- **Only real clashes count toward the 3 wins.** Free hits on a staggered enemy don't count.
- **Clash count**: every clash round counts, ties included, for the clash bonus and the sanity bonus.
- **On a tie, both sides reroll.** After 50 ties in a row (`maxTieRerolls`), a coin flip decides who loses a coin, logged as `tieBreak`.
- **One-sided attack**: the winner throws only its unbroken coins, one at a time. Power starts at base and adds +coinPower for each heads so far; every coin hits with the current power.
- **Damage rounding**: damage is floored, with an epsilon guard against float error. Any hit with power > 0 and multiplier > 0 deals at least 1 (`battle.minHitDamage`).
- **Level modifier**: added to the multiplier as `1 + modifier`. The skill's `levelOffset` is added to the attack level.
- **Stagger**:
  - It triggers when HP first falls *below* a threshold. Crossing several thresholds with one hit counts as one stagger.
  - A killing blow does not stagger.
  - A staggered unit loses its action for the rest of that turn and all of the next one, and recovers at the end of the next turn.
  - If the enemy is staggered at turn start, it shows no intent, and the player's attack is a free one-sided hit.
- **Sanity**:
  - Win: +10 + 1 × clash count.
  - Loss: −5 − 1 × clash count.
  - At −45, panic starts on the next turn. With `random`, a random card from the hand is used automatically. At the end of that turn, sanity resets to 0 (`panicRecoverSanity`).
  - Enemies have no sanity (`hasSanity: false`), so their heads chance is always 50%.
- **Deck**:
  - S1×3 / S2×2 / S3×1, hand of 2.
  - The used card goes back into the pile, the pile is reshuffled, and a replacement is drawn into the same hand slot.
  - Enemies use the same deck system. The AI picks from its hand weighted by `aiWeights` (default S1:1, S2:1.5, S3:3).
- **Speed**: rolled every turn and logged. With 1 speed die it has no effect yet. It starts to matter with defense skills (M5) and 2 dice (M9).
- **Floor scaling** (`balance.json → floor`):
  - HP +12% per floor.
  - Base power +1 every 3 floors, coin power +1 every 5 floors.
  - Attack/defense level +2 per floor.
  - A boss every 5 floors.
- **Defense skills** (evade/guard) are in the data already, but the engine starts using them in milestone 5.

### Balance snapshot (`npm run sim`, N=3000; smart = picks the card with higher expected power, random = random pick)
| | 1층 패배 | 도달 층 중앙값 | 상위 10% | 첫 보스(5층) 돌파 |
|---|---|---|---|---|
| 한결 (참격) | 12% | 5 | 9 | 24% |
| 도담 (타격) | 16% | 4 | 7 | 19% |

- Single battles on floor 1: smart pick wins 80–94%, random pick wins 70–90%. The boss is 7–9% without any upgrades.
- Most losses happen by **HP running out over several floors** (67–84%). The rest are losing 3 clashes.
- These numbers will move once defense skills and status effects arrive in M5, so I'll retune then.

## Rule change (user request, after milestone 2): duel rule
- **Win: only by reaching 3 clash wins.**
- **Loss:** the enemy reaches 3 clash wins, **or anyone's HP reaches 0. Killing the enemy is also a loss** (`battle.enemyHpZero: "lose"`; set it to `"win"` to go back to the old rule).
- To make this work, enemy HP was raised (thug 160 / rust 190 / hound 150 / boss 330). Lethal risk is now a real decision: when the enemy is low or staggered, you pick a weaker card.
  - "최대합 증가" (max power up) rewards become double-edged. They make clashes easier to win but also make it easier to kill the enemy by accident.
  - Hitting an enemy's weakness can be a liability. For example, 도담 (blunt) vs the hound (weak to blunt) only wins about 52%.
- The engine gained `maxOneSidedDamage()` (an upper bound on damage). The UI uses it for the "lethal risk" warning.
- Re-measured (N=3000):

| | 1층 패배 | 도달 층 중앙값 | 상위 10% | 첫 보스 돌파 | 패배 원인 (내 HP / 상대 사망 / 합 패배) |
|---|---|---|---|---|---|
| 한결 | 21% | 4 | 8 | 21% | 76% / 8% / 16% |
| 도담 | 26% | 3 | 6 | 14% | 57% / 9% / 34% |

## Milestone 3 — battle screen (text-based)

### Assumptions / decisions
- **Card choice takes two taps**: tap a card to select it, then press the "합 개시" button. This prevents accidental taps. Tapping the same card again deselects it.
- **Lethal warning** (only when the optional duel rule is on; by default the card shows "★ 처치 가능" instead): the card shows "⚠ 치사 위험" when its best case (every coin heads, with a clash bonus as large as its coin count) reaches the enemy's current HP. The duel rule makes this important. It is an upper bound, so in practice it often won't actually kill.
- **Enemy intent box**: shows skill, power range, coin count, damage type and its max damage to you. It turns red when it can kill you.
- **Result panel**: shows the latest turn, up to 9 lines. The full log is in "로그" (scroll by dragging).
- **"포기"** asks for confirmation ("정말?") on the first tap and acts on the second, within 2 seconds.
- **Victory rewards (3 choose 1)** are already shown at the end of a battle, so the endless loop is playable on a phone now. The polished screen, saving/resume and the game-over record are milestone 6. For now, leaving the app loses the run.
- **The title screen now has character select**, which the spec places in milestone 6. It was needed to play.
- **Security**: all text (data, logs) is drawn on the Phaser canvas. No HTML/DOM injection path exists.

## Rule fix (user clarification): whoever hits 0 HP loses
- I misread the earlier request. The intended rule is **"the side whose HP reaches 0 loses"**, so killing the enemy is a **win**. The default is now `battle.enemyHpZero: "win"`. The duel variant (`"lose"`) is still there as an option.
- Final rules:
  - **Win**: you reach 3 clash wins, or the enemy's HP reaches 0.
  - **Loss**: the enemy reaches 3 clash wins, or your HP reaches 0.
- Enemy HP: thug 120 / rust 145 / hound 110 / boss 260. Because clash wins usually end the battle first, enemy HP barely moves the win rate (simulated 100–160 → nearly identical). This setting lets a strong hit sometimes finish a fight early.
- The card label now shows "★ 처치 가능" (can kill) in green instead of a lethal warning. The red warning only appears under the duel rule.
- Re-measured (N=1500):

| | 1층 패배 | 도달 층 중앙값 | 첫 보스 돌파 | 패배 원인 (내 HP / 합 패배) |
|---|---|---|---|---|
| 한결 | 13% | 5 | 23% | 83% / 17% |
| 도담 | 19% | 4 | 18% | 65% / 35% |

## Rule change (user request): HP is the only win condition
- **Clash-win victory and defeat are removed.** Win = bring the enemy's HP to 0. Loss = your HP reaches 0. (`battle.playerClashWinsToWin / enemyClashWinsToWin` = `null`; the code still supports numbers if you ever want them back.)
- **Difficulty now comes from reward choices, not HP** (user request). Changes:
  - Enemy HP is high (thug 160 / rust 190 / hound 150 / boss 300). If you keep winning clashes you eventually win, so long fights are fine.
  - Player HP was raised to match (한결 140 / 도담 170).
  - **Post-battle recovery**: after every won battle you heal 30% of max HP automatically (`rewards.healAfterBattle`). This keeps HP attrition from deciding runs.
  - **Enemy growth per floor**: base power +1 every 2 floors, coin power +1 every 4 floors, level +1 per floor, HP +8% per floor. On average the enemy gains about +1 power per floor. Picking power rewards keeps pace; picking poorly falls behind.
  - Boss skills toned down (it was an unbeatable wall): S1 4+2×3, S2 5+3×3, S3 4+5×3.
- The simulator now compares **"good reward picks"** (heal when below 50% HP, otherwise the largest power gain) against **random picks** (N=2000):

| | 1층 패배 | 5층 보스 돌파 (잘 고름 / 무작위) | 10층 도달 (잘 고름 / 무작위) | 상위 10% 층 |
|---|---|---|---|---|
| 한결 | 6% | 38% / 18% | 12% / 1.4% | 12 / 7 |
| 도담 | 8% | 31% / 11% | 7.5% / 0.3% | 10 / 6 |

## Milestone 4 — clash animation

### What it does
- `src/ui/ClashAnimator.ts` replays a turn's engine events. It never computes rules.
  - skill names for each side
  - coins pop in
  - each clash round: all remaining coins flip (gold = heads, grey = tails), power numbers bounce in (winner gold, loser grey), and the loser's coin cracks and falls
  - ties show "동점! 재굴림"
  - one-sided attack: each coin flips and pulses; a damage number floats from the target; the camera shakes in proportion to the damage; the target flashes; the HP bar tweens down
  - banners for clash win, stagger and panic
- **Speed button** (top bar): ×1 → ×2 → 연출 끔 (instant). It is saved in `localStorage` (validated on read; see below).
- **Skip**: while a turn plays, the main button becomes "스킵 ▶▶" and finishes the turn instantly.
- The engine now reports `stagger` *after* the `coinHit` that caused it, so the animation reads "hit → stagger".

### Assumptions
- The HP bar and sanity gauge are not re-rendered from final state until the animation ends. The animator drives them step by step from event values.
- Coins use placeholder textures generated at boot under the manifest keys `ui.coin.heads / tails / broken`. Milestone 7 will load real images under the same keys.
- Sound comes in milestone 7.

### Security
- New `src/platform/storage.ts`: every `localStorage` read is wrapped in try/catch, size-limited (256 KB), parsed and validated. Corrupted, tampered or blocked storage silently falls back to defaults. Saves in milestone 6 will use the same wrapper.
