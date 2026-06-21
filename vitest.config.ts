import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    deps: {
      inline: ['expo-sqlite', 'expo-crypto', 'pinyin-pro'],
    },
    ssr: {
      noExternal: ['expo-sqlite', 'expo-crypto', 'pinyin-pro'],
    },
  },
  resolve: {
    alias: {
      'expo-sqlite': 'expo-sqlite',
      'expo-crypto': 'expo-crypto',
      'pinyin-pro': 'pinyin-pro',
      react: 'react',
      'react-native': 'react-native',
    },
  },
});
