# Phase 5 WebDAV 备份恢复 — 文档 vs 代码功能对照报告

> 生成日期：2026-06-22
> 基准文档：spec-v4.5 §10（三层数据策略）、plan-phase5.md
> 检查范围：C1 工具层 / C2 引擎层 / C3 UI 集成 / C4 测试（12 个代码文件）

---

## 需求来源提取

### spec-v4.5 §10 中 WebDAV 相关需求条目

| # | 来源 | 需求描述 |
|---|------|---------|
| R1 | §10.1 | WebDAV 手动触发，始终可配置，用作数据备份与恢复，不参与实时同步 |
| R2 | §10.3 | App 启动时执行 `PRAGMA integrity_check` |
| R3 | §10.3 | 数据库损坏且 N1 可达 → 静默自动从 N1 全量拉取恢复 |
| R4 | §10.3 | 数据库损坏且 N1 不可达 → 自动从 WebDAV 最近备份恢复 |
| R5 | §10.3 | 两者均不可达 → 新建空库并告知用户 |
| R6 | §10.3 | WebDAV 恢复前校验文件（能打开、表结构完整），通过才覆盖本地数据库 |
| R7 | §10.6 | N1 已连接 → 绿色云 +「已连接」；N1 不可达 → 灰色云 +「本地模式」；WebDAV → 蓝色云 |
| R8 | §10.7 | 配置中心含 WebDAV 配置：URL / 账号 / 密码 / 测试连接 / 导出 / 恢复，始终可配置 |
| R9 | §15 | 所有远程凭据加密存储（AI Key、WebDAV 密码） |
| R10 | §14.2 | 崩溃恢复静默自动执行；网络失败静默降级；DB 操作失败 Toast |

### plan-phase5.md 功能点提取

| # | Commit | 功能点 |
|---|--------|--------|
| F1 | C1 | 凭据加密存储（get/set/clear WebDAV 凭据，SecureStore） |
| F2 | C1 | WebDAV 客户端（createClient v5、testConnection、uploadBackup、downloadBackup、listBackups、ensureBackupDir） |
| F3 | C1 | SQLite 快照导出（WAL checkpoint、VACUUM INTO、生成快照文件） |
| F4 | C1 | 备份完整性校验（integrity_check + 核心表存在检查 + 行数检查） |
| F5 | C2 | 导出备份完整流程（快照 → 上传 → 清理临时文件） |
| F6 | C2 | 从 WebDAV 恢复（列表 → 取最近 → 下载 → 校验 → 覆盖 → 重启用 WAL） |
| F7 | C2 | 从本地快照恢复（校验 → 覆盖 → 重启用 WAL） |
| F8 | C2 | 崩溃自动恢复（三路径优先级：N1 → WebDAV → 空库） |
| F9 | C2 | init.ts 集成崩溃恢复（在 initDatabase 中调用 performRecovery） |
| F10 | C3 | ConfigScreen 补全 WebDAV 区域（地址/账号/密码/测试连接/导出/恢复） |
| F11 | C3 | WebDAVConfig 独立组件（状态管理、loading、编辑权限控制） |
| F12 | C3 | SyncStatusIcon 蓝色云 +「WebDAV」模式判断 |
| F13 | C3 | RecoveryProgress 恢复遮罩组件（N1/WebDAV/空库三态） |
| F14 | C4 | webdav.test.ts（连接/上传/下载/列表/超时） |
| F15 | C4 | backup.test.ts（快照/校验/恢复/崩溃恢复路径） |
| F16 | C4 | config-webdav.test.ts（凭据持久化/导出恢复/权限控制） |

---

## 详细逐项对照

### Commit 1: WebDAV 工具层

#### 1.1 credential.ts → F1

| 检查项 | 计划要求 | 代码实际 | 状态 |
|--------|---------|---------|------|
| getWebDAVCredentials() | 返回 {url, username, password} | 完全匹配，并行读取 SecureStore | ✅ 已实现 |
| setWebDAVCredentials() | 存储三项凭据 | 完全匹配，URL 去末尾 `/` | ✅ 已实现 |
| clearWebDAVCredentials() | 清空三项 | 完全匹配 | ✅ 已实现 |
| KEYS 常量 | `pstore_webdav_url/username/password` | 完全匹配，`as const` | ✅ 已实现 |
| SecureStore API | `setItemAsync/getItemAsync/deleteItemAsync` | 完全匹配 | ✅ 已实现 |

