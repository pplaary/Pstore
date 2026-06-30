# PStore P1 — 审校修复指令（P0 + P1）

工作目录：`E:\Code\PStore`。修复 ScanScreen 拍照增强的 1 个 P0 和 4 个 P1。

---

## P0-1：availableModes 不认 n1-server → 功能死代码

**文件**: `src/screens/ScanScreen.tsx`，约第 56-59 行

**当前**:
```ts
const availableModes = useMemo<ScanMode[]>(
  () => (aiConfigured ? ['scan', 'photo'] : ['scan']),
  [aiConfigured],
);
```

**改为**:
```ts
const availableModes = useMemo<ScanMode[]>(
  () => (aiConfigured || !!syncConfigServerUrl ? ['scan', 'photo'] : ['scan']),
  [aiConfigured, syncConfigServerUrl],
);
```

---

## P1-2：移除早期守卫，无配置时仍浪费拍照

**文件**: `src/screens/ScanScreen.tsx`，在 `handleTakePhoto` 中 `setIsLoading(true)` 之前

**新增前置守卫**:
```ts
if (!syncConfigServerUrl && (!aiConfig || !aiConfig.apiUrl)) {
  Alert.alert('提示', '请先配置 AI 服务');
  return;
}
```

---

## P1-3：串联超时最坏 25s → 改并发 + 短超时

**文件**: `src/screens/ScanScreen.tsx`，`handleTakePhoto` 的 try 块

**当前逻辑**: n1 15s → 失败后 vision 10s，串联最坏 25s

**改为并发调用**（用 `Promise.allSettled` 同时发起两路，取先成功的）：

```ts
const imageDataUrl = `data:image/jpeg;base64,${photo.base64}`;

const n1Promise = syncConfigServerUrl
  ? aiParseImage(syncConfigServerUrl, imageDataUrl).then(r => ({ source: 'n1' as const, result: r }))
  : Promise.reject(new Error('no n1 config'));

const visionPromise = (aiConfig && aiConfig.apiUrl)
  ? recognizeProduct(photo.base64, aiConfig).then(r => ({ source: 'vision' as const, result: r }))
  : Promise.reject(new Error('no vision config'));

const settled = await Promise.allSettled([n1Promise, visionPromise]);

let recognized = false;
for (const s of settled) {
  if (!recognized && s.status === 'fulfilled') {
    if (s.value.source === 'n1') {
      const data = s.value.result.data;
      if (data && data.name) {
        const specParts = [
          data.price != null && data.price !== '' ? `¥${data.price}` : null,
          data.category || null,
          data.location || null,
        ].filter((p): p is string => p !== null);
        setCandidates([{
          name: data.name,
          confidence: -1,  // n1-server 无置信度字段
          spec: specParts.join(' · ') || 'N1 AI 识别',
        }]);
        setShowCandidates(true);
        recognized = true;
      } else {
        console.warn('ScanScreen: n1-server 返回无效数据', s.value.result);
      }
    } else if (s.value.source === 'vision') {
      if (s.value.result.candidates.length > 0) {
        setCandidates(s.value.result.candidates);
        setShowCandidates(true);
        recognized = true;
      }
    }
  } else if (s.status === 'rejected') {
    console.warn('ScanScreen: AI 通道失败', s.reason);
  }
}
```

**并同步修改 `candidates` state 类型**，`confidence` 字段需能表示 N/A。当前类型 `{ name: string; confidence: number; spec?: string }` 保持不变，n1 结果用 `confidence: -1`，UI 渲染时判断 `-1` 则隐藏置信度行。

**候选列表 UI 改动**（在 Modal 的 renderItem 中）：

```tsx
{item.confidence >= 0 && (
  <Text style={styles.candidateConfidence}>
    置信度 {(item.confidence * 100).toFixed(0)}%
  </Text>
)}
```

---

## P1-4：confidence: 0.95 硬编码 → 改为 -1 标记 N/A

已在 P1-3 修复方案中一并处理（`confidence: -1` + UI 条件渲染）。不再单独列出。

---

## P1-5：n1 空数据静默失败无日志

已在 P1-3 修复方案中处理（`console.warn('ScanScreen: n1-server 返回无效数据', ...)`）。不再单独列出。

---

## 补充：移除死 catch

原 vision 路径的外层 try-catch 是死代码（`recognizeProduct` 永不 throw），在新并发方案中已自然移除。

---

## 验收

```bash
cd E:\Code\PStore && npx tsc --noEmit && npx vitest run
```

确保零类型错误 + 全测试通过后提交：

```bash
git add -A && git commit -m "fix(app): ScanScreen AI 审校修复 — 并发/守卫/置信度/日志"
```
