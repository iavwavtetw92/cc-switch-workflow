// ============================================================
// useAi — Composable
// 统一 AI 调用入口，管理流式输出状态
// ============================================================

import { ref, onUnmounted } from 'vue'
import type { AiMessage, Skill } from '@core/types/ai.types'

let _sessionCounter = 0

export function useAi() {
  const isStreaming = ref(false)
  const streamText  = ref('')
  const error       = ref<string | null>(null)

  const _cleanups: Array<() => void> = []

  // ──────────────────────────────────────────────────────────
  // 流式调用（主要入口）
  // onChunk: 每收到一段就回调（用于实时追加到 UI）
  // onDone:  完成，返回完整文本
  // ──────────────────────────────────────────────────────────

  async function chatStream(
    messages: AiMessage[],
    skillId?: string,
    onChunk?: (chunk: string) => void,
    onDone?:  (full: string) => void,
  ): Promise<void> {
    // 取消正在进行的请求
    cancel()

    const sessionId = `ai-${++_sessionCounter}-${Date.now()}`
    isStreaming.value = true
    streamText.value  = ''
    error.value = null

    // 注册流式事件监听
    const onChunkEvent  = (sid: string, chunk: string) => {
      if (sid !== sessionId) return
      streamText.value += chunk
      onChunk?.(chunk)
    }
    const onDoneEvent = (sid: string, full: string) => {
      if (sid !== sessionId) return
      isStreaming.value = false
      streamText.value  = full
      onDone?.(full)
      cleanup()
    }
    const onErrorEvent = (sid: string, msg: string) => {
      if (sid !== sessionId) return
      error.value = msg
      isStreaming.value = false
      cleanup()
    }

    window.electronAPI.on('ai:stream-chunk', onChunkEvent)
    window.electronAPI.on('ai:stream-done',  onDoneEvent)
    window.electronAPI.on('ai:stream-error', onErrorEvent)

    function cleanup() {
      window.electronAPI.off('ai:stream-chunk', onChunkEvent)
      window.electronAPI.off('ai:stream-done',  onDoneEvent)
      window.electronAPI.off('ai:stream-error', onErrorEvent)
    }
    _cleanups.push(cleanup)

    // 发起请求（不 await，主进程后台流式推送）
    await window.electronAPI.aiChatStream({ sessionId, messages, skillId })
  }

  // ──────────────────────────────────────────────────────────
  // 取消当前流式请求
  // ──────────────────────────────────────────────────────────

  function cancel() {
    isStreaming.value = false
    _cleanups.forEach(fn => fn())
    _cleanups.length = 0
  }

  // ──────────────────────────────────────────────────────────
  // 构建消息列表的辅助函数
  // ──────────────────────────────────────────────────────────

  function buildMessages(userContent: string, context?: string): AiMessage[] {
    const msgs: AiMessage[] = []
    if (context) {
      msgs.push({ role: 'user', content: `上下文：\n\`\`\`\n${context}\n\`\`\`` })
      msgs.push({ role: 'assistant', content: '好的，我已经了解上下文，请说明你的问题。' })
    }
    msgs.push({ role: 'user', content: userContent })
    return msgs
  }

  // 获取技能列表
  async function getSkills(): Promise<Skill[]> {
    try {
      return await (window.electronAPI as any).aiSkills() ?? []
    } catch {
      return []
    }
  }

  onUnmounted(() => cancel())

  return {
    isStreaming,
    streamText,
    error,
    chatStream,
    cancel,
    buildMessages,
    getSkills,
  }
}
