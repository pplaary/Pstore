# Phase 8 C1/C3/C4 审校指令

## 审校范围

审校以下 4 个文件，对照 plan-phase8.md 逐项检查：

| 文件 | 对应计划 |
|---|---|
| `src/theme/ThemeContext.tsx` | C1.1 主题 Context |
| `src/services/backup/exportCSV.ts` | C3.1 CSV 导出 |
| `src/components/PriceChart.tsx` | C3.2 价格折线图 |
| `src/services/backup/clear.ts` | C4.1 清空库 |

同时审校：
- `App.tsx` — C1.3 全项目颜色替换遗漏
- `ConfigScreen.tsx` — C1.2/C4.2 集成完整性
- `HomeScreen.tsx` — C1.3 主题集成
- `ProductDetailScreen.tsx` — C3.3 集成

---

## 审校要点

### 1. ThemeContext.tsx vs Plan §C1.1

1. **care scale 值**：代码 `scale: mode === 'care' ? 1.25 : 1`，计划写 `fontSizeScale ×1.2`。确认实际需求是多少。

2. **持久化存储**：代码使用 `expo-secure-store`，计划写 `AsyncStorage`。二者语义不同（SecureStore 是加密存储）。确认使用哪个。

3. **!ready 回退主题**：第 208-214 行，未就绪时回退到 `buildTheme('light', 'light')`。如果用户之前保存的是 dark/care，首屏会短暂显示亮色（闪烁）。检查是否需要调整为 `buildTheme(storedMode, systemScheme)` 或至少用 systemScheme。

4. **useTheme 无 Provider 回退**：第 233-236 行，`setMode` 返回空函数 `async () => {}`。如果主题未正确包裹但代码仍调用了 `setMode`，会静默失败。检查是否需要 console.warn 提示。

5. **system 模式切换响应**：system 模式依赖 `useColorScheme()`。当用户在系统设置中切换亮/暗时，React Native 是否自动触发 re-render？`useColorScheme()` 返回的 `systemColorScheme` 作为 `buildTheme` 参数，是派生值而非 state，不会自动触发 re-render——除非 `useColorScheme()` 本身返回新值导致组件 re-render。验证这一点。

### 2. exportCSV.ts vs Plan §C3.1

6. **CSV 列顺序/命名与计划不一致**：

   | 计划列 | 代码列 |
   |---|---|
   | 名称 | 名称 ✓ |
   | 别名 | 规格 |
   | 价格 | 售价 |
   | 规格 | 分类 |
   | 条码 | 状态 |
   | 分类 | 条码 |
   | 状态 | 别名 |
   | 更新时间 | 创建时间 |
   | — | 更新时间 |

   代码比计划多一列「创建时间」。列顺序完全不同。确认以哪个为准。

7. **Scope 过滤中的 isDeleted 检查**：`in_stock` 和 `to_be_purchased` 分支中 `filter(p => p.status === '...' && !p.isDeleted)`，但 `!p.isDeleted` 对所有分支都是必须条件。可提取为公共条件避免冗余，不影响正确性。

8. **exportPriceHistoryCSV 参数签名**：计划 `exportPriceHistoryCSV(productId)`，代码 `exportPriceHistoryCSV(db, productId, productName)`。多了 `db` 和 `productName` 参数——`db` 是因为需要查数据库，`productName` 用于文件名。与计划差异属实现细节。

### 3. PriceChart.tsx vs Plan §C3.2

9. **实现方式**：计划提到 `react-native-svg 或纯 View`，代码选纯 View（绝对定位 + 旋转 View 作为连线）。纯 View 方案可行但需验证：
   - `transformOrigin: '0 50%'` 在 Android 低版本是否支持（React Native 0.73+ 才稳定支持 transformOrigin）
   - Connector 旋转角度用 `Math.atan2(dy, dx) * 180 / Math.PI`，但 `dx` 可能为 0，`atan2(0, 0)` 返回 0——安全

