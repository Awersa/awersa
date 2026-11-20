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

## Reward rework (user playtest feedback)
- **Playtest**: picking only "날 선 코인" (all skills, coin power +1) and "단단한 기초" (all skills, base power +1) reached floor 15. The sim confirmed that strategy was optimal, so there was no real choice.
- **Fix** (user chose "make the choice matter"):
  - All-skill upgrades are now **rare** (weight 1 each, was 2–3).
  - Single-slot upgrades are **stronger and more common**: base power **+3** (was +2), coin power +2, weight 4.
  - The decision is now "build up S1, which shows up often (3 of 6 cards), or make the big S3 hit harder (1 of 6)". Reward text shows the slot's deck count (e.g. "S1 가르기 (덱 3장)") so the trade-off is visible.
  - Enemy growth adjusted to keep the difficulty: coin power +1 every 3 floors (was 4), HP +10% per floor (was 8%).
- The simulator now has three reward strategies. "Smart" values each offer by expected power gain × how often that slot is drawn. Results (N=3000):

| reaching floor 10 | 한결 | 도담 |
|---|---|---|
| smart (situational) | 13.5% | 11.1% |
| all-skill upgrades first | 6.4% | 3.2% |
| random | 0.3% | 0.3% |

First-floor loss stays at about 6–8%.

## Reward screen + boss coin reward (user request)
- **Reward cards show before → after**: `S1 가르기 (덱 3장): 5~11 → 6~12`, `HP 50 → 85 / 140`, `코인 2→3개`. They are computed by applying the reward to a copy of the player, so the text always matches what actually happens.
- **New boss-only reward "코인 주조" (coin +1 on one random skill)**:
  - After a **boss** battle it appears with probability **50%** (`rewards.json → coin_add.chance`) and replaces one of the 3 offers. It never appears on normal floors.
  - It has a gold frame and the label "★ … (보스 보상)".
  - A skill can't go above **5 coins** (`balance.json → rewards.maxCoinCount`). Skills already at the cap are never picked.
  - Engine: `SkillMod.coinCount`. Every coin count now goes through `effectiveSkill()`, including the one-sided-attack hit count and the animator's coin rows.
- **No heal offers at full HP** (it was a wasted pick).
- **Accelerating enemy growth** (`floor.basePowerAccelDivisor = 60`): extra enemy base power = ⌊(floor−1)²/60⌋, i.e. +1 at floor 9, +6 at floor 21, +15 at floor 31. Without it, accumulated rewards (especially extra coins) eventually outscaled the linear enemy growth and some simulated runs never ended (hit the 200-floor sim cap). The early game is unchanged.
- Measured (N=3000):

| | 1층 패배 | 5층 보스 돌파 (잘/전체만/무작위) | 10층 (잘/전체만/무작위) | 최고 |
|---|---|---|---|---|
| 한결 | 6% | 50% / 39% / 22% | 13% / 4% / 1% | 24 |
| 도담 | 8% | 46% / 28% / 15% | 11% / 2% / 0.3% | 21 |

## Milestone 5 — defense skills + status effects

### Defense skills
- The **defense button** is always available next to "합 개시". It doesn't use or cycle hand cards. Tap it to select, then press "방어 개시".
- **수비 (guard)**: flips its coins once. Shield = power × 1.5 (`defense.guardShieldMultiplier`). The shield absorbs damage from the incoming one-sided attack, hit by hit. Hits show "막음 N".
- **회피 (evade)**: for each incoming coin, the evade skill rolls and compares its power with that coin's hit power. If evade is higher, the coin does nothing and the evader gains +5 sanity (`defense.evadeSanity`). The first failed evade breaks it, and the remaining coins hit normally.
- **반격 (counter)**: an incoming attack becomes a normal clash against the counter skill (sanity changes and clash bonus apply).
- A defense with no incoming attack is wasted ("공격이 없어 무의미").
- **Enemies defend too**:
  - 경비 인형: guard "장갑 전개"
  - 그림자 들개: evade "그림자 회피"
  - Boss: counter "역행하는 초침"
  - The intent box shows it in blue ("방어: 수비 …"). How often each enemy defends is set by `aiWeights.defense`.

