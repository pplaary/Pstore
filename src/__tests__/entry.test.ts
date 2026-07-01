/**
 * Commit 2: 应用入口与路由导航 — 集成测试
 *
 * 验证文件存在性与模块导出。
 * 注意：避免导入 expo-sqlite 原生模块（需真机/模拟器）。
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

describe('Commit 2: 入口与路由导航', () => {
  // ==================== 入口文件 ====================

  it('index.ts 存在并导出 registerRootComponent', () => {
    const f = path.join(PROJECT_ROOT, 'index.ts');
    expect(fs.existsSync(f)).toBe(true);
    const content = fs.readFileSync(f, 'utf8');
    expect(content).toContain('registerRootComponent');
    expect(content).toContain("import App from './App'");
  });

  it('App.tsx 存在并包含 initDatabase + StoreProvider + ThemeProvider', () => {
    const f = path.join(PROJECT_ROOT, 'App.tsx');
    expect(fs.existsSync(f)).toBe(true);
    const content = fs.readFileSync(f, 'utf8');
    expect(content).toContain('initDatabase');
    expect(content).toContain('StoreProvider');
    expect(content).toContain('ThemeProvider');
  });

  // ==================== 导航模块 ====================

  it('src/navigation/RootNavigator.tsx 存在并包含 createNativeStackNavigator', () => {
    const f = path.join(PROJECT_ROOT, 'src', 'navigation', 'RootNavigator.tsx');
    expect(fs.existsSync(f)).toBe(true);
    const content = fs.readFileSync(f, 'utf8');
    expect(content).toContain('createNativeStackNavigator');
  });

  it('src/navigation/types.ts 存在并包含路由参数表', () => {
    const f = path.join(PROJECT_ROOT, 'src', 'navigation', 'types.ts');
    expect(fs.existsSync(f)).toBe(true);
    const content = fs.readFileSync(f, 'utf8');
    expect(content).toContain('ProductList');
    expect(content).toContain('ProductDetail');
    expect(content).toContain('ProductEdit');
    expect(content).toContain('Scan');
    expect(content).toContain('DrawerScreenProps');
  });

  // ==================== Context 模块 ====================

  it('src/context/store.tsx 存在并导出 StoreProvider + useStore', () => {
    const f = path.join(PROJECT_ROOT, 'src', 'context', 'store.tsx');
    expect(fs.existsSync(f)).toBe(true);
    const content = fs.readFileSync(f, 'utf8');
    expect(content).toContain('export function StoreProvider');
    expect(content).toContain('export function useStore');
    expect(content).toContain('getAllProducts');
    expect(content).toContain('createContext');
  });

  // ==================== Screen 占位模块 ====================

  const screens = ['ProductListScreen', 'ProductDetailScreen', 'ProductEditScreen', 'ScanScreen'];
  for (const name of screens) {
    it(`src/screens/${name}.tsx 存在并导出组件`, () => {
      const f = path.join(PROJECT_ROOT, 'src', 'screens', `${name}.tsx`);
      expect(fs.existsSync(f)).toBe(true);
      const content = fs.readFileSync(f, 'utf8');
      expect(content).toContain(`export function ${name}`);
    });
  }
});
