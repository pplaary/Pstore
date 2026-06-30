---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 6ae0fa66bbfac089a0a0be292e878a1b_6966e07f709f11f1b2f55254006c9bbf
    ReservedCode1: aUEUK0AvL6nUG3gujj1DnAmH5NeJgQLE9ALErPaBGtizxalXRRVuLaq2MUywyslAsL7lt/cuyZez7uqQYrLAuoLn1M0jUves0u7u1e7WDQFm8DOAqfoPQwWMBAsm+GzWDRZJuYseRPabNmmO6wXW4b2uVTVVeF9hraQ4ZGM8PW+FepPthPWUF6Iro5Q=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 6ae0fa66bbfac089a0a0be292e878a1b_6966e07f709f11f1b2f55254006c9bbf
    ReservedCode2: aUEUK0AvL6nUG3gujj1DnAmH5NeJgQLE9ALErPaBGtizxalXRRVuLaq2MUywyslAsL7lt/cuyZez7uqQYrLAuoLn1M0jUves0u7u1e7WDQFm8DOAqfoPQwWMBAsm+GzWDRZJuYseRPabNmmO6wXW4b2uVTVVeF9hraQ4ZGM8PW+FepPthPWUF6Iro5Q=
---

# PStore App — AI 嵌入点分析文档

> **版本**: v1.0  
> **日期**: 2026-06-25  
> **背景**: n1-server 已集成 open-medkit AI 核心，提供 `/api/ai/parse`、`/api/ai/parse-image`、`/api/ai/query` 等端点。本报告分析 App 端如何在**不新增独立按钮/页面**的前提下，将 AI 能力自然嵌入现有页面流程。

---

## 目录

