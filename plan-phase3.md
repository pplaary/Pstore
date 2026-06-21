# Phase 3 开发计划：拍照识别 + PendingItem + 重复检测合并

> 基于 spec-v4.5 §5.3 / §5.7 / §8.1 / §8.2 / §12.4
> 基准 commit: Phase 2 完成（购物车+管理模式+主界面重构）
> 工作流: 按 commit 顺序执行 → 每个 commit 完成后 `git commit` → 进入下一个

---

## 提交信息格式

```
phase3-<n>: <简短描述>
```

---

## 文件清单

| Commit | 新建 | 修改 |
|--------|------|------|
| C1 DB层 | `src/db/pending.ts`, `src/db/duplicate.ts`, `src/utils/levenshtein.ts`, `src/db/migrations/v2.ts`, `src/db/__tests__/pending.test.ts`, `src/db/__tests__/duplicate.test.ts` | `src/db/types.ts`, `src/db/init.ts` |
| C2 扫码+拍照 | `src/services/vision.ts`, `src/store/aiConfig.ts` | `src/screens/ScanScreen.tsx`, `src/navigation/types.ts`, `src/navigation/RootNavigator.tsx`, `src/screens/HomeScreen.tsx` |
| C3 管理模式 | `src/screens/PendingItemsScreen.tsx`, `src/screens/DuplicateScreen.tsx` | `src/components/DrawerContent.tsx`, `src/navigation/types.ts`, `src/navigation/RootNavigator.tsx`, `src/db/product.ts` |
| C4 集成测试 | `src/db/__tests__/pending.test.ts`(补充), `src/__tests__/scan-pending.test.ts`, `src/__tests__/duplicate-merge.test.ts` | — |

---

## 实现要点

### 通用约束（所有 commit 遵守）

1. spec-v4.5 是唯一权威，凡是 spec 写了具体算法/参数/示例的，代码必须逐字对齐
2. 所有 SQL 参数化，禁止字符串拼接
3. 所有 SELECT 查询商品表必须 `AND isDeleted = 0`
4. product 与 product_fts 写入必须在同一 SQLite 事务内
5. 错误处理遵循 §14.2：DB 操作失败 Toast 提示；网络请求失败静默降级
6. UUID 使用 `crypto.randomUUID()`，禁止自增/时间戳拼接

---

## Commit 1: DB层 — PendingItem CRUD + 重复检测引擎

### 1.1 `src/utils/levenshtein.ts` (新建)

实现 Levenshtein 距离计算，归一化至 0~1。

**确定性规格**：
- 比较前：strip 两侧空格 + 转全小写 + 移除括号内容（`removeBrackets(s)` 用正则 `/\([^)]*\)/g` 去掉）
- 距离公式：`distance / max(len(a), len(b))`
- 导出 `normalizedSimilarity(a: string, b: string): number`，返回值 ∈ [0, 1]
- 空字符串对空字符串 → 1.0

```typescript
function removeBrackets(s: string): string {
  return s.replace(/\([^)]*\)/g, '');
}

export function normalizedSimilarity(a: string, b: string): number {
  const sa = removeBrackets(a.trim().toLowerCase());
  const sb = removeBrackets(b.trim().toLowerCase());
  if (sa.length === 0 && sb.length === 0) return 1;
  // Levenshtein 动态规划实现
  // ...
  return 1 - distance / Math.max(sa.length, sb.length);
}
```

### 1.2 `src/db/types.ts` (修改)

新增类型：

```typescript
/** 重复检测候选 */
export interface MergeCandidate {
  productA: Product;
  productB: Product;
  reason: 'barcode' | 'name_similarity';
  similarity?: number;  // 仅 name_similarity 时有值
}

/** 合并结果 */
export interface MergeResult {
  keptId: string;       // 保留的商品 ID
  mergedId: string;     // 被合并（软删除）的商品 ID
  mergedName: string;   // 被合并的商品名（已写入保留商品的 aliases）
}
```

### 1.3 `src/db/pending.ts` (新建)

PendingItem CRUD，操作 `pending_items` 表：

