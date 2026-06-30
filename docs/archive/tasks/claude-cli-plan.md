# Claude CLI 开发计划

## 前置条件

当前仓库状态：`04c6426` — db 层 6 个模块已完工，spec v4.5 对齐。
所有 db 层代码在 `src/db/` 下，可直接 import 使用。

## 总体规则

- 每完成一个模块立即 `git commit`，提交信息按各模块指定格式
- commit 粒度 = 一个独立可审查的功能模块
- 读 spec 不要臆造：输入输出以 `spec/spec-v4.md` 确定性示例为准
- 已有 db 层 API 全部可用：`tokenizeChinese` / `escapeFts5` / `searchProducts` / `getAllProducts` / `addProduct` / `updateProduct` / `softDeleteProduct` 等

---

## Commit 1: 项目骨架

**文件**：`package.json` / `tsconfig.json` / `app.json` / `babel.config.js`

- `package.json`：Expo ~52.0, React 18.3, RN 0.76，依赖 `expo-sqlite` `expo-crypto` `pinyin-pro` `@react-navigation/native` `@react-navigation/native-stack`
- `tsconfig.json`：strict，paths `@/*` → `src/*`
- `app.json`：name "PStore"，CAMERA 权限
- `babel.config.js`：babel-preset-expo

提交信息：`chore: Expo 项目骨架`

---

## Commit 2: 入口与路由

**文件**：`index.ts` / `App.tsx` / `src/navigation/types.ts` / `src/navigation/RootNavigator.tsx` / `src/context/store.tsx`

入口：
- `index.ts`：`registerRootComponent(App)`
- `App.tsx`：启动时 `initDatabase()` → loading → `StoreProvider(db)` → `NavigationContainer`

路由（NativeStack）：
- ProductList → ProductDetail(id?) → ProductEdit(id?) → ScanBarcode

全局 Context（`src/context/store.tsx`）：
- `StoreProvider` 提供 db 实例
- `useStore()` hook 暴露 `{ db, products, refreshProducts }`

提交信息：`feat: 应用入口与路由导航`

---

## Commit 3: 商品列表页

**文件**：`src/screens/ProductListScreen.tsx`

- 顶部搜索栏：TextInput，输入时实时调 `searchProducts(db, query)`
- 分类横向滚动筛选条：10 个分类标签，单选，高亮选中
- FlatList 商品列表：每项显示名称、价格、状态色标（IN_SHOP 绿 / OUT_OF_STOCK 红 / TO_BE_PURCHASED 橙）
- 右上角 "+" → ProductEditScreen（新增）
- 底部扫码按钮 → ScanScreen
- 空状态："未找到商品"
- `useFocusEffect` 聚焦时刷新列表

提交信息：`feat(ui): 商品列表页`

---

## Commit 4: 商品详情页

**文件**：`src/screens/ProductDetailScreen.tsx`

- route.params.id → `getProductById` 获取商品
- 展示：名称、拼音、价格、规格、条码、分类、状态、时间
- 价格历史列表（`getPriceHistory`）
- 底部：编辑 → ProductEditScreen | 软删除 → `softDeleteProduct` → 返回列表

提交信息：`feat(ui): 商品详情页`

---

## Commit 5: 商品编辑页 + 扫码页

**文件**：`src/screens/ProductEditScreen.tsx` / `src/screens/ScanScreen.tsx`

编辑页：
- 无 id → 新增模式（`addProduct`）；有 id → 编辑模式（`updateProduct`）
- 表单字段：名称 (必填)、价格 (必填)、规格、条码、分类 (Picker)、状态 (三选一)
- 保存后返回列表并刷新
- 表单校验：名称非空、价格 > 0

扫码页：
- 使用 `expo-camera` 或 `expo-barcode-scanner` 扫描条码
- 扫码成功 → 跳转 ProductEditScreen 预填 barcode 字段
- 支持手动输入条码 fallback

提交信息：`feat(ui): 商品编辑与扫码页`

---

## 完成标准

全部 5 个 commit 完成后：
1. `git log --oneline` 应显示从 `04c6426` 开始的 5 个新 commit
2. `src/screens/` 下 4 个文件 + 入口/路由/Context 全部存在
3. 逻辑完整可运行（虽然可能需要 `npm install` 后 `npx expo start`）