#### 1.2 webdav.ts → F2

| 检查项 | 计划要求 | 代码实际 | 状态 |
|--------|---------|---------|------|
| createClient | webdav v5 API | 完全匹配 | ✅ 已实现 |
| getClient() | 从 SecureStore 读凭据创建客户端 | 完全匹配 | ✅ 已实现 |
| testConnection() | 列根目录，返回 {ok, error?} | 列根目录 + ensureBackupDir（含写权限验证），超时 30s | ✅ 已实现（优于计划） |
| uploadBackup() | Base64 编码上传 | 完全匹配 | ✅ 已实现 |
| downloadBackup() | 下载到临时目录，验证非空 | 完全匹配 | ✅ 已实现 |
| listBackups() | 过滤 .db 文件，按时间倒序 | 完全匹配 | ✅ 已实现 |
| ensureBackupDir() | 不存在则创建 | 完全匹配 | ✅ 已实现 |
| 超时控制 | 30s | 完全匹配（withTimeout 包装） | ✅ 已实现 |
| BACKUP_DIR | `/pstore-backups` | 完全匹配 | ✅ 已实现 |

#### 1.3 snapshot.ts → F3

| 检查项 | 计划要求 | 代码实际 | 状态 |
|--------|---------|---------|------|
| exportSnapshot() | 快照导出 | 完全匹配 | ✅ 已实现 |
| WAL checkpoint | `PRAGMA wal_checkpoint(TRUNCATE)` | 完全匹配 | ✅ 已实现 |
| 输出路径 | cacheDirectory + 时间戳 | 完全匹配 | ✅ 已实现 |
| 导出方式 | `FileSystem.copyAsync`（计划） | `VACUUM INTO`（代码更优，不依赖物理路径） | ✅ 已实现（优于计划） |
| 验证非空 | 检查文件存在且大小>0 | 完全匹配 | ✅ 已实现 |

#### 1.4 validate.ts → F4

| 检查项 | 计划要求 | 代码实际 | 状态 |
|--------|---------|---------|------|
| validateBackup() | 多层次校验 | 完全匹配 | ✅ 已实现 |
| integrity_check | 必须返回 "ok" | 完全匹配 | ✅ 已实现 |
| 核心表检查 | product / price_history / pending_item | product / price_history / pending_items（代码用复数 `pending_items` 与 spec-v4.5 §5.3 一致，计划有笔误） | ✅ 已实现 |
| 行数检查 | product 表 count > 0 | 完全匹配 | ✅ 已实现 |
| 关闭连接 | finally 中 close | 完全匹配 | ✅ 已实现 |

---

### Commit 2: 备份恢复引擎

#### 2.1 export.ts → F5

| 检查项 | 计划要求 | 代码实际 | 状态 |
|--------|---------|---------|------|
| exportToWebDAV() | 完整导出流程 | 完全匹配 | ✅ 已实现 |
| 流程步骤 | 快照 → 上传 → 清理 | 完全匹配，增加凭据预检查 | ✅ 已实现（优于计划） |
| 文件命名 | `pstore-backup-{ISO_TIMESTAMP}.db`，冒号替换横杠 | 完全匹配 | ✅ 已实现 |
| 成功清理 | 删除本地临时快照 | 完全匹配（idempotent 删除） | ✅ 已实现 |
| 失败保留 | 保留本地快照 | 完全匹配（返回 snapshotPath） | ✅ 已实现 |

#### 2.2 restore.ts → F6, F7

