# CLAUDE.md

PStore — 单店单人 Android 商品管理工具。查价为主，**不做收银/支付/结算**。
技术栈：React Native 0.76 + Expo SDK 52 + TypeScript，expo-sqlite (WAL + FTS5)，React Navigation (native-stack + drawer)，Zustand。

## 权威规格

**所有开发以实现 `spec/spec-v4.md` 为准，禁止臆造。** spec v4.5 是唯一权威来源，包含确定性示例（输入输出精确到字符）。凡是 spec 写了具体算法/参数/示例的，代码必须逐字对齐。

## 命令

```bash
npm start              # Expo dev server
npm test               # vitest 测试
npx vitest run <file>  # 单文件测试
npx tsc --noEmit       # 类型检查
```

## 架构概览

```
index.ts → App.tsx → StoreProvider → NavigationContainer
                                         │
                                    RootNavigator (createNativeStackNavigator)
                                         │
                                    MainDrawer (DrawerNavigator)
                                    ├── HomeScreen (主屏)
                                    ├── ProductListScreen
                                    ├── ProductDetailScreen
                                    ├── ProductEditScreen
                                    └── ScanScreen
```

### 导航结构（Phase 2 重构后）

- `src/navigation/RootNavigator.tsx` — NativeStackNavigator，包含 Drawer 作为首页
- `src/navigation/types.ts` — `RootStackParamList` 路由参数表
- `src/components/DrawerContent.tsx` — 抽屉菜单（管理模式条件渲染、购物车概览）

### 状态管理（Zustand）

| Store | 文件 | 职责 |
|-------|------|------|
| `useStore` | `src/context/store.tsx` | 全局 db 实例 + products 列表 + refreshProducts |
| `useCartStore` | `src/store/cart.ts` | 购物车（纯内存，不持久化） |
| `useModeStore` | `src/store/mode.ts` | 管理模式开关（纯内存，重启回普通） |
| `usePinStore` | `src/store/pin.ts` | PIN 密码（SHA-256 哈希，纯内存） |

### Screen 层

- **HomeScreen** — 主屏：搜索栏 + 商品列表（FlatList）+ 购物车折叠栏 + 底部输入栏 + 连击标题进管理模式 + 批量管理模式
- **ProductListScreen** — 独立商品列表（管理模式入口用）
- **ProductDetailScreen** — 商品详情 + 价格历史 + 编辑/删除
- **ProductEditScreen** — 新增/编辑表单（name/price/spec/barcode/aliases/category/status）
- **ScanScreen** — 扫码（expo-camera）+ 手动输入 fallback

### DB 层（`src/db/` — spec v4.5 锁定）

| 文件 | 职责 |
|------|------|
| `init.ts` | `initDatabase()`、schema 迁移、`escapeFts5()`、`fastRefresh()` |
| `product.ts` | CRUD：`addProduct`/`updateProduct`/`softDeleteProduct`/`getAllProducts`/`getProductById`/`getProductByBarcode`/`addPriceRecord`/`getPriceHistory` |
| `search.ts` | FTS5 搜索：`searchProducts`/`searchByBarcode`/`searchByCategory`/`searchByStatus`/`exportProducts` |
| `tokenizer.ts` | `tokenizeChinese(text): string[]` — CJK 单字拆分纯函数 |
| `types.ts` | `Product`/`PriceHistory`/`PendingItem` 接口 + `CATEGORIES`(10种) |
| `verify.ts` | 自验证测试 |

## 编码红线

1. **SQL 必须参数化** — 禁止字符串拼接；所有值通过 `?` 占位符传入
2. **FTS5 与 product 在同一事务写入** — `db.withTransactionAsync()` 包裹
3. **所有 SELECT 加 `isDeleted = 0`**
4. **CJK 分词精确匹配 spec §6.1** — 仅拆分 4E00-9FFF/3400-4DBF/F900-FAFF
5. **pinyin-pro 参数锁定** — `{pattern:'first', toneType:'none', type:'string'}`，去空格转大写
6. **UUID v4** — `expo-crypto` 的 `randomUUID()`
7. **FTS5 查询词经 `escapeFts5()` 处理** — 不可直接拼接用户输入

## Git 提交规则

- 每完成一个功能模块一个 commit，不做大杂烩提交
- 提交信息格式：`<type>(<scope>): <描述>`（如 `feat(cart): Zustand 购物车 store`）
- 开发任务文件在 `tasks/` 目录下，按阶段编号
