// ============================================================
// AiService — Main Process Service
// 通过 CC Switch 当前激活的 provider 调用 AI
// 支持流式输出，兼容所有 OpenAI-compatible API
// ============================================================

import { net } from 'electron'
import type { AiMessage } from '../../core/types/ai.types'
import { getSkillById } from '../../core/skills/builtinSkills'
import type { CcSwitchAdapter } from '../../adapters/cc-switch/CcSwitchAdapter'

export class AiService {
  private ccSwitch: CcSwitchAdapter

  constructor(ccSwitch: CcSwitchAdapter) {
    this.ccSwitch = ccSwitch
  }

  // --------------------------------------------------------
  // 获取当前 provider 配置
  // --------------------------------------------------------

  private async getProviderConfig(): Promise<{
    baseUrl: string
    apiKey:  string
    model:   string
  } | null> {
    try {
      const provider = await this.ccSwitch.getCurrentProvider()
      if (!provider) {
        console.warn('[AiService] 未找到当前激活的 provider')
        return null
      }

      // 从 db 读到的原始行里有 apiUrl / modelName / apiKey
      const raw = provider as any
      const baseUrl = raw.apiUrl ?? raw.baseUrl ?? raw.base_url ?? 'http://localhost:11434/v1'
      const model   = raw.modelName ?? raw.model_name ?? raw.models?.[0] ?? 'gpt-4o'
      const apiKey  = raw.apiKey ?? raw.api_key ?? 'sk-no-key'

      return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey, model }
    } catch (err) {
      console.error('[AiService] 获取 provider 失败:', err)
      return null
    }
  }

  // --------------------------------------------------------
  // 非流式调用（简单场景）
  // --------------------------------------------------------

  async chat(
    messages:  AiMessage[],
    skillId?:  string,
    maxTokens = 2048,
  ): Promise<string> {
    const config = await this.getProviderConfig()
    if (!config) return '[错误：未配置 AI provider，请先在 CC Switch 中设置模型]'

    const finalMessages = this.buildMessages(messages, skillId)

    const body = JSON.stringify({
      model:      config.model,
      messages:   finalMessages,
      max_tokens: maxTokens,
      stream:     false,
    })

    return new Promise((resolve, reject) => {
      const request = net.request({
        method:   'POST',
        url:      `${config.baseUrl}/chat/completions`,
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
      })

      let responseBody = ''
      request.on('response', (response) => {
        response.on('data', (chunk) => { responseBody += chunk.toString() })
        response.on('end', () => {
          try {
            const json = JSON.parse(responseBody)
            const content = json.choices?.[0]?.message?.content ?? json.error?.message ?? '[空响应]'
            resolve(content)
          } catch {
            resolve(`[解析失败] ${responseBody.substring(0, 200)}`)
          }
        })
      })
      request.on('error', (err) => {
        reject(new Error(`AI 请求失败: ${err.message}`))
      })
      request.write(body)
      request.end()
    })
  }

  // --------------------------------------------------------
  // 流式调用（主要使用场景）
  // onChunk: 每收到一段文字就回调
  // onDone:  完成
  // --------------------------------------------------------

  async chatStream(
    messages:  AiMessage[],
    onChunk:   (chunk: string) => void,
    onDone:    (fullText: string) => void,
    onError:   (err: string) => void,
    skillId?:  string,
    maxTokens = 2048,
  ): Promise<void> {
    const config = await this.getProviderConfig()
    if (!config) {
      onError('[错误：未配置 AI provider，请先在 CC Switch 中设置模型]')
      onDone('')
      return
    }

    const finalMessages = this.buildMessages(messages, skillId)

    const body = JSON.stringify({
      model:      config.model,
      messages:   finalMessages,
      max_tokens: maxTokens,
      stream:     true,
    })

    let fullText = ''

    const request = net.request({
      method:   'POST',
      url:      `${config.baseUrl}/chat/completions`,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'Accept':        'text/event-stream',
      },
    })

    request.on('response', (response) => {
      let buffer = ''

      response.on('data', (chunk) => {
        buffer += chunk.toString()
        // 按 SSE 行解析
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''   // 最后一行可能不完整，留着

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === 'data: [DONE]') continue
          if (!trimmed.startsWith('data: ')) continue

          try {
            const json = JSON.parse(trimmed.slice(6))
            const delta = json.choices?.[0]?.delta?.content ?? ''
            if (delta) {
              fullText += delta
              onChunk(delta)
            }
          } catch { /* 忽略非 JSON 行 */ }
        }
      })

      response.on('end', () => {
        onDone(fullText)
      })
    })

    request.on('error', (err) => {
      onError(`AI 请求失败: ${err.message}`)
      onDone(fullText)
    })

    request.write(body)
    request.end()
  }

  // --------------------------------------------------------
  // 构建最终消息列表（注入 skill system prompt）
  // --------------------------------------------------------

  private buildMessages(messages: AiMessage[], skillId?: string): AiMessage[] {
    const skill = skillId ? getSkillById(skillId) : undefined

    if (skill) {
      // 将 skill prompt 作为 system message 插入最前面
      return [
        { role: 'system', content: skill.prompt },
        ...messages.filter(m => m.role !== 'system'),
      ]
    }

    // 无 skill 时若没有 system，加一个通用的
    const hasSystem = messages.some(m => m.role === 'system')
    if (!hasSystem) {
      return [
        { role: 'system', content: '你是一个专业的开发助手，简洁、准确地回答问题。' },
        ...messages,
      ]
    }

    return messages
  }
}
