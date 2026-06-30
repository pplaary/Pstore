# PStore MVP Task 01：脚手架 + 数据库层

## 你的任务

你的工作目录是E:\Code\PStore\test\Gemini。
在一个全新的 Expo 项目中完成以下工作，确保代码能编译运行。

## 步骤

### 1. 创建项目
```
npx create-expo-app@latest PStore --template blank-typescript
cd PStore
npx expo install expo-sqlite
```

### 2. 创建数据库初始化模块 `src/db/init.ts`

实现 `initDatabase()` 函数，创建以下 4 张表：

```sql
CREATE TABLE IF NOT EXISTS product (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  aliases TEXT,
  pinyin TEXT,
  searchText TEXT,
  price REAL NOT NULL,
  spec TEXT,
  imageUri TEXT,
  barcode TEXT,
  category TEXT,
  status TEXT DEFAULT 'IN_SHOP',
  isDeleted INTEGER DEFAULT 0,
  updatedAt TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS product_fts USING fts5(
  id,
  searchText,
  name,
  aliases
);

CREATE TABLE IF NOT EXISTS price_history (
  id TEXT PRIMARY KEY,
  productId TEXT,
  oldPrice REAL,
  newPrice REAL,
  changedAt TEXT
);

CREATE TABLE IF NOT EXISTS pending_item (
  id TEXT PRIMARY KEY,
  barcode TEXT UNIQUE,
  scannedAt TEXT
);
```

### 3. 实现中文分词函数 `src/db/tokenizer.ts`

导出 `tokenizeChinese(text: string): string`
- 输入 "百事可乐" → 输出 "百 事 可 乐"
- 中文按单字拆分，空格连接
- 非中文字符（英文/数字/标点）原样保留不拆分

### 4. 实现商品插入函数 `src/db/product.ts`

导出 `insertProduct(db, product)`：
- 自动生成 UUID
- 自动生成 pinyin 字段
- 调用 tokenizeChinese 生成 searchText
- 写入 product 表后同步写入 product_fts 表
- 设置 createdAt / updatedAt 为当前 ISO 8601 时间

### 5. 实现 FTS5 搜索函数 `src/db/search.ts`

导出 `searchProducts(db, query: string): Product[]`
- 对 query 做 tokenizeChinese 分词
- 用分词后的结果构造 FTS5 MATCH 查询
- 返回匹配结果

### 6. 创建校验脚本 `src/db/verify.ts`

导出 `verifyDatabase(db)` 函数：
- 插入 3 条测试商品：百事可乐/可口可乐/农夫山泉
- 用 "可乐" 搜索
- 打印搜索结果，确认返回 2 条（百事 + 可口）
- 用 "农夫" 搜索
- 打印搜索结果，确认返回 1 条

### 7. 在 App.tsx 中调用

- App 启动时调用 initDatabase()
- 提供一个按钮 "运行校验"，点击后调用 verifyDatabase
- 显示校验结果在屏幕上

## 要求

- TypeScript，类型完整
- 代码能直接 `npx expo start` 运行
- 不依赖 AI / 网络 / 后端
- 不引入额外 UI 库
- 完成后列出每个文件的路径和用途
