# 技术债务清理计划

## #1 [高] search.ts — LIMIT 字符串拼接改参数化

**文件**: `src/db/search.ts`

问题：`LIMIT ${options.limit}` 等 4 处将数字直接拼进 SQL。

修复：对所有 LIMIT/OFFSET 使用参数化绑定。若 expo-sqlite 不支持 LIMIT 参数绑定，则对 `options.limit` 做白名单数值校验（正整数，≤200）后拼接，并加注释说明原因。

---

## #2 [高] recovery.ts — N1 恢复路径补齐同步逻辑

**文件**: `src/services/backup/recovery.ts` 约 86-91 行

问题：N1 可用时只返回 `source: 'N1'`，未真正触发从 N1 拉取最新备份。

修复：补充 N1 同步恢复逻辑——检查 N1 上是否有新于本地的备份版本，有则下载并 `restore`。若暂时无法完整实现，至少加 TODO 注释 + 兜底日志，标注当前为占位实现。

---

## #3 [中] stt.ts — 录音轮询加超时保护

**文件**: `src/services/stt.ts` 约 191-199 行

问题：轮询 `getStatusAsync` 无超时上限，若 expo-av 从不触发 `isDoneRecording` 会永久阻塞。

修复：在轮询循环外加 30 秒超时保护，超时后 `forceStop()` 并返回错误。

---

## 执行

按 #1 → #2 → #3 顺序。每项完成后运行 `npx tsc --noEmit`，全部完成后运行 `npx vitest run`。
