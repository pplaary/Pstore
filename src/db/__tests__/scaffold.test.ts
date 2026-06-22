/**
 * 验证 Expo 项目骨架：配置文件可解析、依赖结构正确、db 纯函数可用。
 *
 * 注意：本测试不导入 expo-sqlite/expo-crypto（这些是原生模块，需真机/模拟器）。
 *       纯函数 tokenizeChinese 等在 Node 环境下直接可用。
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

describe('scaffold: project skeleton', () => {
  // ==================== 配置文件存在 ====================

  it('package.json 存在且可解析', () => {
    const pkgPath = path.join(PROJECT_ROOT, 'package.json');
    expect(fs.existsSync(pkgPath)).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    expect(pkg.name).toBe('pstore');
    expect(pkg.dependencies.expo).toMatch(/~52/);
    expect(pkg.dependencies['expo-sqlite']).toBeDefined();
    expect(pkg.dependencies['expo-crypto']).toBeDefined();
    expect(pkg.dependencies['pinyin-pro']).toBeDefined();
    expect(pkg.dependencies.react).toBe('18.3.1');
    expect(pkg.dependencies['react-native']).toBe('0.76.7');
  });

  it('tsconfig.json 存在且 strict + paths 正确', () => {
    const cfgPath = path.join(PROJECT_ROOT, 'tsconfig.json');
    expect(fs.existsSync(cfgPath)).toBe(true);
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    expect(cfg.compilerOptions.strict).toBe(true);
    expect(cfg.compilerOptions.paths['@/*']).toEqual(['./src/*']);
  });

  it('app.json 存在且 name + permissions 正确', () => {
    const appPath = path.join(PROJECT_ROOT, 'app.json');
    expect(fs.existsSync(appPath)).toBe(true);
    const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));
    expect(app.expo.name).toBe('PStore');
    expect(app.expo.android.permissions).toContain('CAMERA');
  });

  it('babel.config.js 存在', () => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, 'babel.config.cjs'))).toBe(true);
  });

  // ==================== src 结构 ====================

  it('src/db/ 核心模块全部存在', () => {
    const dbDir = path.join(PROJECT_ROOT, 'src', 'db');
    const required = [
      'init.ts',
      'product.ts',
      'search.ts',
      'tokenizer.ts',
      'types.ts',
      'verify.ts',
    ];
    for (const f of required) {
      expect(fs.existsSync(path.join(dbDir, f))).toBe(true);
    }
  });

  // ==================== db 纯函数可用 ====================

  it('tokenizeChinese 分词正确', async () => {
    const { tokenizeChinese } = await import('../tokenizer');
    expect(tokenizeChinese('百事可乐')).toEqual(['百', '事', '可', '乐']);
    expect(tokenizeChinese('可口可乐500ml')).toEqual(['可', '口', '可', '乐', '500ml']);
  });

  it('CATEGORIES 常量有 10 个分类', async () => {
    const { CATEGORIES } = await import('../types');
    expect(CATEGORIES).toHaveLength(10);
    expect(CATEGORIES[0]).toBe('零食');
    expect(CATEGORIES).toContain('饮料');
  });
});
