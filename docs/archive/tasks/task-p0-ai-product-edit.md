# PStore P0 AI 嵌入：ProductEdit 表单 AI 智能填写 + AI 识图

## 你的任务

工作目录：`E:\Code\PStore`。在 ProductEditScreen 中嵌入两个 AI 入口，不新增独立按钮/页面。所有 AI 调用复用 n1.ts 的 request 模式。

## 前置：读取以下文件了解现有结构

- `src/screens/ProductEditScreen.tsx` — 目标修改页面（457行）
- `src/services/n1.ts` — API 客户端模板
- `src/theme/ThemeContext.tsx` — 主题系统（获取 colors / scale）
- `src/navigation/types.ts` — 路由参数类型（ProductEditScreenProps）

## 步骤 1：扩展 n1.ts 新增 AI API 函数

在 `src/services/n1.ts` 末尾新增类型定义和函数：

```typescript
// === AI 类型 ===

export interface AiParseResult {
  name: string;
  category?: string;
  location?: string;
  description?: string;
  price?: string;
  acquired_at?: string;
  warranty_to?: string;
  barcode?: string;
  status?: string;
}

export interface AiQueryResult {
  data: {
    answer: string;
    items: Array<{
      id: number;
      name: string;
      category: string;
      location: string;
      description: string;
      price: number | null;
      acquired_at: string;
      warranty_to: string;
      barcode: string;
      status: string;
    }>;
  };
}

// === AI API 调用 ===

const AI_TIMEOUT = 15000;

async function aiRequest<T>(
  serverUrl: string,
  path: string,
  body: object,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT);
  try {
    const res = await fetch(`${serverUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function aiParse(serverUrl: string, text: string): Promise<{ data?: AiParseResult; error?: string }> {
  return aiRequest(serverUrl, '/api/ai/parse', { text });
}

export async function aiParseImage(serverUrl: string, imageDataUrl: string): Promise<{ data?: AiParseResult; error?: string }> {
  return aiRequest(serverUrl, '/api/ai/parse-image', { imageDataUrl });
}
```

## 步骤 2：ProductEditScreen 嵌入点 A — AI 智能填写

在表单顶部（名称输入框上方）新增 AI 智能填写入口。具体改动：

### 2.1 新增 import

```typescript
import { aiParse, aiParseImage, type AiParseResult } from '../services/n1';
import { useSyncConfigStore } from '../store/syncConfig';
```

### 2.2 新增 state

```typescript
const [aiText, setAiText] = useState('');
const [aiVisible, setAiVisible] = useState(false);
const [aiLoading, setAiLoading] = useState(false);
```

### 2.3 AI 智能填写 UI

在 ScrollView 内、名称输入框上方插入：

```tsx
{/* AI 智能填写 */}
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

{aiVisible && (
  <View style={[styles.aiInputContainer, { backgroundColor: colors.bg.card, borderColor: colors.border.light }]}>
    <TextInput
      style={[styles.aiInput, { color: colors.text.primary, backgroundColor: colors.bg.input }]}
      placeholder="描述这个物品，AI 帮你填…（如：白色充电宝20000毫安 89块 放抽屉第二层）"
      placeholderTextColor={colors.text.hint}
      value={aiText}
      onChangeText={setAiText}
      multiline
      numberOfLines={3}
      textAlignVertical="top"
    />
    <TouchableOpacity
      style={[styles.aiSubmit, { backgroundColor: aiLoading || !aiText.trim() ? colors.brand.primaryLight : colors.brand.primary }]}
      onPress={handleAiParse}
      disabled={aiLoading || !aiText.trim()}
      activeOpacity={0.7}
    >
      <Text style={[styles.aiSubmitText, { color: '#fff' }]}>
        {aiLoading ? '解析中…' : 'AI 解析'}
      </Text>
    </TouchableOpacity>
  </View>
)}
```

### 2.4 handleAiParse 函数

```typescript
const handleAiParse = useCallback(async () => {
  const text = aiText.trim();
  if (!text) return;
  
  const serverUrl = useSyncConfigStore.getState().serverUrl;
  if (!serverUrl) {
    Alert.alert('提示', '请先在设置中配置 N1 服务器地址');
    return;
  }

  setAiLoading(true);
  try {
    const result = await aiParse(serverUrl, text);
    if (result.error || !result.data) {
      Alert.alert('AI 解析失败', result.error || '未能识别物品信息，请重试或手动填写');
      return;
    }

    const data = result.data;
    // 确认后再回填
    const preview = [
      data.name && `名称：${data.name}`,
      data.price && `价格：${data.price}`,
      data.category && `分类：${data.category}`,
      data.location && `位置：${data.location}`,
      data.description && `描述：${data.description}`,
    ].filter(Boolean).join('\n');

    Alert.alert(
      'AI 识别结果',
      preview || '未识别到关键信息',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '填入表单',
          onPress: () => applyAiResult(data),
        },
      ],
    );
  } catch (e) {
    Alert.alert('网络错误', 'AI 服务暂不可用，请手动填写');
  } finally {
    setAiLoading(false);
  }
}, [aiText]);
```

### 2.5 applyAiResult 函数

```typescript
const applyAiResult = useCallback((data: AiParseResult) => {
  if (data.name) setName(data.name);
  if (data.price) {
    const num = data.price.replace(/[^0-9.]/g, '');
    if (num) setPrice(num);
  }
  if (data.barcode) setBarcode(data.barcode);
  // spec 用 location + description 合并
  const specParts = [data.location, data.description].filter(Boolean);
  if (specParts.length > 0) setSpec(specParts.join(' - '));
  // category 匹配现有 CATEGORIES
  if (data.category) {
    const matched = CATEGORIES.find(c => c === data.category || c.includes(data.category!) || data.category!.includes(c));
    if (matched) setCategory(matched);
  }
}, []);
```

## 步骤 3：ProductEditScreen 嵌入点 B — AI 识图

在图片选择区域增加 AI 识图按钮。

### 3.1 UI 改动

在现有图片显示区域（`{imageUri && <Image .../>}`）下方增加：

```tsx
{imageUri && (
  <TouchableOpacity
    style={[styles.aiImageBtn, { borderColor: colors.border.medium }]}
    onPress={handleAiImageParse}
    disabled={aiLoading}
    activeOpacity={0.7}
  >
    <Text style={[styles.aiImageBtnText, { color: colors.brand.primary }]}>
      {aiLoading ? 'AI 识别中…' : 'AI 识别此图片'}
    </Text>
  </TouchableOpacity>
)}
```

### 3.2 handleAiImageParse 函数

```typescript
const handleAiImageParse = useCallback(async () => {
  if (!imageUri) return;
  
  const serverUrl = useSyncConfigStore.getState().serverUrl;
  if (!serverUrl) {
    Alert.alert('提示', '请先在设置中配置 N1 服务器地址');
    return;
  }

  setAiLoading(true);
  try {
    // 读取图片文件为 base64
    const response = await fetch(imageUri);
    const blob = await response.blob();
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    
    // 构造 Data URL
    const ext = imageUri.split('.').pop()?.toLowerCase() || 'jpeg';
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    const imageDataUrl = `data:${mimeType};base64,${base64}`;

    const result = await aiParseImage(serverUrl, imageDataUrl);
    if (result.error || !result.data) {
      Alert.alert('AI 识别失败', result.error || '未能识别图片中的物品');
      return;
    }

    const data = result.data;
    const preview = [
      data.name && `名称：${data.name}`,
      data.price && `价格：${data.price}`,
      data.category && `分类：${data.category}`,
    ].filter(Boolean).join('\n');

    Alert.alert(
      'AI 识图结果',
      preview || '未识别到关键信息',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '填入表单',
          onPress: () => applyAiResult(data),
        },
      ],
    );
  } catch (e) {
    Alert.alert('网络错误', 'AI 服务暂不可用，请手动填写');
  } finally {
    setAiLoading(false);
  }
}, [imageUri]);
```

### 3.3 注意：base64 在 React Native 中的处理

如果 `FileReader` 不可用（React Native 环境），使用 `expo-file-system` 或 `fetch` + `buffer` 替代方案。优先使用 `expo-file-system`：

```typescript
import * as FileSystem from 'expo-file-system';