### Status effects (data-driven)
- `src/data/statuses.json` defines each status as **triggers (when) × actions (what)** plus a turn-end decay. The engine (`src/core/status.ts`) only knows the generic triggers (`coinThrown`, `hitTaken`, `turnEnd`, `burst`, `coinHit`) and actions (`damage`, `sanityLoss`, `staggerDamage`, `crit`). A new status that combines these needs **no code**. There is a test for this ("poison").
- Skills apply statuses through `coinEffects` (on hit, per coin) and `onUse`. Effect types:
  - `apply`: add potency/count to the target or to yourself
  - `burst`: trigger the status's burst, e.g. tremor
  - `spend`: use up N of a status for +power this use, e.g. charge
- Stacking: potency and count both add up, capped at 99. A status disappears when its count reaches 0. All statuses are cleared at the start of each battle.

### Assumptions
- **Bleed** fires per coin *thrown in a one-sided attack*, not per clash flip.
- **Tremor burst** counts its potency as extra HP loss for stagger checks only. It can trigger an early stagger without dealing real damage. Tremor count also drops by 1 every turn end.
- **Poise**: crit chance = potency × 5% (`status.critChancePerPotency`). The spec literally says "potency%", which would be 0.01, but that is too weak with small potencies. A crit multiplies damage by 1.2 and uses 1 count. Poise count also drops by 1 every turn end.
- **Charge**: a count-only resource that drops by 1 every turn end. 도담's S1 gives 2 charge. S3 spends 3 charge for +6 base power.
- **Sinking** on a unit without sanity deals its potency as damage instead.
- **Order of onUse effects**: by speed, with the player first on ties.
- **Turn-end damage (burn)** can end the battle; the outcome is checked again after turn end.

### Character kits
- **한결 (slash · bleed/poise)**:
  - S1: bleed on its 2nd coin
  - S2: bleed 1/1 on every coin
  - S3: gives itself poise 3/2, then bleed 3/2 on its last coin
  - Defense: evade
- **도담 (blunt · tremor/charge)**:
  - S1: +2 charge, tremor 3/2
  - S2: tremor, then a burst on its last coin
  - S3: spends 3 charge for +6, then a burst on its last coin
  - Defense: guard
- **Enemy statuses**:
  - thug: bleed
  - hound: rupture
  - boss: sinking on S1, burn on S3

### Balance (N=3000)
- Statuses made players much stronger (boss clear went to ~70%). Retuned:
  - enemy level +2 per floor
  - acceleration divisor 40
  - normal enemy HP 180 / 210 / 165, boss 360
  - normal enemies' S1 +1 base power
  - 도담 S1 +1 base power

| | 1층 패배 | 5층 보스 돌파 (잘/전체만/무작위) | 10층 (잘/전체만/무작위) | 최고 |
|---|---|---|---|---|
| 한결 | 8% | 56% / 46% / 28% | 10.5% / 3% / 0.5% | 23 |
| 도담 | 5% | 65% / 46% / 29% | 12.5% / 2% / 0.2% | 23 |

- The simulator's "smart" player defends when the enemy's attack clearly outclasses its best card. Measured this way, defense barely changes win rates (`npm run sim -- --no-defense` to compare). Its value is situational: dodging a clash you'd lose, gaining sanity with evade, or blunting a boss S3. Human playtesting will tell more.

## Milestone 6 — endless loop: gifts, boss pattern, save/resume, records

