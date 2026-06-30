# Phase 8 C2 快捷入口 — 实现指令

基于 plan-phase8.md §C2，生成完整的快捷入口功能。

---

## 背景

PStore 是一个商品管理 React Native (Expo) 应用，使用 expo-sqlite 作为数据库。项目已有完整的主题系统（ThemeContext）、导航结构（HomeScreen 搜索栏下方需插入 QuickEntryBar）。

---

## C2.1 数据层 — `src/db/quickEntry.ts`

创建 CRUD 模块，操作 `loose_goods_labels` 表（schema 已存在）：

```sql
CREATE TABLE loose_goods_labels (
  id    TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  "order" INTEGER DEFAULT 0
);
```

需导出以下函数：

### `getAllQuickEntries(db: SQLiteDatabase): Promise<LooseGoodsLabel[]>`
- 查询 `SELECT * FROM loose_goods_labels ORDER BY "order" ASC, label ASC`
- 返回类型 `LooseGoodsLabel` 需定义：`{ id: string; label: string; order: number }`

### `addQuickEntry(db: SQLiteDatabase, label: string): Promise<LooseGoodsLabel>`
- 生成 uuid（用 `expo-crypto` 的 `randomUUID()`）
- `order` 自动设为 `MAX("order") + 1`（先查询最大值，空表时从 0 开始）
- INSERT 后返回新条目对象

### `removeQuickEntry(db: SQLiteDatabase, id: string): Promise<void>`
- `DELETE FROM loose_goods_labels WHERE id = ?`

### `reorderQuickEntry(db: SQLiteDatabase, id: string, newOrder: number): Promise<void>`
- `UPDATE loose_goods_labels SET "order" = ? WHERE id = ?`

---

## C2.2 UI 组件 — `src/components/QuickEntryBar.tsx`

### 功能规格

横向滚动标签条，两种模式：

**普通模式（只读）**：
- 水平 `ScrollView` 展示所有标签
- 每个标签为可点击 Chip（圆角 Pill），点击后触发 `onPress(label: string)` 回调
- 左侧有 `+` 按钮（触发进入管理模式或直接新增）
- 使用 ThemeContext 获取主题颜色

**管理模式（编辑）**：
- 长按标签进入管理模式（或点击编辑按钮）
- 每个标签右侧出现 `×` 删除按钮
- 底部出现新增输入栏（TextInput + 确认按钮）
- 标签支持拖拽排序（可用 `react-native-draggable-flatlist` 或简易长按拖拽，或至少支持通过按钮上下移动）
- 点击「完成」退出管理模式

### Props 接口

```ts
interface QuickEntryBarProps {
  entries: LooseGoodsLabel[];
  onPress: (label: string) => void;
  onAdd: (label: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onReorder: (id: string, newOrder: number) => Promise<void>;
}
```

### 样式要求
- 标签 Chip: 圆角 16，padding 水平 12 垂直 6，背景色 `colors.border.light`，文字色 `colors.text.secondary`
- 管理模式 Chip: 背景色 `colors.brand.primary`，文字色 `colors.text.inverse`
- + 按钮: 圆形 32dp，边框 `colors.border.default`，+ 号颜色 `colors.brand.primary`
- 整体容器: padding 水平 12，高度自适应
- 使用 `scale` 缩放字号

---

## C2.3 HomeScreen 集成

在 `src/screens/HomeScreen.tsx` 中集成 QuickEntryBar：

1. **导入**: `import { QuickEntryBar } from '../components/QuickEntryBar'` 和 `import * as QuickEntry from '../db/quickEntry'`
2. **state**: 新增 `const [quickEntries, setQuickEntries] = useState<LooseGoodsLabel[]>([])`
3. **加载**: 在现有 `useEffect` 中（或新增），db 就绪后调用 `QuickEntry.getAllQuickEntries(db)` 并 setState
4. **渲染位置**: 搜索栏下方、商品列表上方（即 `<SearchBar>` 组件之后插入）
5. **回调实现**:
   - `onPress(label)` → 将 `label` 填入搜索框并触发搜索
   - `onAdd(label)` → 调用 `QuickEntry.addQuickEntry(db, label)` 并刷新列表
   - `onRemove(id)` → 调用 `QuickEntry.removeQuickEntry(db, id)` 并刷新列表
   - `onReorder(id, newOrder)` → 调用 `QuickEntry.reorderQuickEntry(db, id, newOrder)` 并刷新列表
6. **刷新函数**: 封装 `loadQuickEntries()` 函数，在增删改后调用

---

## 执行要求

1. 按 C2.1 → C2.2 → C2.3 顺序实现
2. 每完成一个文件运行 `npx tsc --noEmit`，零错误再继续
3. 全部完成后运行 `npx vitest run` 确认无新增失败
4. 生成 `src/__tests__/quick-entry.test.tsx` 测试文件，覆盖：
   - QuickEntryBar 渲染（空列表 / 有标签）
   - onPress 回调
   - 管理模式切换
