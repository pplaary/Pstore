# Phase 4 开发计划：N1 云服务

> 基于 spec-v4.5 §10
> 基准 commit: 50e70a3 (Phase 2+3 审校修复完成)
> 工作流: 按 commit 顺序执行 → 每个 commit 完成后 `git commit` → 进入下一个

---

## 提交信息格式

```
phase4-<n>: <简短描述>
```

---

## 文件清单

| Commit | 新建 | 修改 |
|--------|------|------|
| C1 N1后端 | `n1-server/Dockerfile`, `n1-server/package.json`, `n1-server/src/index.ts`, `n1-server/src/db.ts`, `n1-server/src/routes/config.ts`, `n1-server/src/routes/products.ts`, `n1-server/tsconfig.json`, `n1-server/.dockerignore` | — |
| C2 客户端引擎 | `src/services/n1.ts`, `src/services/sync.ts`, `src/db/migrations/v3.ts`, `src/hooks/useNetworkDetection.ts`, `src/store/syncConfig.ts` | `src/db/types.ts`, `src/db/init.ts` |
| C3 UI集成 | `src/screens/ConfigScreen.tsx`, `src/components/SyncStatusIcon.tsx` | `src/navigation/types.ts`, `src/navigation/RootNavigator.tsx` |
| C4 测试 | `src/__tests__/sync.test.ts`, `src/db/__tests__/n1-client.test.ts`, `src/__tests__/config-flow.test.ts` | — |

---

## 实现要点

### 通用约束（所有 commit 遵守）

1. spec-v4.5 §10 是唯一权威，代码必须逐字对齐
2. 所有 SQL 参数化，禁止字符串拼接
3. 后端端口固定 3141，数据库文件在容器内 `/data/n1.db`
4. Config PIN 默认值 `0000`，可通过环境变量 `CONFIG_PIN` 覆盖
5. 前端使用 `expo-crypto` 的 `randomUUID()`，与现有代码一致
6. 错误处理遵循 §14.2：网络失败静默降级，DB 操作失败 Toast

---

## Commit 1: N1 后端

### 1.1 `n1-server/` 目录结构

```
n1-server/
  Dockerfile
  package.json
  tsconfig.json
  .dockerignore
  src/
    index.ts          # Express 入口
    db.ts             # SQLite 初始化 + CRUD
    routes/
      config.ts        # POST /api/config/get, POST /api/config/set
      products.ts      # POST /api/products/sync, POST /api/products/push
```

### 1.2 `n1-server/package.json`

依赖：`express` `better-sqlite3` `body-parser` + devDeps `typescript` `@types/express` `@types/better-sqlite3` `tsx`

scripts:
- `build`: `tsc`
- `start`: `node dist/index.js`
- `dev`: `tsx src/index.ts`

### 1.3 `n1-server/Dockerfile`

- 基础镜像 `node:20-alpine`
- 安装 `python3 make g++`（better-sqlite3 编译需要）
- WORKDIR `/app`
- 复制 package.json → npm ci → 复制 src → npm run build
- EXPOSE 3141
- VOLUME `/data`
- CMD `node dist/index.js`

### 1.4 `n1-server/src/db.ts` — SQLite 层

```typescript
import Database from 'better-sqlite3';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || '/data';
const db = new Database(path.join(DATA_DIR, 'n1.db'));
db.pragma('journal_mode = WAL');

// 建表
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    barcode TEXT,
    category TEXT DEFAULT '',
    unit TEXT DEFAULT '个',
    imageUri TEXT,
    isDeleted INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_products_updated ON products(updatedAt);
`);

