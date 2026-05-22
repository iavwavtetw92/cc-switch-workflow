// IpcBridge.spec.ts
// IpcBridge 和 IpcTerminalAdapter 单元测试
// 使用 Mock ElectronAPI，验证调用转发和事件分发逻辑

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IpcBridge, IpcTerminalAdapter } from '@adapters/ipc/IpcBridge'
import type { ElectronAPI } from '@adapters/ipc/IpcBridge'

// ── Mock ElectronAPI ────────────────────────────────────────

function makeMockApi(overrides: Partial<ElectronAPI> = {}): ElectronAPI {
  const listeners: Record<string, Array<(...args: any[]) => void>> = {}

  return {
    terminalCreate:  vi.fn().mockResolvedValue({ ptyId: 'pty-123' }),
    terminalInput:   vi.fn().mockResolvedValue(undefined),
    terminalResize:  vi.fn().mockResolvedValue(undefined),
    terminalKill:    vi.fn().mockResolvedValue(true),

    workflowList:    vi.fn().mockResolvedValue([]),
    workflowGet:     vi.fn().mockResolvedValue(null),
    workflowSave:    vi.fn().mockResolvedValue({ success: true }),
    workflowExport:  vi.fn().mockResolvedValue('{"id":"wf1"}'),
    workflowImport:  vi.fn().mockResolvedValue({ success: true }),

    ccSwitchProviders: vi.fn().mockResolvedValue([]),
    ccSwitchCurrent:   vi.fn().mockResolvedValue(null),
    ccSwitchSwitch:    vi.fn().mockResolvedValue({ success: true }),

    mcpInvoke: vi.fn().mockResolvedValue({ success: true, data: 'result' }),

    on: vi.fn((channel, cb) => {
      if (!listeners[channel]) listeners[channel] = []
      listeners[channel].push(cb)
    }),
    off: vi.fn((channel, cb) => {
      if (listeners[channel]) {
        listeners[channel] = listeners[channel].filter(l => l !== cb)
      }
    }),

    // 测试辅助：触发事件
    _emit: (channel: string, ...args: any[]) => {
      listeners[channel]?.forEach(l => l(...args))
    },

    ...overrides,
  } as any
}

// ── IpcBridge 测试 ──────────────────────────────────────────

describe('IpcBridge', () => {
  let api: ReturnType<typeof makeMockApi>
  let bridge: IpcBridge

  beforeEach(() => {
    api = makeMockApi()
    bridge = new IpcBridge(api)
  })

  describe('Terminal IPC', () => {
    it('terminalCreate 返回 ptyId', async () => {
      const id = await bridge.terminalCreate('workbox1', 'D:\\')
      expect(id).toBe('pty-123')
      expect(api.terminalCreate).toHaveBeenCalledWith({ boxId: 'workbox1', cwd: 'D:\\' })
    })

    it('terminalInput 转发参数', async () => {
      await bridge.terminalInput('pty-123', 'ls\r')
      expect(api.terminalInput).toHaveBeenCalledWith({ ptyId: 'pty-123', data: 'ls\r' })
    })

    it('terminalResize 转发参数', async () => {
      await bridge.terminalResize('pty-123', 120, 40)
      expect(api.terminalResize).toHaveBeenCalledWith({ ptyId: 'pty-123', cols: 120, rows: 40 })
    })

    it('terminalKill 返回 true', async () => {
      const result = await bridge.terminalKill('pty-123')
      expect(result).toBe(true)
    })

    it('onTerminalData 订阅并转发数据', () => {
      const handler = vi.fn()
      bridge.onTerminalData(handler)
      ;(api as any)._emit('terminal:data', 'pty-123', 'hello\r\n')
      expect(handler).toHaveBeenCalledWith('pty-123', 'hello\r\n')
    })

    it('onTerminalData 返回取消订阅函数', () => {
      const handler = vi.fn()
      const unsub = bridge.onTerminalData(handler)
      unsub()
      ;(api as any)._emit('terminal:data', 'pty-123', 'data')
      expect(api.off).toHaveBeenCalled()
    })

    it('onTerminalExit 订阅并转发退出码', () => {
      const handler = vi.fn()
      bridge.onTerminalExit(handler)
      ;(api as any)._emit('terminal:exit', 'pty-123', 0)
      expect(handler).toHaveBeenCalledWith('pty-123', 0)
    })
  })

  describe('Workflow IPC', () => {
    it('workflowList 返回空数组', async () => {
      const list = await bridge.workflowList()
      expect(list).toEqual([])
    })

    it('workflowGet 按 id 查询', async () => {
      await bridge.workflowGet('wf1')
      expect(api.workflowGet).toHaveBeenCalledWith({ id: 'wf1' })
    })

    it('workflowSave 返回 success boolean', async () => {
      const ok = await bridge.workflowSave({ id: 'wf1' } as any)
      expect(ok).toBe(true)
    })

    it('workflowExport 返回 JSON 字符串', async () => {
      const json = await bridge.workflowExport('wf1')
      expect(json).toBe('{"id":"wf1"}')
    })

    it('workflowImport 转发 JSON 字符串', async () => {
      const result = await bridge.workflowImport('{"id":"wf1"}')
      expect(result.success).toBe(true)
    })

    it('onWorkflowStepStart 订阅事件', () => {
      const handler = vi.fn()
      bridge.onWorkflowStepStart(handler)
      ;(api as any)._emit('workflow:step-start', 'exec-1', 'step-1')
      expect(handler).toHaveBeenCalledWith('exec-1', 'step-1')
    })

    it('onWorkflowDone 订阅事件', () => {
      const handler = vi.fn()
      bridge.onWorkflowDone(handler)
      ;(api as any)._emit('workflow:done', 'exec-1', true)
      expect(handler).toHaveBeenCalledWith('exec-1', true)
    })
  })

  describe('CC Switch IPC', () => {
    it('ccSwitchProviders 返回空数组', async () => {
      const list = await bridge.ccSwitchProviders()
      expect(list).toEqual([])
    })

    it('ccSwitchCurrent 返回 null', async () => {
      const current = await bridge.ccSwitchCurrent()
      expect(current).toBeNull()
    })

    it('ccSwitchSwitch 转发 providerId', async () => {
      const ok = await bridge.ccSwitchSwitch('gpt4')
      expect(ok).toBe(true)
      expect(api.ccSwitchSwitch).toHaveBeenCalledWith({ providerId: 'gpt4' })
    })
  })

  describe('MCP IPC', () => {
    it('mcpInvoke 返回 data', async () => {
      const result = await bridge.mcpInvoke('feishu_search', { query: 'test' })
      expect(result).toEqual({ success: true, data: 'result' })
    })
  })
})

