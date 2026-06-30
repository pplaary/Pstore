# Phase 8 MEDIUM + LOW 修复指令

## MEDIUM 修复

### M1. ThemeContext care scale 1.25 → 1.2

**文件**: `src/theme/ThemeContext.tsx` 约 157 行

查找 `scale: mode === 'care' ? 1.25`，将 `1.25` 改为 `1.2`。

---

### M2. 创建 4 个测试文件

创建以下测试文件，采用静态分析模式（同 quick-entry.test.tsx）：

**① `src/__tests__/theme.test.tsx`**
覆盖：
- ThemeContext 提供 scale/colors/mode/colorScheme/setMode
- `createUseTheme` 返回 hook，调用返回当前 theme
- `care` 模式下 scale = 1.2（验证 M1 修复后正确）
- `standard` 模式下 scale = 1
- `system` 模式下 colorScheme 为派生值
- `useColorScheme()` 被调用
- ThemeProvider 渲染 children

**② `src/__tests__/export-csv.test.ts`**
覆盖：
- `exportProductsCSV` 接收 Product[] 返回 { ok, path }
- `exportProductsCSV` 空数组返回 { ok, path }
- `exportPriceHistoryCSV` 接收 (db, productId, productName) 返回 { ok, path }
- `exportPriceHistoryCSV` 空 history 返回 { ok, path }
- 文件路径使用 `FileSystem.documentDirectory`
- CSV 列顺序: 名称,别名,价格,规格,条码,分类,状态,更新时间
- 文件名包含时间戳

**③ `src/__tests__/price-chart.test.tsx`**
覆盖：
- PriceChart 组件接收 `history` 和可选 `maxHistory`
- `maxHistory` 默认值 20
- 渲染时对 history 执行 `.slice(-maxHistory)` 截断
- 空 history 渲染空状态提示
- 有数据时渲染 LineChart
- `connector` 配置含 stroke/width
- `transformOrigin` 配置存在

**④ `src/__tests__/clear.test.ts`**
覆盖：
- `clearProducts` 接收 db 返回 { ok, count, message }
- `clearPendingItems` 接收 db 返回 { ok, count, message }
- `resetDatabase` 接收 db 返回 { ok, message }
- `resetDatabase` 调用 `createSchemaV1`
- 三个函数均参数化 SQL（无字符串拼接）
- 错误时返回 { ok: false, message }

每个测试文件格式：静态分析（导入 + describe/it 验证导出/类型/配置），不渲染真实组件。

---

### M3. PriceChart Connector 线宽 hairlineWidth

**文件**: `src/components/PriceChart.tsx` 约 156 行

查找 `height: 1.5`，改为 `height: StyleSheet.hairlineWidth`。

---

### M4. HomeScreen batchBtnDangerText 颜色

**文件**: `src/screens/HomeScreen.tsx` 约 1340 行

查找 `batchBtnDangerText: { color: '#FFFFFF' }`，改为 `color: colors.text.inverse`。

---

### M5. useTheme 无 Provider 回退 warn

**文件**: `src/theme/ThemeContext.tsx` 约 234 行

查找 `setMode: async () => {}`，改为:
```ts
setMode: async (..._args: any[]) => {
  console.warn('[ThemeContext] setMode called outside ThemeProvider');
},
```

---

## LOW 修复（全部注释补充）

### L1. PriceChart transformOrigin 注释

**文件**: `src/components/PriceChart.tsx` 约 161 行

在 `transformOrigin: '0 50%'` 行上方添加注释:
`// transformOrigin 需 RN >= 0.73`

---

### L2. ThemeContext system 模式注释

**文件**: `src/theme/ThemeContext.tsx`

在 `systemColorScheme` / `colorScheme` 逻辑附近添加注释:
`// system 模式依赖 useColorScheme()，系统亮暗切换时由 RN 内部触发 re-render`

---

### L3. clear.ts / init.ts schema 同步注释

**文件 A**: `src/services/backup/clear.ts`
在 `createSchemaV1` 调用处（约 106 行）上方添加:
`// ⚠️ DDL 与此文件及 db/init.ts 中的 createSchemaV1 需同步修改`

**文件 B**: `src/db/init.ts`
在 `createSchemaV1` 函数上方添加:
`// ⚠️ DDL 与此文件及 services/backup/clear.ts 中的 resetDatabase 需同步修改`

---

### L4. exportCSV 注释

**文件**: `src/services/backup/exportCSV.ts`

在 `exportPriceHistoryCSV` 函数上方添加:
`// productName 用于生成导出文件名；db 用于查询数据库`

---

## 执行顺序

先 MEDIUM M1→M2→M3→M4→M5，再 LOW L1→L2→L3→L4。
每完成一个文件运行 `npx tsc --noEmit` 确认零错误。
全部完成后运行 `npx vitest run`。