export default db;
```

### 1.5 `n1-server/src/routes/config.ts`

**POST /api/config/get**
- 请求体可为空
- 读取 config 表中 `apiUrl` `apiKey` `textModel` `visionModel`
- 返回 `{ apiUrl, apiKey, textModel, visionModel }`（存在则取值，不存在返回空字符串）

**POST /api/config/set**
- 请求体：`{ pin: string, apiUrl?: string, apiKey?: string, textModel?: string, visionModel?: string }`
- pin 校验：与环境变量 `CONFIG_PIN`（默认 `0000`）比较
- 不正确 → 403 `{ error: "invalid pin" }`
- 正确 → 逐字段 upsert 到 config 表，返回 200 `{ ok: true }`

### 1.6 `n1-server/src/routes/products.ts`

**POST /api/products/sync**
- 请求体：`{ after?: string }`（ISO 时间戳，返回该时间之后更新的商品）
- 不传 after → 返回所有未被删除的商品
- 传 after → 返回 `updatedAt >= after` 的所有商品（含已删除）
- 返回：`{ products: Product[], serverTime: string }`
- serverTime 为当前服务器 ISO 时间戳，客户端用它作下次 sync 的 after

**POST /api/products/push**
- 请求体：`{ changes: PushChange[] }`
- PushChange 类型：
  ```typescript
  interface PushChange {
    id: string;
    name: string;
    price: number;
    barcode?: string;
    category: string;
    unit: string;
    imageUri?: string;
    isDeleted: number;
    updatedAt: string;
  }
  ```
- 逐条处理：读取本地对应 id 的商品 → 若不存在 OR 传入的 updatedAt >= 本地 updatedAt 则 INSERT OR REPLACE
- 全部处理完后返回 `{ ok: true, count: number }`

### 1.7 `n1-server/src/index.ts` — Express 入口

- 监听端口 `process.env.PORT || 3141`
- `app.use(bodyParser.json())`
- 挂载 configRouter 和 productsRouter
- 健康检查 `GET /api/health → { ok: true }`

---

## Commit 2: 客户端同步引擎

### 2.1 `src/db/types.ts` (修改)

新增类型：

```typescript
export interface SyncStatus {
  lastSyncAt: string | null;     // ISO 时间戳
  lastPushAt: string | null;
  serverUrl: string | null;
  isConnected: boolean;
}

export interface PushChange {
  id: string;
  name: string;
  price: number;
  barcode: string | null;
  category: string;
  unit: string;
  imageUri: string | null;
  isDeleted: number;
  updatedAt: string;
}
```

### 2.2 `src/db/migrations/v3.ts` (新建)

```typescript
import { SQLiteDatabase } from 'expo-sqlite';

export async function migrate(db: SQLiteDatabase): Promise<void> {
  // products 表增加 updatedAt 列
  await db.execAsync(`
    ALTER TABLE products ADD COLUMN updatedAt TEXT;
    UPDATE products SET updatedAt = createdAt WHERE updatedAt IS NULL;
  `);
}
```

### 2.3 `src/services/n1.ts` (新建)

N1 API 客户端，封装四个端点调用：

```typescript
const DEFAULT_TIMEOUT = 5000;