// ── IpcTerminalAdapter 测试 ─────────────────────────────────

describe('IpcTerminalAdapter', () => {
  let api: ReturnType<typeof makeMockApi>
  let bridge: IpcBridge
  let adapter: IpcTerminalAdapter

  beforeEach(() => {
    api = makeMockApi()
    bridge = new IpcBridge(api)
    adapter = new IpcTerminalAdapter(bridge)
  })

  it('create 返回 ptyId', async () => {
    const id = await adapter.create('workbox1', 'D:\\')
    expect(id).toBe('pty-123')
  })

  it('write 调用 terminalInput', async () => {
    await adapter.write('pty-123', 'ls\r')
    expect(api.terminalInput).toHaveBeenCalledWith({ ptyId: 'pty-123', data: 'ls\r' })
  })

  it('resize 调用 terminalResize', async () => {
    await adapter.resize('pty-123', 80, 24)
    expect(api.terminalResize).toHaveBeenCalledWith({ ptyId: 'pty-123', cols: 80, rows: 24 })
  })

  it('onData 按 ptyId 分发数据', () => {
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    adapter.onData('pty-123', handler1)
    adapter.onData('pty-456', handler2)

    ;(api as any)._emit('terminal:data', 'pty-123', 'data-a')
    expect(handler1).toHaveBeenCalledWith('data-a')
    expect(handler2).not.toHaveBeenCalled()
  })

  it('onData 取消订阅后不再收到数据', () => {
    const handler = vi.fn()
    const unsub = adapter.onData('pty-123', handler)
    unsub()
    ;(api as any)._emit('terminal:data', 'pty-123', 'data')
    expect(handler).not.toHaveBeenCalled()
  })

  it('onExit 按 ptyId 分发退出码', () => {
    const handler = vi.fn()
    adapter.onExit('pty-123', handler)
    ;(api as any)._emit('terminal:exit', 'pty-123', 1)
    expect(handler).toHaveBeenCalledWith(1)
  })

  it('kill 清理处理器并调用 terminalKill', async () => {
    const handler = vi.fn()
    adapter.onData('pty-123', handler)
    await adapter.kill('pty-123')
    ;(api as any)._emit('terminal:data', 'pty-123', 'after kill')
    expect(handler).not.toHaveBeenCalled()
    expect(api.terminalKill).toHaveBeenCalledWith({ ptyId: 'pty-123' })
  })

  it('dispose 清理全局监听', () => {
    const handler = vi.fn()
    adapter.onData('pty-123', handler)
    adapter.dispose()
    ;(api as any)._emit('terminal:data', 'pty-123', 'data')
    expect(handler).not.toHaveBeenCalled()
  })
})
