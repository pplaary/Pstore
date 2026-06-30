# Phase 8 最终修复 - 第三轮（精确编辑指令）

## #2 ConfigScreen — 挂载「清空待扫记录」按钮

**文件**: `src/screens/ConfigScreen.tsx`

在数据管理区域（约 295-317 行），`buttonRow` 内只有两个按钮。需添加第三个：

```
查找:
          <TouchableOpacity
            style={[styles.button, styles.dangerButton]}
            onPress={handleResetDatabase}
            accessibilityLabel="重置数据库"
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>重置数据库</Text>
          </TouchableOpacity>

在「重置数据库」按钮的 `</TouchableOpacity>` 之后、「`</View>`（buttonRow 结束）」之前，插入:
          <TouchableOpacity
            style={[styles.button, styles.dangerButton]}
            onPress={handleClearPendingItems}
            accessibilityLabel="清空待扫记录"
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>清空待扫记录</Text>
          </TouchableOpacity>
```

## #4 ProductDetailScreen — 挂载「导出 CSV」按钮

**文件**: `src/screens/ProductDetailScreen.tsx`

在商品信息卡片 `cardHeader` 内、商品名之后添加导出按钮。

```
查找:
          <Text style={styles.productName}>{product.name}</Text>
        </View>   ← cardHeader 结束

在 `</View>` (cardHeader) 之前插入:
          <TouchableOpacity onPress={handleExportAll} accessibilityLabel="导出商品 CSV">
            <Text style={styles.exportTextButton}>导出 CSV</Text>
          </TouchableOpacity>
```

同时需在 StyleSheet 中添加 `exportTextButton` 样式（参考 `exportButton`，但用文字颜色而非 emoji 尺寸）。

在 styles 中添加:
```
    exportTextButton: {
      color: colors.brand.primary,
      fontSize: 14 * scale,
      fontWeight: '600',
    },
```

## #5 QuickEntryBar — 长按删除限制在编辑模式

**文件**: `src/components/QuickEntryBar.tsx`

当前代码（约 113 行）:
```
onLongPress={() => {
    if (!editable) return;
```

改为:
```
onLongPress={() => {
    if (!isEditing) return;
```

## 执行

按 #2 → #4 → #5 顺序逐一编辑。每项完成后运行 `npx tsc --noEmit` 确认零错误。全部完成后运行 `npx vitest run`。
