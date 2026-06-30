# Phase 5 开发计划：WebDAV 备份恢复

> 基于 spec-v4.5 §10（三层数据策略）、architecture-mvp §4.4
> 基准 commit: Phase 4 完成后的 HEAD
> 工作流: 按 commit 顺序执行 → 每个 commit 完成后 `git commit` → 进入下一个

---

## 提交信息格式

```
phase5-<n>: <简短描述>
```

---

## 文件清单

| Commit | 新建 | 修改 |
|--------|------|------|
| C1 WebDAV 工具层 | `src/services/webdav.ts`, `src/services/backup/snapshot.ts`, `src/services/backup/validate.ts`, `src/services/credential.ts` | — |
| C2 备份恢复引擎 | `src/services/backup/export.ts`, `src/services/backup/restore.ts`, `src/services/backup/recovery.ts` | `src/db/init.ts` |
| C3 UI 集成 | `src/components/WebDAVConfig.tsx`, `src/components/RecoveryProgress.tsx` | `src/screens/ConfigScreen.tsx`, `src/components/SyncStatusIcon.tsx` |
| C4 测试 | `src/__tests__/webdav.test.ts`, `src/__tests__/backup.test.ts`, `src/__tests__/config-webdav.test.ts` | — |

---

## 实现要点

### 通用约束（所有 commit 遵守）

1. spec-v4.5 §10.1 / §10.3 / §10.7 是唯一权威，代码必须逐字对齐
2. WebDAV 凭据（账号、密码）必须加密存储（§15），使用 `expo-secure-store`
3. WebDAV 定位为手/动冷备份，不参与实时同步，不与 N1 引擎耦合
4. 备份文件命名格式：`pstore-backup-{ISO_TIMESTAMP}.db`
5. 恢复前必须校验备份文件完整性（能打开、表结构完整），校验通过才覆盖本地数据库
6. 错误处理遵循 §14.2：网络失败静默降级，DB 操作失败 Toast，崩溃恢复静默自动执行
7. 所有 WebDAV 操作使用 `webdav` npm 包（`npm: webdav`）的 v5 客户端

---

## Commit 1: WebDAV 工具层

### 1.1 `src/services/credential.ts` — 凭据加密存储

```typescript
import * as SecureStore from 'expo-secure-store';

const KEYS = {
  webdavUrl: 'pstore_webdav_url',
  webdavUsername: 'pstore_webdav_username',
  webdavPassword: 'pstore_webdav_password',
} as const;

export async function getWebDAVCredentials(): Promise<{
  url: string | null;
  username: string | null;
  password: string | null;
}>

export async function setWebDAVCredentials(
  url: string,
  username: string,
  password: string
): Promise<void>

export async function clearWebDAVCredentials(): Promise<void>
```

- 使用 `SecureStore.setItemAsync` / `getItemAsync` / `deleteItemAsync`
- url 去除末尾 `/`，统一格式 `https://host/path`

### 1.2 `src/services/webdav.ts` — WebDAV 客户端

```typescript
import { createClient, type WebDAVClient } from 'webdav';

const BACKUP_DIR = '/pstore-backups';

function getClient(): WebDAVClient {
  // 从 SecureStore 读取凭据 → createClient(url, { username, password })
}

/** 测试连接：列出根目录，返回可达状态 */
export async function testConnection(): Promise<{
  ok: boolean;
  error?: string;
}>

/** 上传文件到 WebDAV */
export async function uploadBackup(
  localPath: string,
  remoteFileName: string
): Promise<{ ok: boolean; remotePath?: string; error?: string }>

/** 下载备份文件到本地临时目录 */
export async function downloadBackup(
  remoteFileName: string
): Promise<{ ok: boolean; localPath?: string; error?: string }>

/** 列出备份目录下所有 .db 文件，按时间倒序 */
export async function listBackups(): Promise<
  { name: string; size: number; lastModified: string }[]
>

/** 确保备份目录存在（不存在则创建） */
async function ensureBackupDir(): Promise<void>
```

- `createClient` 使用 `webdav` 包 v5 API
- 上传/下载超时 30s（备份文件可能较大）
- `listBackups` 过滤仅 `.db` 文件，按 `lastModified` 降序
- `BACKUP_DIR` 为 WebDAV 服务端目录，不存在时自动创建

### 1.3 `src/services/backup/snapshot.ts` — SQLite 快照导出

