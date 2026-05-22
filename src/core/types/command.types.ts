// ============================================================
// Command Types — Core Layer
// 统一输入解析相关类型
// ============================================================

/** 解析后的命令类型 */
export type ParsedCommandType =
  | 'workflow'          // >工作流ID  触发工作流
  | 'workflow-alias'    // >gs 等别名
  | 'direct'            // @1:内容  直接分发到面板
  | 'mcp'               // mcp:tool:params
  | 'cc-switch'         // cc:switch:modelId
  | 'cc-list'           // cc:list  列出所有模型
  | 'plain'             // 普通文本，发送到焦点面板

export interface ParsedCommand {
  type: ParsedCommandType
  raw: string

  // workflow / workflow-alias
  workflowId?: string
  alias?: string

  // direct
  target?: string
  content?: string

  // mcp
  tool?: string
  params?: Record<string, unknown>

  // cc-switch
  action?: string
  modelId?: string
}

/** 命令别名映射 */
export interface CommandAlias {
  alias: string
  workflowId: string
  description?: string
}

/** 输入解析错误 */
export interface ParseError {
  raw: string
  reason: string
}
