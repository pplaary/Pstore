# PStore P1 AI 嵌入：ScanScreen 拍照模式对接 n1-server

## 你的任务

工作目录：`E:\Code\PStore`。增强 ScanScreen 拍照模式，优先使用 n1-server 的 `/api/ai/parse-image` 端点（返回更丰富的字段：价格、分类、位置等），现有 `recognizeProduct`(vision.ts) 作为降级方案。

## 前置：理解现有结构

拍照模式当前流程：
1. 用户切换到「拍照」Tab → `handleTakePhoto` 触发
2. `cameraRef.takePicture({ base64: true })` 获取 raw base64
3. 调用 `recognizeProduct(base64, aiConfig)` → 返回 `VisionCandidate[]`
4. 候选列表 Bottom Sheet 展示 `{ name, confidence, spec }`
5. 用户加购 → 在 DB 中搜索 name → 匹配到加购物车，未匹配到跳 ProductEdit

## 步骤 1：新增 import

在 `src/screens/ScanScreen.tsx` 顶部新增：

```typescript
import { aiParseImage } from '../services/n1';
import { useSyncConfigStore } from '../store/syncConfig';
```

## 步骤 2：获取 n1-server 配置

在组件内（`ScanScreen` 函数），现有 `aiConfig` / `aiConfigured` 下方新增：

```typescript
const syncConfigServerUrl = useSyncConfigStore((s) => s.serverUrl);
```

## 步骤 3：修改 `handleTakePhoto` — 增加 n1-server 优先路径

修改 `handleTakePhoto` 的 try 块（拍照成功后部分）。当前逻辑：

```typescript
const result = await recognizeProduct(photo.base64, aiConfig);
if (result.candidates.length === 0) {
  Alert.alert('识别结果', '未识别到商品');
} else {
  setCandidates(result.candidates);
  setShowCandidates(true);
}
```

改为（n1-server 优先，失败降级）：

```typescript
let recognized = false;

// 优先尝试 n1-server 的 aiParseImage（返回字段更丰富）
if (syncConfigServerUrl) {
  try {
    const imageDataUrl = `data:image/jpeg;base64,${photo.base64}`;
    const result = await aiParseImage(syncConfigServerUrl, imageDataUrl);
    if (result.data && result.data.name) {
      const data = result.data;
      // 将 AiParseResult 映射为候选列表格式
      const specParts = [
        data.price ? `¥${data.price}` : null,
        data.category || null,
        data.location || null,
      ].filter(Boolean);
      const candidate = {
        name: data.name,
        confidence: 0.95, // n1-server 结果置信度高于通用视觉
        spec: specParts.join(' · '),
      };
      setCandidates([candidate]);
      setShowCandidates(true);
      recognized = true;
    }
  } catch (e) {
    console.warn('ScanScreen: n1-server AI 识别失败，降级到通用视觉', e);
  }
}

// 降级：使用现有 recognizeProduct
if (!recognized && aiConfig && aiConfig.apiUrl) {
  try {
    const result = await recognizeProduct(photo.base64, aiConfig);
    if (result.candidates.length > 0) {
      setCandidates(result.candidates);
      setShowCandidates(true);
      recognized = true;
    }
  } catch (e) {
    console.error('ScanScreen: 通用视觉识别失败', e);
  }
}

if (!recognized) {
  Alert.alert('识别结果', '未识别到商品');
}
```

## 步骤 4：TypeScript 编译检查

```bash
npx tsc --noEmit
```

## 步骤 5：vitest 全量测试

```bash
npx vitest run
```

## 验收标准

- [ ] ScanScreen 拍照模式优先调用 n1-server `/api/ai/parse-image`
- [ ] n1-server 返回的价格/分类/位置展示在候选列表的 spec 行（`¥价格 · 分类 · 位置`）
- [ ] n1-server 未配置或失败时，自动降级到现有 `recognizeProduct`
- [ ] 两方都失败时 Alert "未识别到商品"
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全部通过（除预存 stt.test.ts 问题）
- [ ] 不影响扫码模式（`mode === 'scan'`）任何行为

## 提交

```bash
cd E:\Code\PStore && git add -A && git commit -m "feat(app): ScanScreen 拍照模式优先对接 n1-server AI 识别"
```
