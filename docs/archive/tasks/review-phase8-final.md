# Phase 8 最终修复审校指令

对照 E:\Code\PStore\tasks\fix-phase8-final.md 逐项验证修复质量。

## 审校清单

### #1 QuickEntryBar 普通模式只读
- 验证 QuickEntryBar.tsx 新增 `editable` prop，默认 false
- 验证 `+` 按钮仅在 editable=true 时渲染/生效
- 验证长按进入编辑仅在 editable=true 时生效
- 验证 HomeScreen.tsx 传入 `editable={true}`

### #2 ConfigScreen clearPendingItems 入口
- 验证 ConfigScreen.tsx 导入了 clearPendingItems
- 验证数据管理区域有"清空待扫记录"按钮
- 验证按钮点击弹出二次确认 Alert
- 验证确认后调用 clearPendingItems(db)

### #3 PriceChart 最近 N 条截断
- 验证 PriceChart.tsx 新增 `maxHistory` prop，默认 20
- 验证渲染前对 history 做 `.slice(-maxHistory)`

### #4 ProductDetailScreen 导出按钮
- 验证 ProductDetailScreen.tsx JSX 中渲染了"导出 CSV"按钮
- 验证按钮调用 handleExportAll
- 验证按钮使用文字而非纯 emoji

### #5 QuickEntryBar 长按删除
- 验证编辑模式下标签 onLongPress 触发删除
- 验证长按删除前有 Alert.alert 二次确认
- 验证确认内容包含 entry.label

## 输出格式

对每个检查项标注 PASS / FAIL + 简要说明。
