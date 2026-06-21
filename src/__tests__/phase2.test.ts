/**
 * Phase 2 集成测试：验证新模块存在且导出正确
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

describe('Phase 2: 购物车 + 抽屉导航 + 管理模式 + 列表增强', () => {
  // ==================== Commit 1: 购物车 Store ====================

  it('src/store/cart.ts 存在并导出 CartItem + useCartStore', () => {
    const f = path.join(PROJECT_ROOT, 'src', 'store', 'cart.ts');
    expect(fs.existsSync(f)).toBe(true);
    const content = fs.readFileSync(f, 'utf8');
    expect(content).toContain('CartItem');
    expect(content).toContain('useCartStore');
    expect(content).toContain('addToCart');
    expect(content).toContain('removeFromCart');
    expect(content).toContain('clearCart');
  });

  // ==================== Commit 2: 抽屉导航 ====================

  it('src/navigation/RootNavigator.tsx 存在并包含 DrawerNavigator', () => {
    const f = path.join(PROJECT_ROOT, 'src', 'navigation', 'RootNavigator.tsx');
    expect(fs.existsSync(f)).toBe(true);
    const content = fs.readFileSync(f, 'utf8');
    expect(content).toContain('createDrawerNavigator');
    expect(content).toContain('Home');
    expect(content).toContain('ProductList');
  });

  it('src/screens/HomeScreen.tsx 存在并包含购物车折叠栏', () => {
    const f = path.join(PROJECT_ROOT, 'src', 'screens', 'HomeScreen.tsx');
    expect(fs.existsSync(f)).toBe(true);
    const content = fs.readFileSync(f, 'utf8');
    expect(content).toContain('cartBar');
    expect(content).toContain('cartExpanded');
    expect(content).toContain('checkoutVisible');
  });

  it('src/components/DrawerContent.tsx 存在', () => {
    const f = path.join(PROJECT_ROOT, 'src', 'components', 'DrawerContent.tsx');
    expect(fs.existsSync(f)).toBe(true);
  });

  // ==================== Commit 3: 管理模式 + PIN ====================

  it('src/store/mode.ts 存在并导出 useModeStore', () => {
    const f = path.join(PROJECT_ROOT, 'src', 'store', 'mode.ts');
    expect(fs.existsSync(f)).toBe(true);
    const content = fs.readFileSync(f, 'utf8');
    expect(content).toContain('useModeStore');
    expect(content).toContain('enterManagement');
    expect(content).toContain('exitManagement');
  });

  it('src/store/pin.ts 存在并导出 usePinStore', () => {
    const f = path.join(PROJECT_ROOT, 'src', 'store', 'pin.ts');
    expect(fs.existsSync(f)).toBe(true);
    const content = fs.readFileSync(f, 'utf8');
    expect(content).toContain('usePinStore');
    expect(content).toContain('verifyPin');
    expect(content).toContain('setPin');
  });

  it('src/components/PinModal.tsx 存在', () => {
    const f = path.join(PROJECT_ROOT, 'src', 'components', 'PinModal.tsx');
    expect(fs.existsSync(f)).toBe(true);
    const content = fs.readFileSync(f, 'utf8');
    expect(content).toContain('PinModal');
    expect(content).toContain('PIN 错误');
  });

  // ==================== Commit 4: FAB + 长按菜单 + 批量管理 ====================

  it('HomeScreen.tsx 包含 FAB + 批量管理工具栏', () => {
    const f = path.join(PROJECT_ROOT, 'src', 'screens', 'HomeScreen.tsx');
    const content = fs.readFileSync(f, 'utf8');
    expect(content).toContain('styles.fab');
    expect(content).toContain('batchToolbar');
    expect(content).toContain('selectAll');
    expect(content).toContain('handleBatchDelete');
    expect(content).toContain('handleBatchStatus');
  });
});
