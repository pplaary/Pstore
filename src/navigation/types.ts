/**
 * 导航路由类型定义
 */

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  ProductList: undefined;
  ProductDetail: { id: string };
  ProductEdit: { id?: string };
  ScanBarcode: undefined;
};

export type ProductListScreenProps = NativeStackScreenProps<RootStackParamList, 'ProductList'>;
export type ProductDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'ProductDetail'>;
export type ProductEditScreenProps = NativeStackScreenProps<RootStackParamList, 'ProductEdit'>;
export type ScanScreenProps = NativeStackScreenProps<RootStackParamList, 'ScanBarcode'>;
