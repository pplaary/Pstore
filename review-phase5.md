# Phase 5 WebDAV 备份恢复 — 审校报告

> 审校基准: `spec-v4.md` §10（三层数据策略）、§14（错误处理）、§15（安全）、§10.3（崩溃恢复）
> 审校范围: Phase 5 全部 12 个新增/修改文件
> 审校日期: 2026-06-22

---

## 审校摘要

| 级别 | 数量 | 说明 |
|------|------|------|
| P0 | 5 | 与 spec 冲突或功能缺陷，必须修复 |
| P1 | 8 | 写法不规范但功能正常 |
| P2 | 6 | 优化建议 |

---

## P0（与 spec 冲突或功能缺陷）

### P0-1. expo-sqlite 数据库路径构造错误（3 文件受影响）

**影响文件**: `src/services/backup/snapshot.ts` L37、`src/services/backup/restore.ts` L134/L166、`src/services/backup/recovery.ts` L44

**问题**: 三个文件均通过 `${FileSystem.documentDirectory}SQLite/${dbPath}` 拼接数据库文件的绝对路径。但 `getDatabasePath()` 仅返回 `'pstore.db'`，expo-sqlite 的 `openDatabaseAsync('pstore.db')` 内部自行决定存储位置（Android 默认在 `/data/data/<package>/databases/`，iOS 在 Library 目录），与 `FileSystem.documentDirectory`（Android: `/data/data/<package>/files/`）不在同一路径。

**后果**: `FileSystem.copyAsync` 的 source 路径不存在，快照导出、恢复覆盖、崩溃恢复中的数据库文件操作全部失败。

**spec 依据**: §10.3 要求恢复时"校验通过再覆盖本地数据库"，覆盖操作必须能正确访问数据库文件。

**修复建议**: 不应手动拼接数据库路径，改用以下方案之一：
1. 利用 expo-sqlite 自身的备份 API（如 `db.backupAsync()` 或 `SQLite.deleteDatabaseAsync()`）
2. 或在 App 启动时将 expo-sqlite 实际数据库路径缓存到模块变量，供 snapshot/restore/recovery 复用。

---

### P0-2. restore.ts 未关闭当前数据库连接即覆盖文件

**影响文件**: `src/services/backup/restore.ts` L119-L139

**问题**: `restoreFromWebDAV()` 接受可选参数 `db`，但从 `WebDAVConfig.tsx` 调用时未传入 `db`（L148: `await restoreFromWebDAV()`）。不传 `db` 时，整个"关闭当前连接"步骤被跳过，直接用 `FileSystem.copyAsync` 覆盖正被 expo-sqlite 打开的数据库文件。

**后果**: SQLite 文件被正在运行的连接锁定，覆盖操作可能失败或产生损坏的数据库文件。

**spec 依据**: §10.3 "校验通过再覆盖本地数据库"——覆盖前必须确保数据库连接已关闭。

**修复建议**: 
1. `WebDAVConfig` 需能获取当前数据库实例并传入；或
2. 在 `restoreFromWebDAV` 中通过全局 DB 引用获取当前连接并关闭。

---

### P0-3. ConfigScreen 缺失管理模式区分 — WebDAV 始终可编辑

**影响文件**: `src/screens/ConfigScreen.tsx` L130、`src/components/WebDAVConfig.tsx`

**问题**: `ConfigScreen` 硬编码 `<WebDAVConfig editable={true} />`，未读取当前模式（普通/管理）。`WebDAVConfig` 虽有 `editable` prop 但调用方始终传 `true`。

**后果**: 普通模式下用户也能编辑 WebDAV 凭据、导出备份、触发恢复操作。违反 spec §11.4 的权限模型。

**spec 依据**: §11.4 明确"配置中心：N1/WebDAV 只读（普通模式） vs 全部可编辑（管理模式）"；§10.7 "WebDAV 配置……始终可配置"是指入口始终可见，不是始终可编辑。

**修复建议**: `ConfigScreen` 需从全局状态/context 获取当前模式，并传递正确的 `editable` 值给 `WebDAVConfig`。

---

### P0-4. init.ts 未显式启用 WAL 模式

