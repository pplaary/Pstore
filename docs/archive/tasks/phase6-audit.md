# Phase 6 审校指令

## 任务

审校 PStore Phase 6（AI 引擎）全部已实现代码，对照 spec-v4 §7/§7.2/§7.4/§14.2 逐项检查，输出分级审校报告（CRITICAL / HIGH / MEDIUM / LOW）。

## 需审校的文件

1. `src/services/ai.ts` — AI API 客户端（buildSystemPrompt / callAI / parseAIResponse / interceptChineseNumerals）
2. `src/store/aiConfig.ts` — AI 配置 Zustand Store（detectReachability / setAIConfig / clearAIConfig / updateLatency）
3. `src/services/ai/rag.ts` — RAG Top 20 检索增强
4. `src/services/ai/chat.ts` — 对话上下文管理器 ChatManager
5. `src/services/ai/cache.ts` — 输入缓存与草稿管理
6. `src/__tests__/ai.test.ts` — AI 服务层测试
7. `src/__tests__/ai-chat.test.ts` — 对话引擎测试
8. `src/__tests__/aiConfig.test.ts` — AI 配置 Store 测试
9. `src/__tests__/ai-ui.test.ts` — UI 集成测试

## 审校基准（spec 原文）

### spec §7 降级逻辑（已实现于 aiConfig.ts detectReachability）

```
App 启动
  ├─ 有 AI 配置且 API 可达 → 聊天模式（AI 驱动）
  └─ 无 AI 配置或 API 不可达 → 搜索模式（本地 FTS5 直搜）
```

切换无感知：同一个输入框，底层走不同路径，上层 UI 不区分。

### spec §7.2 AI 模式行为

**System Prompt 核心**（必须逐字逐段存在于 buildSystemPrompt 输出中）：
```
你是 PStore 商品查价助手。
职责：理解自然语言（查价/数量），匹配商品库。
做法：匹配商品库（名称/别名/拼音/模糊），输出结构化 JSON。
约束：不确定时列候选项；回复简洁≤3句；仅在售商品可选。
```

**上下文注入**：购物车快照 + 当前模式（普通/管理）+ 最近 8-10 轮对话

**最大对话轮数**：上下文窗口最多保留最近 10 轮对话。超过时 FIFO 丢弃最旧轮次。每"轮"定义为一次用户输入 + AI 回复的组合。

**输出格式**：
```json
{ "action": "addToCart"|"search"|"ambiguous"|"notFound",
  "productId": "...",
  "quantity": 1,
  "message": "已找到可乐 ×2",
  "confidence": 0.85 }
```

### spec §7.4 保护机制与纠错

- RAG Top K 20，不全量注入商品库
- productId 本地校验，不存在时拒绝加购
- AI 草稿卡 60 秒过期变灰，仍可点击确认
- 相同输入 5 分钟内复用缓存
- 中文数字预拦截（两瓶→2、半打→6）
- 用户可随时打断：AI 流程中任何时刻可切回手动搜索
- AI Key 本地加密缓存：N1 短暂故障时可临时直连 AI
- 纠错出口：拍照候选列表底部加「以上都不是→手动搜索」按钮；语音松开发送前可滑动取消

### spec §14.2 错误处理

- AI API 超时 10s → 静默降级至本地模式，不弹错误提示
- AI 返回格式无法解析时，降级为本地 FTS5 搜索，不重复请求 AI
- 网络质量指示：顶栏状态区显示 AI 延迟色标（绿 < 1s / 黄 1-3s / 红 > 3s）

## 审校重点（逐项检查）

### CRITICAL（必须精确匹配 spec）

1. `buildSystemPrompt` 输出必须包含 spec §7.2 System Prompt 核心的全部 4 段
2. `parseAIResponse` 必须校验 action/quantity/message/confidence 必填且合法
3. `parseAIResponse` action=addToCart 时 productId 必填，其他 action 下 productId 可选
4. `interceptChineseNumerals('两瓶可乐')` → `{ text: '2瓶可乐', replaced: true }`
5. `interceptChineseNumerals('半打鸡蛋')` → `{ text: '6鸡蛋', replaced: true }`
6. `interceptChineseNumerals('二十三瓶')` → `{ text: '23瓶', replaced: true }`
7. ChatManager MAX_ROUNDS = 10，FIFO 溢出正确
8. RAG 仅返回 IN_SHOP 商品，不含缺货/待采
9. AIResponseCache：5 分钟缓存 TTL，60 秒草稿变灰
10. callAI 超时 10s (AbortController)，失败返回 null

### HIGH（必须实现但有允许的方案变体）

11. aiConfig.ts detectReachability 三级降级：N1 → 本地缓存 → 无配置
12. aiConfig.ts updateLatency 色标阈值：<1s green, 1-3s yellow, >3s red
13. ChatManager.buildMessages 输出格式：[system] + N 轮对话 + [current_user]
14. RAG 摘要每行格式：ID:{id} | {name} | {spec} | ¥{price} | [{status}]
15. callAI 请求体格式与 vision.ts 保持一致（OpenAI 兼容）

### MEDIUM（覆盖边界条件）

16. 空商品库时 RAG 摘要显示「商品库中暂无匹配商品」
17. parseAIResponse productId 本地校验（查 product 表确认存在且未删除）
18. ChatManager 添加 12 轮后仅保留最近 10 轮
19. ChatManager.clear 正确清空所有历史
20. AIResponseCache.evict 正确清理所有过期条目
21. interceptChineseNumerals 对无中文数字输入返回 replaced=false

### LOW（代码质量/一致性）

22. 类型定义与 spec 一致（AITextConfig、AIResponse、AIMessage）
23. SecureStore 键名正确（pstore_ai_config）
24. 测试覆盖率：核心路径 + 边界条件

## 输出格式

按 CRITICAL / HIGH / MEDIUM / LOW 四级分类，每项写明：
- 等级
- 文件:行号
- 问题描述
- spec 引用
- 修复建议

无问题时对应分级标注「无问题」。
