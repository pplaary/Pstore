# Phase 8: P2 暗色关怀 + P3 快捷入口 + P4 数据管理

> 三个小模块合并，总工作量约 4 个 commit。

---

## Commit 1 (C1): 主题基础设施

### C1.1 主题 Context
- `src/theme/ThemeContext.tsx` — ThemeProvider + useTheme hook
- 三种模式: `light` / `dark` / `care`
- 颜色方案:
  - light: 现有硬编码色值
  - dark: React Native 内置 Dark Mode 色板
  - care: 高对比度 + 大字号 (fontSizeScale ×1.2) + 简化间距
- 响应 `useColorScheme()` 自动切换 light/dark
- 手动覆盖: AsyncStorage 持久化 `pstore_theme_mode`

### C1.2 配置页面集成
- ConfigScreen 新增 "外观" 板块: 亮色/暗色/跟随系统/关怀模式
- 开关形式切换

### C1.3 全项目颜色替换
对所有组件文件执行颜色替换，策略: 静态 import 主题色 → StyleSheet 引用变量

## Commit 2 (C2): 快捷入口

### C2.1 数据层
- `src/db/quickEntry.ts` — CRUD
  - `getAllQuickEntries(db)` → LooseGoodsLabel[]
  - `addQuickEntry(db, label)` — order 自动 = max(order)+1
  - `removeQuickEntry(db, id)`
  - `reorderQuickEntry(db, id, newOrder)`

### C2.2 UI 组件
- `src/components/QuickEntryBar.tsx`
  - 横向滚动可编辑标签条
  - 管理模式: 长按删除 / 拖拽排序 / 底部 + 按钮新增
  - 普通模式: 只读点击，点击即搜索该标签

### C2.3 HomeScreen 集成
- 搜索栏下方插入 QuickEntryBar
- 点击标签 → 搜索栏填入关键词并触发搜索

## Commit 3 (C3): CSV 导出 + 价格折线图

### C3.1 CSV 导出
- `src/services/backup/exportCSV.ts`
  - `exportProductsCSV()` — 导出全部非删除商品为 CSV
  - `exportPriceHistoryCSV(productId)` — 单个商品价格历史 CSV
  - 使用 `expo-file-system` + `expo-sharing` 分享
  - CSV 列: 名称,别名,价格,规格,条码,分类,状态,更新时间

### C3.2 价格折线图
- `src/components/PriceChart.tsx`
  - 轻量 SVG 折线图（不引入第三方图表库，用 react-native-svg 或纯 View 实现）
  - 在 ProductDetailScreen 中嵌入
  - 显示最近 N 条价格变动记录
  - X 轴时间 / Y 轴价格

### C3.3 ProductDetailScreen 集成
- 嵌入 PriceChart
- 添加 "导出 CSV" 按钮

## Commit 4 (C4): 清空库 + 测试

### C4.1 清空库
- `src/services/backup/clear.ts`
  - `clearAllProducts(db)` — 软删除所有商品（isDeleted=1）
  - `clearPendingItems(db)` — 清空待处理扫码记录
  - `resetDatabase(db)` — 完全重置（DROP + 重建所有表）
  - 二次确认 Alert（"此操作不可撤销"）

### C4.2 ConfigScreen 集成
- 配置页面底部 "数据管理" 区域
- 清空商品库 / 清空待处理 / 完全重置 三个按钮
- 均有二次确认

### C4.3 测试
- `src/__tests__/theme.test.tsx`
- `src/__tests__/quick-entry.test.tsx`
- `src/__tests__/export-csv.test.ts`
- `src/__tests__/price-chart.test.tsx`
- `src/__tests__/clear.test.ts`
