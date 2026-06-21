# PStore MVP 施工级最小架构

> 配套 spec-v4.3 | 日期：2026-06-20
> 用途：施工指引，只保留运行必须结构，不含扩展设计

---

## 1. MVP Runtime 架构图

```
                 ┌──────────────────────────┐
                 │        UI Layer          │
                 │  React Native Screens    │
                 │                          │
                 │  - Search / Chat View    │
                 │  - Product Card View     │
                 │  - Cart Bottom Sheet     │
                 │  - Admin Panel           │
                 └──────────┬───────────────┘
                            │ ProductResult
                            ▼
                 ┌──────────────────────────┐
                 │     State Layer          │
                 │      Zustand Store       │
                 │                          │
                 │ - UI State               │
                 │ - Cart (memory only)     │
                 │ - Session Mode           │
                 └──────────┬───────────────┘
                            │
          ┌─────────────────┼──────────────────┐
          ▼                 ▼                  ▼
┌────────────────┐ ┌────────────────┐ ┌──────────────────┐
│ Input Adapter   │ │ Sync Engine    │ │ Product Engine   │
│                │ │                │ │                  │
│ - AI Adapter    │ │ N1 Sync Client │ │ SQLite Query     │
│ - Scan Adapter  │ │ WebDAV Backup  │ │ FTS Search       │
│ - Search Input  │ │                │ │ Price Calc       │
└───────┬────────┘ └───────┬────────┘ └────────┬─────────┘
        │                  │                    │
        └──────────┬───────┴──────────┬───────┘
                   ▼                  ▼
            ┌────────────────────────────────┐
            │        SQLite (WAL)            │
            │  Local Single Source of Truth  │
            └────────────────────────────────┘
```

**关键约束**：
- UI 不直接理解 AI / 扫码 / 搜索，只消费 ProductResult
- SQLite 是唯一本地真源
- N1 只是同步源，不参与 UI 决策
- Cart 纯内存

---

## 2. SQLite 最终表结构（MVP 版）

### 2.1 product（核心表）

```sql
CREATE TABLE product (
  id TEXT PRIMARY KEY,

  name TEXT NOT NULL,
  aliases TEXT,
  pinyin TEXT,

  searchText TEXT,   -- FTS input
  price REAL NOT NULL,
  spec TEXT,

  imageUri TEXT,
  barcode TEXT,

  category TEXT,

  status TEXT,       -- IN_SHOP / OUT_OF_STOCK / TO_BE_PURCHASED

  isDeleted INTEGER DEFAULT 0,

  updatedAt TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
```

### 2.2 product_fts（关键）

```sql
CREATE VIRTUAL TABLE product_fts USING fts5(
  id,
  searchText,
  name,
  aliases
);
```

写入规则：
- product insert/update → 同步更新 FTS
- searchText = 中文单字拆分

### 2.3 price_history

```sql
CREATE TABLE price_history (
  id TEXT PRIMARY KEY,
  productId TEXT,
  oldPrice REAL,
  newPrice REAL,
  changedAt TEXT
);
```

### 2.4 pending_item（扫描兜底）

```sql
CREATE TABLE pending_item (
  id TEXT PRIMARY KEY,
  barcode TEXT UNIQUE,
  scannedAt TEXT
);
```

---

## 3. 本地状态模型（UI 运行核心）

### 3.1 Zustand Store（最小集合）

```typescript
type AppState = {
  mode: "NORMAL" | "ADMIN";

  sessionQuery: string;

  cart: CartItem[];   // memory only

  ui: {
    loading: boolean;
    error?: string;
  };

  sync: {
    status: "N1" | "LOCAL" | "WEB_DAV";
    lastSyncAt?: string;
  };
};
```

### 3.2 ProductResult（唯一 UI 输入）

```typescript
type ProductResult = {
  source: "AI" | "SCAN" | "SEARCH";

  product: Product;

  confidence?: number;

  raw?: any;
};
```

---

## 4. 同步流

### 4.1 总体原则

| 角色 | 说明 |
|------|------|
| N1 | 权威源 |
| Local SQLite | 工作副本 |
| WebDAV | 冷备份 |

### 4.2 写入流

**本地写入**：
```
UI 操作
  → SQLite write
  → mark dirty queue
```

**同步到 N1**：
```
local dirty queue
  → push to N1 API
  → N1 apply (updatedAt 判断)
  → success → clear queue
```

**拉取 N1**：
```
app start / reconnect
  → fetch /products/sync
  → diff by updatedAt
  → overwrite local
```

### 4.3 冲突规则（简化版）

单店单人场景下，弹窗逐个抉择没必要，直接按时间戳自动覆盖：

```
if (N1.updatedAt > local.updatedAt)
    use N1
else
    keep local
```

无字段级 merge。如果后续出现多设备需求再考虑手动抉择。

### 4.4 WebDAV 流（冷备）

```
export:
  manual trigger
  → export sqlite snapshot
  → upload file

restore:
  download snapshot
  → integrity_check
  → replace DB
```

### 4.5 同步状态机

```
OFFLINE LOCAL ONLY
   ↓
CONNECTING N1
   ↓
SYNCING PUSH
   ↓
SYNCING PULL
   ↓
SYNCED
```

---

## 5. UI 状态机（三层模型）

### L1：输入层（Input State）

```
IDLE
  ↓
USER_INPUT (text / scan / voice / ai)
  ↓
RESOLVED_PRODUCT_RESULT
```

职责：接收输入 → 转换 ProductResult

### L2：展示层（Display State）

```
PRODUCT_LIST
   ↓
PRODUCT_DETAIL_CARD
   ↓
CONFIRM_ADD
```

规则：所有输入最终都变成 product card，UI 不关心来源

### L3：购物车层（Cart State）

```
EMPTY
  ↓ add
ACTIVE
  ↓ remove
EMPTY
```

特点：memory only，无持久化，无复杂分支

### UI 三层合并图

```
        INPUT LAYER
(AI / Scan / Search / Voice)
              ↓
      ProductResult (唯一入口)
              ↓
        DISPLAY LAYER
   Card → Confirm → List
              ↓
         CART LAYER
     Memory-only basket
```

---

## 6. MVP 运行闭环

```
输入
 ↓
ProductResult Adapter
 ↓
SQLite 查询/写入
 ↓
UI Card 渲染
 ↓
加购（内存）
 ↓
结账展示
 ↓
清空
```

---

## 7. 开发启动结论

- 无架构分支
- 无分布式复杂度
- 无支付/订单域
- 无多设备一致性
- 无学习型系统
- UI 状态 ≤ 3 层
- 数据模型稳定

**施工结论**：现在是标准 RN CRUD + 本地数据库 + 简单同步 + UI 状态机工程，可以直接开工。

