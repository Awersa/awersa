# ASSETS — 이미지·사운드 넣는 법

파일을 **아래 경로에 그 이름 그대로** 넣고 다시 빌드(`npm run dev` / `npm run build`)하면 끝입니다.
파일이 없는 키는 자동으로 도형·텍스트(이미지)로 대체되고, **효과음은 코드로 합성한 기본음**이 나옵니다(BGM은 파일이 없으면 무음). 에러로 멈추지 않습니다.

- 이미지: `src/assets/images/`
- 사운드: `src/assets/sounds/`
- 키 ↔ 파일 매핑: `src/assets/manifest.json` (파일 이름/확장자를 바꾸고 싶으면 여기서 경로만 수정)

> 에셋은 빌드할 때 게임에 묶여 들어갑니다(외부 URL에서 불러오지 않음). 그래서 파일을 추가/교체한 뒤에는 꼭 다시 빌드하세요.
> 지원 형식: 이미지 `png / jpg / webp`, 사운드 `ogg / mp3 / m4a / wav`.

## 이미지

| 키 | 기본 파일 | 권장 크기 | 쓰이는 곳 |
|---|---|---|---|
| `bg.title` | `images/bg_title.png` | 1080×1920 | 타이틀 배경 (50% 투명도로 깔림) |
| `bg.battle` | `images/bg_battle.png` | 1080×1920 | 전투 배경 (35% 투명도) |
| `bg.boss` | `images/bg_boss.png` | 1080×1920 | 보스전 배경 (없으면 `bg.battle`) |
| `char.hangyeol.idle` | `images/hangyeol_idle.png` | 512×512, 투명 PNG | 한결 기본 |
| `char.hangyeol.attack` | `images/hangyeol_attack.png` | 512×512, 투명 PNG | 한결 공격 (없으면 idle) |
| `char.dodam.idle` | `images/dodam_idle.png` | 512×512, 투명 PNG | 도담 기본 |
| `char.dodam.attack` | `images/dodam_attack.png` | 512×512, 투명 PNG | 도담 공격 |
| `enemy.thug.idle` / `.attack` | `images/enemy_thug_idle.png` / `_attack.png` | 512×512, 투명 PNG | 뒷골목 패거리 초상 (공격 시 attack으로 바뀜) |
| `enemy.rust.idle` / `.attack` | `images/enemy_rust_idle.png` / `_attack.png` | 512×512 | 녹슨 경비 인형 |
| `enemy.hound.idle` / `.attack` | `images/enemy_hound_idle.png` / `_attack.png` | 512×512 | 그림자 들개 |
| `enemy.keeper.idle` / `.attack` | `images/enemy_keeper_idle.png` / `_attack.png` | 512×512 | 시계탑 관리인 (보스) |
| `ui.coin.heads` | `images/coin_heads.png` | 128×128, 투명 PNG | 코인 앞면 (합 연출 + 카드) |
| `ui.coin.tails` | `images/coin_tails.png` | 128×128, 투명 PNG | 코인 뒷면 |
| `ui.coin.broken` | `images/coin_broken.png` | 128×128, 투명 PNG | 깨진 코인 |

- 초상은 상자(280×260)에 **비율 유지하며 맞춰** 들어갑니다. 정사각형이면 가장 깔끔합니다.
- 코인은 72px 정도로 그려지므로 128×128이면 충분합니다.
- 캐릭터 이미지(`char.*`, `enemy.*`의 idle/attack)는 **합 무대에서 직접 움직이는 전투원**으로 쓰입니다. 그림은 **오른쪽을 보도록** 그려 주세요(적은 자동으로 좌우 반전). 높이 220px 정도로 맞춰 그려지며, 발이 그림 아래쪽 끝에 오게 하면 됩니다.

## 사운드

| 키 | 기본 파일 | 길이/권장 | 재생 시점 |
|---|---|---|---|
| `bgm.title` | `sounds/bgm_title.ogg` | 루프 1~3분 | 타이틀 |
| `bgm.battle` | `sounds/bgm_battle.ogg` | 루프 1~3분 | 일반 전투 |
| `bgm.boss` | `sounds/bgm_boss.ogg` | 루프 1~3분 | 보스전 |
| `sfx.ui.tap` | `sounds/ui_tap.ogg` | < 0.2초 | 모든 버튼 탭 |
| `sfx.coin.flip` | `sounds/coin_flip.ogg` | < 0.3초 | 코인 뒤집기 |
| `sfx.clash.impact` | `sounds/clash_impact.ogg` | < 0.4초 | 합에서 무기가 부딪힐 때 |
| `sfx.coin.break` | `sounds/coin_break.ogg` | < 0.5초 | 합에서 코인 파괴 |
| `sfx.clash.win` | `sounds/clash_win.ogg` | < 1초 | 내가 합 승리 |
| `sfx.clash.lose` | `sounds/clash_lose.ogg` | < 1초 | 내가 합 패배 |
| `sfx.hit.slash` | `sounds/hit_slash.ogg` | < 0.5초 | 참격 적중 |
| `sfx.hit.pierce` | `sounds/hit_pierce.ogg` | < 0.5초 | 관통 적중 |
| `sfx.hit.blunt` | `sounds/hit_blunt.ogg` | < 0.5초 | 타격 적중 |
| `sfx.crit` | `sounds/crit.ogg` | < 0.5초 | 치명타 |
| `sfx.guard` | `sounds/guard.ogg` | < 0.5초 | 수비 |
| `sfx.evade` | `sounds/evade.ogg` | < 0.5초 | 회피 성공 |
| `sfx.stagger` | `sounds/stagger.ogg` | < 1초 | 흐트러짐 |
| `sfx.status` | `sounds/status.ogg` | < 0.3초 | 상태이상 부여 |
| `sfx.victory` | `sounds/victory.ogg` | 1~3초 | 승리 |
| `sfx.defeat` | `sounds/defeat.ogg` | 1~3초 | 패배 |

- **아이폰(Safari)** 도 쓸 거라면 `ogg` 대신 **`mp3` 또는 `m4a`** 를 권장합니다. 그 경우 `manifest.json`의 확장자만 바꾸세요 (예: `"sfx.coin.flip": "sounds/coin_flip.mp3"`).
- 브라우저 정책상 소리는 **첫 터치 이후**에 나옵니다.
- 타이틀 오른쪽 위 **소리 켬/끔** 버튼으로 끌 수 있고, 설정은 저장됩니다. 볼륨 기본값: 효과음 0.8, BGM 0.5.
- 연출을 "연출 끔"으로 두면 효과음도 생략됩니다(버튼 탭·승패음 제외).

## 새 캐릭터/적을 추가할 때
`characters.json` / `enemies.json`의 `"asset"` 값(예: `"enemy.thug"`)이 이미지 키의 앞부분입니다.
`"asset": "enemy.newboss"`로 정했다면 `manifest.json`에 `"enemy.newboss.idle"`, `"enemy.newboss.attack"`을 추가하고 파일을 넣으면 됩니다.

## 저작권
개인 취미 프로젝트라도 다른 게임(림버스 컴퍼니 등)의 그림·음악 파일을 그대로 넣어 **배포/공유**하면 저작권 문제가 될 수 있습니다.
직접 만든 것, 무료 라이선스(CC0 등) 에셋, 또는 본인만 보는 용도로 쓰세요.