```typescript
import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

/** 导出当前 SQLite 数据库为快照文件 */
export async function exportSnapshot(
  outputPath?: string
): Promise<{ ok: boolean; snapshotPath?: string; error?: string }>

/** 获取当前数据库文件的路径 */
export function getDatabasePath(): string
```

- 复制当前 SQLite 文件到临时目录（使用 `FileSystem.copyAsync`）
- 执行 `PRAGMA wal_checkpoint(TRUNCATE)` 确保 WAL 内容写入主文件
- 输出文件路径默认：`FileSystem.cacheDirectory + 'pstore-snapshot-' + Date.now() + '.db'`
- 返回快照文件绝对路径

### 1.4 `src/services/backup/validate.ts` — 备份完整性校验

```typescript
import * as SQLite from 'expo-sqlite';

/** 校验备份文件完整性 */
export async function validateBackup(
  filePath: string
): Promise<{
  ok: boolean;
  error?: string;
  tableCount?: number;
  productCount?: number;
}>
```

校验流程（§10.3）：

1. 打开文件：`SQLite.openDatabaseAsync(filePath)`
2. 执行 `PRAGMA integrity_check`，必须返回 `"ok"`
3. 检查表结构：验证 `product` / `price_history` / `pending_item` 三张核心表存在
4. 检查 product 表行数（> 0 才算有效备份，空库备份拒绝）
5. 关闭数据库连接，返回校验结果

---

## Commit 2: 备份恢复引擎

### 2.1 `src/services/backup/export.ts` — 导出备份流程

```typescript
import * as FileSystem from 'expo-file-system';

export interface ExportResult {
  ok: boolean;
  remotePath?: string;
  snapshotPath?: string;
  error?: string;
}

/** 完整导出备份流程：快照 → 上传 → 清理本地临时快照 */
export async function exportToWebDAV(): Promise<ExportResult>
```

流程：

1. 调用 `exportSnapshot()` 导出本地快照
2. 生成远程文件名：`pstore-backup-{ISO_TIMESTAMP}.db`（如 `pstore-backup-2026-06-22T14-30-00.db`，冒号替换为横杠避免文件系统兼容问题）
3. 调用 `webdav.uploadBackup(snapshotPath, remoteFileName)`
4. 上传成功后删除本地临时快照
5. 上传失败保留本地快照（用户可手动处理）

### 2.2 `src/services/backup/restore.ts` — 恢复流程

```typescript
export interface RestoreResult {
  ok: boolean;
  sourceFileName?: string;
  productCount?: number;
  error?: string;
}

/** 从 WebDAV 恢复：列出备份 → 选最近备份 → 下载 → 校验 → 覆盖 */
export async function restoreFromWebDAV(
  remoteFileName?: string
): Promise<RestoreResult>

/** 从本地快照文件恢复（崩溃恢复场景） */
export async function restoreFromLocal(filePath: string): Promise<RestoreResult>
```

`restoreFromWebDAV` 流程：

1. 若不传 `remoteFileName` → `listBackups()` 获取备份列表，取最近一份（按时间降序第一项）
2. 若列表为空 → 返回失败
3. `downloadBackup(remoteFileName)` 下载到临时目录
4. `validateBackup(downloadedPath)` 校验完整性
5. 校验失败 → 删除临时文件，返回失败
6. 校验通过 → 关闭当前数据库连接 → `FileSystem.copyAsync({ from: downloadedPath, to: dbPath })` 覆盖
7. 删除临时下载文件，返回成功

**恢复前用户确认**：此函数被 UI 层调用前，UI 层负责弹窗确认（"将覆盖当前所有数据，是否继续？"）。引擎层不做二次确认。

### 2.3 `src/services/backup/recovery.ts` — 崩溃恢复

```typescript
export interface RecoveryResult {
  recovered: boolean;
  source: 'N1' | 'WEBDAV' | 'empty' | 'none';
  message: string;
}

/** App 启动时调用：检测数据库完整性 → 必要时自动恢复 */
export async function performRecovery(
  n1Available: boolean
): Promise<RecoveryResult>
```

恢复优先级（§10.3）：

```
PRAGMA integrity_check
  ├─ ok → 正常启动（recovered=false, source='none'）
  └─ 失败
       ├─ N1 可达 → 静默自动从 N1 全量拉取恢复
       ├─ N1 不可达 → restoreFromWebDAV()
       └─ 两者均失败 → 删除损坏 DB，新建空库
```

