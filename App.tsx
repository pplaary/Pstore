import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { initDatabase } from './src/db/init';
import { StoreProvider } from './src/context/store';
import { ProductListScreen } from './src/screens/ProductListScreen';
import { ProductDetailScreen } from './src/screens/ProductDetailScreen';
import { ProductEditScreen } from './src/screens/ProductEditScreen';
import { ScanScreen } from './src/screens/ScanScreen';

export type RootStackParamList = {
  ProductList: undefined;
  ProductDetail: { id: string };
  ProductEdit: { id?: string };
  ScanBarcode: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [db, setDb] = useState<ReturnType<typeof initDatabase> extends Promise<infer T> ? T : never | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initDatabase()
      .then((database) => {
        setDb(database as any);
        setLoading(false);
      })
      .catch((err) => {
        console.error('数据库初始化失败:', err);
        setError(err instanceof Error ? err.message : '未知错误');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return null;
  }

  if (error || !db) {
    throw new Error(error || '数据库未初始化');
  }

  return (
    <StoreProvider db={db}>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="ProductList">
          <Stack.Screen
            name="ProductList"
            component={ProductListScreen}
            options={{ title: 'PStore' }}
          />
          <Stack.Screen
            name="ProductDetail"
            component={ProductDetailScreen}
            options={{ title: '商品详情' }}
          />
          <Stack.Screen
            name="ProductEdit"
            component={ProductEditScreen}
            options={({ route }) => ({
              title: route.params?.id ? '编辑商品' : '新增商品',
            })}
          />
          <Stack.Screen
            name="ScanBarcode"
            component={ScanScreen}
            options={{ title: '扫码' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </StoreProvider>
  );
}
