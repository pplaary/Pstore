import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator initialRouteName="ProductList">
      <Stack.Screen
        name="ProductList"
        component={require('../screens/ProductListScreen').ProductListScreen}
        options={{ title: 'PStore' }}
      />
      <Stack.Screen
        name="ProductDetail"
        component={require('../screens/ProductDetailScreen').ProductDetailScreen}
        options={{ title: '商品详情' }}
      />
      <Stack.Screen
        name="ProductEdit"
        component={require('../screens/ProductEditScreen').ProductEditScreen}
        options={({ route }) => ({
          title: route.params?.id ? '编辑商品' : '新增商品',
        })}
      />
      <Stack.Screen
        name="ScanBarcode"
        component={require('../screens/ScanScreen').ScanScreen}
        options={{ title: '扫码' }}
      />
    </Stack.Navigator>
  );
}