- N1 可达时走 `sync.performSync(serverUrl)` 全量拉取（复用 Phase 4 引擎）
- WebDAV 恢复时走 `restoreFromWebDAV()` 取最近备份
- 最后兜底：`FileSystem.deleteAsync(dbPath)` + 重新执行 `init.ts` 建库
- 恢复成功后通知用户（Toast）："数据已从云端恢复" / "数据已从 WebDAV 备份恢复" / "数据已损坏，已创建空数据库"（对应三种路径）
- 整个过程静默自动，不弹窗问用户操作路径

### 2.4 `src/db/init.ts` (修改)

在 `initDatabase()` 函数启动流程中插入崩溃恢复：

```typescript
export async function initDatabase(): Promise<SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('pstore.db');
  await db.execAsync('PRAGMA journal_mode = WAL');

  // 崩溃恢复（Phase 5 新增）
  const recoveryResult = await performRecovery(/* n1Available */);
  if (recoveryResult.recovered) {
    showToast(recoveryResult.message);
  }

  // 原有 schema 迁移逻辑...
  await runMigrations(db);
  return db;
}
```

---

## Commit 3: UI 集成

### 3.1 `src/screens/ConfigScreen.tsx` (修改)

补全 Phase 4 中留空的 WebDAV 配置区域（§10.7），替换占位文字为完整交互组件：

```
┌──────────────────────────────┐
│  WebDAV 配置                  │
│                              │
│  地址:   [________________]  │  ← 必填，placeholder: https://example.com/webdav
│  账号:   [________________]  │  ← 必填
│  密码:   [________________]  │  ← 必填，secureTextEntry
│                              │
│  状态:   ● 已连接  /  ○ 未配置│  ← 动态文本
│                              │
│  [测试连接]                   │  ← 按钮
│  [导出备份]  [从备份恢复]      │  ← 按钮
└──────────────────────────────┘
```

**交互逻辑**：

- **字段编辑**：仅在管理模式（`mode === 'ADMIN'`）下可编辑，普通模式只读
- **测试连接**：
  - 点击 → 调 `webdav.testConnection()`
  - 成功 → Toast "WebDAV 连接成功"，状态变绿色
  - 失败 → Toast "连接失败：{error}"
- **导出备份**：
  - 仅在管理模式可用
  - 点击 → 调 `exportToWebDAV()`
  - 进行中显示 loading（按钮文字变「导出中…」+ ActivityIndicator）
  - 成功 → Toast "备份已导出至 WebDAV（{文件名}）"
  - 失败 → Toast "导出失败：{error}"
- **从备份恢复**：
  - 仅在管理模式可用
  - 点击 → 弹确认框（"将覆盖当前所有数据，是否继续？"）
  - 确认 → 调 `restoreFromWebDAV()`
  - 成功 → Toast "数据已从备份恢复（共 N 件商品）"，建议重启 App
  - 失败 → Toast "恢复失败：{error}"
- WebDAV 凭据变更后自动保存到 SecureStore（失去焦点时触发）

### 3.2 `src/components/WebDAVConfig.tsx` (新建)

抽离 WebDAV 配置区为独立组件，供 ConfigScreen 引用：

```typescript
interface WebDAVConfigProps {
  editable: boolean; // 管理模式为 true
}
```

组件职责：
- 管理 WebDAV 地址/账号/密码三个 TextInput
- 管理连接状态 state（`untested` / `connected` / `failed`）
- 管理导出/恢复操作的 loading state
- 所有副作用（存储凭据、测试连接、导出、恢复）通过内部函数封装

### 3.3 `src/components/SyncStatusIcon.tsx` (修改)

完善 WebDAV 模式的判断和展示（Phase 4 已有骨架）：

- 读取 `syncConfig` store 的 `serverUrl` 和 WebDAV 凭据
- 判断逻辑：
  - N1 已配置且可达 → 绿色云 + 「已连接」
  - WebDAV 已配置且 N1 不可达/未配置 → 蓝色云 + 「WebDAV」
  - 两者均未配置或均不可达 → 灰色云 + 「本地模式」
- WebDAV 模式检测：从 SecureStore 中读取 `pstore_webdav_url`，非空即判定为已配置 WebDAV

### 3.4 `src/components/RecoveryProgress.tsx` (新建)

崩溃恢复的启动加载遮罩组件（可选，仅在恢复耗时较长时展示）：

```typescript
interface RecoveryProgressProps {
  visible: boolean;
  source: 'N1' | 'WEBDAV' | 'empty';
  message: string;
}
```

- 半透明遮罩 + 居中卡片
- 显示恢复来源图标（N1 云 / WebDAV 文件夹 / 空数据库图标）
- 显示恢复进度文字（如「正在从 WebDAV 恢复数据…」）
- App 正常启动时 `visible=false`，不展示

