// ============================================================
// Adapter Interface Types — Core Layer
// 适配器接口定义（供 Core 层依赖注入使用，不含实现）
// ============================================================

import type { Workflow } from './workflow.types'

// --------------------------------------------------------
// 终端适配器接口
// --------------------------------------------------------
export interface ITerminalAdapter {
  /** 创建一个 PTY 实例，返回 ptyId */
  create(boxId: string, cwd: string): Promise<string>
  /** 向 PTY 发送输入 */
  write(ptyId: string, data: string): Promise<void>
  /** 调整终端大小 */
  resize(ptyId: string, cols: number, rows: number): Promise<void>
  /** 关闭 PTY */
  kill(ptyId: string): Promise<boolean>
  /** 监听终端输出 */
  onData(ptyId: string, handler: (data: string) => void): () => void
  /** 监听进程退出 */
  onExit(ptyId: string, handler: (code: number) => void): () => void
}

// --------------------------------------------------------
// 工作流存储适配器接口
// --------------------------------------------------------
export interface IWorkflowStorage {
  /** 获取所有工作流 */
  list(): Promise<Workflow[]>
  /** 根据 ID 获取工作流 */
  get(id: string): Promise<Workflow | null>
  /** 保存（新建或更新）工作流 */
  save(workflow: Workflow): Promise<void>
  /** 删除工作流 */
  delete(id: string): Promise<boolean>
  /** 导出工作流 JSON 字符串 */
  export(id: string): Promise<string>
  /** 导入工作流 JSON 字符串，返回导入的工作流 */
  import(json: string): Promise<Workflow>
}

// --------------------------------------------------------
// CC Switch 适配器接口
// --------------------------------------------------------
export interface ICcSwitchAdapter {
  /** 获取所有 Provider 列表 */
  getProviders(): Promise<Provider[]>
  /** 获取当前激活的 Provider */
  getCurrentProvider(): Promise<Provider | null>
  /** 切换到指定 Provider */
  switchProvider(providerId: string): Promise<boolean>
  /** 扫描本地 cc-switch.db 文件位置 */
  scanDatabasePath(): Promise<string | null>
}

export interface Provider {
  id: string
  name: string
  type: string
  isActive: boolean
  baseUrl?: string
  models?: string[]
}

// --------------------------------------------------------
// MCP 适配器接口
// --------------------------------------------------------
export interface IMcpAdapter {
  /** 调用 MCP 工具 */
  invoke(tool: string, params: Record<string, unknown>): Promise<unknown>
  /** 检查 MCP 服务是否可用 */
  isAvailable(): Promise<boolean>
}

// --------------------------------------------------------
// 设置存储适配器接口
// --------------------------------------------------------
export interface ISettingsStorage {
  get<T>(key: string, defaultValue?: T): T | undefined
  set<T>(key: string, value: T): void
  delete(key: string): void
  clear(): void
}
