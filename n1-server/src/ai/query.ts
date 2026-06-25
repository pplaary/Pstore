import { db } from '../db';
import type { ItemRecord, ItemType } from './items';
import { getAllItems, getDateBoundaries, getItemWarrantyState } from './items';
import { isRecord, parseAiJsonResponse } from './json-utils';
import type { QueryResponseStyle } from './types';

// ---------------------------------------------------------------------------
// ID / name matching
// ---------------------------------------------------------------------------

function formatItemDisplayName(item: ItemType) {
  return item.name;
}

export function normalizeIdList(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as number[];
  }

  return value
    .map((item) => {
      if (typeof item === 'number' && Number.isFinite(item)) {
        return item;
      }

      if (typeof item === 'string') {
        const numeric = Number(item);
        return Number.isFinite(numeric) ? numeric : null;
      }

      return null;
    })
    .filter((item): item is number => item !== null);
}

function matchItemByName(items: ItemType[], name: string) {
  const normalizedName = name.trim().toLowerCase();

  if (!normalizedName) {
    return undefined;
  }

  return items.find((item) => {
    const itemNames = [
      item.name,
      item.barcode,
      formatItemDisplayName(item),
    ]
      .filter(Boolean)
      .map((val) => val.toLowerCase());

    return itemNames.some(
      (candidate) =>
        candidate === normalizedName ||
        candidate.includes(normalizedName) ||
        normalizedName.includes(candidate),
    );
  });
}

export function collectMatchedItems(payload: unknown, items: ItemType[]) {
  const matched = new Map<number, ItemType>();

  const addById = (id: number) => {
    const item = items.find((it) => it.id === id);

    if (item) {
      matched.set(item.id, item);
    }
  };

  const addByName = (name: string) => {
    const item = matchItemByName(items, name);

    if (item) {
      matched.set(item.id, item);
    }
  };

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (!isRecord(value)) {
      return;
    }

    normalizeIdList(value.item_ids).forEach(addById);
    normalizeIdList(value.ids).forEach(addById);
    normalizeIdList(value.itemIds).forEach(addById);

    if (typeof value.id === 'number') {
      addById(value.id);
    } else if (typeof value.id === 'string') {
      const numericId = Number(value.id);
      if (Number.isFinite(numericId)) {
        addById(numericId);
      }
    }

    if (typeof value.name === 'string') {
      addByName(value.name);
    }

    if (typeof value.barcode === 'string') {
      addByName(value.barcode);
    }

    if (Array.isArray(value.items)) {
      value.items.forEach(visit);
    }

    if (Array.isArray(value.results)) {
      value.results.forEach(visit);
    }
  };

  visit(payload);

  return Array.from(matched.values());
}

// ---------------------------------------------------------------------------
// Inventory / fast-path detection
// ---------------------------------------------------------------------------

export function isInventoryQuestion(question: string) {
  const normalized = question.replace(/\s+/g, '');
  const patterns = [
    '都有什么',
    '有什么',
    '所有物品',
    '全部物品',
    '物品清单',
    '物品列表',
    '清单',
    '库存',
  ];

  return patterns.some((pattern) => normalized.includes(pattern));
}

// ---------------------------------------------------------------------------
// Marker extraction & cleanup
// ---------------------------------------------------------------------------

const QUERY_ID_MARKER = '[[PSTORE_IDS:';
const LEGACY_ID_MARKER = '[ids:';

function parseIdText(value: string) {
  return value
    .split(/[,\s，、；;]+/)
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
}

export function extractIdsFromAnswer(answer: string) {
  const matches = [
    answer.match(/\[\[PSTORE_IDS:\s*([^\]]*?)\s*\]\]/i)?.[1],
    answer.match(/\[ids:\s*([^\]]*?)\s*\]/i)?.[1],
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(matches.flatMap(parseIdText)));
}

export function stripQueryMetadata(answer: string) {
  return answer
    .replace(/\s*(\[\[PSTORE_IDS:\s*[^\]]*?\s*\]\]|\[ids:\s*[^\]]*?\s*\])\s*$/i, '')
    .replace(/^\s+/, '')
    .replace(/\s+$/, '');
}

