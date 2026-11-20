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
  text: '#f2e6d0',
  textDim: '#a8987f',
} as const;

export const FONT = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
