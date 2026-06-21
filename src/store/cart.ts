/**
 * 购物车 Zustand Store
 *
 * 纯内存态，不持久化。App 退出或后台回收后自然清空。
 * 符合 spec 原则三：「轻快无感，扫完就走」
 */

import { create } from 'zustand';

// ==================== 类型 ====================

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

// ==================== 辅助函数 ====================

function calcTotal(items: CartItem[]): number {
  return items.reduce((s, i) => s + i.price * i.quantity, 0);
}

// ==================== Store ====================

export interface CartState {
  items: CartItem[];
  total: number;
  addToCart: (productId: string, name: string, price: number) => void;
  removeFromCart: (productId: string) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  items: [],
  total: 0,

  addToCart: (productId, name, price) => {
    set((s) => {
      const exist = s.items.find((i) => i.productId === productId);
      let next: CartItem[];
      if (exist) {
        next = s.items.map((i) =>
          i.productId === productId ? { ...i, quantity: i.quantity + 1 } : i,
        );
      } else {
        next = [...s.items, { productId, name, price, quantity: 1 }];
      }
      return { items: next, total: calcTotal(next) };
    });
  },

  removeFromCart: (productId) => {
    set((s) => {
      const exist = s.items.find((i) => i.productId === productId);
      if (!exist) return s;
      let next: CartItem[];
      if (exist.quantity <= 1) {
        next = s.items.filter((i) => i.productId !== productId);
      } else {
        next = s.items.map((i) =>
          i.productId === productId ? { ...i, quantity: i.quantity - 1 } : i,
        );
      }
      return { items: next, total: calcTotal(next) };
    });
  },

  removeItem: (productId) => {
    set((s) => {
      const next = s.items.filter((i) => i.productId !== productId);
      return { items: next, total: calcTotal(next) };
    });
  },

  clearCart: () => {
    set({ items: [], total: 0 });
  },
}));
