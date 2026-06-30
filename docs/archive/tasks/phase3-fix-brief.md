# Phase 3 回归修复简报

## 背景
Phase 3 ScanScreen 重写后，旧测试 `edit-scan.test.ts` 的断言与新实现不匹配。另有一个被误删的测试文件需要恢复。

---

## 问题清单

### 1. edit-scan.test.ts — 空条码校验断言过时

**位置**: `src/__tests__/edit-scan.test.ts` 第 84 行
**当前代码**: `expect(content).toContain('请输入或扫描条码');`
**问题**: 旧 ScanScreen 用 `Alert.alert('提示', '请输入或扫描条码')` 做空条码校验。新 ScanScreen 改为禁用提交按钮 + 静默 return（`if (!trimmed) return;` + `disabled={!barcodeInput.trim()}`），不再有这段文本。
**修复**: 将断言改为匹配新实现的校验模式，例如检查 disabled 属性：
```
expect(content).toContain('disabled={!barcodeInput.trim()}');
```
或更精确地检查手动输入兜底区域存在且提交按钮有 disabled 逻辑。

### 2. cart.test.ts 文件丢失

**位置**: `src/store/__tests__/cart.test.ts`
**问题**: 该文件在 Phase 2 commit `d7d5f3a` 中创建并被 git 跟踪，但 Phase 3 执行期间从磁盘被删除。`git status` 显示 ` D`（working tree 删除，未 staged）。
**修复**: `git checkout -- src/store/__tests__/cart.test.ts` 恢复文件即可。无需重写。

### 3. package.json 未提交

**位置**: `package.json`
**问题**: Phase 3 C2 安装了 `expo-camera ~16.0.18`，修改了 package.json 但未做 git commit。
**修复**: 在最终 commit 中一并提交 package.json 变更。

---

## 执行步骤

1. 恢复 cart.test.ts：
```bash
git checkout -- src/store/__tests__/cart.test.ts
```

2. 修改 edit-scan.test.ts 第 84 行，将 `'请输入或扫描条码'` 改为 `'disabled={!barcodeInput.trim()}'`

3. 运行测试确认全绿：
```bash
npx vitest run
```
预期：`edit-scan.test.ts` 全部通过；`search.test.ts` 的预存失败可以忽略（非本次引入）。

4. 提交：
```bash
git add src/__tests__/edit-scan.test.ts src/store/__tests__/cart.test.ts package.json
git commit -m "fix: Phase 3 回归 — 适配 edit-scan 测试 + 恢复 cart.test.ts + 提交 package.json"
```
