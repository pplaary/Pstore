/**
 * N1 API 客户端
 *
 * 封装四个端点调用，5 秒超时。
 */

const DEFAULT_TIMEOUT = 5000;

async function request<T>(
  serverUrl: string,
  path: string,
  body: object,
  timeoutMs: number = DEFAULT_TIMEOUT,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${serverUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ==================== 类型 ====================

export interface ConfigGetResult {
  apiUrl: string;
  apiKey: string;
  textModel: string;
  visionModel: string;
}

export interface ConfigSetData {
  apiUrl?: string;
  apiKey?: string;
  textModel?: string;
  visionModel?: string;
}

export interface SyncProduct {
  id: string;
  name: string;
  price: number;
  barcode?: string;
  category: string;
  unit: string;
  imageUri?: string;
  isDeleted: number;
  updatedAt: string;
  createdAt: string;
}

export interface SyncResult {
  products: SyncProduct[];
  serverTime: string;
}

export interface PushChange {
  id: string;
  name: string;
  price: number;
  barcode?: string;
  category: string;
  unit: string;
  imageUri?: string;
  isDeleted: number;
  updatedAt: string;
}

// ==================== API 调用 ====================

export async function getConfig(
  serverUrl: string,
): Promise<ConfigGetResult> {
  return request<ConfigGetResult>(serverUrl, '/api/config/get', {});
}

export async function setConfig(
  serverUrl: string,
  pin: string,
  data: ConfigSetData,
): Promise<{ ok: true }> {
  return request<{ ok: true }>(serverUrl, '/api/config/set', { pin, ...data });
}

export async function syncProducts(
  serverUrl: string,
  after?: string,
): Promise<SyncResult> {
  return request<SyncResult>(serverUrl, '/api/products/sync', after ? { after } : {});
}

export async function pushProducts(
  serverUrl: string,
  changes: PushChange[],
): Promise<{ ok: true; count: number }> {
  return request<{ ok: true; count: number }>(serverUrl, '/api/products/push', { changes });
}

// ==================== AI 类型 ====================

export interface AiParseResult {
  name: string;
  category?: string;
  location?: string;
  description?: string;
  price?: string;
  acquired_at?: string;
  warranty_to?: string;
  barcode?: string;
  status?: string;
}

// 备注：Phase N AI 自然语言查询功能
export interface AiQueryResult {
  data: {
    answer: string;
    items: Array<{
      id: number;
      name: string;
      category: string;
      location: string;
      description: string;
      price: number | null;
      acquired_at: string;
      warranty_to: string;
      barcode: string;
      status: string;
    }>;
  };
}

// ==================== AI API 调用 ====================

const AI_TIMEOUT = 15000;

export async function aiParse(
  serverUrl: string,
  text: string,
): Promise<{ data?: AiParseResult; error?: string }> {
  return request(serverUrl, '/api/ai/parse', { text }, AI_TIMEOUT);
}

export async function aiParseImage(
  serverUrl: string,
  imageDataUrl: string,
): Promise<{ data?: AiParseResult; error?: string }> {
  return request(serverUrl, '/api/ai/parse-image', { imageDataUrl }, AI_TIMEOUT);
}
