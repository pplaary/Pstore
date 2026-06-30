---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 6ae0fa66bbfac089a0a0be292e878a1b_f239e2e26d2611f1aa625254006c9bbf
    ReservedCode1: DYoYUMvK9ZnYmFp0dZ9j7PLshPh+XNWWgqL+2rSQEdIEXqzVnibnQQ91Wwh8Ly73Q2WyJ5tO70cAfjvwb0CpSRs0Ajd/Z8g+dzd11OqcAuvZGJMpA4W5xo/485yT6D9a2dFkfa1QSrNXzC2HJvY99hvYbxil/7xcvq8hFirS2Ntjd0Smmk3K6fZ+w90=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 6ae0fa66bbfac089a0a0be292e878a1b_f239e2e26d2611f1aa625254006c9bbf
    ReservedCode2: DYoYUMvK9ZnYmFp0dZ9j7PLshPh+XNWWgqL+2rSQEdIEXqzVnibnQQ91Wwh8Ly73Q2WyJ5tO70cAfjvwb0CpSRs0Ajd/Z8g+dzd11OqcAuvZGJMpA4W5xo/485yT6D9a2dFkfa1QSrNXzC2HJvY99hvYbxil/7xcvq8hFirS2Ntjd0Smmk3K6fZ+w90=
---

# PStore Phase 2 开发计划：购物车 + 管理模式 + 主界面重构

## 前置条件

当前仓库：`e8532ec` — db 层完善 + 4 基础页面 + 6 条审校修复。
所有 db API 可用：`initDatabase / addProduct / updateProduct / softDeleteProduct / searchProducts / getAllProducts / getProductById / getPriceHistory` 等。

## 依赖关系

```
Commit 1: 购物车 Zustand store（无依赖，纯状态层）
    ↓
Commit 2: 抽屉导航 + 主界面布局（依赖 Commit 1 的 cart store）
    ↓
Commit 3: 管理模式 + PIN 密码（依赖 Commit 2 的布局框架）
    ↓
Commit 4: 商品列表增强（FAB/长按菜单/批量管理，依赖 Commit 3 的管理模式）
```

每 commit 独立可审查，完成即 `git add` + `git commit`。

---

## 总体规则

- 读 spec `E:\Code\PStore\spec\spec-v4.md` 确定性示例为权威标准
- 不臆造 spec 未定义的字段/行为
- 已有 db 层不动（除非 spec 要求的缺陷修复）

---

## Commit 1: 购物车 Zustand Store

**新建文件**：`src/store/cart.ts`

### 类型定义

```ts
export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}
```

### Store 实现（Zustand）

- `items: CartItem[]` — 商品列表
- `total: computed` — 合计金额，实时计算 `sum(price * quantity)`
- `itemCount: computed` — 总件数
- `addToCart(productId, name, price)`：已存在 +1，不存在新增 quantity=1
- `removeFromCart(productId)`：已存在 -1，减到 0 移除
- `removeItem(productId)`：直接删除该项
- `clearCart()`：清空全部
- 纯内存态，不持久化

提交信息：`feat(cart): Zustand 购物车 store`

---

## Commit 2: 抽屉导航 + 主界面布局

### 新增/修改文件

**新增依赖**：`@react-navigation/drawer`（需加进 package.json）

**导航结构**：
```
RootStack (NativeStackNavigator)
  └─ MainDrawer (DrawerNavigator)
       ├─ Home → 主界面（搜索/聊天/商品卡片区域）
       ├─ ProductDetail → 详情页
       └─ ProductEdit → 编辑页
```

### src/navigation/RootNavigator.tsx（重新创建，替换 App.tsx 中的内联导航）

- 原 App.tsx 中的 NativeStack 保持不变，作为 RootStack
- 新增 DrawerNavigator，Home 为主屏
- ProductDetail / ProductEdit / ScanBarcode 作为 RootStack 上的模态/推入页面（不在抽屉内）

### App.tsx 简化

- `App.tsx` 保留：initDatabase → ErrorUI/loading → StoreProvider → NavigationContainer
- 导航逻辑全部移入 RootNavigator.tsx

### src/screens/HomeScreen.tsx（新建，替代 ProductListScreen 的"主界面"角色）

**顶部栏**（原生 Navigation Header，不自定义）：
- 左：≡ 菜单按钮（Drawer toggle）
- 中：PStore 标题（普通模式）/ "PStore [管理]"（管理模式）
- 右：☁️ 同步状态图标（先做占位，灰色云图标，后续 Phase 3 接真实状态）

**中间聊天/搜索区域**：
- 搜索模式（当前阶段）：搜索框 + FlatList 商品列表（复用 ProductListScreen 核心逻辑）
- AI 模式占位：标记 TODO，当前阶段全走 FTS5 搜索

**购物车折叠栏**（固定在搜索区域底部）：
- 折叠态：🛒 ×N | ¥XX.XX | [结账]
- `×N` 为 cart.itemCount，0 时隐藏整栏
- 展开态（点击折叠栏展开）：每行商品名 + 单价 + ⊕⊖ + 小计
  - ⊕⊖ 调 cart.addToCart / cart.removeFromCart
  - 小计 = price × quantity
  - [清空] 按钮 + [结账] 按钮
