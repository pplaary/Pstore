/**
 * 导航路由类型定义
 *
 * 架构:
 * RootStack (NativeStack)
 *   └── MainDrawer (DrawerNavigator)
 *         ├── HomeTabs (BottomTab)
 *         │     ├── Home (首页对话)
 *         │     └── Scan (扫码)
 *         ├── ProductList
 *         ├── ProductDetail
 *         ├── ProductEdit
 *         ├── Config
 *         ├── DuplicateList
 *         ├── PendingItems
 *         └── LooseGoodsManage
 */

import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DrawerScreenProps as RNDrawerScreenProps } from '@react-navigation/drawer';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

// ==================== 导航参数表 ====================

export type RootStackParamList = {
  MainDrawer: undefined;
};

export type DrawerParamList = {
  HomeTabs: undefined;
  ProductList: { filter?: string };
  ProductDetail: { id: string };
  ProductEdit: { id?: string; barcode?: string; name?: string; spec?: string };
  Config: undefined;
  DuplicateList: undefined;
  PendingItems: undefined;
  LooseGoodsManage: undefined;
};

export type HomeTabParamList = {
  Home: undefined;
  Scan: { mode?: 'scan' | 'photo' };
};

// ==================== Screen Props 类型 ====================

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
export type DrawerScreenProps<T extends keyof DrawerParamList> = RNDrawerScreenProps<DrawerParamList, T>;
export type HomeTabScreenProps<T extends keyof HomeTabParamList> = BottomTabScreenProps<HomeTabParamList, T>;

// ==================== 便捷类型别名 ====================

export type ProductListScreenProps = DrawerScreenProps<'ProductList'>;
export type ProductDetailScreenProps = DrawerScreenProps<'ProductDetail'>;
export type ProductEditScreenProps = DrawerScreenProps<'ProductEdit'>;
export type ConfigScreenProps = DrawerScreenProps<'Config'>;
export type ScanScreenProps = HomeTabScreenProps<'Scan'>;
export type LooseGoodsManageScreenProps = DrawerScreenProps<'LooseGoodsManage'>;
export type DuplicateListScreenProps = DrawerScreenProps<'DuplicateList'>;
export type PendingItemsScreenProps = DrawerScreenProps<'PendingItems'>;

// 复合导航类型：Drawer 页面可导航到其他 Drawer 页面
export type HomeScreenCompositeProps = CompositeScreenProps<
  HomeTabScreenProps<'Home'>,
  RNDrawerScreenProps<DrawerParamList>
>;
export type ProductListScreenCompositeProps = CompositeScreenProps<
  DrawerScreenProps<'ProductList'>,
  RNDrawerScreenProps<DrawerParamList>
>;
export type HomeScreenProps = HomeTabScreenProps<'Home'>;

// ScanScreen 在 BottomTab 内，但需要导航到 Drawer 页面
export type ScanScreenCompositeProps = CompositeScreenProps<
  HomeTabScreenProps<'Scan'>,
  RNDrawerScreenProps<DrawerParamList>
>;