**影响文件**: `src/db/init.ts` L64-L74（`openAndMigrate` 函数）

**问题**: `openAndMigrate()` 直接打开数据库并执行迁移，但未执行 `PRAGMA journal_mode = WAL`。plan-phase5.md §2.4 的代码模板明确要求 `await db.execAsync('PRAGMA journal_mode = WAL')`。

**后果**: 数据库可能回退到 DELETE 日志模式（expo-sqlite 默认行为），影响并发读性能和崩溃恢复能力。

**spec 依据**: §10.1 "本地 SQLite（WAL 模式）"、§14.2 "SQLite WAL 模式自带崩溃恢复"。

**修复建议**: 在 `openAndMigrate()` 中 `SQLite.openDatabaseAsync` 之后、`migrate` 之前加入 `PRAGMA journal_mode = WAL`。

---

### P0-5. webdav.ts 缺失上传/下载超时控制

**影响文件**: `src/services/webdav.ts` L77-L107 (`uploadBackup`)、L117-L147 (`downloadBackup`)

**问题**: `uploadBackup` 和 `downloadBackup` 未设置任何超时。webdav v5 底层使用 axios，可在 `createClient` 时配置 `timeout` 参数，但当前 `getClient()`（L26-L32）未传入 `timeout` 选项。

**后果**: 网络异常时上传/下载可能无限期挂起，用户体验极差。

**spec 依据**: plan-phase5.md §1.2 "上传/下载超时 30s（备份文件可能较大）"。虽然 spec-v4.md 正文未直接规定 WebDAV 超时，但 §14.2 规定"网络请求失败时静默降级"——无超时则无法降级。

**修复建议**: `createClient` 调用时添加 `{ timeout: 30000 }`。

---

## P1（写法不规范但功能正常）

### P1-1. webdav.ts 使用 Base64 文本往返传输二进制 SQLite 文件

**影响文件**: `src/services/webdav.ts` L89-L98、L129-L138

**问题**: `uploadBackup` 用 `FileSystem.readAsStringAsync(..., Base64)` 读取 SQLite 二进制文件，将其编码为 Base64 字符串后传给 `putFileContents`（string 模式）。`downloadBackup` 用 `getFileContents({ format: 'text' })` 取回 Base64 字符串再 `writeAsStringAsync(..., Base64)` 解码。虽然 Base64 属于 ASCII 安全字符集，UTF-8 往返无误，但这是纯文本通道传二进制的不规范做法，且 SQLite 文件体积翻倍传输。

**修复建议**: 使用 `webdav.createReadStream` / `createWriteStream` 或直接传递 Buffer/ArrayBuffer，走真正的二进制通道。

---

### P1-2. testConnection 行为与 plan 描述不完全一致

**影响文件**: `src/services/webdav.ts` L57-L72

**问题**: plan 描述 `testConnection` 为"列出根目录，返回可达状态"。实际实现先调用 `ensureBackupDir`（创建目录 + 验证写权限），比"列出根目录"更重。功能上没有问题且更实用，但与 plan 描述存在偏差。

**修复建议**: 无需修改代码；如严格对齐 plan，可将 `ensureBackupDir` 替换为简单的 `client.getDirectoryContents('/')`。

---

### P1-3. restore.ts 恢复后未重新启用 WAL 模式

**影响文件**: `src/services/backup/restore.ts` L136-L139

**问题**: 恢复操作直接用备份文件覆盖本地数据库后，未执行 `PRAGMA journal_mode = WAL`。即使 P0-4 修复后在 `openAndMigrate` 中启用了 WAL，恢复路径通过 `FileSystem.copyAsync` 直接覆盖文件，绕过了 `openAndMigrate`。

**spec 依据**: §10.1 "本地 SQLite（WAL 模式）"——恢复后应处于 WAL 模式。

**修复建议**: 覆盖数据库文件后，由调用方重新打开数据库时执行 WAL PRAGMA；或在 restore 函数中打开目标数据库执行 WAL PRAGMA 后关闭。

---

### P1-4. recovery.ts 删除损坏数据库时未清理 WAL/SHM 伴生文件

