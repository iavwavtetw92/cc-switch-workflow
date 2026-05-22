// ============================================================
// PanelBus — Core Layer
// 面板消息总线，解耦面板间通信
// 纯 EventEmitter 封装，无框架依赖
// ============================================================

import { EventEmitter } from 'events'
import type { PanelMessage, PanelMessageType } from '../types/panel.types'
import type { PanelTarget } from '../types/workflow.types'

type MessageHandler = (msg: PanelMessage) => void

let _msgIdCounter = 0
function genMsgId(): string {
  return `msg-${Date.now()}-${++_msgIdCounter}`
}

export class PanelBus extends EventEmitter {
  /** 向指定面板发送消息 */
  sendToPanel(
    target: PanelTarget,
    type: PanelMessageType,
    content: string,
    meta?: Record<string, unknown>,
    source?: string,
  ): PanelMessage {
    const msg: PanelMessage = {
      id: genMsgId(),
      target,
      type,
      content,
      meta,
      source,
      timestamp: Date.now(),
    }
    this.emit(`panel:${target}`, msg)
    this.emit('panel:*', msg)  // 全局监听器
    return msg
  }

  /** 广播消息到所有面板 */
  broadcast(
    type: PanelMessageType,
    content: string,
    meta?: Record<string, unknown>,
    source?: string,
  ): PanelMessage[] {
    const targets: PanelTarget[] = [
      'workbox1', 'workbox2', 'learnbox', 'searchbox1', 'searchbox2',
    ]
    return targets.map(target =>
      this.sendToPanel(target, type, content, meta, source),
    )
  }

  /** 订阅特定面板的消息，返回取消订阅函数 */
  subscribe(panelId: string, handler: MessageHandler): () => void {
    const event = `panel:${panelId}`
    this.on(event, handler)
    return () => this.off(event, handler)
  }

  /** 订阅所有面板消息（全局监听），返回取消订阅函数 */
  subscribeAll(handler: MessageHandler): () => void {
    this.on('panel:*', handler)
    return () => this.off('panel:*', handler)
  }

  /** 清除指定面板的所有监听器 */
  clearPanel(panelId: string): void {
    this.removeAllListeners(`panel:${panelId}`)
  }
}

/** 全局单例 */
export const panelBus = new PanelBus()
