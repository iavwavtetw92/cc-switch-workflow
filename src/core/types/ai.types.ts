// ============================================================
// AI Types — Core Layer
// ============================================================

/** 对话消息 */
export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** AI 调用请求 */
export interface AiRequest {
  sessionId: string
  messages:  AiMessage[]
  skillId?:  string
  /** 最大 token 数，默认 2048 */
  maxTokens?: number
}

/** 流式 chunk */
export interface AiStreamChunk {
  sessionId: string
  delta:     string
  done:      boolean
  error?:    string
}

/** Skill 技能包 */
export interface Skill {
  id:         string
  name:       string
  icon:       string
  /** System prompt 模板，支持 {{input}} 占位符 */
  prompt:     string
  /** 适用的面板类型 */
  panelTypes: Array<'workbox' | 'learnbox' | 'searchbox'>
  /** 输入模式 */
  inputMode:  'selection' | 'all' | 'query+results'
}
