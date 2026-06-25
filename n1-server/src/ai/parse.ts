import { callAiJson } from './client';
import { isRecord } from './json-utils';
import { getDynamicCategories, normalizeItemDraftPayload } from './items';
import { buildImageParseMessages, buildParsePrompt } from './prompts';

export async function parseItemText(
  apiKey: string,
  baseUrl: string,
  model: string,
  text: string,
) {
  const categories = getDynamicCategories();
  const { parsed, raw } = await callAiJson<Record<string, string> | null>(
    apiKey,
    baseUrl,
    model,
    [
      { role: 'system', content: buildParsePrompt(categories) },
      { role: 'user', content: text },
    ],
  );

  if (!isRecord(parsed)) {
    return { error: 'AI returned invalid format', raw };
  }

  return {
    data: normalizeItemDraftPayload(parsed),
  };
}

export async function parseItemImage(
  apiKey: string,
  baseUrl: string,
  model: string,
  imageDataUrl: string,
) {
  const categories = getDynamicCategories();
  const messages = buildImageParseMessages(categories, imageDataUrl);
  const { parsed, raw } = await callAiJson<Record<string, string> | null>(
    apiKey,
    baseUrl,
    model,
    messages,
  );

  if (!isRecord(parsed)) {
    return { error: 'AI returned invalid format', raw };
  }

  return { data: normalizeItemDraftPayload(parsed) };
}
