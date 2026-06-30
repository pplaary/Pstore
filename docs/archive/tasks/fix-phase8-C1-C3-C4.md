# Phase 8 C1/C3/C4 修复指令

基于审校报告 memory_00_XKPxlPdojYdOAZD2v4Vh5442，修复 CRITICAL 和 HIGH 级问题。

---

## 修复 #6 [CRITICAL] — CSV 列顺序对齐计划

**文件**: `src/services/backup/exportCSV.ts`

**修改**: `productToCsvRow` 函数和 `exportProductsCSV` 的 headers，将列顺序对齐计划 §C3.1：

```
名称, 别名, 价格, 规格, 条码, 分类, 状态, 更新时间
```

具体要求：
1. 修改 `headers` 数组为 `['名称', '别名', '价格', '规格', '条码', '分类', '状态', '更新时间']`
2. 修改 `productToCsvRow` 中的字段顺序为 `[name, aliases, price, spec, barcode, category, status, updatedAt]`
3. 删除 `createdAt` 列（不在计划中）
4. 保留 BOM 头和 `csvEscape` 逻辑不变
5. 保留 scope 过滤逻辑不变

---

## 修复 #19 [HIGH] — HomeScreen 批量管理工具栏 + 骨架屏走主题

**文件**: `src/screens/HomeScreen.tsx`

**修改**:

1. 将 `batchToolbar` 的 `backgroundColor: '#1E293B'` 替换为 `colors.bg.card`（或 dark 模式下有合适的深色令牌，若无则用 `colors.bg.primary`）
2. 将 `batchToolbarText` 的 `color: '#94A3B8'` 替换为 `colors.text.hint`
3. 将 `batchBtn` 的 `backgroundColor: '#334155'` 替换为 `colors.border.default`（或在 dark/care 下选合适的令牌）
4. 将 `batchBtnText` 的 `color: '#FFFFFF'` 替换为 `colors.text.inverse`
5. 将 `batchBtnExit` 的 `backgroundColor: '#475569'` 替换为 `colors.brand.danger`（或保持独立令牌）
6. 将 `batchBtnExitText` 的 `color: '#FFFFFF'` 替换为 `colors.text.inverse`
7. 将 `skeletonCard` 的 `backgroundColor: '#E0E0E0'` 替换为 `colors.border.light`

注意：
- 如果 `batchToolbar` 的设计意图是始终深色（注释说「固定深色，不受主题影响」），请在代码中添加明确的注释说明为何刻意不走主题，并标注这是已知的设计决策而非遗漏。
- 确认修改后 `createStyles` 函数正确接收 `colors` 和 `scale` 参数。

---

## 修复 #13 [HIGH] — resetDatabase DDL 与 db/init.ts 同步

**方案 A**（推荐）：导出 `createSchemaV1`

1. 检查 `src/db/init.ts`，找到 `createSchemaV1` 函数，添加 `export` 关键字
2. 在 `src/services/backup/clear.ts` 中 `import { createSchemaV1 } from '../../db/init'`
3. 将 `resetDatabase` 中第 126-168 行内联 DDL 替换为调用 `createSchemaV1(db)`
4. 确保 `PRAGMA user_version = 1` 仍保留在 resetDatabase 中

**方案 B**（若 createSchemaV1 不可导出）：
在 `clear.ts` 顶部和 `db/init.ts` 相应位置各添加注释：

```
⚠️ SCHEMA SYNC: 此 DDL 与 src/db/init.ts 中的 createSchemaV1 必须保持同步。
如需修改表结构，必须同时更新两处。
```

---

## 执行方式

依次对每个文件执行修改，修改完成后运行：
```bash
cd E:\Code\PStore
npx tsc --noEmit
```

确保零错误后再继续下一个修复。