**影响文件**: `src/services/backup/recovery.ts` L82-L85、L144-L147

**问题**: WAL 模式下的 SQLite 数据库会产生 `-wal` 和 `-shm` 伴生文件。`recoverFromN1` 和 `recoverFromWebDAV` 仅删除主 `.db` 文件，未清理伴生文件。

**修复建议**: 删除主文件后追加删除 `${fullDbPath}-wal` 和 `${fullDbPath}-shm`（忽略文件不存在错误）。

---

### P1-5. export.ts / restore.ts 调用前未检查凭据是否已配置

**影响文件**: `src/services/backup/export.ts`、`src/services/backup/restore.ts`

**问题**: `exportToWebDAV()` 和 `restoreFromWebDAV()` 直接调用底层 webdav 函数，底层函数通过 `getClientOrThrow()` 会抛出"凭据未配置"错误。虽然错误能被 catch 并返回 `{ ok: false }`，但错误消息不如"请先配置 WebDAV 凭据"用户友好。

**修复建议**: 在函数入口处显式检查凭据并返回友好错误。

---

### P1-6. WebDAVConfig 使用 Alert.alert 而非 Toast 通知

**影响文件**: `src/components/WebDAVConfig.tsx` L100-L113、L119-L125、L131-L143

**问题**: plan-phase5.md §3.1 要求"成功 → Toast"、"失败 → Toast"。实际代码全部使用 `Alert.alert`（阻塞式弹窗），而非轻量 Toast。

**spec 依据**: plan-phase5.md §3.1 交互逻辑表格；spec §14.2 对 DB 操作失败要求 Toast。

**修复建议**: 将操作结果通知从 `Alert.alert` 替换为 Toast 组件（`react-native-root-toast` 或 Expo 内置方案），仅在恢复确认环节保留 Alert.alert。

---

### P1-7. SyncStatusIcon WebDAV 检测仅在挂载时执行一次

**影响文件**: `src/components/SyncStatusIcon.tsx` L20-L24

**问题**: `SecureStore.getItemAsync('pstore_webdav_url')` 在 `useEffect([], [])` 中执行一次。用户在 ConfigScreen 配置 WebDAV 后返回主界面，图标状态不会更新。

**修复建议**: 监听 ConfigScreen 返回事件（如 `useFocusEffect`）重新读取 SecureStore，或通过全局事件/状态通知 SyncStatusIcon 刷新。

---

### P1-8. validate.ts 表名 'pending_items' vs plan 中的 'pending_item'

**影响文件**: `src/services/backup/validate.ts` L15

**问题**: plan-phase5.md §1.4 描述校验时提及 "product / price_history / pending_item 三张核心表"，但实际 DB schema 中表名为 `pending_items`（复数，见 `init.ts` L192）。代码使用 `pending_items` 与 schema 一致，是 plan 文档的笔误。代码行为正确，但审校需记录此差异。

**修复建议**: 建议修正 plan-phase5.md 中的表名。

---

## P2（优化建议）

### P2-1. recovery.ts 中 openAndMigrate 双重调用

**影响文件**: `src/db/init.ts` L76、`src/services/backup/recovery.ts` L82

**问题**: `performRecovery` 的 `recoverFromN1` 路径中已调用 `openAndMigrate()` 重建数据库。`initDatabase` 之后再次调用 `openAndMigrate()`（L76），形成双重调用。第二次调用被 `getCurrentVersion` 检测到版本已达标，立即返回，无明显副作用但属冗余。

**修复建议**: `initDatabase` 在调用 `performRecovery` 之后判断 `recoveryResult.recovered`，若为 true 且数据库已重建完成，直接打开数据库而非再次执行 `openAndMigrate`。

---

### P2-2. credential.ts 数据库文件加密未实现

**影响文件**: `src/services/credential.ts`（及全局）

**问题**: spec §15 要求"本地数据库文件加密（防止 root 后直接读取）"。expo-sqlite 不原生支持 SQLite 加密扩展（SEE/sqlcipher），且在 Android 上数据库位于应用私有目录 `/data/data/<package>/`，未 root 设备天然不可访问。

