# PStore P2 — 复审扫尾修复

工作目录：`E:\Code\PStore`

## N1：`showUnmatchedAlert` "仅记录" 缺 DB 错误处理

**文件**: `src/screens/ScanScreen.tsx`，`showUnmatchedAlert` 中"仅记录"的 `onPress`

**改为**:
```tsx
onPress: async () => {
  try {
    await createOrUpdate(db, barcode);
    Alert.alert('已记录', `条码 ${barcode} 已暂存，可在管理模式补充`);
  } catch {
    Alert.alert('记录失败', '条码暂存失败，请重试');
  }
},
```

## N2：`handleAiBarcode` 缺调试日志

**文件**: `src/screens/ScanScreen.tsx`，`handleAiBarcode`

在无结果 Alert 前补：
```ts
console.warn('ScanScreen: AI 条码解析无结果', result);
```

在异常 Alert 前补：
```ts
console.warn('ScanScreen: AI 条码解析失败', e);
```

---

完成后 `tsc --noEmit` + `git commit -m "fix(app): P2 扫尾 — DB错误处理 + 调试日志"`。
