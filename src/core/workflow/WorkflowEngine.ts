// ============================================================
// WorkflowEngine — Core Layer
// 工作流执行引擎
// - 并行执行（waitFor: 'none'）或串行等待（waitFor: 'complete'）
// - 事件驱动，对外发出 execution:* / step:* 事件
// - 纯逻辑，通过 AdapterRegistry 调用外部能力
// ============================================================

import { EventEmitter } from 'events'
import type {
  Workflow,
  WorkflowStep,
  ExecutionResult,
  ExecutionStatus,
  StepResult,
  WorkflowEventPayload,
} from '../types/workflow.types'
import type { PanelBus } from '../panel/PanelBus'

// --------------------------------------------------------
// 适配器注册表接口（Engine 所需的最小适配器集合）
// --------------------------------------------------------
export interface AdapterRegistry {
  /** 向终端面板发送命令 */
  sendTerminalCommand(panelId: string, command: string): Promise<{ success: boolean; output?: string }>
  /** 调用 MCP 工具 */
  invokeMcp(tool: string, params: Record<string, unknown>): Promise<unknown>
  /** 切换 CC Switch 模型 */
  switchCcModel(modelId: string): Promise<boolean>
  /** 在编辑器中打开内容 */
  openInEditor(panelId: string, content: string, meta?: Record<string, unknown>): Promise<void>
  /** 触发搜索 */
  triggerSearch(panelId: string, query: string): Promise<void>
}

// --------------------------------------------------------
// 执行上下文（每次执行一个 Workflow 对应一个 Context）
// --------------------------------------------------------
interface ExecutionContext {
  id: string
  workflowId: string
  status: ExecutionStatus
  stepResults: StepResult[]
  startedAt: number
  abortController: AbortController
}

let _execIdCounter = 0
function genExecId(): string {
  return `exec-${Date.now()}-${++_execIdCounter}`
}

export class WorkflowEngine extends EventEmitter {
  private executions: Map<string, ExecutionContext> = new Map()

  constructor(
    private adapters: AdapterRegistry,
    private bus: PanelBus,
  ) {
    super()
  }

  // --------------------------------------------------------
  // 公开 API
  // --------------------------------------------------------

  /**
   * 启动工作流执行
   * 返回 executionId，执行在异步进行
   */
  async run(workflow: Workflow): Promise<string> {
    const execId = genExecId()
    const ctx: ExecutionContext = {
      id: execId,
      workflowId: workflow.id,
      status: 'running',
      stepResults: [],
      startedAt: Date.now(),
      abortController: new AbortController(),
    }

    this.executions.set(execId, ctx)
    this.emit('execution:start', { executionId: execId, workflowId: workflow.id } as WorkflowEventPayload)

    // 异步执行，不阻塞调用方
    this._executeWorkflow(ctx, workflow).catch(err => {
      ctx.status = 'failed'
      this.emit('execution:failed', {
        executionId: execId,
        workflowId: workflow.id,
        data: { error: err.message },
      } as WorkflowEventPayload)
    })

    return execId
  }

  /** 取消执行 */
  cancel(executionId: string): boolean {
    const ctx = this.executions.get(executionId)
    if (!ctx || ctx.status !== 'running') return false

    ctx.abortController.abort()
    ctx.status = 'cancelled'
    this.emit('execution:cancelled', {
      executionId,
      workflowId: ctx.workflowId,
    } as WorkflowEventPayload)

    return true
  }

  /** 获取执行状态 */
  getStatus(executionId: string): ExecutionResult | null {
    const ctx = this.executions.get(executionId)
    if (!ctx) return null

    return {
      executionId: ctx.id,
      workflowId: ctx.workflowId,
      status: ctx.status,
      stepResults: [...ctx.stepResults],
      startedAt: ctx.startedAt,
    }
  }

  /** 获取所有运行中的执行 */
  getRunning(): string[] {
    return Array.from(this.executions.entries())
      .filter(([, ctx]) => ctx.status === 'running')
      .map(([id]) => id)
  }

  // --------------------------------------------------------
  // 核心执行逻辑
  // --------------------------------------------------------

  private async _executeWorkflow(ctx: ExecutionContext, workflow: Workflow): Promise<void> {
    const signal = ctx.abortController.signal

    try {
      // 按 waitFor 策略分组执行
      // waitFor: 'none' → 并行，waitFor: 'complete'/'ready' → 串行
      const groups = this.groupSteps(workflow.steps)

      for (const group of groups) {
        if (signal.aborted) break

        // 组内并行执行
        const promises = group.map(step => this._executeStep(ctx, step, signal))
        const results = await Promise.allSettled(promises)

        // 检查是否有必须成功但失败的步骤
        for (let i = 0; i < results.length; i++) {
          const result = results[i]
          const step = group[i]

          if (result.status === 'rejected' && !step.continueOnError) {
            ctx.status = 'failed'
            this.emit('execution:failed', {
              executionId: ctx.id,
              workflowId: ctx.workflowId,
              data: { error: result.reason?.message, stepId: step.id },
            } as WorkflowEventPayload)
            return
          }
        }
      }

      if (!signal.aborted) {
        ctx.status = 'completed'
        this.emit('execution:done', {
          executionId: ctx.id,
          workflowId: ctx.workflowId,
        } as WorkflowEventPayload)
      }
    } catch (err) {
      if (!signal.aborted) {
        ctx.status = 'failed'
        throw err
      }
    }
  }