export function collectMentionedItemsFromText(answer: string, items: ItemType[]) {
  const normalizedAnswer = answer.trim().toLowerCase();

  if (!normalizedAnswer) {
    return [] as ItemType[];
  }

  return items.filter((item) => {
    const candidates = [
      item.name,
      item.barcode,
      formatItemDisplayName(item),
    ]
      .filter(Boolean)
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length >= 2);

    return candidates.some((candidate) => normalizedAnswer.includes(candidate));
  });
}

export function getSafeQueryStreamChunk(buffer: string) {
  const markerIndex = Math.max(buffer.lastIndexOf(QUERY_ID_MARKER), buffer.lastIndexOf(LEGACY_ID_MARKER));

  if (markerIndex >= 0) {
    return buffer.slice(0, markerIndex);
  }

  const holdBackLength = Math.max(QUERY_ID_MARKER.length, LEGACY_ID_MARKER.length) - 1;

  if (buffer.length <= holdBackLength) {
    return '';
  }

  return buffer.slice(0, buffer.length - holdBackLength);
}

// ---------------------------------------------------------------------------
// Answer builders
// ---------------------------------------------------------------------------

function formatItemBullet(
  item: ItemType,
  todayStr: string,
  in30daysStr: string,
) {
  const status = getItemWarrantyState(item, todayStr, in30daysStr);
  const tags: string[] = [];

  if (status === 'expired') {
    tags.push('已过保');
  } else if (status === 'expiring') {
    tags.push('即将过保');
  }

  if (item.category) {
    tags.push(item.category);
  }

  return `- **${formatItemDisplayName(item)}**${tags.length > 0 ? `：${tags.join(' · ')}` : ''}`;
}

function buildQueryNotes(
  items: ItemType[],
  todayStr: string,
  in30daysStr: string,
  expiringDays: number,
) {
  const expired = items.filter(
    (item) => getItemWarrantyState(item, todayStr, in30daysStr) === 'expired',
  );
  const expiring = items.filter(
    (item) => getItemWarrantyState(item, todayStr, in30daysStr) === 'expiring',
  );
  const lines: string[] = [];

  if (expired.length > 0 || expiring.length > 0) {
    lines.push('### 质保提示');
  }

  if (expired.length > 0) {
    lines.push(`- **已过保**：${expired.map(formatItemDisplayName).join('、')}`);
  }

  if (expiring.length > 0) {
    lines.push(`- **${expiringDays} 天内过保**：${expiring.map(formatItemDisplayName).join('、')}`);
  }

  return lines;
}

export function buildInventoryAnswer(
  items: ItemType[],
  todayStr: string,
  in30daysStr: string,
  expiringDays: number,
  responseStyle: QueryResponseStyle,
) {
  const expired = items.filter(
    (item) => getItemWarrantyState(item, todayStr, in30daysStr) === 'expired',
  );
  const expiring = items.filter(
    (item) => getItemWarrantyState(item, todayStr, in30daysStr) === 'expiring',
  );
  const previewNames = items
    .slice(0, 5)
    .map((item) => `**${formatItemDisplayName(item)}**`)
    .join('、');
  const lines = [
    '### 物品库概况',
    `- 共 **${items.length}** 件物品；已过保 **${expired.length}** 件；${expiringDays} 天内过保 **${expiring.length}** 件`,
    previewNames
      ? `- 物品包括：${previewNames}${items.length > 5 ? ` 等 ${items.length} 件` : ''}`
      : '- 下方卡片可查看完整清单',
  ];

  if (responseStyle === 'detailed') {
    const categorySummary = new Map<string, number>();

    items.forEach((item) => {
      const key = item.category || '未分类';
      categorySummary.set(key, (categorySummary.get(key) || 0) + 1);
    });

    const topCategories = Array.from(categorySummary.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => `${name} ${count} 件`);

    if (topCategories.length > 0) {
      lines.push(`- 分类分布：${topCategories.join('，')}`);
    }
  }

  const notes = buildQueryNotes(items, todayStr, in30daysStr, expiringDays);

  if (notes.length > 0) {
    lines.push('', ...notes);
  }

  return lines.join('\n');
}

