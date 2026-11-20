export const SceneKey = {
  Boot: 'Boot',
  Title: 'Title',
  Battle: 'Battle',
  Reward: 'Reward',
  GameOver: 'GameOver',
} as const;
export type SceneKey = (typeof SceneKey)[keyof typeof SceneKey];