  private async _executeStep(
    ctx: ExecutionContext,
    step: WorkflowStep,
    signal: AbortSignal,
  ): Promise<StepResult> {
    if (signal.aborted) {
      throw new Error('执行已取消')
    }

    const startedAt = Date.now()
    this.emit('step:start', {
      executionId: ctx.id,
      workflowId: ctx.workflowId,
      stepId: step.id,
    } as WorkflowEventPayload)

    let output: string | undefined
    let error: string | undefined
    let success = false

    try {
      const result = await this._dispatchStep(step, signal)
      output = result.output
      success = result.success

      if (!success && !step.continueOnError) {
        throw new Error(result.error ?? `步骤 ${step.id} 执行失败`)
      }
    } catch (err) {
      error = (err as Error).message
      success = false

      if (!step.continueOnError) {
        throw err
      }
    }

    const finishedAt = Date.now()
    const stepResult: StepResult = {
      stepId: step.id,
      success,
      output,
      error,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
    }

    ctx.stepResults.push(stepResult)

    this.emit('step:done', {
      executionId: ctx.id,
      workflowId: ctx.workflowId,
      stepId: step.id,
      data: stepResult,
    } as WorkflowEventPayload)

    return stepResult
  }

  private async _dispatchStep(
    step: WorkflowStep,
    signal: AbortSignal,
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    // 超时控制
    const timeout = step.timeout && step.timeout > 0 ? step.timeout : 0

    const executeWithTimeout = async () => {
      switch (step.type) {
        case 'terminal': {
          const panelId = step.target === 'auto' ? 'workbox1' : step.target
          return await this.adapters.sendTerminalCommand(panelId, step.command)
        }

        case 'editor': {
          const panelId = step.target === 'auto' ? 'learnbox' : step.target
          await this.adapters.openInEditor(panelId, step.command, step.params)
          return { success: true }
        }

        case 'search': {
          const panelId = step.target === 'auto' ? 'searchbox1' : step.target
          await this.adapters.triggerSearch(panelId, step.command)
          return { success: true }
        }

        case 'mcp': {
          const result = await this.adapters.invokeMcp(step.command, step.params ?? {})
          // 将结果通过 PanelBus 推送到目标面板
          this.bus.sendToPanel(
            step.target,
            'mcp-result',
            JSON.stringify(result),
            { tool: step.command },
            'workflow-engine',
          )
          return { success: true, output: JSON.stringify(result) }
        }

        case 'cc-switch': {
          const ok = await this.adapters.switchCcModel(step.command)
          return { success: ok, error: ok ? undefined : `切换模型 ${step.command} 失败` }
        }

        case 'delay': {
          const ms = parseInt(step.command, 10)
          if (!isNaN(ms) && ms > 0) {
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(resolve, ms)
              signal.addEventListener('abort', () => {
                clearTimeout(timer)
                reject(new Error('执行已取消'))
              }, { once: true })
            })
          }
          return { success: true }
        }

        case 'notify': {
          this.bus.sendToPanel(step.target, 'notify', step.command, step.params, 'workflow-engine')
          return { success: true }
        }

        default:
          return { success: false, error: `未知步骤类型: ${(step as WorkflowStep).type}` }
      }
    }

    if (timeout > 0) {
      return Promise.race([
        executeWithTimeout(),
        new Promise<{ success: boolean; error: string }>(resolve =>
          setTimeout(() => resolve({ success: false, error: `步骤 ${step.id} 超时 (${timeout}ms)` }), timeout),
        ),
      ])
    }

    return executeWithTimeout()
  }

  /**
   * 将步骤按 waitFor 分组：
   * - waitFor: 'none'（或未指定）的步骤与前一组合并（并行）
   * - waitFor: 'complete' / 'ready' 的步骤单独成组（串行屏障）
   *
   * 示例：步骤序列 [A(none), B(none), C(complete), D(none), E(complete)]
   * → 分组：[[A, B], [C], [D], [E]]
   */
  private groupSteps(steps: WorkflowStep[]): WorkflowStep[][] {
    const groups: WorkflowStep[][] = []
    let currentGroup: WorkflowStep[] = []

    for (const step of steps) {
      const waitFor = step.waitFor ?? 'none'

      if (waitFor === 'none') {
        currentGroup.push(step)
      } else {
        // 有 waitFor 约束，先把当前并行组关闭，再将此步骤单独成组
        if (currentGroup.length > 0) {
          groups.push(currentGroup)
          currentGroup = []
        }
        groups.push([step])
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup)
    }

    return groups
  }
}