| 检查项 | 计划要求 | 代码实际 | 状态 |
|--------|---------|---------|------|
| restoreFromWebDAV() | 从 WebDAV 恢复 | 完全匹配 | ✅ 已实现 |
| 不指定文件名 | 自动取最近备份 | 完全匹配（listBackups → [0]） | ✅ 已实现 |
| 列表为空 | 返回失败 | 完全匹配 | ✅ 已实现 |
| 下载 → 校验 → 覆盖 | 完整流程 | 完全匹配 | ✅ 已实现 |
| 校验失败 | 删除临时文件 | 完全匹配 | ✅ 已实现 |
| 覆盖前关闭连接 | 避免文件锁冲突 | 完全匹配 | ✅ 已实现 |
| 恢复后启用 WAL | `PRAGMA journal_mode = WAL` | 完全匹配 | ✅ 已实现 |
| restoreFromLocal() | 本地快照恢复 | 完全匹配 | ✅ 已实现 |
| UI 层确认 | 引擎不做二次确认 | 完全匹配 | ✅ 已实现 |

#### 2.3 recovery.ts → F8

| 检查项 | 计划要求 | 代码实际 | 状态 |
|--------|---------|---------|------|
| performRecovery(n1Available) | 启动恢复入口 | 完全匹配 | ✅ 已实现 |
| integrity_check | 完好 → recovered=false | 完全匹配 | ✅ 已实现 |
| N1 可达路径 | 全量拉取恢复 | 完全匹配（复用 Phase 4 performSync） | ✅ 已实现 |
| WebDAV 路径 | 取最近备份恢复 | 完全匹配 | ✅ 已实现 |
| 空库兜底 | 新建空库 | 完全匹配 | ✅ 已实现 |
| 静默自动 | 不弹窗 | 完全匹配 | ✅ 已实现 |
| 清理伴生文件 | WAL/SHM 文件 | 完全匹配（cleanupCompanionFiles） | ✅ 已实现 |
| 恢复后 Toast | 三种消息 | 完全匹配，通过 onRecoveryMsg 回调传递 | ✅ 已实现 |

#### 2.4 init.ts → F9

| 检查项 | 计划要求 | 代码实际 | 状态 |
|--------|---------|---------|------|
| initDatabase 中调用恢复 | 启动流程插入崩溃恢复 | 完全匹配 | ✅ 已实现 |
| n1Available 参数 | 控制 N1 恢复路径 | 完全匹配 | ✅ 已实现 |
| onRecoveryMsg 回调 | Toast 通知 | 代码增加回调参数，比计划更灵活 | ✅ 已实现（优于计划） |
| 恢复在前，迁移在后 | 避免文件锁冲突 | 代码先恢复后 openAndMigrate，比计划更安全 | ✅ 已实现（优于计划） |
| openAndMigrate 拆分 | 供 recovery 内部复用 | 完全匹配 | ✅ 已实现 |

---

### Commit 3: UI 集成

#### 3.1 ConfigScreen.tsx → F10

| 检查项 | 计划要求 | 代码实际 | 状态 |
|--------|---------|---------|------|
| WebDAV 区域存在 | 替换占位文字 | 引用 WebDAVConfig 组件 | ✅ 已实现 |
| 管理模式控制 | 仅管理模式可编辑 | 通过 `editable={isManagement}` 控制 | ✅ 已实现 |
| N1 测试连接 | 存在 | 完全匹配 | ✅ 已实现 |
| N1 立即同步 | 存在 | 完全匹配 | ✅ 已实现 |

#### 3.2 WebDAVConfig.tsx → F11

| 检查项 | 计划要求 | 代码实际 | 状态 |
|--------|---------|---------|------|
| 地址/账号/密码 TextInput | 三个输入框 | 完全匹配 | ✅ 已实现 |
| 密码 secureTextEntry | 隐藏输入 | 完全匹配 | ✅ 已实现 |
| 连接状态 | untested / connected / failed | 完全匹配 | ✅ 已实现 |
| 测试连接按钮 | loading 状态 + Toast 反馈 | 完全匹配 | ✅ 已实现 |
| 导出备份按钮 | loading 状态 + Toast 反馈 | 完全匹配 | ✅ 已实现 |
| 从备份恢复按钮 | Alert 确认弹窗 | 完全匹配，"将覆盖当前所有数据，是否继续？" | ✅ 已实现 |
| 恢复后提示重启 | Alert 建议重启 | 完全匹配 | ✅ 已实现 |
| 凭据自动保存 | 失去焦点时触发 | 测试连接/导出/恢复前均保存 | ✅ 已实现（优于计划） |
| 加载已保存凭据 | useEffect 初始化 | 完全匹配 | ✅ 已实现 |
| editable 控制只读 | 普通模式不可编辑 | TextInput editable + 按钮 disabled | ✅ 已实现 |

