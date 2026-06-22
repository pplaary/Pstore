/**
 * 对话上下文管理器
 *
 * 维护最近 10 轮对话（每轮 = 用户输入 + AI 回复），FIFO 溢出。
 * 构造完整 messages 数组供 AI API 调用。
 *
 * spec §7.2: 最大 10 轮对话上下文
 */

import type { AIMessage, AIResponse } from '../ai';
import type { RAGContext } from './rag';

// ==================== 类型 ====================

/** 一轮对话 */
export interface ConversationRound {
  userInput: string;
  aiResponse: AIResponse;
}

// ==================== 常量 ====================

const MAX_ROUNDS = 10; // spec §7.2: 最大 10 轮，FIFO 溢出

// ==================== ChatManager 类 ====================

/**
 * 对话管理器。
 *
 * 维护上下文窗口（最近 10 轮），构造完整的 messages 数组供 AI API 调用。
 * 购物车快照和模式随每次请求注入。
 */
export class ChatManager {
  private rounds: ConversationRound[] = [];

  /** 添加一轮对话，超出 10 轮时 FIFO 丢弃最旧轮次 */
  addRound(userInput: string, aiResponse: AIResponse): void {
    this.rounds.push({ userInput, aiResponse });
    // FIFO 溢出：超过最大轮次时移除最旧的
    while (this.rounds.length > MAX_ROUNDS) {
      this.rounds.shift()!;
    }
  }

  /** 获取最近 N 轮对话（默认 10 轮） */
  getRecentRounds(count = MAX_ROUNDS): ConversationRound[] {
    if (count >= this.rounds.length) {
      return [...this.rounds];
    }
    return this.rounds.slice(-count);
  }

  /** 清空对话历史 */
  clear(): void {
    this.rounds = [];
  }

  /**
   * 构造完整的 messages 数组：
   *
   *   [system]   ← buildSystemPrompt(cartSnapshot, mode, rag.summary)
   *   [user_1, assistant_1, ..., user_N, assistant_N]
   *   [user_current]
   *
   * @param buildSystemPrompt 用于构造 system prompt 的函数
   * @param userInput         当前用户输入
   * @param cartSnapshot      购物车快照字符串
   * @param mode              当前模式：NORMAL | ADMIN
   * @param rag               RAG 上下文
   */
  buildMessages(
    buildSystemPrompt: (context: {
      cartSnapshot: string;
      mode: 'NORMAL' | 'ADMIN';
      productSummary: string;
    }) => string,
    userInput: string,
    cartSnapshot: string,
    mode: 'NORMAL' | 'ADMIN',
    rag: RAGContext,
  ): AIMessage[] {
    const messages: AIMessage[] = [];

    // 1. system message：注入购物车快照、模式、RAG 摘要
    messages.push({
      role: 'system',
      content: buildSystemPrompt({
        cartSnapshot,
        mode,
        productSummary: rag.summary,
      }),
    });

    // 2. 历史对话轮次
    for (const round of this.rounds) {
      messages.push({ role: 'user', content: round.userInput });
      messages.push({
        role: 'assistant',
        content: JSON.stringify(round.aiResponse),
      });
    }

    // 3. 当前用户输入
    messages.push({ role: 'user', content: userInput });

    return messages;
  }
}