1. [API 通信层现状](#1-api-通信层现状)
2. [页面分析](#2-页面分析)
   - [2.1 ProductEditScreen — 商品录入/编辑](#21-producteditscreen--商品录入编辑)
   - [2.2 ScanScreen — 扫码页面](#22-scanscreen--扫码页面)
   - [2.3 HomeScreen — 首页](#23-homescreen--首页)
   - [2.4 ProductListScreen — 商品列表/搜索](#24-productlistscreen--商品列表搜索)
3. [嵌入点总览](#3-嵌入点总览)
4. [优先级排序与预估工作量](#4-优先级排序与预估工作量)
5. [通用技术方案](#5-通用技术方案)

---

## 1. API 通信层现状

**文件**: `src/services/n1.ts`

### 当前通信模式

| 维度 | 现状 |
|---|---|
| 协议 | HTTP POST，JSON body |
| 超时 | 5 秒 (`AbortController`) |
| Server URL | 由 `sync.ts` 传入，来自 `SyncConfigStore` |
| 端点 | `/api/config/get`、`/api/config/set`、`/api/products/sync`、`/api/products/push` |

### AI API 端点（n1-server 已就绪）

| 端点 | 方法 | 用途 | 请求体 |
|---|---|---|---|
| `/api/ai/parse` | POST | 文本解析为物品 JSON | `{ text: string }` |
| `/api/ai/parse-image` | POST | 图片解析为物品 JSON | `{ imageDataUrl: string }` |
| `/api/ai/parse-batch` | POST | 批量文本解析 | `{ texts: string[] }` |
| `/api/ai/query` | POST | 自然语言查询 | `{ question: string }` |
| `/api/ai/query-stream` | POST | 流式 NL 查询 (SSE) | `{ question: string }` |
| `/api/ai/test` | POST | 测试 AI 连接 | `{}` |
| `/api/ai/config-status` | GET | 获取 AI 配置状态 | — |

### 建议

在 `src/services/n1.ts` 中新增 AI API 调用函数，复用现有 `request<T>()` 模式：

```typescript
// 新增函数示意
export async function aiParse(serverUrl: string, text: string): Promise<ParseResult>
export async function aiParseImage(serverUrl: string, imageDataUrl: string): Promise<ParseResult>
export async function aiQuery(serverUrl: string, question: string): Promise<QueryResult>
```

---

## 2. 页面分析

### 2.1 ProductEditScreen — 商品录入/编辑

**文件**: `src/screens/ProductEditScreen.tsx` (457 行)  
**导航**: `RootStack > ProductEdit`，由首页 FAB、长按菜单、扫码无匹配等入口推入。

#### 2.1.1 现状

| 元素 | 说明 |
|---|---|
| **表单字段** | 商品名称(必填)、别名、价格(必填)、规格、图片、条码、分类(Chip 选择)、状态(三态切换) |
| **操作入口** | 图片点击→系统相册选择器；保存按钮→本地 SQLite 写入 |
| **预填机制** | 从 `route.params` 接收 `barcode`/`name`/`spec`，用于扫码跳转回填 |
| **编辑模式** | 通过 `route.params.id` 识别，从 DB 加载已有数据回填 |

#### 2.1.2 AI 嵌入点

##### 嵌入点 A：表单顶部 "AI 智能填写" 入口

- **位置**: 商品名称输入框上方或右侧，一个轻量按钮（如 `✨ 智能填写`）
- **触发**: 点击后弹出一个小输入区，用户粘贴或输入一段自然语言描述（如"去年双十一在京东买的罗技 MX Master 3S 鼠标，花了 499，放在书房抽屉里"）
- **调用**: `POST /api/ai/parse`，传入文本
- **数据流**:

```
用户输入描述文本
  → aiParse(serverUrl, text)
  → n1-server /api/ai/parse → AI 提取结构化字段
  → 返回 { name, category, location, price, acquired_at, description, ... }
  → 自动回填表单：name、price、category、spec(→location)
  → 用户确认/修正 → 保存
```

- **UI 交互**:
  1. 点击 `✨ 智能填写` → 弹出半屏 Modal / Bottom Sheet
  2. 内含 TextInput（多行，placeholder: "描述这个物品，AI 帮你填…"）+ 提交按钮
  3. AI 返回后，展示解析结果预览卡片（列出识别到的字段），用户确认后自动填入表单
  4. 如果 AI 未识别某字段，该字段留空，不影响用户手动填

- **参数适配**: 将 `ProductEditScreen` 的字段映射到 items 表字段：
  | 表单字段 | AI 返回字段 | 映射逻辑 |
  |---|---|---|
  | `name` | `name` | 直接填入 |
  | `price` | `price` | 提取数字部分填入 |
  | `spec` | `location` + `description` | 合并为规格描述（如"书房抽屉 - 办公鼠标"） |
  | `category` | `category` | 匹配现有 CATEGORIES 列表，无匹配则归入"其他" |
  | `barcode` | `barcode` | 直接填入 |
  | `aliases` | — | AI 不返回，用户手动填 |

##### 嵌入点 B：图片区域 "AI 识图" 触发

- **位置**: 图片选择区域右侧或图片预览下方，增加 `🔍 AI 识别` 文字按钮
- **前置条件**: 用户已选择一张图片（`imageUri` 非空）
- **触发**: 点击后将图片转为 base64 Data URL
- **调用**: `POST /api/ai/parse-image`，传入 `{ imageDataUrl }`
- **数据流**:

```
用户选图 → 点击 AI 识别
  → ImagePicker 获取 base64 → 构造 Data URL
  → aiParseImage(serverUrl, imageDataUrl)
  → n1-server /api/ai/parse-image → AI 视觉识别
  → 返回物品结构化字段
  → 同嵌入点 A，自动回填表单
```

- **UI 交互**:
  1. `imageUri` 非空时，图片预览下方出现 `🔍 AI 识别此图片` 按钮
  2. 点击后显示 Loading 状态（按钮变灰 + 菊花）
  3. 识别成功 → 同嵌入点 A 的回填流程
  4. 识别失败 → Toast 提示 "AI 识别失败，请手动填写"

#### 2.1.3 为什么自然融入

- 录入是 App 最高频的痛点场景，手动填 7+ 个字段效率低
- "智能填写" 按钮紧贴表单顶部，不干扰原有手动填写流程
- AI 只是"预填辅助"，用户最终确认后才保存，数据安全可控
- 不需要新增独立页面或底部 Tab，完全在现有 ProductEdit 内闭环

---

### 2.2 ScanScreen — 扫码页面

**文件**: `src/screens/ScanScreen.tsx` (572 行)  
**导航**: `RootStack > ScanBarcode`，由首页扫码 FAB、聊天模式相机按钮、ProductList 底部扫码按钮推入。

#### 2.2.1 现状

| 元素 | 说明 |
|---|---|
| **双模式** | Tab 切换：「扫码」（条码扫描）/「拍照」（AI 识别），拍照模式需 `aiConfigured` 才显示 |
| **扫码流程** | 条码扫描 → `findByBarcode` 查 DB → 匹配到则显示商品卡（加购/忽略）→ 未匹配则跳转 `ProductEdit`（管理模式）或记录为 pending |
| **手动输入** | 底部输入栏 + 确认按钮，兜底手动条码输入 |
| **拍照识别** | `cameraRef.takePicture({ base64: true })` → `recognizeProduct(base64, aiConfig)` → 候选列表 Bottom Sheet → 加购/跳转录入 |
| **AI 配置来源** | `useAIConfigStore`，独立于 n1-server 的 AI 配置（使用 `aiConfig.apiUrl` 等） |

#### 2.2.2 AI 嵌入点

##### 嵌入点 C：扫码无匹配 → "AI 解析条码" 选项

- **位置**: 扫码未匹配到商品时（`handleBarcodeScanned` 中 `results.length === 0` 的分支）
- **当前行为**: 管理模式→跳 ProductEdit；非管理模式→记录 pending
- **增强方案**: 在 Alert 或结果区增加第三个选项 "AI 识别"，将条码号作为文本传给 AI 尝试解析
- **调用**: `POST /api/ai/parse`，传入 `{ text: "条码 " + scannedBarcode }`
- **数据流**:

```
条码扫描 → DB 无匹配
  → 弹出选项：「手动录入」「AI 识别」「仅记录」
  → 用户点 AI 识别 → aiParse(serverUrl, "条码 6901234567890")
  → n1-server /api/ai/parse → AI 可能返回条码关联的商品名/品牌
  → 填入 ProductEdit 并跳转（name 预填 + barcode 预填）
```

- **UI 交互**:
  1. 扫码无匹配时，结果卡片显示"未找到商品"，下方三个按钮：「手动录入」「AI 识别」「仅记录」
  2. AI 识别按钮点击 → Loading → 成功后跳转 ProductEdit 并预填解析结果

##### 嵌入点 D：拍照模式对接 n1-server

- **现状**: 拍照模式已存在，但调用的是 `recognizeProduct()`（`src/services/vision.ts`），使用的是独立 AI 配置
- **改造方案**: 
  - **方案 1（推荐）**: 新增一个调用路径，拍照后同时或优先走 `POST /api/ai/parse-image`，返回结果比 `recognizeProduct` 更丰富（含价格、分类等）
  - **方案 2**: 渐进替换，先让 n1-server 端点和现有 `recognizeProduct` 共存，后续逐步迁移
- **数据流**:

```
拍照模式 → 拍照获取 base64
  → aiParseImage(serverUrl, imageDataUrl)
  → n1-server /api/ai/parse-image → 返回物品结构化数据
  → 候选列表展示（名称 + 分类 + 价格区间）
  → 用户选择 → 加购 / 跳 ProductEdit
```

- **优势**: 现有 `recognizeProduct` 仅返回 `{ name, confidence, spec }`，n1-server 端点返回完整物品字段（价格、分类、位置等），信息量大幅提升。

#### 2.2.3 为什么自然融入

- 扫码页是"识别"的核心场景，"AI 识别"是扫码无结果时的自然延伸
- 拍照模式已存在，只是增强后端能力，不改变前端交互结构
- 用户对"扫码→识别→入库"的心智模型已经建立，AI 嵌入只是让识别更准、信息更全

---

### 2.3 HomeScreen — 首页

**文件**: `src/screens/HomeScreen.tsx` (1254 行)  
**导航**: `MainDrawer > Home`，App 启动默认页面。

#### 2.3.1 现状

| 元素 | 说明 |
|---|---|
| **双模式** | `aiMode === 'chat'` 决定显示聊天模式或搜索模式。由 `useAIConfigStore` 控制 |
| **搜索模式** | 搜索栏（名称/拼音/条码）→ FTS5 搜索 → FlatList 商品列表；散装标签快捷行；管理模式 FAB(+)、扫码 FAB、批量管理工具栏 |
| **聊天模式** | 完整的 AI Chat 界面：消息气泡、语音输入、RAG 上下文、对话历史管理、草稿卡(ProductConfirmCard)、降级 FTS5 搜索、购物车折叠栏 |
| **AI 调用链** | `callAI()` → `parseAIResponse()` → `renderAiResponse()`，使用独立的 AI 配置（`SecureStore` 中的 `pstore_ai_config`） |
| **AI 配置** | `apiUrl` + `apiKey` + `textModel`，存储在 `SecureStore`，与 n1-server 的 AI 配置完全独立 |

#### 2.3.2 AI 嵌入点

##### 嵌入点 E：搜索栏支持自然语言（搜索模式）

- **位置**: 现有搜索栏 `TextInput`
- **现状**: 仅支持关键词搜索（名称、拼音、条码），走本地 FTS5
- **增强方案**: 在搜索栏右侧增加一个 `NL` 切换按钮，开启后输入的自然语言走 `/api/ai/query`
- **调用**: `POST /api/ai/query`，传入 `{ question: userInput }`
- **数据流**:

```
用户输入 "有哪些快过期的物品" 或 "书房里放了什么"
  → NL 模式开启 → aiQuery(serverUrl, question)
  → n1-server /api/ai/query → AI 分析并查询 items 表
  → 返回 { answer, items: [...] }
  → 在搜索结果区展示 AI 回答 + 关联商品列表
```

- **UI 交互**:
  1. 搜索栏右侧增加小标签 `NL`（默认关闭，走关键词搜索）
  2. 开启后 placeholder 变为 "描述你想找的物品…"
  3. 结果区上方展示 AI 回答气泡，下方展示匹配商品列表
  4. 失败降级 → 自动回退到关键词搜索

##### 嵌入点 F（暂不推荐）：聊天模式对接 n1-server

- 聊天模式已经成熟且使用独立的 AI 服务，强行替换成本高、收益低
- **建议搁置**，等 n1-server 的 `/api/ai/query-stream`（SSE 流式）稳定后再评估迁移

#### 2.3.3 为什么自然融入

- 搜索栏是首页最高频的交互入口，"NL 切换" 是轻量增强，不影响现有关键词搜索用户
- 聊天模式已非常完善且自成体系，不宜强行替换；搜索模式的 NL 增强是增量而非替代

---

### 2.4 ProductListScreen — 商品列表/搜索

**文件**: `src/screens/ProductListScreen.tsx` (482 行)  
**导航**: `MainDrawer > ProductList`，侧边栏菜单入口。

#### 2.4.1 现状

| 元素 | 说明 |
|---|---|
| **搜索栏** | TextInput，搜索商品名称、拼音或条码 |
| **分类筛选** | 水平滚动 Chip 列表，单选/取消 |
| **列表** | FlatList，每行显示名称+拼音+规格+价格+状态徽标，点击进入 ProductDetail |
| **底部** | 固定扫码按钮「扫码识别」→ 跳转 ScanBarcode |
| **管理模式** | 右上角 "+" 按钮、右下 FAB "+" |

#### 2.4.2 AI 嵌入点

##### 嵌入点 G：搜索栏支持自然语言查询

- **位置**: 同 HomeScreen 搜索栏
- **增强方案**: 搜索栏右侧增加 `NL` 切换，与 HomeScreen 的嵌入点 E 共用同一套 UI 组件和逻辑
- **调用**: `POST /api/ai/query`
- **数据流**: 同嵌入点 E

##### 嵌入点 H：空结果页 "AI 帮你找" 引导

- **位置**: 当前空结果页（`isEmpty === true`）
- **现状**: 显示"未找到商品" + "没有与「xxx」匹配的商品"
- **增强方案**: 空结果页增加一个按钮 "试试 AI 搜索"，点击后将当前搜索词作为 NL 查询发送
- **调用**: `POST /api/ai/query`
- **数据流**:

```
用户搜索 → FTS5 返回 0 条
  → 空结果页："未找到商品，试试 AI 搜索？"
  → 用户点击 → aiQuery(serverUrl, originalQuery)
  → n1-server /api/ai/query → AI 理解意图并查询
  → 返回结果列表
```

#### 2.4.3 为什么不新增独立 AI 页面

- ProductListScreen 的定位是"浏览 + 搜索"，AI 应该增强搜索而非替代搜索
- 空结果引导是最低摩擦的 AI 入口：用户已经有搜索意图，AI 只是换一种方式理解这个意图

---

## 3. 嵌入点总览

| 编号 | 页面 | 嵌入点 | 嵌入方式 | API 端点 | 类型 |
|---|---|---|---|---|---|
| **A** | ProductEdit | AI 智能填写 | 表单顶部按钮 → 文本输入 → AI 解析 → 回填 | `POST /api/ai/parse` | 新功能 |
| **B** | ProductEdit | AI 识图 | 图片旁按钮 → base64 → AI 解析 → 回填 | `POST /api/ai/parse-image` | 新功能 |
| **C** | ScanScreen | 扫码无匹配 AI 识别 | 结果区增加"AI 识别"按钮 | `POST /api/ai/parse` | 增强 |
| **D** | ScanScreen | 拍照模式增强 | 对接 n1-server 端点，替换/补充现有 vision.ts | `POST /api/ai/parse-image` | 重构 |
| **E** | HomeScreen | NL 搜索 | 搜索栏右侧 NL 切换按钮 | `POST /api/ai/query` | 新功能 |
| **F** | HomeScreen | 聊天模式迁移 | 暂不推荐 | — | 搁置 |
| **G** | ProductList | NL 搜索 | 同 E，共用组件 | `POST /api/ai/query` | 新功能 |
| **H** | ProductList | 空结果 AI 引导 | 空结果页增加"试试 AI 搜索" | `POST /api/ai/query` | 新功能 |

---

## 4. 优先级排序与预估工作量

### 排序原则

1. **用户价值密度**: 优先做高频场景、减少用户操作步骤的嵌入点
2. **实现复杂度**: 优先做改动小、风险低、可独立交付的嵌入点
3. **依赖关系**: 先做 API 客户端封装，再做页面嵌入

### 排序结果

| 优先级 | 编号 | 说明 | 工作量 | 理由 |
|---|---|---|---|---|
| **P0** | A + B | ProductEdit AI 智能填写 + AI 识图 | 3 人天 | 录入是最大痛点，AI 可减少 70% 手动输入；两个嵌入点在同一页面，可一起做 |
| **P1** | D | ScanScreen 拍照模式增强 | 1.5 人天 | 拍照模式已存在，改造成本低；返回字段更丰富，用户体验提升明显 |
| **P2** | C | ScanScreen 扫码无匹配 AI 识别 | 1 人天 | 扫码无匹配是高频场景，AI 识别可减少用户流失 |
| **P3** | E + G + H | 全局 NL 搜索（Home + ProductList） | 2.5 人天 | 覆盖面广但非刚需，用户对关键词搜索已有习惯；H 可作为 E/G 的子功能附带实现 |
| **P4** | F | 聊天模式迁移 | — | 暂不推荐，已有成熟方案 |

### 基础设施（前置工作）

| 任务 | 工作量 | 说明 |
|---|---|---|
| `n1.ts` 新增 AI 客户端函数 | 0.5 人天 | 封装 `aiParse` / `aiParseImage` / `aiQuery`，复用 `request<T>()` |
| 字段映射工具函数 | 0.5 人天 | `mapAiResultToProductForm()` 将 items 字段映射到 products 表单 |
| **合计** | **1 人天** | 建议在 P0 开始前完成 |

### 总预估

| 阶段 | 内容 | 工作量 |
|---|---|---|
| 前置 | API 客户端 + 字段映射 | 1 人天 |
| P0 | ProductEdit AI 解析 | 3 人天 |
| P1 | ScanScreen 拍照增强 | 1.5 人天 |
| P2 | ScanScreen 无匹配 AI | 1 人天 |
| P3 | 全局 NL 搜索 | 2.5 人天 |
| **总计** | | **9 人天** |

---

## 5. 通用技术方案

### 5.1 API 客户端扩展（`src/services/n1.ts`）

复用现有 `request<T>()` 模式，新增三个 AI 调用函数：

```typescript
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
  answer: string;
  items: Array<{
    id: number;
    name: string;
    category: string;
    location: string;
    price: number | null;
    // ...
  }>;
}

export async function aiParse(
  serverUrl: string,
  text: string,
): Promise<AiParseResult> {
  return request(serverUrl, '/api/ai/parse', { text });
}

export async function aiParseImage(
  serverUrl: string,
  imageDataUrl: string,
): Promise<AiParseResult> {
  return request(serverUrl, '/api/ai/parse-image', { imageDataUrl });
}

export async function aiQuery(
  serverUrl: string,
  question: string,
): Promise<AiQueryResult> {
  return request(serverUrl, '/api/ai/query', { question });
}
```

### 5.2 Server URL 获取

当前 App 中 serverUrl 来自 `SyncConfigStore`（`useSyncConfigStore`）。所有 AI 调用应统一从这个 Store 获取 serverUrl，确保与同步功能使用同一服务器。

```typescript
import { useSyncConfigStore } from '../store/syncConfig';

// 在组件或 service 中
const serverUrl = useSyncConfigStore.getState().serverUrl;
```

### 5.3 字段映射（`src/services/ai-field-mapper.ts`）

n1-server AI 端点返回 items 表字段，需要映射到 App 现有的 Product 表单字段：

```typescript
export function mapAiParseToForm(result: AiParseResult): Partial<ProductFormData> {
  return {
    name: result.name || '',
    price: extractNumber(result.price) ?? 0,
    spec: [result.location, result.description].filter(Boolean).join(' - '),
    category: matchCategory(result.category),
    barcode: result.barcode || '',
  };
}
```

### 5.4 错误处理与降级

所有 AI 调用统一遵循：
1. **超时**: 使用 `AbortController`，AI 端点建议超时 15 秒（比普通 API 的 5 秒长）
2. **网络错误**: Toast 提示 "AI 服务暂不可用，请手动操作"
3. **解析失败**: AI 返回但字段为空 → 部分回填可用字段，其余留空
4. **降级策略**: 不阻塞用户操作，AI 仅作为辅助，失败不中断主流程

### 5.5 用户隐私与数据安全

- AI 调用仅发送用户输入的文本或图片 base64，不附加任何设备信息或用户身份
- 图片解析时，base64 仅在内存中构造，不写入磁盘
- serverUrl 指向用户自己的 n1-server 实例，数据不出用户掌控范围

---

## 附录：现有 AI 能力对照

| 能力 | n1-server 端点 | App 现有实现 | 差异 |
|---|---|---|---|
| 文本解析 | `POST /api/ai/parse` | 无 | 新增 |
| 图片解析 | `POST /api/ai/parse-image` | `recognizeProduct()` (vision.ts) | n1-server 返回字段更全（价格、分类等） |
| NL 查询 | `POST /api/ai/query` | 聊天模式 `callAI()` | 聊天模式功能更丰富（RAG、对话历史）、但 n1-server 直接查 DB 更精准 |
| NL 流式查询 | `POST /api/ai/query-stream` | 无 | 新增，可支撑未来实时 AI 回复 |
*（内容由AI生成，仅供参考）*
