import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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
  ProductEdit: { id?: string; barcode?: string };
  ScanBarcode: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function ErrorUI({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorIcon}>⚠️</Text>
      <Text style={styles.errorTitle}>数据库初始化失败</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryButtonText}>重试</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function App() {
  const [db, setDb] = useState<ReturnType<typeof initDatabase> extends Promise<infer T> ? T : never | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const init = useCallback(() => {
    setLoading(true);
    setError(null);
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

  useEffect(() => {
    init();
  }, [init]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (error || !db) {
    return <ErrorUI message={error || '数据库未初始化'} onRetry={init} />;
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

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 32,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#DC2626',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
