// 全局类型定义（旧版兼容保留，新代码请使用 src/adapters/ipc/IpcBridge.ts 中的 ElectronAPI）

export interface ExecuteResult {
  success: boolean
  output: string
  error?: string
  pid?: number
}

export interface ProcessInfo {
  pid: number
  command: string
  boxId: string
  startTime: number
  cwd: string
}

export interface ProviderConfig {
  id: string
  name: string
  apiUrl?: string
  modelName?: string
  isActive: boolean
}

export interface WindowStatus {
  id: string
  type: 'main' | 'detached'
  panelType?: string
  title: string
  isVisible: boolean
  isFocused: boolean
}

export interface SearchResult {
  title: string
  snippet: string
  source?: string
  url?: string
  file?: string
  line?: number
  content?: string
}

export {}