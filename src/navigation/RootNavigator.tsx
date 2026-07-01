/**
 * 导航根组件 — 现代化导航架构
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
 *
 * 单手交互:
 * - 抽屉从左侧滑出
 * - 底部 Tab 栏易于拇指触及
 * - 返回按钮在左上角
 */

import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import type { RootStackParamList, DrawerParamList, HomeTabParamList } from './types';

import { ScanScreen } from '../screens/ScanScreen';
import { ProductListScreen } from '../screens/ProductListScreen';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { ProductEditScreen } from '../screens/ProductEditScreen';
import { ConfigScreen } from '../screens/ConfigScreen';
import { DuplicateScreen } from '../screens/DuplicateScreen';
import { PendingItemsScreen } from '../screens/PendingItemsScreen';
import { LooseGoodsManageScreen } from '../screens/LooseGoodsManageScreen';
import DrawerContent from '../components/DrawerContent';
import HomeScreen from '../screens/HomeScreen';

// ==================== 导航器实例 ====================

const Stack = createNativeStackNavigator<RootStackParamList>();
const Drawer = createDrawerNavigator<DrawerParamList>();
const Tab = createBottomTabNavigator<HomeTabParamList>();

// ==================== 底部 Tab 导航 ====================

function HomeTabs() {
  const { theme } = useTheme();
  const { colors, scale } = theme;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface.s1,
          borderTopColor: colors.border.subtle,
          borderTopWidth: 0.5,
          height: Platform.OS === 'ios' ? 80 : 60,
          paddingBottom: Platform.OS === 'ios' ? 20 : 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.brand.primary,
        tabBarInactiveTintColor: colors.text.tertiary,
        tabBarLabelStyle: {
          fontSize: 11 * scale,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: '对话',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-ellipses" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Scan"
        component={ScanScreen}
        options={{
          tabBarLabel: '扫码',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="scan" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// ==================== Drawer 导航 ====================

function MainDrawer() {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerStyle: {
          backgroundColor: colors.surface.s1,
          width: 300,
        },
        drawerType: 'front',
        overlayColor: colors.surface.overlay,
        swipeEdgeWidth: 40,
        swipeMinDistance: 10,
      }}
    >
      <Drawer.Screen name="HomeTabs" component={HomeTabs} />
      <Drawer.Screen
        name="ProductList"
        component={ProductListScreen}
        options={{ drawerItemStyle: { display: 'none' } }}
      />
      <Drawer.Screen
        name="ProductDetail"
        component={ProductDetailScreen}
        options={{ drawerItemStyle: { display: 'none' } }}
      />
      <Drawer.Screen
        name="ProductEdit"
        component={ProductEditScreen}
        options={{ drawerItemStyle: { display: 'none' } }}
      />
      <Drawer.Screen
        name="Config"
        component={ConfigScreen}
        options={{ drawerItemStyle: { display: 'none' } }}
      />
      <Drawer.Screen
        name="DuplicateList"
        component={DuplicateScreen}
        options={{ drawerItemStyle: { display: 'none' } }}
      />
      <Drawer.Screen
        name="PendingItems"
        component={PendingItemsScreen}
        options={{ drawerItemStyle: { display: 'none' } }}
      />
      <Drawer.Screen
        name="LooseGoodsManage"
        component={LooseGoodsManageScreen}
        options={{ drawerItemStyle: { display: 'none' } }}
      />
    </Drawer.Navigator>
  );
}

// ==================== 根导航器 ====================

export default function RootNavigator() {
  const { theme } = useTheme();
  const { colors } = theme;

  const navTheme = useMemo(
    () => ({
      ...(theme.isDark ? DarkTheme : DefaultTheme),
      colors: {
        ...(theme.isDark ? DarkTheme.colors : DefaultTheme.colors),
        primary: colors.brand.primary,
        background: colors.surface.s0,
        card: colors.surface.s1,
        text: colors.text.primary,
        border: colors.border.subtle,
        notification: colors.brand.danger,
      },
    }),
    [theme.isDark, colors]
  );

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: {
            backgroundColor: colors.surface.s0,
          },
        }}
      >
        <Stack.Screen name="MainDrawer" component={MainDrawer} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}