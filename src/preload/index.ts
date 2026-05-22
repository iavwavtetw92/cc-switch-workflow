// ============================================================
// Preload Script — 更新版（与 IPC channel 完全对应）
// 使用 contextBridge 安全暴露 electronAPI 给渲染进程
// ============================================================

import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  // --------------------------------------------------------
  // Terminal
  // --------------------------------------------------------
  terminalCreate: (options: { boxId: string; cwd: string }) =>
    ipcRenderer.invoke('terminal:create', options),

  terminalInput: (options: { ptyId: string; data: string }) =>
    ipcRenderer.invoke('terminal:input', options),

  terminalResize: (options: { ptyId: string; cols: number; rows: number }) =>
    ipcRenderer.invoke('terminal:resize', options),

  terminalKill: (options: { ptyId: string }) =>
    ipcRenderer.invoke('terminal:kill', options),

  // --------------------------------------------------------
  // Workflow
  // --------------------------------------------------------
  workflowList: () =>
    ipcRenderer.invoke('workflow:list'),

  workflowGet: (options: { id: string }) =>
    ipcRenderer.invoke('workflow:get', options),

  workflowSave: (workflow: unknown) =>
    ipcRenderer.invoke('workflow:save', workflow),

  workflowExport: (options: { id: string }) =>
    ipcRenderer.invoke('workflow:export', options),

  workflowImport: (json: string) =>
    ipcRenderer.invoke('workflow:import', json),

  // --------------------------------------------------------
  // CC Switch
  // --------------------------------------------------------
  ccSwitchProviders: () =>
    ipcRenderer.invoke('cc-switch:providers'),

  ccSwitchCurrent: () =>
    ipcRenderer.invoke('cc-switch:current'),

  ccSwitchSwitch: (options: { providerId: string }) =>
    ipcRenderer.invoke('cc-switch:switch', options),

  ccSwitchScan: () =>
    ipcRenderer.invoke('cc-switch:scan'),

  // --------------------------------------------------------
  // MCP
  // --------------------------------------------------------
  mcpInvoke: (options: { tool: string; params: Record<string, unknown> }) =>
    ipcRenderer.invoke('mcp:invoke', options),

  // --------------------------------------------------------
  // Project Search
  // --------------------------------------------------------
  projectSearch: (options: { query: string; path: string }) =>
    ipcRenderer.invoke('project:search', options),

  // --------------------------------------------------------
  // 事件订阅（Main → Renderer 推送）
  // 白名单控制允许监听的 channel
  // --------------------------------------------------------

  // 存储 callback → wrapper 的映射，确保 off() 能正确移除相同引用
  _listenerMap: new Map<Function, Function>(),

  on(channel: string, callback: (...args: any[]) => void) {
    const allowed = [
      'terminal:data',
      'terminal:exit',
      'workflow:step-start',
      'workflow:step-done',
      'workflow:done',
      'panel-reattached',
    ]
    if (!allowed.includes(channel)) return
    // 包装函数：过滤掉 Electron 的 event 参数
    const wrapper = (_event: any, ...args: any[]) => callback(...args)
    ;(electronAPI._listenerMap as Map<Function, Function>).set(callback, wrapper)
    ipcRenderer.on(channel, wrapper as any)
  },

  off(channel: string, callback: (...args: any[]) => void) {
    const wrapper = (electronAPI._listenerMap as Map<Function, Function>).get(callback)
    if (wrapper) {
      ipcRenderer.removeListener(channel, wrapper as any)
      ;(electronAPI._listenerMap as Map<Function, Function>).delete(callback)
    }
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)