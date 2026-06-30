# PStore P2 AI 嵌入：ScanScreen 扫码无匹配 AI 识别

## 你的任务

工作目录：`E:\Code\PStore`。在 ScanScreen 扫码未匹配到商品时，增加「AI 识别」选项，将条码号通过 n1-server `/api/ai/parse` 尝试解析商品信息。

## 前置：理解现有流程

当前 `handleBarcodeScanned`（ScanScreen.tsx）逻辑：
```
条码扫描 → findByBarcode(db, code)
  → 匹配到：展示商品卡（加购/忽略）
  → 未匹配：
      - 管理模式 → 直接跳 ProductEdit { barcode }
      - 普通模式 → 记录 pending + Alert "已记录"
```

## 步骤 1：新增 import

在 `src/screens/ScanScreen.tsx` 顶部，确认已有（P1 已加）：
```typescript
import { aiParse } from '../services/n1';
import { useSyncConfigStore } from '../store/syncConfig';
```

## 步骤 2：修改 `handleBarcodeScanned` — 未匹配分支增加 AI 识别

**文件**: `src/screens/ScanScreen.tsx`

找到未匹配分支（`results.length === 0`），当前代码：

```tsx
} else {
  setMatchedProduct(null);
  if (isManagement) {
    navigation.navigate('ProductEdit', { barcode: scannedBarcode });
  } else {
    await createOrUpdate(db, scannedBarcode);
    Alert.alert(
      '已记录',
      `条码 ${scannedBarcode} 已记录，可在管理模式中补充`,
      [{ text: '确定' }],
    );
  }
}
```

**改为**：

```tsx
} else {
  setMatchedProduct(null);
  // 统一展示三选项弹窗
  Alert.alert(
    '未找到商品',
    `条码 ${scannedBarcode}`,
    [
      { text: '仅记录', style: 'cancel', onPress: async () => {
        if (!isManagement) {
          await createOrUpdate(db, scannedBarcode);
        }
      }},
      {
        text: 'AI 识别',
        onPress: () => handleAiBarcode(scannedBarcode),
      },
      {
        text: '手动录入',
        onPress: () => {
          navigation.navigate('ProductEdit', { barcode: scannedBarcode });
        },
      },
    ],
  );
}
```

## 步骤 3：新增 `handleAiBarcode` 函数

在 `handleBarcodeScanned` 之后新增：

```tsx
const handleAiBarcode = useCallback(async (barcode: string) => {
  const serverUrl = useSyncConfigStore.getState().serverUrl;
  if (!serverUrl) {
    Alert.alert('提示', '请先配置 N1 服务器地址');
    return;
  }

  setIsLoading(true);
  try {
    const result = await aiParse(serverUrl, `条码 ${barcode}`);
    if (result.data && result.data.name) {
      // AI 解析成功 → 跳转 ProductEdit 并预填
      navigation.navigate('ProductEdit', {
        barcode,
        name: result.data.name,
        spec: [
          result.data.price ? `¥${result.data.price}` : null,
          result.data.category || null,
        ].filter((p): p is string => p !== null).join(' · '),
      });
    } else {
      // AI 未识别 → 走手动录入
      console.warn('ScanScreen: AI 条码解析无结果', result);
      navigation.navigate('ProductEdit', { barcode });
    }
  } catch (e) {
    console.warn('ScanScreen: AI 条码解析失败', e);
    // 降级：不阻塞，走手动录入
    navigation.navigate('ProductEdit', { barcode });
  } finally {
    setIsLoading(false);
  }
}, [navigation]);
```

## 步骤 4：检查 ProductEditScreen 能否接收预填 name/spec

确认 `ProductEditScreen` 已支持从 `route.params` 接收 `name` 和 `spec` 预填（已有逻辑在第 69-103 行的 `useEffect` 中）。如果已有，无需改动。

## 验收

```bash
cd E:\Code\PStore && npx tsc --noEmit && npx vitest run
```

- [ ] 扫码未匹配时弹出三选项：「仅记录」「AI 识别」「手动录入」
- [ ] 点「AI 识别」→ 调 `/api/ai/parse` 传入 `"条码 xxx"`
- [ ] AI 成功 → 跳 ProductEdit 预填 name + barcode + spec(价格·分类)
- [ ] AI 失败 → 降级跳 ProductEdit（仅 barcode）
- [ ] 点「手动录入」→ 跳 ProductEdit { barcode }
- [ ] 点「仅记录」→ 记录 pending（普通模式）/ 什么都不做（管理模式）
- [ ] 不影响扫码匹配成功时的原有行为
- [ ] tsc 零错误，vitest 全过

## 提交

```bash
git add -A && git commit -m "feat(app): ScanScreen 扫码无匹配增加 AI 条码识别入口"
```
