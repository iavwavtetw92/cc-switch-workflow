// ============================================================
// Preload Script — contextBridge 安全暴露 electronAPI
// ============================================================

import { contextBridge, ipcRenderer } from 'electron'

// ── 监听器 Map（在 preload 作用域，不经过 contextBridge 序列化）
// key = callback 原始函数, value = 包装后的 ipcRenderer 监听函数
const listenerMap = new Map<Function, (...args: any[]) => void>()

const ALLOWED_CHANNELS = [
  'terminal:data',
  'terminal:exit',
  'workflow:step-start',
  'workflow:step-done',
  'workflow:done',
  'panel-reattached',
  'ai:stream-chunk',
  'ai:stream-done',
  'ai:stream-error',
]

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Terminal ────────────────────────────────────────────────
  terminalCreate: (options: { boxId: string; cwd: string }) =>
    ipcRenderer.invoke('terminal:create', options),

  terminalInput: (options: { ptyId: string; data: string }) =>
    ipcRenderer.invoke('terminal:input', options),

  terminalResize: (options: { ptyId: string; cols: number; rows: number }) =>
    ipcRenderer.invoke('terminal:resize', options),

  terminalKill: (options: { ptyId: string }) =>
    ipcRenderer.invoke('terminal:kill', options),

  // ── Workflow ────────────────────────────────────────────────
  workflowList: () => ipcRenderer.invoke('workflow:list'),
  workflowGet: (options: { id: string }) => ipcRenderer.invoke('workflow:get', options),
  workflowSave: (workflow: unknown) => ipcRenderer.invoke('workflow:save', workflow),
  workflowExport: (options: { id: string }) => ipcRenderer.invoke('workflow:export', options),
  workflowImport: (json: string) => ipcRenderer.invoke('workflow:import', json),

  // ── CC Switch ───────────────────────────────────────────────
  ccSwitchProviders: () => ipcRenderer.invoke('cc-switch:providers'),
  ccSwitchCurrent:   () => ipcRenderer.invoke('cc-switch:current'),
  ccSwitchSwitch: (options: { providerId: string }) =>
    ipcRenderer.invoke('cc-switch:switch', options),
  ccSwitchScan: () => ipcRenderer.invoke('cc-switch:scan'),

  // ── MCP ─────────────────────────────────────────────────────
  mcpInvoke: (options: { tool: string; params: Record<string, unknown> }) =>
    ipcRenderer.invoke('mcp:invoke', options),

  // ── Search ──────────────────────────────────────────────────
  projectSearch: (options: { query: string; path: string }) =>
    ipcRenderer.invoke('project:search', options),

  // ── AI ──────────────────────────────────────────────────────
  aiSkills: () => ipcRenderer.invoke('ai:skills'),
  aiChat: (options: { messages: any[]; skillId?: string; maxTokens?: number }) =>
    ipcRenderer.invoke('ai:chat', options),
  aiChatStream: (options: { sessionId: string; messages: any[]; skillId?: string; maxTokens?: number }) =>
    ipcRenderer.invoke('ai:chat-stream', options),

  // ── 事件订阅（Main → Renderer）──────────────────────────────
  // listenerMap 存在 preload 作用域，不经过 contextBridge 的序列化
  on(channel: string, callback: (...args: any[]) => void) {
    if (!ALLOWED_CHANNELS.includes(channel)) return
    // 若已注册过同一 callback，先移除旧的
    const existing = listenerMap.get(callback)
    if (existing) ipcRenderer.removeListener(channel, existing)
    // 包装函数：过滤掉 Electron event 对象
    const wrapper = (_event: Electron.IpcRendererEvent, ...args: any[]) => callback(...args)
    listenerMap.set(callback, wrapper)
    ipcRenderer.on(channel, wrapper)
  },

  off(channel: string, callback: (...args: any[]) => void) {
    const wrapper = listenerMap.get(callback)
    if (wrapper) {
      ipcRenderer.removeListener(channel, wrapper)
      listenerMap.delete(callback)
    }
  },
})