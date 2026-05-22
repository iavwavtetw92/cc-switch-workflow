// ============================================================
// Workflow Types — Core Layer
// 纯类型定义，无任何框架依赖
// ============================================================

/** 面板目标 */
export type PanelTarget =
  | 'workbox1'
  | 'workbox2'
  | 'learnbox'
  | 'searchbox1'
  | 'searchbox2'
  | 'auto'        // 自动选择空闲面板
  | 'focused'     // 当前焦点面板
  | 'all-workbox' // 广播到所有工作框

/** 工作流步骤类型 */
export type StepType =
  | 'terminal'   // 执行终端命令
  | 'editor'     // 在编辑器中打开/写入内容
  | 'search'     // 触发搜索
  | 'mcp'        // 调用 MCP 工具
  | 'cc-switch'  // 切换 AI 模型
  | 'delay'      // 等待 N 毫秒
  | 'notify'     // 发送通知（UI 提示）

/** 步骤等待策略 */
export type WaitStrategy =
  | 'none'      // 不等待，立即执行下一步（并行）
  | 'complete'  // 等待当前步骤完成
  | 'ready'     // 等待面板就绪（有响应）

/** 触发器类型 */
export type TriggerType = 'shortcut' | 'schedule' | 'manual'

// --------------------------------------------------------
// 工作流步骤
// --------------------------------------------------------
export interface WorkflowStep {
  id: string
  name?: string
  type: StepType
  target: PanelTarget
  /** 命令内容 / MCP 工具名 / 模型 ID / 延迟毫秒数 */
  command: string
  /** 额外参数（MCP 参数、编辑器选项等） */
  params?: Record<string, unknown>
  /** 等待策略，默认 'none'（并行） */
  waitFor?: WaitStrategy
  /** 遇到错误是否继续，默认 false */
  continueOnError?: boolean
  /** 步骤超时（毫秒），0 = 不限制 */
  timeout?: number
}

// --------------------------------------------------------
// 工作流触发器
// --------------------------------------------------------
export interface WorkflowTrigger {
  type: TriggerType
  /** 快捷键，如 "Ctrl+Shift+1" */
  shortcut?: string
  /** Cron 表达式，用于定时触发 */
  cron?: string
}

// --------------------------------------------------------
// 工作流主体
// --------------------------------------------------------
export interface Workflow {
  id: string
  name: string
  description: string
  icon?: string
  tags: string[]
  steps: WorkflowStep[]
  trigger?: WorkflowTrigger
  /** 工作流版本，用于迁移 */
  version: string
  /** 是否为内置工作流（内置流不可删除） */
  builtin?: boolean
  createdAt: number
  updatedAt: number
}

// --------------------------------------------------------
// 工作流执行状态
// --------------------------------------------------------
export type ExecutionStatus =
  | 'pending'    // 等待执行
  | 'running'    // 执行中
  | 'paused'     // 已暂停
  | 'completed'  // 成功完成
  | 'failed'     // 失败
  | 'cancelled'  // 已取消

export interface StepResult {
  stepId: string
  success: boolean
  output?: string
  error?: string
  startedAt: number
  finishedAt: number
  durationMs: number
}

export interface ExecutionResult {
  executionId: string
  workflowId: string
  status: ExecutionStatus
  stepResults: StepResult[]
  startedAt: number
  finishedAt?: number
  error?: string
}

// --------------------------------------------------------
// 工作流事件（执行引擎对外发出的事件）
// --------------------------------------------------------
export type WorkflowEvent =
  | 'execution:start'
  | 'execution:done'
  | 'execution:failed'
  | 'execution:cancelled'
  | 'step:start'
  | 'step:done'
  | 'step:failed'
  | 'step:output'

export interface WorkflowEventPayload {
  executionId: string
  workflowId: string
  stepId?: string
  data?: unknown
}
