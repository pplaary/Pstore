# Phase 8 最终修复 - 第二轮（3 项 FAIL）

## #2 [FAIL] ConfigScreen — 按钮未挂载到 UI

**文件**: `src/screens/ConfigScreen.tsx`

代码已导入 `clearPendingItems` 并实现二次确认逻辑，但数据管理区域（约 295-317 行）只有"清空商品""重置数据库"按钮，缺少"清空待扫记录"按钮。

**修复**: 在数据管理区域添加"清空待扫记录"按钮，触发已实现的确认逻辑。

---

## #4 [FAIL] ProductDetailScreen — 导出 CSV 按钮缺失

**文件**: `src/screens/ProductDetailScreen.tsx`

`handleExportAll` 已定义（119-130 行），但 JSX 中无渲染。当前仅有价格历史区域 emoji 导出按钮（173-176 行）。

**修复**: 在 ProductDetailScreen JSX 中添加"导出 CSV"文字按钮，调用 `handleExportAll`。按钮放在合适位置（如顶部工具栏区域），使用文字而非纯 emoji。

---

## #5 [FAIL] QuickEntryBar — 长按删除无 isEditing 限制

**文件**: `src/components/QuickEntryBar.tsx`

长按删除逻辑已实现（110-126 行），确认内容包含 `entry.label`，但 `onLongPress` 未加 `isEditing` 判断。非编辑模式下长按也可触发删除确认，与计划不符。

**修复**: 在 `onLongPress` 回调外加 `isEditing` 条件判断，仅在编辑模式下触发长按删除。

---

## 执行顺序

按 #2 → #4 → #5 顺序逐一修复，每项完成后运行 `npx tsc --noEmit` 确认零错误。
全部完成后运行 `npx vitest run`。