async function request<T>(url: string, body: object): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
  try {
    const res = await fetch(url, {
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

export async function getConfig(serverUrl: string) { /* ... */ }
export async function setConfig(serverUrl: string, data: ConfigSetData) { /* ... */ }
export async function syncProducts(serverUrl: string, after?: string) { /* ... */ }
export async function pushProducts(serverUrl: string, changes: PushChange[]) { /* ... */ }
```

### 2.4 `src/services/sync.ts` (新建)

同步引擎，核心逻辑：

```typescript
import * as N1 from './n1';
import * as db from '../db/product';
import { getSyncStatus, setSyncStatus } from '../store/syncConfig';

/** 执行一次完整同步循环 */
export async function performSync(serverUrl: string): Promise<SyncResult> {
  // 1. 推送本地未同步变更
  const pending = await getPendingChanges();
  if (pending.length > 0) {
    await N1.pushProducts(serverUrl, pending);
    await markPushed(pending.map(p => p.id));
  }

  // 2. 拉取全量/增量
  const lastSync = getSyncStatus().lastSyncAt;
  const result = await N1.syncProducts(serverUrl, lastSync || undefined);

  // 3. 合并入库（按 §10.2 时间戳规则）
  for (const p of result.products) {
    const local = await db.getProductById(p.id);
    if (!local || new Date(p.updatedAt) >= new Date(local.updatedAt)) {
      await db.upsertProduct(p);
    }
  }

  // 4. 更新时间戳
  setSyncStatus({ lastSyncAt: result.serverTime });
  return { synced: result.products.length, pushed: pending.length };
}
```

**getPendingChanges**: 查询本地 `updatedAt > lastPushAt` 的商品，按 PushChange 格式返回
**markPushed**: 用传入的 id 列表把 lastPushAt 更新为当前时间（这些 id 对应商品的 pushed 标记）

### 2.5 `src/hooks/useNetworkDetection.ts` (新建)

```typescript
import { useState, useEffect, useCallback } from 'react';

export function useNetworkDetection(serverUrl: string | null, interval = 30000) {
  const [isConnected, setIsConnected] = useState(false);

  const check = useCallback(async () => {
    if (!serverUrl) { setIsConnected(false); return; }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${serverUrl}/api/health`, { signal: controller.signal });
      clearTimeout(timer);
      setIsConnected(res.ok);
    } catch {
      setIsConnected(false);
    }
  }, [serverUrl]);

  useEffect(() => {
    check();
    if (!serverUrl) return;
    const id = setInterval(check, interval);
    return () => clearInterval(id);
  }, [check, interval]);

  return isConnected;
}
```

### 2.6 `src/store/syncConfig.ts` (新建)

Zustand store：

```typescript
interface SyncConfigState {
  serverUrl: string | null;
  lastSyncAt: string | null;
  lastPushAt: string | null;
  isSyncing: boolean;
  setServerUrl: (url: string | null) => void;
  setSyncStatus: (status: { lastSyncAt?: string; lastPushAt?: string }) => void;
  setIsSyncing: (v: boolean) => void;
}
```

持久化到 AsyncStorage（使用 zustand persist middleware）。

---

## Commit 3: UI 集成

### 3.1 `src/components/SyncStatusIcon.tsx` (新建)

云图标组件，按 §10.6 规则渲染：

| 状态 | 图标 | 文字 |
|------|------|------|
| N1 已连接 | 绿色云图标 | 「已连接」 |
| N1 不可达 | 灰色云图标 | 「本地模式」 |
| WebDAV 模式 | 蓝色云图标 | 「WebDAV」 |

- 从 `syncConfig` store 读取 serverUrl
- 使用 `useNetworkDetection(serverUrl)` 获取连接状态
- 显示 `@expo/vector-icons` 的 Ionicons `cloud` / `cloud-offline` / `cloud-done` 图标
- WebDAV 模式判断：serverUrl 以 `dav://` 或 `webdav://` 开头

### 3.2 `src/screens/ConfigScreen.tsx` (新建)

配置中心页面，按 §10.7 结构：

```
┌──────────────────────────────┐
│  N1 服务地址                  │
│  [________________] (含端口)  │
│  [测试连接]  [立即同步]        │
│                              │
│  WebDAV 配置                  │
│  URL:   [________________]    │
│  账号:  [________________]    │
│  密码:  [________________]    │
│  [测试连接] [导出] [恢复]      │
│                              │
│  AI 配置                      │
│  API 地址: [________________]  │
│  Key:     [________________]  │
│  文本模型: [________________]  │
│  视觉模型: [________________]  │
│  N1 在线时自动拉取，此处可手动覆盖
└──────────────────────────────┘
```

- N1 地址默认值：`http://192.168.x.x:3141`
- 测试连接：调用 `/api/health`，显示结果（已连接/连接失败）
- 立即同步：调用 `performSync`，显示同步数量
- WebDAV 字段暂留空（Phase 5 实现）
- AI 配置字段暂留空（N1 模式从服务端拉取）

### 3.3 导航集成

- `ConfigScreen` 注册到导航的 `config` / `Config` 路由
- 顶栏标题栏右侧放置 `SyncStatusIcon`，点击进入配置中心
- `HomeScreen` 的 headerRight 使用 `SyncStatusIcon`

---

## Commit 4: 测试

### 4.1 `src/__tests__/sync.test.ts` (新建)

测试同步引擎：
- `getPendingChanges` 正确返回未推送商品
- `performSync` 推送后拉取，时间戳正确更新
- 冲突合并：N1 较新 → 覆盖本地；本地较新 → 保留本地
- 已删除商品在 sync 中正确标记

### 4.2 `src/db/__tests__/n1-client.test.ts` (新建)

测试 N1 API 客户端：
- syncProducts 正确解析返回格式
- pushProducts 构造正确的请求体
- 超时处理（5 秒后 abort）
- 非 200 响应的错误处理

### 4.3 `src/__tests__/config-flow.test.ts` (新建)

集成测试：
- 输入 N1 地址 → 测试连接 → 显示状态
- 立即同步 → 商品列表更新
- 离线 → 自动切换到本地模式
