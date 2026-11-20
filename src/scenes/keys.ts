export const SceneKey = {
  Boot: 'Boot',
  Title: 'Title',
  Battle: 'Battle',
} as const;
export type SceneKey = (typeof SceneKey)[keyof typeof SceneKey];
