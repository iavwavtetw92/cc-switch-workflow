// ============================================================
// IpcBridge — Adapter Layer (Renderer Side)
// 统一封装 Renderer → Main 的所有 IPC 调用
// 依赖 preload 暴露的 window.electronAPI
// ============================================================

import type { ITerminalAdapter } from '@core/types/adapter.types'
import type { Workflow } from '@core/types/workflow.types'
import type { Provider } from '@core/types/adapter.types'

// --------------------------------------------------------
// 类型声明（与 preload/index.ts 保持同步）
// --------------------------------------------------------

export interface ElectronAPI {
  // Terminal
  terminalCreate(options: { boxId: string; cwd: string }): Promise<{ ptyId: string }>
  terminalInput(options: { ptyId: string; data: string }): Promise<void>
  terminalResize(options: { ptyId: string; cols: number; rows: number }): Promise<void>
  terminalKill(options: { ptyId: string }): Promise<boolean>

  // Workflow
  workflowList(): Promise<Workflow[]>
  workflowGet(options: { id: string }): Promise<Workflow | null>
  workflowSave(workflow: Workflow): Promise<{ success: boolean }>
  workflowDelete(options: { id: string }): Promise<{ success: boolean }>
  workflowExport(options: { id: string }): Promise<string>
  workflowImport(json: string): Promise<{ success: boolean; workflow?: Workflow; error?: string }>

  // CC Switch
  ccSwitchProviders(): Promise<Provider[]>
  ccSwitchCurrent(): Promise<Provider | null>
  ccSwitchSwitch(options: { providerId: string }): Promise<{ success: boolean }>

  // MCP
  mcpInvoke(options: { tool: string; params: Record<string, unknown> }): Promise<unknown>

  // Project Search
  projectSearch(options: { query: string; path: string }): Promise<Array<{ file: string; line: number; content: string }>>

  // AI (via CC Switch provider)
  aiSkills(): Promise<import('@core/types/ai.types').Skill[]>
  aiChat(options: { messages: import('@core/types/ai.types').AiMessage[]; skillId?: string; maxTokens?: number }): Promise<{ success: boolean; content: string; error?: string }>
  aiChatStream(options: { sessionId: string; messages: import('@core/types/ai.types').AiMessage[]; skillId?: string; maxTokens?: number }): Promise<{ success: boolean; error?: string }>

  // Event listeners
  on(channel: string, callback: (...args: any[]) => void): void
  off(channel: string, callback: (...args: any[]) => void): void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

// --------------------------------------------------------
// IpcBridge — 统一调用入口
// --------------------------------------------------------

export class IpcBridge {
  private api: ElectronAPI

  constructor(api?: ElectronAPI) {
    // 允许测试时注入 mock
    this.api = api ?? window.electronAPI
  }

  // --------------------------------------------------------
  // Terminal IPC
  // --------------------------------------------------------

  async terminalCreate(boxId: string, cwd: string): Promise<string> {
    const { ptyId } = await this.api.terminalCreate({ boxId, cwd })
    return ptyId
  }

  async terminalInput(ptyId: string, data: string): Promise<void> {
    return this.api.terminalInput({ ptyId, data })
  }

  async terminalResize(ptyId: string, cols: number, rows: number): Promise<void> {
    return this.api.terminalResize({ ptyId, cols, rows })
  }

  async terminalKill(ptyId: string): Promise<boolean> {
    return this.api.terminalKill({ ptyId })
  }

  onTerminalData(handler: (ptyId: string, data: string) => void): () => void {
    const cb = (ptyId: string, data: string) => handler(ptyId, data)
    this.api.on('terminal:data', cb)
    return () => this.api.off('terminal:data', cb)
  }

  onTerminalExit(handler: (ptyId: string, code: number) => void): () => void {
    const cb = (ptyId: string, code: number) => handler(ptyId, code)
    this.api.on('terminal:exit', cb)
    return () => this.api.off('terminal:exit', cb)
  }

  // --------------------------------------------------------
  // Workflow IPC
  // --------------------------------------------------------

  async workflowList(): Promise<Workflow[]> {
    return this.api.workflowList()
  }

  async workflowGet(id: string): Promise<Workflow | null> {
    return this.api.workflowGet({ id })
  }

  async workflowSave(workflow: Workflow): Promise<boolean> {
    const { success } = await this.api.workflowSave(workflow)
    return success
  }

