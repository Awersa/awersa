# Clash Duel — 1대1 코인 합 전투 (무한 모드)

개인 취미 프로젝트. 휴대폰 브라우저에서 돌아가는 1대1 합(Clash) 전투 무한 모드 게임.
사양: [`SPEC.md`](SPEC.md) · 가정/결정 기록: [`DESIGN_NOTES.md`](DESIGN_NOTES.md)

## 실행

```bash
npm install
npm run dev        # http://localhost:5173 (이 PC에서만 접속 가능)
npm test           # Vitest 단위 테스트
npm run build      # 타입체크 + 프로덕션 빌드 (dist/, sw.js 자동 생성)
npm run preview    # 빌드 결과를 로컬 + 같은 네트워크에 띄우기 (포트 4173)
```

## 휴대폰에서 확인

1. PC와 휴대폰을 같은 와이파이에 연결
2. `npm run dev:host` 실행 → 터미널에 나오는 `Network: http://192.168.x.x:5173` 주소를 휴대폰 브라우저로 열기
   - 공용 와이파이(카페 등)에서는 같은 네트워크의 다른 사람도 접속할 수 있으니 집 와이파이에서만 쓰세요.
3. **홈 화면 설치(PWA)/오프라인 실행은 HTTPS가 필요**합니다. `http://192.168…` 주소에서는 게임은 되지만 설치·오프라인은 안 됩니다.
   설치하려면 `dist/`를 GitHub Pages 같은 HTTPS 호스팅에 올려서 접속하세요.

## 구조

```
src/core/     전투 엔진 (UI 의존성 0, 순수 TS)
src/data/     밸런스/캐릭터/스킬 JSON
src/config/   JSON 타입 래퍼, 화면 상수
src/scenes/   Phaser 씬 (Boot, Title, Battle, …)
src/ui/       버튼 등 UI 컴포넌트
src/platform/ 서비스워커 템플릿/등록
tests/        Vitest
scripts/      아이콘 생성 등 보조 스크립트
```
