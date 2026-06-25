/**
 * 视觉识别服务
 *
 * 调用 AI 视觉模型 API（OpenAI 兼容格式）进行拍照商品识别。
 * 超时 10s（spec §14.2），失败时静默降级返回空候选列表。
 */

export interface VisionCandidate {
  name: string;
  confidence: number;   // 0~1
  spec?: string;
}

export interface VisionResponse {
  candidates: VisionCandidate[];
}

export interface AIConfig {
  apiUrl: string;
  apiKey: string;
  visionModel: string;
}

const TIMEOUT_MS = 10_000; // spec §14.2: AI API 超时 10s

/**
 * 调用视觉模型识别图片中的商品。
 *
 * @param imageBase64  base64 编码的图片（不含 data:image 前缀）
 * @param config       AI 配置
 * @returns            VisionResponse，失败时返回空 candidates
 */
export async function recognizeProduct(
  imageBase64: string,
  config: AIConfig,
): Promise<VisionResponse> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const url = `${config.apiUrl}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.visionModel,
        messages: [
          {
            role: 'system',
            content: '识别图中的商品，返回候选列表及置信度。',
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 500,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`vision API error: ${response.status} ${response.statusText}`);
      return { candidates: [] };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return { candidates: [] };
    }

    // 尝试解析 JSON 数组或含 JSON 的文本
    const candidates = parseVisionResponse(content);
    return { candidates };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn('vision API timeout');
    } else {
      console.warn('vision API failed:', err);
    }
    return { candidates: [] };
  }
}

/**
 * 从 AI 回复文本中解析候选列表。
 * 支持纯 JSON 数组或 Markdown 代码块中的 JSON。
 */
function parseVisionResponse(content: string): VisionCandidate[] {
  // 尝试提取 markdown 代码块中的 JSON
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : content.trim();

  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is { name: string; confidence: number; spec?: string } =>
          typeof item.name === 'string' && typeof item.confidence === 'number',
        )
        .map((item) => ({
          name: item.name,
          confidence: Math.max(0, Math.min(1, item.confidence)),
          spec: (item as any).spec,
        }));
    }
  } catch {
    // 非 JSON 格式，返回空
  }

  return [];
}
