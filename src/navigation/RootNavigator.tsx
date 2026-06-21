/**
 * 根导航：DrawerNavigator + NativeStack 组合
 *
 * 结构：
 * RootStack (NativeStack)
 *   ├─ MainDrawer (DrawerNavigator)
 *   │    ├─ Home → 主界面（搜索 + 购物车折叠栏 + 底部输入栏）
 *   │    └─ ProductList → 商品列表（管理模式入口）
 *   ├─ ProductDetail → 详情页（推入）
 *   ├─ ProductEdit → 编辑页（推入）
 *   └─ ScanBarcode → 扫码页（推入）
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { HomeScreen } from '../screens/HomeScreen';
import { ProductListScreen } from '../screens/ProductListScreen';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { ProductEditScreen } from '../screens/ProductEditScreen';
import { ScanScreen } from '../screens/ScanScreen';
import { PendingItemsScreen } from '../screens/PendingItemsScreen';
import { DuplicateScreen } from '../screens/DuplicateScreen';
import DrawerContent from '../components/DrawerContent';
import type { RootStackParamList } from './types';
import type { DrawerParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Drawer = createDrawerNavigator<DrawerParamList>();

function MainDrawer() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
      }}
    >
      <Drawer.Screen name="Home" component={HomeScreen} />
      <Drawer.Screen name="ProductList" component={ProductListScreen} />
    </Drawer.Navigator>
  );
}

export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="MainDrawer"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="MainDrawer" component={MainDrawer} />
      <Stack.Screen
        name="ProductDetail"
        component={ProductDetailScreen}
        options={{ presentation: 'card', headerShown: true, title: '商品详情' }}
      />
      <Stack.Screen
        name="ProductEdit"
        component={ProductEditScreen}
        options={({ route }) => ({
          presentation: 'card',
          headerShown: true,
          title: route.params?.id ? '编辑商品' : '新增商品',
        })}
      />
      <Stack.Screen
        name="ScanBarcode"
        component={ScanScreen}
        options={{ presentation: 'card', headerShown: true, title: '扫码' }}
      />
      <Stack.Screen
        name="PendingItems"
        component={PendingItemsScreen}
        options={{ presentation: 'card', headerShown: true, title: '待处理条码' }}
      />
      <Stack.Screen
        name="DuplicateList"
        component={DuplicateScreen}
        options={{ presentation: 'card', headerShown: true, title: '重复检测' }}
      />
    </Stack.Navigator>
  );
}