#### 3.3 SyncStatusIcon.tsx → F12

| 检查项 | 计划要求 | 代码实际 | 状态 |
|--------|---------|---------|------|
| 绿色云 | N1 已配置且可达 → cloud-done 绿色 +「已连接」 | 完全匹配 | ✅ 已实现 |
| 蓝色云 | WebDAV 已配置 → cloud 蓝色 +「WebDAV」 | 完全匹配 | ✅ 已实现 |
| 灰色云 | 均未配置/不可达 → cloud-offline 灰色 +「本地模式」 | 完全匹配 | ✅ 已实现 |
| WebDAV 检测 | 从 SecureStore 读 pstore_webdav_url | 完全匹配 | ✅ 已实现 |
| useFocusEffect | 每次聚焦重读状态 | 完全匹配 | ✅ 已实现 |

#### 3.4 RecoveryProgress.tsx → F13

| 检查项 | 计划要求 | 代码实际 | 状态 |
|--------|---------|---------|------|
| Modal 遮罩 | 半透明遮罩 + 居中卡片 | 完全匹配 | ✅ 已实现 |
| N1 图标 | cloud-done 绿色 | 完全匹配 | ✅ 已实现 |
| WebDAV 图标 | folder-open 蓝色 | 完全匹配 | ✅ 已实现 |
| empty 图标 | cube 灰色 | 完全匹配 | ✅ 已实现 |
| ActivityIndicator | 加载动画 | 完全匹配 | ✅ 已实现 |
| visible=false 不展示 | 正常启动隐藏 | 完全匹配 | ✅ 已实现 |

---

### Commit 4: 测试

#### 4.1 webdav.test.ts → F14

| 检查项 | 计划要求 | 代码实际 | 状态 |
|--------|---------|---------|------|
| testConnection 可达/不可达 | 两项测试 | 文件不存在 | ❌ 未实现 |
| uploadBackup → listBackups | 上传后列表验证 | 文件不存在 | ❌ 未实现 |
| downloadBackup 验证 | 文件存在且大小>0 | 文件不存在 | ❌ 未实现 |
| listBackups 排序 | 时间倒序 | 文件不存在 | ❌ 未实现 |
| listBackups 过滤 | 仅 .db 文件 | 文件不存在 | ❌ 未实现 |
| 超时处理 | 30s abort | 文件不存在 | ❌ 未实现 |

#### 4.2 backup.test.ts → F15

| 检查项 | 计划要求 | 代码实际 | 状态 |
|--------|---------|---------|------|
| exportSnapshot 非空 | 生成文件存在且>0 | 文件不存在 | ❌ 未实现 |
| validateBackup 有效/损坏/空库 | 三种场景 | 文件不存在 | ❌ 未实现 |
| restoreFromWebDAV 覆盖 | 数据量一致 | 文件不存在 | ❌ 未实现 |
| performRecovery 三路径 | N1/WebDAV/空库 | 文件不存在 | ❌ 未实现 |
| 恢复后 WAL 模式 | 验证 WAL 已启用 | 文件不存在 | ❌ 未实现 |

#### 4.3 config-webdav.test.ts → F16

| 检查项 | 计划要求 | 代码实际 | 状态 |
|--------|---------|---------|------|
| 凭据输入 → 连接 → 状态 | 端到端流程 | 文件不存在 | ❌ 未实现 |
| 凭据持久化 | 重启后仍在 SecureStore | 文件不存在 | ❌ 未实现 |
| 导出备份验证 | 远程出现 .db 文件 | 文件不存在 | ❌ 未实现 |
| 恢复数据一致 | 本地与备份一致 | 文件不存在 | ❌ 未实现 |
| 普通模式只读 | 字段不可编辑 | 文件不存在 | ❌ 未实现 |
| 管理模式按钮禁用 | disabled 或隐藏 | 文件不存在 | ❌ 未实现 |

