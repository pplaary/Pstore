# Phase 8 MEDIUM 项修复指令

基于审校报告修复 6 个 MEDIUM 级问题。

---

## #1 — care scale 对齐计划值 1.2

**文件**: `src/theme/ThemeContext.tsx`

**修改**: 第 142 行 `scale: mode === 'care' ? 1.25 : 1` → `scale: mode === 'care' ? 1.2 : 1`

---

## #2 — 持久化存储改用 AsyncStorage

**文件**: `src/theme/ThemeContext.tsx`

**修改**:
1. 将 `import * as SecureStore from 'expo-secure-store'` 替换为 `import AsyncStorage from '@react-native-async-storage/async-storage'`
2. 将 `SecureStore.getItemAsync(STORAGE_KEY)` 替换为 `AsyncStorage.getItem(STORAGE_KEY)`
3. 将 `SecureStore.setItemAsync(STORAGE_KEY, mode)` 替换为 `AsyncStorage.setItem(STORAGE_KEY, mode)`
4. 注释中的「持久化: expo-secure-store」改为「持久化: AsyncStorage」
5. 错误处理中注释「SecureStore 不可用则使用默认值 'system'」改为「AsyncStorage 不可用则使用默认值 'system'」

---

## #3 — !ready 回退主题用 systemScheme 避免闪烁

**文件**: `src/theme/ThemeContext.tsx`

**修改**: 第 211 行 `buildTheme('light', 'light')` → `buildTheme('system', systemScheme)`

这样未就绪时回退主题跟随系统，避免 dark/care 用户的亮色闪烁。

---

## #7 — exportCSV Scope 过滤提取公共 isDeleted

**文件**: `src/services/backup/exportCSV.ts`

**修改**: 将三处分支的 `!p.isDeleted` 提取为公共过滤：

```ts
const filtered = products
  .filter(p => !p.isDeleted)
  .filter(p => {
    if (scope === 'in_stock') return p.status === 'IN_SHOP';
    if (scope === 'to_be_purchased') return p.status === 'TO_BE_PURCHASED';
    return true; // 'all'
  });
```

原三行各自写 `!p.isDeleted` 的分支替换为上述统一结构。

---

## #10 — PriceChart Y 轴标签至少 1 位小数

**文件**: `src/components/PriceChart.tsx`

**修改**: 第 73-75 行 `.toFixed(0)` → `.toFixed(1)`，三处 Y 轴标签都需要改。

```tsx
<Text style={[s.yText, { color: colors.text.hint }]}>¥{hiP.toFixed(1)}</Text>
<Text style={[s.yText, { color: colors.text.hint }]}>¥{((hiP + loP) / 2).toFixed(1)}</Text>
<Text style={[s.yText, { color: colors.text.hint }]}>¥{loP.toFixed(1)}</Text>
```

---

## #16 — clear.ts affectedRows 改为安全访问

**文件**: `src/services/backup/clear.ts`

**修改**: 两处 `(result as { changes: number }).changes` 改为 `(result as any)?.changes ?? 0`

第 37 行和第 65 行各一处。

---

## 执行验证

每改完一个文件运行：
```bash
cd E:\Code\PStore
npx tsc --noEmit
```

确保零错误后再继续下一个。全部完成后确认 vitest 无新增失败。
