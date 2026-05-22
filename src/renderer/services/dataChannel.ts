// 数据通道服务 - 跨面板/窗口数据传输
export class DataChannel {
  private broadcastChannel: BroadcastChannel
  private listeners: Map<string, ((data: any) => void)[]> = new Map()

  constructor() {
    // BroadcastChannel: 跨窗口通信
    this.broadcastChannel = new BroadcastChannel('workflow-channel')
    this.broadcastChannel.onmessage = (event) => {
      this.handleMessage(event.data)
    }
  }

  // 发送数据
  send(type: string, data: any, target?: string): void {
    const message = {
      type,
      data,
      target,
      timestamp: Date.now(),
      source: 'main'
    }

    // 广播到所有窗口
    this.broadcastChannel.postMessage(message)

    // 本地监听器
    this.notifyListeners(type, data)
  }

  // 传输数据到指定面板
  transfer(source: string, target: string, data: any): void {
    this.send('data-transfer', {
      source,
      target,
      data
    }, target)
  }

  // 监听消息
  on(type: string, callback: (data: any) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, [])
    }
    this.listeners.get(type)?.push(callback)
  }

  // 移除监听
  off(type: string, callback: (data: any) => void): void {
    const callbacks = this.listeners.get(type)
    if (callbacks) {
      const index = callbacks.indexOf(callback)
      if (index !== -1) {
        callbacks.splice(index, 1)
      }
    }
  }

  // 处理接收的消息
  private handleMessage(message: any): void {
    this.notifyListeners(message.type, message.data)
  }

  // 通知本地监听器
  private notifyListeners(type: string, data: any): void {
    const callbacks = this.listeners.get(type)
    if (callbacks) {
      callbacks.forEach(cb => cb(data))
    }
  }

  // 关闭通道
  close(): void {
    this.broadcastChannel.close()
    this.listeners.clear()
  }
}