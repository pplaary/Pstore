# PStore P2 — 审校修复指令（P1 + P2）

工作目录：`E:\Code\PStore`。修复 ScanScreen 扫码 AI 识别的 P1 和 P2。

---

## P2-3（先修复）：移动 `handleAiBarcode` 到 `handleBarcodeScanned` 之前

**文件**: `src/screens/ScanScreen.tsx`

将 `handleAiBarcode` 的定义剪切到 `handleBarcodeScanned` 定义之前。这样 P2-2 自然解决。

---

## P1-1：管理模式"仅记录"按钮静默失效

在 `handleBarcodeScanned` 和 `handleManualSubmit` 中，Alert 的"仅记录"按钮内：

**当前**:
```tsx
{ text: '仅记录', style: 'cancel', onPress: async () => {
  if (!isManagement) {
    await createOrUpdate(db, scannedBarcode);
  }
}},
```

**改为**（始终记录 + 加反馈）:
```tsx
{ text: '仅记录', style: 'cancel', onPress: async () => {
  await createOrUpdate(db, scannedBarcode);
  Alert.alert('已记录', `条码 ${scannedBarcode} 已暂存，可在管理模式补充`);
}},
```

两处都要改（扫码路径 + 手动输入路径）。

---

## P1-3：AI 解析失败时静默降级

在 `handleAiBarcode` 的两个降级路径中增加用户提示：

**无结果分支**（`result.data` 为空）:
```tsx
Alert.alert('AI 未识别', '请手动录入商品信息', [
  { text: '确定', onPress: () => navigation.navigate('ProductEdit', { barcode }) },
]);
```

**异常分支**（catch）:
```tsx
Alert.alert('AI 识别失败', '请手动录入商品信息', [
  { text: '确定', onPress: () => navigation.navigate('ProductEdit', { barcode }) },
]);
```

---

## P2-1：提取重复 Alert 为私有函数

在 `handleTakePhoto` 之后、`handleBarcodeScanned` 之前新增：

```tsx
const showUnmatchedAlert = useCallback((barcode: string) => {
  Alert.alert(
    '未找到商品',
    `条码 ${barcode}`,
    [
      {
        text: '仅记录',
        style: 'cancel',
        onPress: async () => {
          await createOrUpdate(db, barcode);
          Alert.alert('已记录', `条码 ${barcode} 已暂存，可在管理模式补充`);
        },
      },
      {
        text: 'AI 识别',
        onPress: () => handleAiBarcode(barcode),
      },
      {
        text: '手动录入',
        onPress: () => navigation.navigate('ProductEdit', { barcode }),
      },
    ],
  );
}, [db, navigation, handleAiBarcode]);
```

然后替换两处重复的 Alert（`handleBarcodeScanned` 和 `handleManualSubmit` 的未匹配分支）为 `showUnmatchedAlert(scannedBarcode)` / `showUnmatchedAlert(trimmed)`。

---

## P2-2：deps 补全

`handleBarcodeScanned` 已通过 P2-1 改为调用 `showUnmatchedAlert`，deps 加上 `showUnmatchedAlert`。

`handleManualSubmit` deps 加上 `showUnmatchedAlert`。

---

## 验收

```bash
cd E:\Code\PStore && npx tsc --noEmit && npx vitest run
```

确认零类型错误 + 全测试通过后提交：

```bash
git add -A && git commit -m "fix(app): P2 扫码 AI 审校修复 — 按钮反馈/降级提示/代码去重"
```