---

## 结果汇总

### 已完成清单（C1–C3 全覆盖）

| 模块 | 文件 | 状态 | 关键实现 |
|------|------|------|---------|
| 凭据加密 | `credential.ts` | ✅ | SecureStore 三项凭据 + URL 归一化 |
| WebDAV 客户端 | `webdav.ts` | ✅ | v5 客户端，30s 超时，Base64 传输 |
| 快照导出 | `snapshot.ts` | ✅ | VACUUM INTO 替代文件复制（优于计划） |
| 备份校验 | `validate.ts` | ✅ | integrity_check + 3 表 + 行数检查 |
| 导出流程 | `export.ts` | ✅ | 快照→上传→清理，失败保留本地 |
| 恢复流程 | `restore.ts` | ✅ | WebDAV + 本地双路径，WAL 恢复启用 |
| 崩溃恢复 | `recovery.ts` | ✅ | N1→WebDAV→空库 三路径，伴生文件清理 |
| DB 初始化 | `init.ts` | ✅ | 恢复前置避免锁冲突，onRecoveryMsg 回调 |
| 配置页面 | `ConfigScreen.tsx` | ✅ | WebDAVConfig 组件集成，管理模式控制 |
| WebDAV 配置 | `WebDAVConfig.tsx` | ✅ | 完整交互：输入/测试/导出/恢复/确认 |
| 同步图标 | `SyncStatusIcon.tsx` | ✅ | 三态判断（绿/蓝/灰），useFocusEffect |
| 恢复遮罩 | `RecoveryProgress.tsx` | ✅ | Modal 三态图标 + 加载动画 |

### 未完成/缺失清单

| # | 缺失项 | 严重程度 | 说明 |
|---|--------|---------|------|
| 1 | `src/__tests__/webdav.test.ts` | 🔴 C4 | 不存在，计划要求 7 项测试（连接/上传/下载/列表/超时等） |
| 2 | `src/__tests__/backup.test.ts` | 🔴 C4 | 不存在，计划要求 7 项测试（快照/校验/恢复/崩溃恢复路径等） |
| 3 | `src/__tests__/config-webdav.test.ts` | 🔴 C4 | 不存在，计划要求 6 项测试（凭据持久化/导出恢复/权限控制等） |

### 代码优于计划的改进点（无功能缺失）

| 改进点 | 计划方案 | 实际方案 | 收益 |
|--------|---------|---------|------|
| 快照导出方式 | `FileSystem.copyAsync` | `VACUUM INTO` | 不依赖物理文件路径，独立干净副本 |
| 崩溃恢复时序 | 先打开 DB 再恢复 | 先恢复再 openAndMigrate | 避免文件锁冲突 |
| initDatabase 接口 | 无回调 | 增加 onRecoveryMsg 回调 | 调用方可自定义恢复通知方式 |
| 恢复函数参数 | restoreFromWebDAV 无 db 参数 | 增加可选 db 参数 | 支持传入活跃连接安全关闭 |
| WebDAV 凭据保存 | 失焦触发 | 操作前均保证保存 | 防止用户在操作间隙修改凭据导致不一致 |

---

## 结论

**核心功能（C1–C3）已 100% 实现**，12 个代码文件全部存在且功能完整，与 spec-v4.5 §10 和 plan-phase5.md 逐条对齐。

**唯一缺口在 C4 测试**：3 个测试文件（`webdav.test.ts`、`backup.test.ts`、`config-webdav.test.ts`）完全缺失。测试覆盖 20 项具体检查点，目前为 0。

### 是否可以进入测试

| 维度 | 评估 |
|------|------|
| 功能完整性 | ✅ 所有 C1/C2/C3 功能点已实现，可直接进入功能验证 |
| 测试就绪度 | ❌ C4 测试完全缺失，无法通过自动化测试覆盖回归 |
| 建议 | 先完成 C4 编写 3 套测试 → 再进入集成测试阶段；若时间紧迫，可先手动走通验收标准的 19 条检查项作为功能验证，C4 测试并行推进 |
