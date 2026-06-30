# Phase 8 最终审校修复指令

基于最终审校报告 memory_00_jSK1usNQafb9pGO8DFMF5881，修复所有 CRITICAL 和 HIGH 级问题。

---

## #1 [CRITICAL] QuickEntryBar 普通模式需只读

**文件**: `src/components/QuickEntryBar.tsx`

**问题**: 组件缺少 `editable` prop，普通用户可点 `+` 进入管理模式，与计划 C2.2 "普通模式只读点击" 不符。

**修复**:
1. Props 新增 `editable?: boolean`，默认 `false`
2. `handlePlusPress` 仅在 `editable === true` 时允许进入编辑
3. 长按进入编辑仅在 `editable === true` 时生效
4. 非编辑模式下不渲染 `+` 按钮（或渲染但点击无效并给出视觉反馈）

**文件**: `src/screens/HomeScreen.tsx`

**修复**: QuickEntryBar 渲染处传入 `editable={true}`，保持 HomeScreen 中可编辑。

---

## #2 [HIGH] ConfigScreen 补充 clearPendingItems 入口

**文件**: `src/screens/ConfigScreen.tsx`

**问题**: `clearPendingItems` 函数存在但数据管理区域无对应按钮。

**修复**:
1. 导入 `clearPendingItems` from `../services/backup/clear`
2. 在"数据管理"区域添加"清空待扫记录"按钮
3. 按钮点击弹出 Alert.alert 二次确认
4. 确认后调用 `clearPendingItems(db)` 并显示结果 Toast

---

## #3 [HIGH] PriceChart 实现最近 N 条截断

**文件**: `src/components/PriceChart.tsx`

**问题**: 计划要求"显示最近 N 条价格变动记录"，当前无任何截断。

**修复**:
1. Props 新增 `maxHistory?: number`，默认值 20
2. 渲染前对 history 做 `.slice(-maxHistory)` 截断
3. 更新 Props 接口注释说明默认值

---

## #4 [HIGH] ProductDetailScreen 补充导出全部 CSV 按钮

**文件**: `src/screens/ProductDetailScreen.tsx`

**问题**: `handleExportAll` 已定义但 JSX 中无渲染按钮，用户无法触发。

**修复**:
1. 在 ProductDetailScreen 的合适位置（建议顶部右侧或工具栏）添加"导出 CSV"按钮
2. 按钮调用现有的 `handleExportAll` 函数
3. 按钮使用 Text 文字 "导出 CSV"（不用纯 emoji）
4. 样式：使用主题色 `colors.brand.primary`

---

## #5 [HIGH] QuickEntryBar 管理模式长按删除逻辑

**文件**: `src/components/QuickEntryBar.tsx`

**问题**: 计划要求"长按删除"，当前删除靠 `×` 按钮。需补充长按删除行为。

**修复**:
1. 在编辑模式下的标签 Chip 上，`onLongPress` 直接触发 `onRemove(entry.id)` 并弹出确认
2. 长按删除前用 Alert.alert 二次确认，标题"删除快捷入口"，内容 `确定删除「{entry.label}」？`
3. 保留现有 `×` 删除按钮作为辅助入口

---

## 执行顺序与验证

按 1→2→3→4→5 顺序逐一修复，每完成一个文件：
```bash
cd E:\Code\PStore
npx tsc --noEmit
```

全部完成后：
```bash
npx vitest run
```

确保零新增错误。