  async workflowDelete(id: string): Promise<boolean> {
    const { success } = await this.api.workflowDelete({ id })
    return success
  }

  async workflowExport(id: string): Promise<string> {
    return this.api.workflowExport({ id })
  }

  async workflowImport(json: string): Promise<{ success: boolean; workflow?: Workflow; error?: string }> {
    return this.api.workflowImport(json)
  }

  onWorkflowStepStart(handler: (execId: string, stepId: string) => void): () => void {
    const cb = (execId: string, stepId: string) => handler(execId, stepId)
    this.api.on('workflow:step-start', cb)
    return () => this.api.off('workflow:step-start', cb)
  }

  onWorkflowStepDone(handler: (execId: string, stepId: string, result: unknown) => void): () => void {
    const cb = (execId: string, stepId: string, result: unknown) => handler(execId, stepId, result)
    this.api.on('workflow:step-done', cb)
    return () => this.api.off('workflow:step-done', cb)
  }

  onWorkflowDone(handler: (execId: string, success: boolean) => void): () => void {
    const cb = (execId: string, success: boolean) => handler(execId, success)
    this.api.on('workflow:done', cb)
    return () => this.api.off('workflow:done', cb)
  }

  // --------------------------------------------------------
  // CC Switch IPC
  // --------------------------------------------------------

  async ccSwitchProviders(): Promise<Provider[]> {
    return this.api.ccSwitchProviders()
  }

  async ccSwitchCurrent(): Promise<Provider | null> {
    return this.api.ccSwitchCurrent()
  }

  async ccSwitchSwitch(providerId: string): Promise<boolean> {
    const { success } = await this.api.ccSwitchSwitch({ providerId })
    return success
  }

  // --------------------------------------------------------
  // MCP IPC
  // --------------------------------------------------------

  async mcpInvoke(tool: string, params: Record<string, unknown>): Promise<unknown> {
    return this.api.mcpInvoke({ tool, params })
  }
}

// --------------------------------------------------------
// IpcTerminalAdapter — 将 IpcBridge 包装为 ITerminalAdapter
// 供 WorkflowEngine 的 AdapterRegistry 使用
// --------------------------------------------------------

export class IpcTerminalAdapter implements ITerminalAdapter {
  private bridge: IpcBridge
  private dataHandlers = new Map<string, Set<(data: string) => void>>()
  private exitHandlers = new Map<string, Set<(code: number) => void>>()
  private unsubData: (() => void) | null = null
  private unsubExit: (() => void) | null = null

  constructor(bridge: IpcBridge) {
    this.bridge = bridge

    // 全局监听，按 ptyId 分发
    this.unsubData = bridge.onTerminalData((ptyId, data) => {
      this.dataHandlers.get(ptyId)?.forEach(h => h(data))
    })
    this.unsubExit = bridge.onTerminalExit((ptyId, code) => {
      this.exitHandlers.get(ptyId)?.forEach(h => h(code))
    })
  }

  async create(boxId: string, cwd: string): Promise<string> {
    return this.bridge.terminalCreate(boxId, cwd)
  }

  async write(ptyId: string, data: string): Promise<void> {
    return this.bridge.terminalInput(ptyId, data)
  }

  async resize(ptyId: string, cols: number, rows: number): Promise<void> {
    return this.bridge.terminalResize(ptyId, cols, rows)
  }

  async kill(ptyId: string): Promise<boolean> {
    this.dataHandlers.delete(ptyId)
    this.exitHandlers.delete(ptyId)
    return this.bridge.terminalKill(ptyId)
  }

  onData(ptyId: string, handler: (data: string) => void): () => void {
    if (!this.dataHandlers.has(ptyId)) this.dataHandlers.set(ptyId, new Set())
    this.dataHandlers.get(ptyId)!.add(handler)
    return () => this.dataHandlers.get(ptyId)?.delete(handler)
  }

  onExit(ptyId: string, handler: (code: number) => void): () => void {
    if (!this.exitHandlers.has(ptyId)) this.exitHandlers.set(ptyId, new Set())
    this.exitHandlers.get(ptyId)!.add(handler)
    return () => this.exitHandlers.get(ptyId)?.delete(handler)
  }

  /** 销毁全局监听（组件卸载时调用） */
  dispose(): void {
    this.unsubData?.()
    this.unsubExit?.()
    this.dataHandlers.clear()
    this.exitHandlers.clear()
  }
}