### Gifts (passives)
- `src/data/gifts.json`: each gift has a `trigger` (`battleStart`, `turnStart`, `clashWin`, `clashLose`, `coinHit`), an optional `chance`, and `actions` (apply a status to self/target, heal, sanity). New gifts need data only.
- 10 gifts:
  - 녹슨 칼날: clash win → bleed to the enemy
  - 금 간 종: clash loss → tremor to the enemy
  - 응급 붕대: heal at battle start
  - 차분한 호흡: poise at battle start
  - 투지: +2 sanity every turn
  - 불씨: 25% burn on each hit
  - 예비 전지: charge at battle start
  - 날카로운 눈: +4 sanity on clash win
  - 철갑 피부: heal on clash loss
  - 파열 탄두: clash win → rupture to the enemy
- A "기프트" reward offer (weight 2) picks a random gift you don't own. It never offers a duplicate and disappears once you own all of them.

### Boss pattern AI
- `aiPattern` in enemy data makes the enemy cycle through fixed moves; it overrides weighted choice. 시계탑 관리인 uses **S1 → S2 → 반격 → S1 → S3** in a loop. You can read the pattern from the intent box and plan around it, for example defending on the S3 turn.
- A pattern move may use a skill that isn't in the enemy's hand. It executes exactly as announced and doesn't cycle the hand.

### Save / resume
- **Auto-save points**: after every turn, when a battle starts, when it is won (moving to the reward phase), and when a reward is taken.
- The result is committed **before** the animation plays. Closing the app on the victory screen keeps the win, and on the defeat screen keeps the loss.
- Closing the app at any moment resumes from the last completed turn: same enemy, HP, sanity, statuses, hand, intent and RNG state. A resumed battle plays out exactly like an uninterrupted one (tested).
- **Security / robustness** (`src/game/save.ts`):
  - The save holds only ids and numbers: no skill definitions, names or text.
  - On load, the run is rebuilt from the shipped game data. Balance changes therefore apply to existing saves, and a tampered save can't inject custom skills or text.
  - Every field is type- and range-checked. Unknown ids, impossible values (HP above max HP, more coins than the cap, a wrong deck size, unknown statuses or gifts, `__proto__`-style keys) reject the whole save. It is deleted and the game starts fresh instead of crashing.
  - Status/gift objects are built only from looked-up known ids, so prototype pollution isn't possible.
- **Records** (`clashduel.records`): best floor and kills per character, plus the total run count. Validated the same way and rebuilt on a null-prototype object.
- **Title screen**:
  - "이어하기 (character · floor · HP)" appears when a valid save exists.
  - Starting a new run while a save exists needs a second tap to confirm ("한 번 더 누르면 새로 시작").
- **"포기"** ends the run and records it, the same as a loss.

