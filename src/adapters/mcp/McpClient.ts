// ============================================================
// McpClient — Adapter Layer
// MCP（Model Context Protocol）协议客户端
// 通过 IpcBridge 向主进程发送 MCP 调用，异步返回结果
// ============================================================

import type { IMcpAdapter } from '@core/types/adapter.types'

/** IpcBridge 的最小接口（避免循环依赖） */
interface McpInvoker {
  mcpInvoke(tool: string, params: Record<string, unknown>): Promise<unknown>
}

export interface McpInvokeResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export class McpClient implements IMcpAdapter {
  private bridge: McpInvoker

  constructor(bridge: McpInvoker) {
    this.bridge = bridge
  }

  /** 检查 MCP 服务是否可用（通过 ping 工具验证） */
  async isAvailable(): Promise<boolean> {
    try {
      await this.bridge.mcpInvoke('ping', {})
      return true
    } catch {
      return false
    }
  }

  /** 调用 MCP 工具 */
  async invoke(tool: string, params: Record<string, unknown>): Promise<unknown> {
    const result = await this.bridge.mcpInvoke(tool, params) as McpInvokeResult
    if (result && typeof result === 'object' && 'success' in result) {
      if (!result.success) {
        throw new Error(result.error ?? `MCP 工具 ${tool} 调用失败`)
      }
      return result.data
    }
    return result
  }
}