**评估**: 这是一个跨 Phase 的架构性问题，非 Phase 5 单独引入。当前状态下数据库文件位于私有目录，实际风险可控。若后续需实现，需引入 `expo-sqlite` 加密插件或替换为 SQLCipher。

---

### P2-3. WebDAVConfig 每次 onBlur 都写入 SecureStore

**影响文件**: `src/components/WebDAVConfig.tsx` L52-L56

**问题**: 三个输入框的 `onBlur` 都绑定 `handleSaveCredentials`，每次焦点离开任一字段都会触发全量 SecureStore 写入。建议仅在值实际变更时写入，或使用防抖。

---

### P2-4. WebDAVConfig 状态文案偏差

**影响文件**: `src/components/WebDAVConfig.tsx` L149

**问题**: 初始状态显示"○ 未测试"，plan 因示为"○ 未配置"。语义差异：未测试暗示凭据已填写但未测，未配置暗示凭据为空。建议改用"未配置"或根据凭据是否填写分别显示。

---

### P2-5. downloadBackup 使用 cacheDirectory 存储临时文件

**影响文件**: `src/services/webdav.ts` L128

**问题**: 下载的备份文件写入 `FileSystem.cacheDirectory`，该目录可能被系统自动清理。对 restore 场景（立即使用后删除）无影响，但如果未来需要"下载后保留"场景，应使用 `documentDirectory` 临时子目录。

---

### P2-6. RecoveryProgress 依赖 @expo/vector-icons

**影响文件**: `src/components/RecoveryProgress.tsx` L9

**问题**: 组件使用 `Ionicons` 图标集。确保 `@expo/vector-icons` 已在 `package.json` 中声明（Expo SDK 52 默认包含，仅需确认）。

---

## 逐文件审校明细

### src/services/credential.ts
| 检查项 | plan/spec 要求 | 实际 | 结果 |
|--------|---------------|------|------|
| 使用 expo-secure-store | plan §1.1 | `SecureStore.setItemAsync/getItemAsync/deleteItemAsync` | OK |
| URL 去末尾 `/` | plan §1.1 | `normalizeUrl: raw.replace(/\/+$/, '')` | OK |
| 三字段加密存储 | spec §15 | url/username/password 三键独立存储 | OK |
| 数据库文件加密 | spec §15 | 未实现（expo-sqlite 限制） | P2-2 |

### src/services/webdav.ts
| 检查项 | plan/spec 要求 | 实际 | 结果 |
|--------|---------------|------|------|
| 使用 webdav v5 createClient | plan §1.2 | `createClient(url, { username, password })` | OK |
| BACKUP_DIR = /pstore-backups | plan §1.2 | `/pstore-backups` | OK |
| testConnection 返回 ok/error | plan §1.2 | 正确返回 | OK |
| testConnection 行为 | plan "列出根目录" | 实际创建备份目录（更重） | P1-2 |
| uploadBackup 流程 | plan §1.2 | 读 Base64 → putFileContents | OK（P1-1） |
| downloadBackup 流程 | plan §1.2 | getFileContents → 写 cache | OK（P1-1） |
| downloadBackup 验证非空 | plan §1.2 | `info.exists && size > 0` | OK |
| listBackups 过滤 .db + 时间降序 | plan §1.2 | `.endsWith('.db')` 过滤 + `sort localeCompare` 降序 | OK |
| 30s 超时 | plan §1.2 | 未实现 | P0-5 |
| ensureBackupDir 自动创建 | plan §1.2 | 已实现，含并发容错 | OK |

### src/services/backup/snapshot.ts
| 检查项 | plan/spec 要求 | 实际 | 结果 |
|--------|---------------|------|------|
| PRAGMA wal_checkpoint(TRUNCATE) | plan §1.3 | `db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)')` | OK |
| 关闭数据库后复制 | plan §1.3 | closeAsync → copyAsync，顺序正确 | OK |
| 默认输出路径 | plan §1.3 | `cacheDirectory + pstore-snapshot-{timestamp}.db` | OK |
| 验证快照非空 | plan §1.3 | `info.exists && size > 0` | OK |
| 数据库文件路径获取 | — | **路径构造错误** | P0-1 |

