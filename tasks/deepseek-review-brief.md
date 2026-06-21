# DeepSeek 审校任务

## 背景

PStore 是一个单店单人单设备的 Android 商品管理工具（<1000 商品，非 POS 收银）。db 层 6 个模块已完工并对齐 spec v4.5，Claude CLI 在此基础上补全了 Expo 项目骨架和 UI 层。

你的任务是审校 Claude CLI 新增的 **20 个文件 / 1938 行代码**。

## 审校标准

以 `spec/spec-v4.md` 为唯一权威标准。关注点：

1. **是否违背 spec 确定性规则** — tokenizer CJK 范围、escapeFts5 输入输出、pinyin-pro 参数等必须精确匹配 spec 示例
2. **是否有破坏性副作用** — `delete`/`DROP`/`ALTER` 等 SQL、文件系统写入、权限滥用
3. **是否有安全漏洞** — SQL 注入（字符串拼接）、未过滤的用户输入直传 MATCH
4. **是否有未引用的死代码** — 定义了但从未调用的函数/组件
5. **代码质量红线** — 未捕获的异步错误、useEffect 无清理函数、内存泄漏

## 文件清单

请审校以下 20 个文件（按 commit 分组）：

### Commit 1: chore: Expo 项目骨架
- `.gitignore`
- `package.json`
- `tsconfig.json`
- `app.json`
- `babel.config.js`
- `expo-env.d.ts`

### Commit 2: fix(db): 兼容 Node 24 ESM
- `src/db/init.ts` (修改 5 行)
- `src/db/__tests__/tokenizer.test.ts` (修改 2 行)
- `src/db/__tests__/scaffold.test.ts` (新增)

### Commit 3: 应用入口与路由导航
- `index.ts`
- `App.tsx`
- `src/navigation/RootNavigator.tsx`
- `src/navigation/types.ts`
- `src/context/store.tsx`

### Commit 4: 商品列表页
- `src/screens/ProductListScreen.tsx`

### Commit 5: 商品详情页
- `src/screens/ProductDetailScreen.tsx`

### Commit 6: 商品编辑与扫码页
- `src/screens/ProductEditScreen.tsx`
- `src/screens/ScanScreen.tsx`
- `src/__tests__/edit-scan.test.ts`
- `src/__tests__/entry.test.ts`
- `vitest.config.ts`

## 输出格式

按以下表格逐条输出发现问题：

| 优先级 | 位置 | 问题描述 | 建议修复 |
|--------|------|----------|----------|
| P0 阻断 | 文件:行号 | 与 spec 冲突 / 安全漏洞 / 破坏操作 | 具体修复代码或方案 |
| P1 重要 | 文件:行号 | 逻辑错误 / 可能漏数据 | 建议 |
| P2 建议 | 文件:行号 | 死代码 / 风格问题 / 可选优化 | 建议 |

最后给出总体结论：通过 / 有条件通过（列明条件）/ 不通过。

## 物料交付

1. `spec/spec-v4.md` — 确定性规格（项目根目录已有）
2. `tasks/claude-cli.diff` — Claude CLI 6 个 commit 的完整 diff（临时文件）