| 函数 | SQL | 说明 |
|------|-----|------|
| `createOrUpdate(barcode)` | `INSERT OR REPLACE` | 条码已存在时仅更新 scannedAt |
| `getAll()` | `SELECT * FROM pending_items ORDER BY scannedAt DESC` | 全部待处理 |
| `deleteById(id)` | `DELETE FROM pending_items WHERE id = ?` | 删除单条 |
| `findByBarcode(barcode)` | `SELECT * FROM pending_items WHERE barcode = ?` | 按条码查 |
| `convertToProduct(id, barcode)` | DELETE + 返回 barcode | 删除记录，返回 barcode 供 ProductEdit 使用 |

### 1.4 `src/db/duplicate.ts` (新建)

重复检测与合并：

| 函数 | 说明 |
|------|------|
| `findByBarcode(barcode)` | 查询同条码商品（排除自身、排除 isDeleted=1） |
| `findByNameSimilarity(name, excludeId?)` | 遍历所有商品计算归一化相似度，筛选 ≥0.9 的结果 |
| `getAllMergeCandidates()` | 返回所有重复候选（条码重复 + 名称高度相似） |
| `mergeProducts(keepId, mergeId)` | 将 mergeId 商品名写入 keepId 的 aliases（逗号追加），mergeId 设 isDeleted=1。在同一事务内完成 |

**条码重复检测**：
```sql
SELECT * FROM product WHERE barcode = ? AND id != ? AND isDeleted = 0
```

**名称相似度检测**：
1. 先用 SQL 取所有 `isDeleted=0` 商品
2. 在 JS 层两两比对 `normalizedSimilarity(a.name, b.name)`
3. 筛选 ≥0.9 的结果
4. 排除同一商品（同 id）

**自动合并（条码一致）**：
- 保留 updatedAt 较新的商品
- 旧商品名自动写入保留商品的 aliases（逗号分隔，去重）
- 旧商品设 isDeleted=1
- 在同一事务内完成

### 1.5 `src/db/migrations/v2.ts` (新建)

```typescript
import type { SQLiteDatabase } from 'expo-sqlite';

export async function migrate(db: SQLiteDatabase): Promise<void> {
  // v2: 确保 pending_items 表有 scannedAt 索引
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_pending_barcode ON pending_items(barcode);
    CREATE INDEX IF NOT EXISTS idx_pending_scanned ON pending_items(scannedAt);
  `);
}
```

### 1.6 `src/db/init.ts` (修改)

- `CURRENT_SCHEMA_VERSION` 从 1 改为 2
- 无需其他修改（migration 走 `loadMigrationScript` 自动加载 `v2.ts`）

### 1.7 测试

`src/db/__tests__/pending.test.ts`：
- 创建 PendingItem → 查询存在
- 重复条码 → 更新 scannedAt 而非新增
- 转换后删除原记录

`src/db/__tests__/duplicate.test.ts`：
- 同条码 → findByBarcode 命中
- 名称相似 ≥90% → findByNameSimilarity 命中
- "百事可乐" vs "百事可乐(500ml)" → 归一化后 ≥0.9
- auto-merge → mergeId 商品 isDeleted=1, keepId aliases 含合并商品名
- 不同条码 + 名称不相似 → 不命中

---

## Commit 2: ScanScreen 全面升级 — 扫码 + 拍照识别

### 2.0 安装依赖

```bash
npx expo install expo-camera
```

expo-camera 在 Android 上内建 Google MLKit barcode scanning，符合 spec §8.1 "MLKit 原生扫码引擎"。

### 2.1 `src/store/aiConfig.ts` (新建)

Zustand store，存储 AI 配置（供拍照识别使用）：

```typescript
import { create } from 'zustand';

interface AIConfig {
  apiUrl: string;       // 视觉模型 API 地址
  apiKey: string;       // API Key
  visionModel: string;  // 视觉模型名称
}

interface AIConfigStore {
  config: AIConfig | null;
  setConfig: (config: AIConfig | null) => void;
  hasConfig: () => boolean;
}

export const useAIConfigStore = create<AIConfigStore>((set, get) => ({
  config: null,
  setConfig: (config) => set({ config }),
  hasConfig: () => get().config !== null,
}));
```

注：AI 配置最终来源为 N1 云服务（spec §10.5/§10.7），Phase 3 先用本地 store 作为过渡，后续 N1 实现时替换数据源。

### 2.2 `src/services/vision.ts` (新建)

拍照识别 API 调用：

```typescript
interface VisionCandidate {
  name: string;
  confidence: number;   // 0~1
  spec?: string;
}