- 结账弹窗：清单 + 总额 + [关闭并清空] 按钮（一步完成，不二次确认）
- 购物车栏用 React Native 原生 Modal 或底部 Sheet 实现

**底部输入栏**：
- 左：🎤 语音按钮（当前阶段显示但置灰 disabled，标记 TODO）
- 中：输入框 placeholder "搜索商品名…"
- 右：📷 相机按钮 → 跳转 ScanScreen

### 侧滑抽屉内容（`src/components/DrawerContent.tsx`）

| 菜单项 | 可见性 | 行为 |
|--------|--------|------|
| 商品管理 | 管理模式 | → ProductListScreen（管理模式版） |
| 商品数据导出 | 管理模式 | → TODO 占位 |
| 同步配置 | 全员 | → 暂弹 Alert("功能开发中") |
| 深色模式 | 全员 | Switch 开关（先只存状态，不实际切换） |
| 关怀模式 | 全员 | Switch 开关（先只存状态，不实际切换） |
| 设置 | 全员 | → 设置页占位 |
| 管理模式 | 全员 | → PIN 弹窗（Commit 3 实现，当前占位） |

### ProductListScreen 调整

- 原 ProductListScreen 保留，但在管理模式中可被导航到（抽屉"商品管理"→ProductListScreen 管理模式版）
- 普通模式下搜索仍在 HomeScreen 完成，不跳转

提交信息：`feat(ui): 抽屉导航 + 主界面布局 + 购物车折叠栏`

---

## Commit 3: 管理模式 + PIN 密码

### 模式状态（`src/store/mode.ts`）

```ts
interface ModeState {
  isManagement: boolean;
  enterManagement(): void;
  exitManagement(): void;
}
```

- Zustand store，纯内存，重启回普通模式
- `enter/exit` 同步更新 state

### PIN 密码（`src/store/pin.ts`）

- 状态：`pinHash: string | null`（null = 未设置）
- `isPinSet: computed` — pinHash !== null
- `setPin(newPin: string)`：哈希存储（使用 expo-crypto 的 digestStringAsync SHA-256）
- `verifyPin(input: string)`：比对哈希
- `resetPin()`：清除（需先验证旧 PIN）
- 首次设置：弹窗 "请设置 4-6 位 PIN"

### PIN 弹窗组件（`src/components/PinModal.tsx`）

- 4-6 位数字输入
- "确认" / "取消" 按钮
- 错误提示红字 "PIN 错误，请重试"
- 验证通过 → mode.enterManagement()

### 连击标题进入管理模式（`HomeScreen.tsx`）

- 标题 "PStore" 可点击
- 5 秒内连击 5 次 → 弹出 PinModal
- 管理模式中再次连击 5 次 → mode.exitManagement()
- 使用 `useRef` 记录点击次数和时间戳

### 管理模式 UI 差异

- 标题显示 "PStore [管理]"
- 抽屉菜单新增商品管理/导出入口（已在 Commit 2 做了条件渲染，现在接上 mode.isManagement）
- 商品列表 FAB (+) 按钮显示（Commit 4 实现，此处先留接口）
- 商品长按菜单显示编辑/改状态/删除（Commit 4 实现，此处先留接口）

提交信息：`feat(auth): 管理模式 + PIN 密码 + 连击标题进入`

---

## Commit 4: 商品列表增强（FAB + 长按菜单 + 批量管理）

### FAB 新增按钮（`HomeScreen.tsx` 或 `ProductListScreen.tsx`）

- 右下角圆形 + 按钮，仅管理模式显示
- 背景色 Primary `#2563EB`
- 点击 → ProductEditScreen（新增模式，无 id）

### 商品长按菜单（商品卡片/列表项）

- 仅管理模式启用
- 弹出 ActionSheet / PopupMenu：
  - 「编辑」→ ProductEditScreen(id)
  - 「改状态」→ 三个选项：在售/缺货/待采 → 调 updateProduct
  - 「软删除」→ 确认后调 softDeleteProduct → 刷新列表

### 批量管理模式

- 工具栏上方增加「批量管理」按钮（仅管理模式）
- 进入批量模式：每行左侧显示 CheckBox
- 底部浮动工具栏：
  - [全选] [反选]
  - [批量改价]：输入新价格，应用到所有选中商品
  - [批量改状态]：选择状态（在售/缺货/待采）
  - [批量删除]：确认后逐个 softDeleteProduct
- 退出批量模式按钮

提交信息：`feat(ui): 商品列表 FAB + 长按菜单 + 批量管理`

---

## 完成标准

全部 4 个 commit 完成后：
1. 购物车：可加购、加减数量、模拟结账、清空
2. 主界面：抽屉导航可用、购物车折叠栏正常、底部输入栏三按钮就位
3. 管理模式：连击标题→PIN→进入管理模式，退出正常
4. 商品管理：FAB 新增、长按菜单、批量操作可用
5. `npx tsc --noEmit` 零 PStore 源码错误（允许 node_modules 的第三方错误）
*（内容由AI生成，仅供参考）*
