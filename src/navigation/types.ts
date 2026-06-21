/**
 * 导航路由类型定义
 */

export type RootStackParamList = {
  ProductList: undefined;
  ProductDetail: { id: string };
  ProductEdit: { id?: string };
  ScanBarcode: undefined;
};

export type ProductListScreenProps = {
  navigation: any;
  route: any;
};

export type ProductDetailScreenProps = {
  navigation: any;
  route: { params: { id: string } };
};

export type ProductEditScreenProps = {
  navigation: any;
  route: { params?: { id?: string } };
};

export type ScanScreenProps = {
  navigation: any;
  route: any;
};
