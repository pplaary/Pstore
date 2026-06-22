import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import { Alert } from 'react-native';
import * as SQLite from 'expo-sqlite';
import type { Product } from '../db/types';
import { getAllProducts } from '../db/product';
import { showToast } from '../utils/toast';

// ==================== Context 类型 ====================

interface StoreContextValue {
  db: SQLite.SQLiteDatabase;
  products: Product[];
  refreshProducts: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

// ==================== Provider ====================

interface StoreProviderProps {
  db: SQLite.SQLiteDatabase;
  children: React.ReactNode;
}

export function StoreProvider({ db, children }: StoreProviderProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const refreshRef = useRef(0);
  const failCountRef = useRef(0);

  const refreshProducts = useCallback(async () => {
    refreshRef.current += 1;
    const token = refreshRef.current;
    try {
      const all = await getAllProducts(db);
      if (token === refreshRef.current) {
        setProducts(all);
        failCountRef.current = 0;
      }
    } catch (e) {
      console.error('refreshProducts 失败:', e);
      failCountRef.current += 1;
      if (failCountRef.current >= 3) {
        showToast('数据库连续操作失败，请重启应用', 'LONG');
      }
    }
  }, [db]);

  const value = useMemo(
    () => ({ db, products, refreshProducts }),
    [db, products, refreshProducts],
  );

  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
}

// ==================== Hook ====================

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error('useStore 必须在 StoreProvider 内使用');
  }
  return ctx;
}
