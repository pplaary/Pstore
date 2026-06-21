/**
 * 购物车 Zustand Store 测试
 */

import { describe, expect, it } from 'vitest';
import { useCartStore } from '../cart';

describe('useCartStore', () => {
  const reset = () => {
    useCartStore.setState({ items: [], total: 0 });
  };

  it('初始状态为空', () => {
    reset();
    expect(useCartStore.getState().items).toHaveLength(0);
    expect(useCartStore.getState().total).toBe(0);
  });

  it('addToCart 新增商品', () => {
    reset();
    useCartStore.getState().addToCart('p1', '可乐', 3.5);
    const state = useCartStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0].productId).toBe('p1');
    expect(state.items[0].quantity).toBe(1);
    expect(state.total).toBe(3.5);
  });

  it('addToCart 已存在则 +1', () => {
    reset();
    useCartStore.getState().addToCart('p1', '可乐', 3.5);
    useCartStore.getState().addToCart('p1', '可乐', 3.5);
    const state = useCartStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0].quantity).toBe(2);
    expect(state.total).toBe(7.0);
  });

  it('addToCart 多商品分别累加', () => {
    reset();
    useCartStore.getState().addToCart('p1', '可乐', 3.5);
    useCartStore.getState().addToCart('p2', '矿泉水', 2.0);
    useCartStore.getState().addToCart('p1', '可乐', 3.5);
    const state = useCartStore.getState();
    expect(state.items).toHaveLength(2);
    expect(state.total).toBeCloseTo(9.0);
  });

  it('removeFromCart 减 1，减到 0 移除', () => {
    reset();
    useCartStore.getState().addToCart('p1', '可乐', 3.5);
    useCartStore.getState().addToCart('p1', '可乐', 3.5);
    useCartStore.getState().removeFromCart('p1');
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].quantity).toBe(1);
    useCartStore.getState().removeFromCart('p1');
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('removeItem 直接删除', () => {
    reset();
    useCartStore.getState().addToCart('p1', '可乐', 3.5);
    useCartStore.getState().addToCart('p1', '可乐', 3.5);
    useCartStore.getState().removeItem('p1');
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('clearCart 清空全部', () => {
    reset();
    useCartStore.getState().addToCart('p1', '可乐', 3.5);
    useCartStore.getState().addToCart('p2', '矿泉水', 2.0);
    useCartStore.getState().clearCart();
    expect(useCartStore.getState().items).toHaveLength(0);
    expect(useCartStore.getState().total).toBe(0);
  });
});
