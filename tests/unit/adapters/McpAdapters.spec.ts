// McpClient.spec.ts + FeishuMcpAdapter.spec.ts
// MCP 适配器层单元测试

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { McpClient } from '@adapters/mcp/McpClient'
import { FeishuMcpAdapter } from '@adapters/mcp/FeishuMcpAdapter'
import type { IpcBridge } from '@adapters/ipc/IpcBridge'

// ── Mock IpcBridge ──────────────────────────────────────────

function makeMockBridge(mcpResult: unknown = { success: true, data: [] }): IpcBridge {
  return {
    mcpInvoke: vi.fn().mockResolvedValue(mcpResult),
    workflowList: vi.fn(),
    workflowGet: vi.fn(),
    workflowSave: vi.fn(),
    workflowExport: vi.fn(),
    workflowImport: vi.fn(),
    terminalCreate: vi.fn(),
    terminalInput: vi.fn(),
    terminalResize: vi.fn(),
    terminalKill: vi.fn(),
    ccSwitchProviders: vi.fn(),
    ccSwitchCurrent: vi.fn(),
    ccSwitchSwitch: vi.fn(),
    onTerminalData: vi.fn().mockReturnValue(() => {}),
    onTerminalExit: vi.fn().mockReturnValue(() => {}),
    onWorkflowStepStart: vi.fn().mockReturnValue(() => {}),
    onWorkflowStepDone: vi.fn().mockReturnValue(() => {}),
    onWorkflowDone: vi.fn().mockReturnValue(() => {}),
  } as unknown as IpcBridge
}

// ── McpClient ───────────────────────────────────────────────

describe('McpClient', () => {
  let bridge: IpcBridge
  let client: McpClient

  beforeEach(() => {
    bridge = makeMockBridge({ success: true, data: 'result' })
    client = new McpClient(bridge)
  })

  it('isAvailable returns true when ping succeeds', async () => {
    const ok = await client.isAvailable()
    expect(ok).toBe(true)
    expect(bridge.mcpInvoke).toHaveBeenCalledWith('ping', {})
  })

  it('isAvailable returns false when ping throws', async () => {
    (bridge.mcpInvoke as any).mockRejectedValue(new Error('network error'))
    const ok = await client.isAvailable()
    expect(ok).toBe(false)
  })

  it('invoke returns data on success', async () => {
    const result = await client.invoke('feishu_search', { query: 'test' })
    expect(result).toBe('result')
  })

  it('invoke throws on success:false', async () => {
    (bridge.mcpInvoke as any).mockResolvedValue({ success: false, error: '服务不可用' })
    await expect(client.invoke('some_tool', {})).rejects.toThrow('服务不可用')
  })

  it('invoke throws with default message when no error field', async () => {
    (bridge.mcpInvoke as any).mockResolvedValue({ success: false })
    await expect(client.invoke('my_tool', {})).rejects.toThrow('MCP 工具 my_tool 调用失败')
  })

  it('invoke passes raw result when not success-shaped', async () => {
    (bridge.mcpInvoke as any).mockResolvedValue(['item1', 'item2'])
    const result = await client.invoke('list_tool', {})
    expect(result).toEqual(['item1', 'item2'])
  })
})

// ── FeishuMcpAdapter ────────────────────────────────────────

describe('FeishuMcpAdapter', () => {
  let bridge: IpcBridge
  let mcpClient: McpClient
  let feishu: FeishuMcpAdapter

  beforeEach(() => {
    bridge = makeMockBridge()
    mcpClient = new McpClient(bridge)
    feishu = new FeishuMcpAdapter(mcpClient)
  })

  describe('isAvailable', () => {
    it('delegates to McpClient.isAvailable', async () => {
      (bridge.mcpInvoke as any).mockResolvedValue({ success: true, data: null })
      const ok = await feishu.isAvailable()
      expect(ok).toBe(true)
    })
  })

  describe('search', () => {
    it('returns mapped results from array response', async () => {
      (bridge.mcpInvoke as any).mockResolvedValue([
        { title: '文档A', url: 'https://a.com', snippet: '摘要', doc_type: 'doc' },
      ])
      const results = await feishu.search('关键词')
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('文档A')
      expect(results[0].url).toBe('https://a.com')
    })

    it('returns mapped results from items-wrapped response', async () => {
      (bridge.mcpInvoke as any).mockResolvedValue({
        success: true,
        data: { items: [{ title: '文档B', url: 'https://b.com', doc_type: 'wiki' }] },
      })
      // 注意: invoke() 拆包 success+data 后返回 { items: [...] }
      const clientSpy = vi.spyOn(mcpClient, 'invoke').mockResolvedValue(
        { items: [{ title: '文档B', url: 'https://b.com', doc_type: 'wiki' }] }
      )
      const results = await feishu.search('kw')
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('文档B')
      clientSpy.mockRestore()
    })

    it('returns empty array on error', async () => {
      (bridge.mcpInvoke as any).mockRejectedValue(new Error('network'))
      const results = await feishu.search('kw')
      expect(results).toEqual([])
    })

    it('returns empty array for null response', async () => {
      vi.spyOn(mcpClient, 'invoke').mockResolvedValue(null)
      const results = await feishu.search('kw')
      expect(results).toEqual([])
    })

    it('passes limit parameter', async () => {
      vi.spyOn(mcpClient, 'invoke').mockResolvedValue([])
      await feishu.search('kw', 5)
      expect(mcpClient.invoke).toHaveBeenCalledWith('feishu_search', { query: 'kw', limit: 5 })
    })
  })

  describe('readDoc', () => {
    it('returns mapped document on success', async () => {
      vi.spyOn(mcpClient, 'invoke').mockResolvedValue({
        title: '会议纪要', content: '正文内容', doc_type: 'doc', url: 'https://x.com'
      })
      const doc = await feishu.readDoc('https://x.com')
      expect(doc?.title).toBe('会议纪要')
      expect(doc?.content).toBe('正文内容')
    })

    it('returns null on error', async () => {
      vi.spyOn(mcpClient, 'invoke').mockRejectedValue(new Error('timeout'))
      const doc = await feishu.readDoc('https://x.com')
      expect(doc).toBeNull()
    })

    it('returns null for null response', async () => {
      vi.spyOn(mcpClient, 'invoke').mockResolvedValue(null)
      const doc = await feishu.readDoc('url')
      expect(doc).toBeNull()
    })
  })

  describe('getKnowledgeTree', () => {
    it('returns array result', async () => {
      vi.spyOn(mcpClient, 'invoke').mockResolvedValue([{ id: 'node1' }])
      const tree = await feishu.getKnowledgeTree()
      expect(tree).toHaveLength(1)
    })

    it('returns items from wrapped response', async () => {
      vi.spyOn(mcpClient, 'invoke').mockResolvedValue({ items: [{ id: 'node2' }] })
      const tree = await feishu.getKnowledgeTree('space-1')
      expect(tree).toHaveLength(1)
    })

    it('returns empty on error', async () => {
      vi.spyOn(mcpClient, 'invoke').mockRejectedValue(new Error('error'))
      const tree = await feishu.getKnowledgeTree()
      expect(tree).toEqual([])
    })
  })
})
