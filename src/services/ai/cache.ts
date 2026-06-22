/**
 * AI 响应缓存与草稿管理
 *
 * - 相同输入 5 分钟内复用缓存（spec §7.4）
 * - 草稿卡 60 秒过期变灰（视觉提示，不阻断交互）
 */

import type { AIResponse } from '../ai';

// ==================== 常量 ====================

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟
const DRAFT_GREY_MS = 60 * 1000; // 60 秒

// ==================== 内部类型 ====================

interface CacheEntry {
  response: AIResponse;
  createdAt: number;
}

interface DraftEntry {
  response: AIResponse;
  createdAt: number;
}

// ==================== AIResponseCache 类 ====================

export class AIResponseCache {
  private cache: Map<string, CacheEntry> = new Map();
  private drafts: Map<string, DraftEntry> = new Map();

  /**
   * 检查缓存：命中且未过期返回 AIResponse，否则返回 null。
   *
   * 缓存 key = 用户输入 trim 后的结果。
   */
  get(userInput: string): AIResponse | null {
    const key = userInput.trim();
    const entry = this.cache.get(key);
    if (!entry) return null;

    // 过期检查
    if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    return entry.response;
  }

  /** 存入缓存（自动清理过期条目） */
  set(userInput: string, response: AIResponse): void {
    const key = userInput.trim();
    this.cache.set(key, { response, createdAt: Date.now() });
    this.evict();
  }

  /** 存入草稿 */
  setDraft(userInput: string, response: AIResponse): void {
    const key = userInput.trim();
    this.drafts.set(key, { response, createdAt: Date.now() });
  }

  /**
   * 获取草稿及是否已过期（60s）。
   *
   * 返回 `{ response, expired }`，UI 据此决定是否灰色显示。
   * 过期草稿仍可操作，仅为视觉提示（spec §7.4）。
   */
  getDraft(userInput: string): { response: AIResponse; expired: boolean } | null {
    const key = userInput.trim();
    const entry = this.drafts.get(key);
    if (!entry) return null;

    const expired = Date.now() - entry.createdAt > DRAFT_GREY_MS;
    return { response: entry.response, expired };
  }

  /**
   * 清理缓存和草稿中所有已过期条目。
   *
   * 缓存过期：5 分钟
   * 草稿过期：60 秒
   */
  evict(): void {
    const now = Date.now();

    // 清理过期缓存
    for (const [key, entry] of this.cache) {
      if (now - entry.createdAt > CACHE_TTL_MS) {
        this.cache.delete(key);
      }
    }

    // 清理过期草稿（与缓存共用 5 分钟 TTL）
    for (const [key, entry] of this.drafts) {
      if (now - entry.createdAt > CACHE_TTL_MS) {
        this.drafts.delete(key);
      }
    }
  }
}
