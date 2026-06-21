/**
 * Commit 5: 商品编辑与扫码页 — 集成测试
 *
 * 验证文件存在性、导出完整性、关键功能实现。
 * 注意：避免导入 expo-sqlite 原生模块（需真机/模拟器）。
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

describe('Commit 5: 商品编辑与扫码页', () => {
  // ==================== 编辑页 ====================

  it('src/screens/ProductEditScreen.tsx 存在并导出组件', () => {
    const f = path.join(PROJECT_ROOT, 'src', 'screens', 'ProductEditScreen.tsx');
    expect(fs.existsSync(f)).toBe(true);
    const content = fs.readFileSync(f, 'utf8');
    expect(content).toContain('export function ProductEditScreen');
  });

  it('ProductEditScreen 包含 addProduct 和 updateProduct 调用', () => {
    const f = path.join(PROJECT_ROOT, 'src', 'screens', 'ProductEditScreen.tsx');
    const content = fs.readFileSync(f, 'utf8');
    expect(content).toContain('addProduct');
    expect(content).toContain('updateProduct');
  });

  it('ProductEditScreen 包含表单校验：名称非空 + 价格>0', () => {
    const f = path.join(PROJECT_ROOT, 'src', 'screens', 'ProductEditScreen.tsx');
    const content = fs.readFileSync(f, 'utf8');
    expect(content).toContain('商品名称不能为空');
    expect(content).toContain('价格必须大于 0');
  });

  it('ProductEditScreen 包含所有表单字段', () => {
    const f = path.join(PROJECT_ROOT, 'src', 'screens', 'ProductEditScreen.tsx');
    const content = fs.readFileSync(f, 'utf8');
    expect(content).toContain('name');
    expect(content).toContain('price');
    expect(content).toContain('spec');
    expect(content).toContain('barcode');
    expect(content).toContain('category');
    expect(content).toContain('status');
  });

  it('ProductEditScreen 包含 CATEGORIES 和 3 种状态', () => {
    const f = path.join(PROJECT_ROOT, 'src', 'screens', 'ProductEditScreen.tsx');
    const content = fs.readFileSync(f, 'utf8');
    expect(content).toContain('CATEGORIES');
    expect(content).toContain("IN_SHOP");
    expect(content).toContain("OUT_OF_STOCK");
    expect(content).toContain("TO_BE_PURCHASED");
  });

  // ==================== 扫码页 ====================

  it('src/screens/ScanScreen.tsx 存在并导出组件', () => {
    const f = path.join(PROJECT_ROOT, 'src', 'screens', 'ScanScreen.tsx');
    expect(fs.existsSync(f)).toBe(true);
    const content = fs.readFileSync(f, 'utf8');
    expect(content).toContain('export function ScanScreen');
  });

  it('ScanScreen 导航到 ProductEdit 并传递 barcode', () => {
    const f = path.join(PROJECT_ROOT, 'src', 'screens', 'ScanScreen.tsx');
    const content = fs.readFileSync(f, 'utf8');
    expect(content).toContain("navigation.navigate('ProductEdit'");
    expect(content).toContain('barcode');
  });

  it('ScanScreen 包含手动输入 fallback 和取消按钮', () => {
    const f = path.join(PROJECT_ROOT, 'src', 'screens', 'ScanScreen.tsx');
    const content = fs.readFileSync(f, 'utf8');
    expect(content).toContain('手动输入条码');
    expect(content).toContain('navigation.goBack');
  });

  it('ScanScreen 包含空条码校验', () => {
    const f = path.join(PROJECT_ROOT, 'src', 'screens', 'ScanScreen.tsx');
    const content = fs.readFileSync(f, 'utf8');
    expect(content).toContain('请输入或扫描条码');
  });
});
