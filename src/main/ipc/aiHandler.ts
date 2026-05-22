// ============================================================
// aiHandler — Main Process IPC Handler
// 处理 AI 流式对话请求，将 chunk 推送给渲染进程
// ============================================================

import { ipcMain, WebContents } from 'electron'
import type { AiService } from '../services/AiService'
import type { AiMessage } from '../../core/types/ai.types'
import { BUILTIN_SKILLS } from '../../core/skills/builtinSkills'

export function registerAiHandlers(
  aiService: AiService,
  getWebContents: () => WebContents | null,
): void {

  // --------------------------------------------------------
  // ai:skills — 获取所有内置技能列表
  // --------------------------------------------------------
  ipcMain.handle('ai:skills', async () => {
    return BUILTIN_SKILLS
  })

  // --------------------------------------------------------
  // ai:chat — 非流式调用（快速单次问答）
  // --------------------------------------------------------
  ipcMain.handle('ai:chat', async (
    _event,
    { messages, skillId, maxTokens }: {
      messages:   AiMessage[]
      skillId?:   string
      maxTokens?: number
    },
  ) => {
    try {
      const result = await aiService.chat(messages, skillId, maxTokens)
      return { success: true, content: result }
    } catch (err) {
      return { success: false, content: '', error: (err as Error).message }
    }
  })

  // --------------------------------------------------------
  // ai:chat-stream — 流式调用
  // 每个 chunk 通过 ai:stream-chunk 推送到渲染进程
  // 完成后发 ai:stream-done
  // --------------------------------------------------------
  ipcMain.handle('ai:chat-stream', async (
    _event,
    { sessionId, messages, skillId, maxTokens }: {
      sessionId:  string
      messages:   AiMessage[]
      skillId?:   string
      maxTokens?: number
    },
  ) => {
    const wc = getWebContents()
    if (!wc || wc.isDestroyed()) {
      return { success: false, error: 'WebContents 不可用' }
    }

    // 开始流式请求（不 await，让它在后台跑）
    aiService.chatStream(
      messages,
      // onChunk
      (chunk) => {
        if (!wc.isDestroyed()) {
          wc.send('ai:stream-chunk', sessionId, chunk)
        }
      },
      // onDone
      (fullText) => {
        if (!wc.isDestroyed()) {
          wc.send('ai:stream-done', sessionId, fullText)
        }
      },
      // onError
      (errMsg) => {
        if (!wc.isDestroyed()) {
          wc.send('ai:stream-error', sessionId, errMsg)
        }
      },
      skillId,
      maxTokens,
    ).catch(err => {
      if (!wc.isDestroyed()) {
        wc.send('ai:stream-error', sessionId, (err as Error).message)
        wc.send('ai:stream-done', sessionId, '')
      }
    })

    return { success: true }
  })
}
