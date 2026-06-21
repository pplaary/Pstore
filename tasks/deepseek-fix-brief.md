# DeepSeek 修复任务

你刚完成审校（report.md），现按以下清单逐条修复，**每修复一类问题一个 git commit**。

## 规则

1. 修完一类问题立即 `git add` + `git commit`
2. 提交信息格式：`fix(review): <简短描述>`
3. 修改前后对照 spec/spec-v4.md 确保不引入新偏差
4. P0-3 不需要改代码——那条是 spec 措辞问题，代码实现正确

---

## 修复清单

### Commit 1: 修 ScanScreen 运行时崩溃

**问题**：`useCallback` 未 import，运行时 ReferenceError

修复 `src/screens/ScanScreen.tsx`：
- `import React, { useState, useRef }` → `import React, { useState, useRef, useCallback }`

提交信息：`fix(review): ScanScreen 补全 useCallback 导入`

---

### Commit 2: 修扫码到编辑页 barcode 传递断链

**涉及文件**：`src/navigation/types.ts` + `src/screens/ProductEditScreen.tsx`

1. types.ts 的 `ProductEdit` 参数增加 barcode：
```
ProductEdit: { id?: string; barcode?: string };
```

2. ProductEditScreen.tsx 中读取 barcode 并写入表单初始值：
- 在 useEffect 中检查 `route.params?.barcode`，若存在则 `setBarcode(route.params.barcode)`
- 注意：编辑已有商品时不应覆盖已有条码（仅在新增模式 `!existingId` 时读取）

提交信息：`fix(review): 扫码 barcode 传递到编辑页`

---

### Commit 3: 补全编辑页 aliases 字段

**涉及文件**：`src/screens/ProductEditScreen.tsx`

在表单中增加 aliases（别名）输入：
- 新增 TextInput，placeholder 如"逗号分隔多个别名"
- addProduct/updateProduct 调用时带上 aliases 字段
- 编辑模式加载时读取已有 aliases

提交信息：`fix(review): 编辑页补全 aliases 字段`

---

### Commit 4: 补全错误处理

**涉及文件**：`App.tsx` + `src/context/store.tsx`

1. App.tsx：数据库初始化失败时不要 throw，改为渲染错误 UI：
   - 显示错误信息
   - 提供"重试"按钮（重新调用 initDatabase）
   - 加载状态用 ActivityIndicator 替代 `return null`

2. store.tsx：数据库操作增加失败计数器：
   - 累计 3 次连续失败后 Alert("数据库异常，请重启应用")
   - 成功后重置计数器

提交信息：`fix(review): 错误处理 — ErrorBoundary 替代 throw + 失败计数器`

---

### Commit 5: 清理 escapeFts5 未使用常量 + 补测试

**涉及文件**：`src/db/init.ts` + `src/db/__tests__/search.test.ts`

1. init.ts：删除 `FTS5_SPECIAL_RE` 常量（escapeFts5 采用全包裹策略，不需要条件检测），同时更新注释说明"所有 token 均双引号包裹，比按需包裹更安全"

2. 在 search.test.ts 中补充 escapeFts5 完整测试用例，覆盖 spec §6.2 全部示例：
   - `可 乐` → `("可" "乐"*)`
   - `可乐` → `("可" "乐"*)`
   - `可乐*` → `("可" "乐"*)`
   - `(550ml)` → `"(550ml)"`

提交信息：`fix(review): 清理 escapeFts5 死代码 + 补全测试`

---

## 完成标准

1. `git log --oneline` 应显示 5 个新的 fix commit
2. 所有修改不破坏已有功能
3. `npx tsc --noEmit` 无类型错误