### src/services/backup/validate.ts
| 检查项 | plan/spec 要求 | 实际 | 结果 |
|--------|---------------|------|------|
| PRAGMA integrity_check → ok | plan §1.4 + spec §10.3 | 正确检查 | OK |
| 核心表存在检查 | plan §1.4 | product / price_history / pending_items | OK（P1-8） |
| product 行数 > 0 | plan §1.4 | `COUNT(*) AS cnt FROM product`，=0 拒绝 | OK |
| 关闭连接 | plan §1.4 | finally 块正确关闭 | OK |

### src/services/backup/export.ts
| 检查项 | plan/spec 要求 | 实际 | 结果 |
|--------|---------------|------|------|
| 流程：快照→上传→清理 | plan §2.1 | exportSnapshot → uploadBackup → deleteAsync | OK |
| 远程文件名格式 | plan §2.1 | `pstore-backup-{date}T{time}.db`，冒号替换横杠 | OK |
| 上传失败保留本地快照 | plan §2.1 | catch 中未删除 snapshotPath | OK |
| 上传前检查凭据 | — | 未显式检查 | P1-5 |

### src/services/backup/restore.ts
| 检查项 | plan/spec 要求 | 实际 | 结果 |
|--------|---------------|------|------|
| listBackups → 取最近 | plan §2.2 | `backups[0]`（已时间降序） | OK |
| downloadBackup → validateBackup | plan §2.2 + spec §10.3 | 下载后校验，失败删临时文件 | OK |
| 校验通过覆盖本地 DB | spec §10.3 | `FileSystem.copyAsync` 覆盖 | OK |
| 覆盖前关闭数据库连接 | — | db 参数可选，UI 层未传入 | P0-2 |
| 恢复后 WAL 模式 | spec §10.1 | 未重新启用 | P1-3 |
| 数据库文件路径获取 | — | **路径构造错误** | P0-1 |
| 恢复前确认由 UI 层负责 | plan §2.2 | 未在引擎层做确认，设计正确 | OK |

### src/services/backup/recovery.ts
| 检查项 | plan/spec 要求 | 实际 | 结果 |
|--------|---------------|------|------|
| 启动时 integrity_check | spec §10.3 | `PRAGMA integrity_check` + 打开异常 catch | OK |
| 优先级: N1 → WebDAV → 空库 | spec §10.3 | 三条路径正确实现 | OK |
| N1 恢复：删除损坏 → 重建 → sync | plan §2.3 | `deleteAsync → openAndMigrate → performSync` | OK |
| WebDAV 恢复：删除损坏 → restoreFromWebDAV → 空库兜底 | plan §2.3 | 三层嵌套 try/catch 正确 | OK |
| 全程静默自动 | spec §10.3 | 无弹窗/无用户交互 | OK |
| Toast 通知恢复结果 | plan §2.3 | 返回 message 字符串，由 initDatabase 回调处理 | OK |
| performSync 签名匹配 | plan §2.3 | `performSync(db, store, serverUrl)` 与实际签名一致 | OK |
| 删除 WAL/SHM 伴生文件 | — | 未清理 | P1-4 |
| 数据库文件路径 | — | **路径构造错误** | P0-1 |

### src/db/init.ts
| 检查项 | plan/spec 要求 | 实际 | 结果 |
|--------|---------------|------|------|
| 启动时插入崩溃恢复 | plan §2.4 | `initDatabase` 中调用 `performRecovery` | OK |
| Schema 版本管理 | spec §10.4 | `PRAGMA user_version` + 顺序迁移 | OK |
| 迁移脚本动态加载 | spec §10.4 | `import(./migrations/v{version})` → `migrate(db)` | OK |
| PRAGMA journal_mode = WAL | plan §2.4 + spec §10.1 | **未实现** | P0-4 |
| openAndMigrate 双重调用 | — | recovery 已调，initDatabase 再调 | P2-1 |

