# 技术债务清理 — 低优先级：未使用导入/变量

## 概述
扫描 src/ 下所有 .ts/.tsx 文件中未使用的 import 和变量声明，逐个删除。

## 已知高疑点文件
1. `src/services/backup/recovery.ts` — `cleanupCompanionFiles` 函数是否被外部调用？若仅内部定义未调用则删除
2. `src/services/backup/restore.ts` — 检查未使用导入
3. `src/db/init.ts` — 检查未使用导入/变量
4. `src/screens/` 下各文件 — 检查未使用导入

## 执行步骤
1. 逐文件扫描：`grep` 每个 import 符号名是否在文件中被使用（排除 import 行自身）
2. 删除确实未被使用的 import（整行删除）
3. 删除确实未被引用的变量/函数声明
4. 每改完一个文件立即 `npx tsc --noEmit` 确认无编译错误
5. 全部完成后运行 `npx vitest run` 确认全量通过

## 约束
- 不要修改业务逻辑
- 不要引入新依赖
- 仅删除死代码，不重构