export function buildMatchedAnswer(
  items: ItemType[],
  todayStr: string,
  in30daysStr: string,
  expiringDays: number,
  responseStyle: QueryResponseStyle,
) {
  if (items.length === 0) {
    return '### 查询结果\n物品库中没有相关物品。';
  }

  const preview = items.slice(0, 3);
  let displayedCount = preview.length;
  const lines = [
    '### 查询结果',
    `- 找到 **${items.length}** 个相关物品`,
    ...preview.map((item) => formatItemBullet(item, todayStr, in30daysStr)),
  ];

  if (responseStyle === 'detailed' && items.length > 0) {
    const extraPreview = items.slice(preview.length, preview.length + 2);

    extraPreview.forEach((item) => {
      lines.push(formatItemBullet(item, todayStr, in30daysStr));
    });
    displayedCount += extraPreview.length;
  }

  if (items.length > displayedCount) {
    lines.push(`- 其余结果请看下方物品卡片`);
  }

  const notes = buildQueryNotes(items, todayStr, in30daysStr, expiringDays);

  if (notes.length > 0) {
    lines.push('', ...notes);
  }

  return lines.join('\n');
}

export function buildEmptyBoxAnswer(responseStyle: QueryResponseStyle) {
  if (responseStyle === 'detailed') {
    return '### 物品库状态\n物品库目前是空的，请先添加物品。\n- 可以先用 AI 解析录入物品\n- 录入后我就能帮你按分类、位置和质保状态检索';
  }

  return '### 物品库状态\n物品库是空的，请先添加物品。';
}

/**
 * Minimal cleanup: collapse excessive blank lines and trim.
 */
export function sanitizeQueryAnswer(answer: string) {
  return answer.replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------------------
// Resolve AI query result into final answer + matched items
// ---------------------------------------------------------------------------

function mergeMatched(...lists: ItemType[][]) {
  const seen = new Map<number, ItemType>();
  for (const list of lists) {
    for (const m of list) {
      if (!seen.has(m.id)) seen.set(m.id, m);
    }
  }
  return Array.from(seen.values());
}

export function resolveQueryResult(
  raw: string,
  items: ItemType[],
  todayStr: string,
  in30daysStr: string,
  expiringDays: number,
  responseStyle: QueryResponseStyle,
) {
  const parsed = parseAiJsonResponse<{
    answer?: string;
    item_ids?: number[];
    ids?: number[];
    id?: number | string;
    name?: string;
    barcode?: string;
    items?: Array<{ id?: number | string; name?: string }>;
  } | null>(raw);

  // Primary: match item names mentioned in the answer text
  const strippedText = stripQueryMetadata(raw);
  const matchedFromText = collectMentionedItemsFromText(strippedText, items);

  // Supplement: structured IDs from marker or JSON payload
  const matchedFromMarker = collectMatchedItems(
    { item_ids: extractIdsFromAnswer(raw) },
    items,
  );
  const matchedFromPayload =
    parsed && isRecord(parsed)
      ? collectMatchedItems(
          {
            item_ids: parsed.item_ids,
            ids: parsed.ids,
            id: parsed.id,
            name: parsed.name,
            barcode: parsed.barcode,
            items: parsed.items,
          },
          items,
        )
      : [];

  const matched = mergeMatched(matchedFromText, matchedFromMarker, matchedFromPayload);

  const parsedAnswer =
    parsed && isRecord(parsed) && typeof parsed.answer === 'string'
      ? sanitizeQueryAnswer(stripQueryMetadata(parsed.answer))
      : '';
  const answer = parsedAnswer.trim() || sanitizeQueryAnswer(strippedText).trim();

  if (answer) {
    return {
      data: {
        answer,
        items: matched,
      },
    };
  }

  if (matched.length > 0) {
    return {
      data: {
        answer: buildMatchedAnswer(
          matched,
          todayStr,
          in30daysStr,
          expiringDays,
          responseStyle,
        ),
        items: matched,
      },
    };
  }

  return { error: 'AI returned invalid format', raw };
}