10. **Y 轴标签精度**：`hiP.toFixed(0)` 在小价格范围（如 5.5~5.6）会显示为 `¥6` 三个相同标签。建议至少保留 1 位小数或用智能精度。

11. **价格全部相同时的处理**：第 49-52 行 `if (lo === hi) { lo = Math.max(0, lo * 0.9); hi = hi * 1.1; }` 扩大范围确保网格线可见。但注意 `lo === hi` 且 `lo === 0` 时，`lo * 0.9 = 0`，`hi * 1.1 = 0`，范围仍为 0。不过通常商品价格不会是 0。

12. **Connector 线宽**：`height: 1.5` 在 RN 中是 dp 值，不同像素密度下可能显示为 1px 或 3px。建议改为 `StyleSheet.hairlineWidth` 或在样式中处理。

### 4. clear.ts vs Plan §C4.1

13. **resetDatabase DDL 硬编码**：第 126-168 行内联了完整的 V1 Schema DDL。注释写「createSchemaV1 未导出」。如果 `db/init.ts` 中的 schema 后续修改，这里有 **schema 分歧风险**。应评估是否需要导出 `createSchemaV1` 或至少添加注释说明两处需同步。

14. **resetDatabase 后无需 fastRefresh**：注释说「无需 fastRefresh（空库）」，正确。`resetDatabase` 中重建了 `product_fts` 虚拟表，空库不需要重建索引。

15. **clearPendingItems 的 DELETE 无 WHERE**：`DELETE FROM pending_items` 全表删除。`pending_items` 表的 WHERE 条件无 isDeleted 字段，属正常操作。

16. **affectedRows 类型断言**：`(result as { changes: number }).changes` — `runAsync` 的返回值类型依赖 expo-sqlite 版本。如果版本升级后类型变化，断言可能失败。建议用 `'changes' in result` 守卫。

### 5. App.tsx vs Plan §C1.3（全项目颜色替换）

17. **App.tsx 的 StyleSheet 含硬编码颜色**：第 72-84 行，loading/error 界面使用硬编码 `'#F8FAFC'`、`'#DC2626'`、`'#64748B'`、`'#2563EB'`、`'#FFFFFF'`。这些出现在 ThemeProvider 外部（loading/error 状态下 ThemeProvider 尚未挂载或已卸载），但仍属计划 §C1.3「全项目颜色替换」范畴。评估是否需要调整或添加计划例外注释。

### 6. ConfigScreen / HomeScreen / ProductDetailScreen 集成

18. **ConfigScreen.tsx**：已导入 `useTheme` 和 `setMode`，确认外观板块 (C1.2) 和数据管理板块 (C4.2) 均已实现。

19. **HomeScreen.tsx**：已导入 `useTheme`，确认所有颜色通过主题获取。

20. **ProductDetailScreen.tsx**：已导入 `useTheme`（多组件），确认 PriceChart 嵌入和 CSV 导出按钮均已集成。

---

## 审校输出格式

请对每个审校点输出：

```
[等级] #N: 文件 — 描述
  当前行为: ...
  计划要求: ...
  影响: ...
  建议: ...
```

等级：CRITICAL / HIGH / MEDIUM / LOW

CRITICAL: 会导致功能错误或数据丢失
HIGH: 偏离计划规范、可能引发 bug
MEDIUM: 代码质量问题、边界情况
LOW: 样式/命名等轻微不一致

---

## 执行指令

```bash
cd E:\Code\PStore
npx claude --model deepseek-v4-pro --dangerously-skip-permissions -p "请作为审校专家，仔细阅读 E:\Code\PStore\tasks\audit-phase8-C1-C3-C4.md 中的审校指令，逐条审校对应的源代码文件，按格式输出完整审校报告。每条必须有等级、描述、当前行为、计划要求、影响、建议。不要跳过任何条目。"
```
