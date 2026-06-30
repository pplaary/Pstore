# PStore P0 AI — 复审 P2 修复

工作目录：`E:\Code\PStore`

`src/screens/ProductEditScreen.tsx` 中两个 handler 的 deps 数组补上 `serverUrl`：

- `handleAiParse` deps: `[aiText, applyAiResult]` → `[aiText, applyAiResult, serverUrl]`
- `handleAiImageParse` deps: `[imageUri, applyAiResult]` → `[imageUri, applyAiResult, serverUrl]`

完成后 `tsc --noEmit` + `git commit -m "fix(app): P0 AI handler deps 补 serverUrl"`。
