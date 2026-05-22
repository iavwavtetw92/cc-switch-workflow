// ============================================================
// Panel Types — Core Layer
// 面板消息总线相关类型
// ============================================================

import type { PanelTarget } from './workflow.types'

/** 面板消息类型 */
export type PanelMessageType =
  | 'command'         // 终端命令
  | 'terminal-input'  // 原始终端输入
  | 'terminal-clear'  // 清空终端
  | 'editor-open'     // 在编辑器打开文件/内容
  | 'editor-write'    // 写入编辑器内容
  | 'search-query'    // 搜索查询
  | 'search-result'   // 搜索结果（回填）
  | 'mcp-result'      // MCP 调用结果
  | 'notify'          // UI 通知提示
  | 'focus'           // 请求获取焦点

export interface PanelMessage {
  /** 消息唯一 ID */
  id: string
  /** 目标面板 */
  target: PanelTarget
  type: PanelMessageType
  /** 主要内容 */
  content: string
  /** 附加元数据 */
  meta?: Record<string, unknown>
  /** 来源（工作流步骤 ID / 用户输入 / 等） */
  source?: string
  timestamp: number
}

/** 面板状态 */
export type PanelStatus = 'idle' | 'running' | 'waiting' | 'error' | 'disconnected'

export interface PanelState {
  id: string
  type: 'workbox' | 'learnbox' | 'searchbox'
  status: PanelStatus
  /** 当前工作目录（终端面板） */
  cwd?: string
  /** 当前打开的文件（编辑器面板） */
  openFile?: string
  /** PTY 进程 ID */
  ptyId?: string
  lastActivity: number
}
