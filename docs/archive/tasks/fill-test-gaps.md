# 补测试覆盖 — 6 个零测试模块

**基础设施**: vitest globals:true, mock 参考 n1-client.test.ts(API)/backup.test.ts(DB文件)

## 模块清单

| # | 文件 | 导出函数 | 新建测试文件 |
|---|------|---------|-------------|
| 1 | src/db/looseGoods.ts | getAllLabels addLabel updateLabel deleteLabel reorderLabels | src/db/__tests__/looseGoods.test.ts |
| 2 | src/services/backup/restore.ts | restoreFromWebDAV restoreFromLocal | src/__tests__/restore.test.ts |
| 3 | src/services/backup/snapshot.ts | exportSnapshot | src/__tests__/snapshot.test.ts |
| 4 | src/services/ai/rag.ts | buildRAGContext | src/__tests__/rag.test.ts |
| 5 | src/services/n1.ts | getConfig setConfig syncProducts pushProducts aiParse aiParseImage aiQuery | src/__tests__/n1.test.ts |
| 6 | src/services/backup/recovery.ts | performRecovery | 追加到 src/__tests__/backup.test.ts 末尾 |

## 要求
- 每个导出函数至少 1 个 happy-path + 1 个 error-path
- 涉及网络/文件 I/O 的函数 mock 掉外部依赖
- recovery 避免重复已有测试(N1降级路径)，补充 WebDAV 完整恢复路径
- 每完成一个模块跑 npx vitest run 确认通过
- 只写测试文件，不修改被测源码