interface VisionResponse {
  candidates: VisionCandidate[];
}
```

函数 `recognizeProduct(imageBase64: string, config: AIConfig): Promise<VisionResponse>`:
- POST `{config.apiUrl}/chat/completions`（OpenAI 兼容格式）
- 请求体含 vision model + base64 图片
- system prompt: "识别图中的商品，返回候选列表及置信度。"
- 超时 10s（spec §14.2）
- 解析失败或超时 → 返回空 candidates 列表，静默降级

### 2.3 `src/screens/ScanScreen.tsx` (重写)

整体重写，实现双模式：

#### 布局结构
```
┌──────────────────────────┐
│  [扫码] [拍照]           │  顶部模式切换 Tab
├──────────────────────────┤
│                          │
│     Camera Preview       │  扫码: 扫码框覆盖
│                          │  拍照: 全屏预览
│                          │
├──────────────────────────┤
│ 手动输入条码框 + [确认]   │  兜底输入（两种模式都显示）
└──────────────────────────┘
```

#### 扫码模式（默认）
1. Camera preview 全屏
2. MLKit 自动检测条码，显示扫码框动画
3. 检测到后调用 `findByBarcode(barcode)` 查商品库
   - 唯一匹配 → 底部弹出商品卡片 + [加购] [忽略]
   - 无匹配 → 根据模式处理：
     - 普通模式：自动 `createOrUpdate(barcode)` → Toast "已记录，可在管理模式中补充"
     - 管理模式：`navigation.navigate('ProductEdit', { barcode })` 跳转新增表单
4. 防抖：同条码值 2 秒内忽略（用 `useRef` 存上次条码 + 时间戳）

#### 拍照模式
1. Camera preview 全屏，拍照按钮居中底部
2. 点击拍照 → 获取 base64
3. 检查 `useAIConfigStore.hasConfig()`
   - 无配置 → Toast 提示"请先配置 AI 服务"，不做请求
4. 有配置 → 调用 `recognizeProduct(base64, config)`
5. 展示候选列表（bottom sheet）：
   - 每行：商品名 + 置信度百分比 + [加购]
   - 多匹配时按置信度降序
   - 底部「以上都不是→手动搜索」→ 跳转到搜索页面
   - 无匹配 → Toast "未识别到商品"
6. 用户点击 [加购] → 加入购物车 + Toast

#### 公共要素
- 手动输入条码框始终显示在底部（spec §8.1 兜底）
- 拍照入口仅当 `hasConfig()` 为 true 时显示 Tab（spec §8.2 "无 AI 配置时隐藏拍照入口，仅保留扫码"）

### 2.4 `src/navigation/types.ts` (修改)

新增路由：

```typescript
export type RootStackParamList = {
  // ...existing
  ScanBarcode: { mode?: 'scan' | 'photo' };  // 修改：支持 mode 参数
  PendingItems: undefined;                     // 新增：PendingItem 管理
  DuplicateList: undefined;                    // 新增：重复检测列表
};
```

### 2.5 `src/navigation/RootNavigator.tsx` (修改)

注册新 Screen：
- `PendingItems` → `PendingItemsScreen`
- `DuplicateList` → `DuplicateScreen`

### 2.6 `src/screens/HomeScreen.tsx` (修改)

底部相机按钮根据模式选择：
- 点击 📷 → 弹出 ActionSheet：「扫码」「拍照」（有 AI 配置时）或直接进入扫码（无 AI 配置时）
- 或者：直接导航到 ScanScreen（默认扫码模式），拍照 Tab 由 ScanScreen 内部控制

推荐后者（简洁）：HomeScreen 底部 📷 直接 `navigation.navigate('ScanBarcode', { mode: 'scan' })`

---

## Commit 3: 管理模式 — PendingItem 管理 + 重复检测 UI

### 3.1 `src/screens/PendingItemsScreen.tsx` (新建)

管理模式中专用的 PendingItem 列表页：

**UI 规格**：
- 顶栏标题「待处理条码」
- 列表每行：条码 + 扫描时间（格式化显示）+ [转为商品] 按钮
- 空态：居中「暂无待处理条码」+ 说明文字「扫码未知条码后会自动记录在此」
- 点击 [转为商品] → `navigation.navigate('ProductEdit', { barcode })`（spec §5.3 转换规则）
- 支持左滑删除（删除 PendingItem 记录）

**转换规则（spec §5.3）**：
- 跳转到 ProductEdit 新建表单，自动填入条码
- 其余字段留空由用户填写
- 表单保存成功后自动 `deleteById(pendingId)` 删除原 PendingItem
- 不做自动名称推断或 AI 辅助补全

### 3.2 `src/screens/DuplicateScreen.tsx` (新建)

管理模式中的重复检测列表页：

**UI 规格**：
- 顶栏标题「重复检测」
- 调用 `getAllMergeCandidates()` 获取候选列表
- 列表分两组：
  - 「条码一致」（自动合并）：展示已自动完成合并的结果
  - 「名称相似」（需确认）：左右并排 A/B 卡片

**条码一致组**：
- 展示格式：「商品A 与 商品B 条码相同，已自动合并」
- 子行显示：保留商品名 + 被合并商品名

**名称相似组**：
- 每行展示：商品A 名称 + 相似度% + 商品B 名称
- [确认非重复] [合并] 按钮
- 点击 [合并] → 弹窗逐字段选择保留值：
  - 名称：选 A 或 B（单选）
  - 售价：选 A 或 B（单选）
  - 规格：选 A 或 B（单选）
  - 条码：选 A 或 B（单选，允许空）
  - 分类/状态：选 A 或 B（单选）
- 确认后调用 `mergeProducts(keepId, mergeId)`
- 合并后 A 的 aliases 追加 B 的商品名，B 设 isDeleted=1

**空态**：居中「未发现重复商品」

### 3.3 `src/components/DrawerContent.tsx` (修改)

在管理模式可见区域新增入口：
- 「待处理条码」→ `navigation.navigate('PendingItems')`
- 「重复检测」→ `navigation.navigate('DuplicateList')`

两个入口仅在 `useModeStore().isManagement` 为 true 时显示。

### 3.4 `src/db/product.ts` (修改)

**新增/编辑商品时触发重复检测**：
- 在 `createProduct` 和 `updateProduct` 保存成功后：
  1. 如果有条码 → 调用 `findByBarcode(barcode)` 自动合并（spec §12.4 静默自动合并）
  2. 调用 `findByNameSimilarity(name)` 检测名称相似
  3. 名称相似 → Toast "检测到可能重复的商品「xxx」，可在管理模式的重复检测中查看"

**自动合并实现**：
- 条码匹配 → 保留 updatedAt 较新的，旧商品名写入保留商品 aliases，旧商品 isDeleted=1
- 在同一事务内完成

---

## Commit 4: 集成测试

### 4.1 `src/__tests__/scan-pending.test.ts` (新建)

测试扫码→PendingItem 完整链路：
- 模拟扫码未知条码 → 验证 `pending_items` 表新增记录
- 模拟扫码已知条码 → 验证弹出商品卡片
- 管理模式扫码未知条码 → 验证跳转 ProductEdit
- 防抖：同条码 2 秒内不重复创建
- PendingItem 转换：验证删除原记录

### 4.2 `src/__tests__/duplicate-merge.test.ts` (新建)

测试重复检测完整链路：
- 插入两个同条码商品 → 验证 auto-merge 结果
- 插入两个高相似度商品 → 验证候选列表包含
- 手动合并 → 验证 aliases 追加、旧商品 isDeleted=1
- 名称相似度 < 90% → 验证不命中

### 4.3 `src/db/__tests__/pending.test.ts` (补充)

- 分页/全部查询
- 左滑删除

---

## 关键依赖与风险

| 风险 | 缓解 |
|------|------|
| expo-camera 在模拟器上无真实摄像头 | 测试用例使用 mock；真机测试待后续 |
| 视觉模型 API 需要用户自行配置 | AI 配置 store 提供手动设置入口；无配置时拍照 Tab 隐藏 |
| Levenshtein 两两比对 O(n²) | 商品量 ≤ 万级，全量比对可接受；后续可加索引优化 |
| PendingItem 与 ProductEdit 转换衔接 | barcode 参数已在 ProductEdit 路由中定义，直接传递 |

---

## CLAUDE.md 更新要点（Phase 3 完成后）

- 新增 Screen: PendingItemsScreen, DuplicateScreen
- 新增 Store: useAIConfigStore
- 新增 Service: vision.ts
- 新增 DB module: pending.ts, duplicate.ts
- 新增 Util: levenshtein.ts
- ScanScreen 重构为双模式（扫码+拍照）
- schema_version 升至 2
- 导航新增路由: PendingItems, DuplicateList
