import type { ChatMessage, QueryResponseStyle } from './types';
import type { ItemType } from './items';

export function buildParsePrompt(categories: string[]) {
  return `你是一个物品信息提取助手。用户会描述一个物品，你需要从中提取结构化信息。
请严格按照以下 JSON 格式返回，不要有任何其他文字：
{
  "name": "物品名称（必填）",
  "category": "分类（选填）",
  "location": "存放位置（选填）",
  "description": "描述/用途（选填）",
  "price": "购买价格如 ¥99（选填）",
  "acquired_at": "购买日期 YYYY-MM-DD（选填）",
  "warranty_to": "质保截止日 YYYY-MM-DD（选填）",
  "barcode": "条码（选填）",
  "status": "状态：active/archived/damaged/lost（默认 active）"
}

规则：
- name 使用物品常见名称，简洁明了
- category 优先从以下已有分类选择：${categories.join('、')}。如果都不匹配，可以新建合理的分类名（选填）
- price 保留用户原始说法（如"约¥99""大概200块"），不需要严格数字化
- acquired_at 和 warranty_to 只有年月时默认为当月最后一天；完全不确定时留空字符串
- status 默认为 "active"

示例输入：戴尔显示器U2723QE，¥3499，2025年1月购入，放在书房书桌上，质保3年到2028年1月
示例输出：
{
  "name": "戴尔显示器U2723QE",
  "category": "电子产品",
  "location": "书房书桌",
  "description": "4K显示器",
  "price": "¥3499",
  "acquired_at": "2025-01-31",
  "warranty_to": "2028-01-31",
  "barcode": "",
  "status": "active"
}

示例输入：工具箱一套，放在车库，去年双十一买的，大概200块
示例输出：
{
  "name": "工具箱一套",
  "category": "工具",
  "location": "车库",
  "description": "",
  "price": "约¥200",
  "acquired_at": "",
  "warranty_to": "",
  "barcode": "",
  "status": "active"
}`;
}

export function buildImageParsePrompt(categories: string[]) {
  return `你是一个物品信息提取助手。用户会提供一张物品照片，你需要从中提取结构化信息。
请严格按照以下 JSON 格式返回，不要有任何其他文字：
{
  "name": "物品名称（必填）",
  "category": "分类（选填）",
  "location": "存放位置（选填）",
  "description": "描述/用途（选填）",
  "price": "购买价格如 ¥99（选填）",
  "acquired_at": "购买日期 YYYY-MM-DD（选填）",
  "warranty_to": "质保截止日 YYYY-MM-DD（选填）",
  "barcode": "条码（选填）",
  "status": "状态：active/archived/damaged/lost（默认 active）"
}

规则：
- 优先从照片中读取物品名称、品牌、型号
- category 优先从以下已有分类选择：${categories.join('、')}。如果都不匹配，可以新建合理的分类名
- 条码通常印在包装盒侧面或底部
- 如果图片模糊或信息不完整，只提取能确认的字段，其他留空字符串
- 不要猜测图片中看不到的信息`;
}

export function buildBatchParsePrompt(categories: string[], itemCount: number) {
  return `你是一个物品信息提取助手。用户将描述 ${itemCount} 个物品（每行一个），请返回一个 JSON 对象，其中 "items" 字段是一个数组，每个元素对应一行物品。
严格按照以下格式返回，不要有任何其他文字：
{
  "items": [
    {
      "name": "物品名称（必填）",
      "category": "分类（选填）",
      "location": "存放位置（选填）",
      "description": "描述/用途（选填）",
      "price": "购买价格如 ¥99（选填）",
      "acquired_at": "购买日期 YYYY-MM-DD（选填）",
      "warranty_to": "质保截止日 YYYY-MM-DD（选填）",
      "barcode": "条码（选填）",
      "status": "状态：active/archived/damaged/lost（默认 active）"
    }
  ]
}
请确保 items 数组长度与输入行数一致（${itemCount} 个元素）。`;
}

export function buildImageParseMessages(categories: string[], imageDataUrl: string): ChatMessage[] {
  return [
    { role: 'system', content: buildImageParsePrompt(categories) },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageDataUrl } },
        {
          type: 'text',
          text: `请从这张物品照片中提取物品信息。
注意：
- 优先读取物品名称、品牌、型号
- 条码通常印在包装盒侧面或底部
- 如果图片模糊或信息不完整，只提取能确认的字段，其他留空字符串
- 不要猜测图片中看不到的信息`,
        },
      ],
    },
  ];
}

export function buildQueryPrompt(
  todayStr: string,
  in30daysStr: string,
  expiringDays: number,
  responseStyle: QueryResponseStyle,
) {
  const styleInstruction =
    responseStyle === 'detailed'
      ? '2. 正文可以使用 4 到 6 个短要点，允许补充简短判断依据、注意事项和下一步建议\n3. 不要使用代码块，不要写成长篇大段文本，不要使用嵌套列表\n4. 保持信息充分但克制，优先给最相关的物品和关键理由'
      : '2. 控制篇幅，正文尽量保持在 2 到 4 个短要点内\n3. 不要使用代码块，不要写成长篇大段文本，不要使用嵌套列表\n4. 只给结论和最关键的信息；位置、详细说明会由界面单独展示，除非它们对回答关键';

  return `你是物品管理助手。下面是用户物品库中所有物品的完整数据（JSON 数组）。

今天的日期是：${todayStr}（YYYY-MM-DD格式）
质保判断：warranty_to < '${todayStr}' 为已过保，'${todayStr}' <= warranty_to <= '${in30daysStr}' 为即将过保（${expiringDays}天内）。
回答风格：${responseStyle === 'detailed' ? '详细' : '简洁'}

请根据用户的问题和物品数据，给出简洁、有用的回答。
规则：
1. 回答使用中文 Markdown，优先使用短标题、列表和强调，不要输出 JSON
${styleInstruction}
5. 如果命中多个物品，优先提最相关的 1 到 3 个，不要把所有细节全部展开
6. 如果查询结果为空或没有匹配物品，明确告知物品库中没有相关物品
7. 如果回答涉及的物品中有已过保的，提醒用户关注质保状态
8. 只能基于提供的数据回答，不要编造物品信息
9. 不要输出超出物品库数据范围的建议板块
10. 在回答中尽量提及相关物品的完整名称，以便系统自动识别
11. 最后一行必须单独输出机器标记，格式固定为：[[PSTORE_IDS:1,3,5]]
12. 如果没有匹配物品，最后一行输出：[[PSTORE_IDS:]]
13. 不要在正文解释这个机器标记`;
}

export function buildQueryMessages(
  question: string,
  items: ItemType[],
  todayStr: string,
  in30daysStr: string,
  expiringDays: number,
  responseStyle: QueryResponseStyle,
) {
  return [
    {
      role: 'system' as const,
      content: buildQueryPrompt(todayStr, in30daysStr, expiringDays, responseStyle),
    },
    {
      role: 'user' as const,
      content: `物品数据：${JSON.stringify(items)}\n\n用户问题：${question}`,
    },
  ];
}
