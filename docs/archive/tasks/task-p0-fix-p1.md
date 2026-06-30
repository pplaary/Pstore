# PStore P0 AI 嵌入 — 审校修复指令（P1 级）

工作目录：`E:\Code\PStore`

参照审校报告，修复以下 7 项 P1 缺陷：

---

## P1-1：handleAiParse 缺少 applyAiResult 依赖

**文件**: `src/screens/ProductEditScreen.tsx`
**位置**: `handleAiParse` 的 `useCallback` deps 数组

**当前**:
```tsx
  }, [aiText]);
```

**改为**:
```tsx
  }, [aiText, applyAiResult]);
```

---

## P1-2：aiLoading 共享旗标竞态

**文件**: `src/screens/ProductEditScreen.tsx`
**改动**: 拆分 `aiLoading` 为两个独立状态

**删除**:
```tsx
const [aiLoading, setAiLoading] = useState(false);
```

**新增**:
```tsx
const [aiTextLoading, setAiTextLoading] = useState(false);
const [aiImageLoading, setAiImageLoading] = useState(false);
```

然后全局替换：
- `handleAiParse` 内所有 `setAiLoading` → `setAiTextLoading`
- `handleAiParse` 内所有 `aiLoading` → `aiTextLoading`
- `handleAiImageParse` 内所有 `setAiLoading` → `setAiImageLoading`
- `handleAiImageParse` 内所有 `aiLoading` → `aiImageLoading`
- AI 文本提交按钮的 `disabled={aiLoading || ...}` → `disabled={aiTextLoading || ...}`
- AI 文本提交按钮文本的 `aiLoading ? '解析中…'` → `aiTextLoading ? '解析中…'`
- AI 图片按钮的 `disabled={aiLoading}` → `disabled={aiImageLoading}`
- AI 图片按钮文本的 `aiLoading ? 'AI 识别中…'` → `aiImageLoading ? 'AI 识别中…'`
- 编辑模式 useEffect 中的 `setAiLoading(false)` → 同时重置两个：`setAiTextLoading(false); setAiImageLoading(false);`

---

## P1-3：aiText / aiVisible 切换商品时未重置

**文件**: `src/screens/ProductEditScreen.tsx`
**位置**: 编辑模式 useEffect（大约在表单字段重置的 setState 块中）

在该 useEffect 的 state 重置块末尾追加：

```tsx
setAiText('');
setAiVisible(false);
setAiTextLoading(false);
setAiImageLoading(false);
```

---

## P1-4：AiQueryResult 死代码

**文件**: `src/services/n1.ts`
**位置**: `AiQueryResult` 接口定义处

在 `export interface AiQueryResult` 上方加一行注释：

```tsx
// 预留：Phase N AI 自然语言查询功能
```

不删除该类型（未来 NL 搜索会用到）。

---

## P1-5：aiRequest 与 request 代码重复

**文件**: `src/services/n1.ts`

**改动**: 让 `request` 接受可选 timeout 参数，删除 `aiRequest`

**修改 `request` 函数签名**:
```typescript
async function request<T>(
  serverUrl: string,
  path: string,
  body: object,
  timeoutMs: number = DEFAULT_TIMEOUT,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // ... 其余不变
}
```

**删除整个 `aiRequest` 函数**（约20行）。

**修改 `aiParse` 和 `aiParseImage`**，将 `aiRequest(...)` 改为 `request(...)`，传入 `AI_TIMEOUT`:
```typescript
export async function aiParse(serverUrl: string, text: string): Promise<{ data?: AiParseResult; error?: string }> {
  return request(serverUrl, '/api/ai/parse', { text }, AI_TIMEOUT);
}

export async function aiParseImage(serverUrl: string, imageDataUrl: string): Promise<{ data?: AiParseResult; error?: string }> {
  return request(serverUrl, '/api/ai/parse-image', { imageDataUrl }, AI_TIMEOUT);
}
```

---

## P1-6：错误处理静默丢弃异常详情

**文件**: `src/screens/ProductEditScreen.tsx`

在两处 AI catch 块中添加 `console.error`：

**handleAiParse 的 catch**:
```tsx
  } catch (e) {
    console.error('ProductEditScreen: AI 文本解析失败', e);
    Alert.alert('网络错误', 'AI 服务暂不可用，请手动填写');
  }
```

**handleAiImageParse 的 catch**:
```tsx
  } catch (e) {
    console.error('ProductEditScreen: AI 图片识别失败', e);
    Alert.alert('网络错误', 'AI 服务暂不可用，请手动填写');
  }
```

---

## P1-7：serverUrl 为 null 时 UI 无感知

**文件**: `src/screens/ProductEditScreen.tsx`

在组件开头 `useSyncConfigStore` 之后获取 `serverUrl`:

```tsx
const serverUrl = useSyncConfigStore((s) => s.serverUrl);
const aiDisabled = !serverUrl;
```

AI 展开按钮在 `serverUrl` 为空时显示禁用状态：

```tsx
{aiDisabled ? (
  <View style={[styles.aiToggle, { borderColor: colors.border.medium }]}>
    <Text style={[styles.aiToggleText, { color: colors.text.hint }]}>
      请先在设置中配置 N1 服务器地址
    </Text>
  </View>
) : (
  <TouchableOpacity
    style={[styles.aiToggle, { borderColor: colors.border.medium }]}
    onPress={() => setAiVisible(!aiVisible)}
    activeOpacity={0.7}
  >
    <Text style={[styles.aiToggleText, { color: colors.text.primary }]}>
      试试用 AI 快速录入
    </Text>
    <Text style={[styles.aiToggleArrow, { color: colors.text.hint }]}>
      {aiVisible ? '收起 ▲' : '展开 ▼'}
    </Text>
  </TouchableOpacity>
)}
```

并简化 `handleAiParse` 和 `handleAiImageParse` 中的 serverUrl 检查，改为 `useSyncConfigStore.getState().serverUrl`（因为 UI 已阻止无配置时的操作，但保留防御性检查）：

```tsx
const url = useSyncConfigStore.getState().serverUrl;
if (!url) return; // 防御性检查
```

---

## 验收

完成后执行：
```bash
cd E:\Code\PStore && npx tsc --noEmit && npx vitest run
```

确认零类型错误 + 全测试通过后提交：
```bash
git add -A && git commit -m "fix(app): P0 AI 集成审校修复 — 竞态拆分/状态重置/代码去重/异常日志"
```
