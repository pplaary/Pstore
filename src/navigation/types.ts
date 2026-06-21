/**
 * 导航路由类型定义
 */

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DrawerScreenProps as RNDrawerScreenProps } from '@react-navigation/drawer';

export type RootStackParamList = {
  MainDrawer: undefined;
  ProductDetail: { id: string };
  ProductEdit: { id?: string; barcode?: string; name?: string; spec?: string };
  ScanBarcode: { mode?: 'scan' | 'photo' };
  PendingItems: undefined;
  DuplicateList: undefined;
};

export type DrawerParamList = {
  Home: undefined;
  ProductList: { filter?: string };
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
export type DrawerScreenProps<T extends keyof DrawerParamList> = RNDrawerScreenProps<DrawerParamList, T>;

// 便捷类型别名
export type ProductListScreenProps = RootStackScreenProps<'ProductList'>;
export type ProductDetailScreenProps = RootStackScreenProps<'ProductDetail'>;
export type ProductEditScreenProps = RootStackScreenProps<'ProductEdit'>;
export type ScanScreenProps = RootStackScreenProps<'ScanBarcode'>;
export type HomeScreenProps = DrawerScreenProps<'Home'>;