### Scenes
- Battle → **Reward scene**:
  - "N층 돌파!", post-battle heal, your build (each skill's range and coin count), owned gifts, 3 offer cards
  - boss rewards gold, gifts purple
- Loss → **GameOver scene**:
  - reached floor, kills, ★ new best or the previous best
  - "같은 캐릭터로 다시" or "타이틀로"

### Balance after gifts + boss pattern (N=2000)
- The boss pattern makes the boss much more dangerous: it now uses its full kit on schedule, S3 every 5th move. Gift offers also take slots that would otherwise be power upgrades.
- Retuned: gift weight 2, enemy level +1 per floor, acceleration divisor 60, enemy HP +14% per floor.

| | 1층 패배 | 5층 보스 돌파 (잘 고름) | 10층 (잘/전체만/무작위) | 최고 |
|---|---|---|---|---|
| 한결 | 9% | 42% | 6% / 5% / 0.4% | 20 |
| 도담 | 5% | 48% | 7% / 4% / 0.4% | 24 |

- The simulator values a gift at a flat ~1.2 power, which is rough. Real players will judge gifts better, so expect human results to beat these numbers.

## Guard rework (user request; recommendation 1 + 3)
- **Shield** = guard power × **2.0** (was 1.5).
- **Leftover shield is dealt back**: if shield remains after the incoming attack, attacker takes `leftover × 1.0` damage (`defense.guardRetaliateMultiplier`). It can stagger.
- **Perfect guard**: if every hit that reached the guard was fully absorbed, the guarder gains **+10 sanity** (`defense.perfectGuardSanity`).
- **A fully absorbed hit carries no on-hit effects**: no bleed/rupture/etc. from that coin, and no `hitTaken` status triggers (rupture, sinking).
- Enemies that guard (경비 인형) get the same rules.
- Measured for 도담 (guard user), sim defending when the enemy's attack outclasses its best card by ≥1, N=2000:

| | 1층 패배 | 5층 보스 돌파 | 10층 |
|---|---|---|---|
| never defend | 6.0% | 46.8% | 7.8% |
| defend (shield ×2.0) | 3.0% | 50.1% | 7.0% |

  Guard is now a real option: it clearly helps early and against the boss's big turns, without being always correct. Evade (한결) is unchanged; its value is sanity gain, not damage.

## Milestone 7 — asset manifest + sound
- `src/assets/manifest.json` maps keys to file paths. `src/assets/registry.ts` uses Vite's `import.meta.glob`, so **only files that exist at build time** are bundled and loaded. Missing assets cost nothing: no 404 requests, no errors.
- Security: assets are bundled at build time; nothing is ever loaded from a runtime-provided path or URL. Manifest keys and paths are pattern-checked (no `..`, image/audio extensions only). CSP stays `'self'` + `data:`/`blob:` for media.
- **Fallbacks**:
  - images: a colored box with a name, or the generated coin placeholder textures (already used since M4)
  - sounds: silence
  - a file that fails to load only logs a warning
- **Where assets show up**:
  - enemy portrait (idle, switching to attack while it hits)
  - battle / boss / title backgrounds
  - coin textures in clashes and on hand cards
  - character idle/attack slots are reserved; the current layout has no player portrait spot
- **Sounds**:
  - BGM: title / battle / boss, looping, and kept playing across scenes when it's the same track
  - SFX: tap, coin flip, coin break, clash win/lose, hit by damage type, crit, guard, evade, stagger, status, victory, defeat
  - Animation SFX are skipped in "연출 끔" mode
- **Settings**: `sound` on/off (title screen button), `sfxVolume` 0.8, `bgmVolume` 0.5. Older saved settings without these fields are upgraded with defaults.
- The artifact build (`npm run build:artifact`, Vite mode `artifact`) inlines all assets as `data:` URLs, so the single-file play page includes them. Mind the 16 MB page limit when adding long BGM.
- Verified by temporarily adding a test portrait, coin image and sound: they replaced the placeholders in the browser with no failed requests. The test files were removed afterwards.
- Full key list, sizes and formats: `ASSETS.md`.

## Synthesized sound effects (user request)
- The user asked to copy Limbus Company's sounds. Declined: those are Project Moon's copyrighted assets. Offered and built original sounds instead.
- `src/game/synth.ts`: all 15 SFX keys have a Web Audio recipe (oscillators + filtered noise + envelopes); no files, no licensing questions:
  - coin "ting" with slight random pitch, coin crack
  - rising/falling clash win/lose jingles
  - swish (slash), sharp "thk" (pierce), deep thump (blunt)
  - crit ring, metallic guard clang, whoosh (evade), stagger rumble, status blip
  - victory/defeat motifs
- **Priority**: if a sound file exists for a key (manifest + `src/assets/sounds`), the file plays; otherwise the synth recipe plays. The sound on/off setting and SFX volume apply to both.
- Uses Phaser's already-unlocked AudioContext (so it starts after the first touch, like files). Identical sounds fired within 30 ms are merged to avoid stacking.
- BGM is not synthesized; add files for that (see `ASSETS.md`).
- Verified:
  - every recipe was rendered offline in Chromium; all are audible and none clip (peak ≤ 0.45 after level balancing)
  - a real 4-turn game started 34 synth voices with sound on and 0 with sound off, with no errors
