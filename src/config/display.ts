/** Layout constants for the portrait 1080x1920 reference resolution. */
export const GAME_WIDTH = 1080;
export const GAME_HEIGHT = 1920;
/** Minimum touch target in game pixels. 48 CSS px on a ~400 CSS px wide phone ≈ 130 game px. */
export const MIN_TOUCH = 130;

export const COLORS = {
  bg: 0x120d0b,
  panel: 0x2a1f1a,
  panelLight: 0x3d2e26,
  gold: 0xd9a441,
  goldDark: 0xb37a1f,
  red: 0xc0392b,
  hp: 0xc0392b,
  hpBack: 0x3a1512,
  sanityPos: 0x4aa3df,
  sanityNeg: 0x8e3b9e,
  stagger: 0xf1c40f,
  danger: '#ff6b5b',
  ok: '#7fd18b',
  text: '#f2e6d0',
  textDim: '#a8987f',
} as const;

export const FONT = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

export const DAMAGE_TYPE_KO = { slash: '참격', pierce: '관통', blunt: '타격' } as const;
export const SIN_KO = { wrath: '분노', lust: '색욕', sloth: '나태', gluttony: '탐식', gloom: '우울', pride: '오만', envy: '질투' } as const;
export const RESIST_KO = { fatal: '치명', weak: '취약', normal: '보통', endured: '인내', ineffective: '견딤', immune: '면역' } as const;