// 在 handleAiImageParse 中：
const base64 = await FileSystem.readAsStringAsync(imageUri, {
  encoding: FileSystem.EncodingType.Base64,
});
```

选择 `expo-file-system` 方式（更可靠，项目已安装 expo 依赖）。

## 步骤 4：新增样式

在 `createStyles` 函数末尾新增：

```typescript
aiToggle: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingVertical: 10 * scale.y,
  paddingHorizontal: 14 * scale.x,
  borderRadius: 8,
  borderWidth: 1,
  marginBottom: 16 * scale.y,
},
aiToggleText: {
  fontSize: 14 * scale.x,
  flex: 1,
},
aiToggleArrow: {
  fontSize: 12 * scale.x,
},
aiInputContainer: {
  borderWidth: 1,
  borderRadius: 8,
  padding: 12 * scale.x,
  marginBottom: 16 * scale.y,
},
aiInput: {
  borderRadius: 6,
  padding: 10 * scale.y,
  fontSize: 14 * scale.x,
  minHeight: 80 * scale.y,
  marginBottom: 10 * scale.y,
},
aiSubmit: {
  borderRadius: 6,
  paddingVertical: 10 * scale.y,
  paddingHorizontal: 20 * scale.x,
  alignItems: 'center',
  alignSelf: 'flex-end',
},
aiSubmitText: {
  fontSize: 14 * scale.x,
  fontWeight: '600',
},
aiImageBtn: {
  borderWidth: 1,
  borderRadius: 6,
  paddingVertical: 8 * scale.y,
  paddingHorizontal: 14 * scale.x,
  alignSelf: 'flex-start',
  marginTop: 8 * scale.y,
},
aiImageBtnText: {
  fontSize: 13 * scale.x,
  fontWeight: '500',
},
```

## 步骤 5：TypeScript 编译检查

完成后运行：
```bash
npx tsc --noEmit
```

如有类型错误必须修复。

## 步骤 6：vitest 全量测试

```bash
npx vitest run
```

确保所有已有测试通过。

## 验收标准

- [ ] n1.ts 新增 `aiParse` / `aiParseImage` 函数，15 秒超时
- [ ] ProductEditScreen 表单顶部有 "试试用 AI 快速录入" 折叠区
- [ ] 折叠区展开后有多行输入框 + "AI 解析" 按钮
- [ ] 输入文本点解析 → 调 `/api/ai/parse` → 结果预览弹窗 → 确认后回填表单
- [ ] 图片区域有 "AI 识别此图片" 按钮（仅当 imageUri 非空时显示）
- [ ] 点击识图 → base64 编码 → 调 `/api/ai/parse-image` → 结果预览 → 确认后回填
- [ ] AI 解析 loading 时按钮置灰
- [ ] 失败不阻塞，弹出提示后可继续手动填写
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 全部通过
- [ ] 不新增独立按钮/页面，所有改动在 ProductEditScreen 和 n1.ts 内

## 提交

完成后执行：
```bash
cd E:\Code\PStore && git add -A && git commit -m "feat(app): ProductEdit 表单嵌入 AI 文本解析与识图"
```