---

## Commit 4: 测试

### 4.1 `src/__tests__/webdav.test.ts` (新建)

测试 WebDAV 客户端：

- `testConnection` 对可达 WebDAV 返回 `{ ok: true }`
- `testConnection` 对不可达地址返回 `{ ok: false, error }`
- `uploadBackup` 成功上传后 `listBackups` 可查到对应文件
- `downloadBackup` 下载后本地文件存在且大小 > 0
- `listBackups` 返回结果按时间倒序
- `listBackups` 过滤非 .db 文件
- 超时处理（30s 后 abort）

### 4.2 `src/__tests__/backup.test.ts` (新建)

测试备份恢复引擎：

- `exportSnapshot` 生成的文件存在且大小 > 0
- `validateBackup` 对有效备份返回 `{ ok: true, productCount > 0 }`
- `validateBackup` 对损坏文件返回 `{ ok: false }`
- `validateBackup` 对空库备份（product 表为空）返回 `{ ok: false }`
- `restoreFromWebDAV` 覆盖后商品数量与备份一致
- `performRecovery` 三种路径切换正确（N1 可用 / 仅 WebDAV / 均不可用）
- 恢复后 WAL 模式已重新启用

### 4.3 `src/__tests__/config-webdav.test.ts` (新建)

集成测试：

- 输入 WebDAV 地址/账号/密码 → 测试连接 → 显示连接状态
- WebDAV 凭据保存 → 重启 App 后凭据仍在 SecureStore
- 导出备份 → WebDAV 服务端出现对应 .db 文件
- 从备份恢复 → 本地商品数据与备份一致
- 普通模式下字段只读不可编辑
- 管理模式外按钮不可点击（导出/恢复按钮 disabled 或隐藏）

---

## 验收标准

### C1: WebDAV 工具层

| # | 标准 |
|---|------|
| 1 | `setWebDAVCredentials` 后凭据加密存储于 SecureStore |
| 2 | `testConnection` 能正确判断目标 WebDAV 是否可达 |
| 3 | `uploadBackup` 成功上传后目标文件存在于远程 |
| 4 | `downloadBackup` 下载的文件与上传内容一致（hash 比对） |
| 5 | `exportSnapshot` 生成完整 SQLite 副本，WAL 已 checkpoint |
| 6 | `validateBackup` 正确识别有效/损坏/空库三种情况 |

### C2: 备份恢复引擎

| # | 标准 |
|---|------|
| 1 | `exportToWebDAV` 完整走通快照→上传→清理流程 |
| 2 | `restoreFromWebDAV` 恢复后本地数据库商品数量与备份一致 |
| 3 | `performRecovery` 在数据库损坏时按 N1 → WebDAV → 空库优先级自动恢复 |
| 4 | 恢复过程静默自动，不弹窗问用户操作路径 |
| 5 | 恢复成功后 Toast 通知用户结果 |

### C3: UI 集成

| # | 标准 |
|---|------|
| 1 | ConfigScreen WebDAV 区域可输入地址/账号/密码 |
| 2 | 测试连接按钮正确反馈连接状态 |
| 3 | 导出备份按钮完成完整导出流程并 Toast 通知 |
| 4 | 从备份恢复按钮弹出确认框后完成恢复 |
| 5 | 普通模式下 WebDAV 字段只读 |
| 6 | SyncStatusIcon 在 WebDAV 模式下显示蓝色云 + 「WebDAV」 |
| 7 | WebDAV 凭据在 App 重启后依然存在 |

### C4: 测试

| # | 标准 |
|---|------|
| 1 | 所有单元测试通过（webdav / backup / config 三套） |
| 2 | 测试覆盖核心路径 + 边界条件（空库/损坏/网络不可达） |

---

## 与其他 Phase 的关系

| 依赖方向 | 说明 |
|----------|------|
| Phase 4 → Phase 5 | ConfigScreen 的 WebDAV 区域在 Phase 4 中留空，Phase 5 补全 |
| Phase 5 → Phase 4 | 崩溃恢复流程中 N1 可用时复用 Phase 4 的 `performSync` 全量拉取 |
| Phase 5 独立 | WebDAV 凭据加密、快照导出、备份校验为独立模块，不与 N1 耦合 |
| 三层数据策略 | Phase 4 实现第 ① 层（N1）、Phase 5 实现第 ③ 层（WebDAV），第 ② 层（本地 SQLite）在 Phase 1-3 已完成 |