### src/components/WebDAVConfig.tsx
| 检查项 | plan/spec 要求 | 实际 | 结果 |
|--------|---------------|------|------|
| 三个 TextInput（URL/账号/密码） | plan §3.2 | 已实现，密码 secureTextEntry | OK |
| 连接状态机 | plan §3.2 | untested/connected/failed 三态 | OK |
| 测试连接按钮 + loading | plan §3.1 | ActivityIndicator + disabled | OK |
| 导出备份按钮 + loading | plan §3.1 | ActivityIndicator + disabled | OK |
| 从备份恢复按钮 + 确认弹窗 | plan §3.1 | Alert.alert 确认框 | OK |
| editable prop 控制可编辑性 | plan §3.2 | disabled={!editable} | OK |
| onBlur 保存凭据 | plan §3.1 | handleSaveCredentials 正确 | OK |
| 通知方式为 Toast | plan §3.1 | 实际使用 Alert.alert | P1-6 |
| 管理模式可用 | plan §3.1 + spec §11.4 | 调用方始终传 editable={true} | P0-3 |
| 状态文案 | plan 图例 | "未测试" vs plan "未配置" | P2-4 |

### src/components/RecoveryProgress.tsx
| 检查项 | plan/spec 要求 | 实际 | 结果 |
|--------|---------------|------|------|
| 接口 (visible, source, message) | plan §3.4 | 完全匹配 | OK |
| 三种 source 图标 | plan §3.4 | cloud-done / folder-open / cube | OK |
| 半透明遮罩 + 居中卡片 | plan §3.4 | Modal + rgba overlay + card | OK |
| visible=false 不展示 | plan §3.4 | Modal visible 属性控制 | OK |

### src/screens/ConfigScreen.tsx
| 检查项 | plan/spec 要求 | 实际 | 结果 |
|--------|---------------|------|------|
| WebDAV 配置区域替换占位 | plan §3.1 | WebDAVConfig 组件集成 | OK |
| N1 服务地址配置 | plan §3.1 | 输入框 + 测试连接 + 同步按钮 | OK |
| AI 配置占位 | plan §3.1 | 保留占位 | OK |
| 管理模式区分 | plan §3.1 + spec §11.4 | 始终 editable={true} | P0-3 |
| N1 测试连接超时 5s | spec §14.2 | AbortController + setTimeout 5000 | OK |

### src/components/SyncStatusIcon.tsx
| 检查项 | plan/spec 要求 | 实际 | 结果 |
|--------|---------------|------|------|
| N1 已配置且可达 → 绿色云 "已连接" | plan §3.3 + spec §10.6 | 正确 | OK |
| WebDAV 已配置且 N1 不可达 → 蓝色云 "WebDAV" | plan §3.3 + spec §10.6 | `cloud` 图标 + `#2563EB` + "WebDAV" | OK |
| 均未配置/不可达 → 灰色云 "本地模式" | plan §3.3 | `cloud-offline` + `#94A3B8` + "本地模式" | OK |
| WebDAV 检测来源 | plan §3.3 | SecureStore `pstore_webdav_url` | OK |
| WebDAV 状态实时更新 | — | 仅 mount 时检测一次，后续不更新 | P1-7 |

---

## 附录：spec 关键条款对照

| spec 条款 | 内容摘要 | Phase 5 覆盖状态 |
|-----------|---------|-----------------|
| §10.1 三层策略 ③ | WebDAV 手动冷备份，不参与实时同步 | `export.ts` / `restore.ts` 独立于 sync 引擎，符合 |
| §10.3 崩溃恢复 | integrity_check → N1 → WebDAV → 空库 | `recovery.ts` 三路径正确实现 |
| §10.3 恢复前校验 | WebDAV 备份需校验（打开、表结构） | `validate.ts` 四层校验实现 |
| §10.7 配置入口 | WebDAV URL/账号/密码/测试/导出/恢复 | `WebDAVConfig.tsx` + `ConfigScreen.tsx` |
| §14.2 崩溃恢复 | WAL 模式 + integrity_check + 静默自动 | 逻辑正确，WAL 启用缺失（P0-4） |
| §15 凭据加密 | WebDAV 密码加密存储 | `credential.ts` 通过 SecureStore 实现 |
| §15 数据库加密 | 本地 DB 文件加密 | 未实现（P2-2，expo-sqlite 限制） |
