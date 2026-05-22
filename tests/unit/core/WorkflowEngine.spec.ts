// WorkflowEngine.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkflowEngine, type AdapterRegistry } from '@core/workflow/WorkflowEngine'
import { PanelBus } from '@core/panel/PanelBus'
import type { Workflow } from '@core/types/workflow.types'

function makeMockAdapters(overrides?: Partial<AdapterRegistry>): AdapterRegistry {
  return {
    sendTerminalCommand: vi.fn().mockResolvedValue({ success: true, output: 'ok' }),
    invokeMcp: vi.fn().mockResolvedValue({ results: [] }),
    switchCcModel: vi.fn().mockResolvedValue(true),
    openInEditor: vi.fn().mockResolvedValue(undefined),
    triggerSearch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function makeWorkflow(steps: Workflow['steps']): Workflow {
  return {
    id: 'test-workflow',
    name: 'Test Workflow',
    description: '',
    tags: [],
    version: '1.0',
    steps,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

async function tick(ms = 50): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

describe('WorkflowEngine', () => {
  let adapters: AdapterRegistry
  let bus: PanelBus
  let engine: WorkflowEngine

  beforeEach(() => {
    adapters = makeMockAdapters()
    bus = new PanelBus()
    engine = new WorkflowEngine(adapters, bus)
  })

  describe('basic execution', () => {
    it('single terminal step completes successfully', async () => {
      const wf = makeWorkflow([{ id: 's1', type: 'terminal', target: 'workbox1', command: 'ls' }])
      const execId = await engine.run(wf)
      await tick(100)
      expect(engine.getStatus(execId)?.status).toBe('completed')
      expect(adapters.sendTerminalCommand).toHaveBeenCalledWith('workbox1', 'ls')
    })

    it('run() returns executionId', async () => {
      const wf = makeWorkflow([{ id: 's1', type: 'terminal', target: 'workbox1', command: 'pwd' }])
      const execId = await engine.run(wf)
      expect(execId).toMatch(/^exec-/)
    })

    it('each run() returns unique executionId', async () => {
      const wf = makeWorkflow([{ id: 's1', type: 'terminal', target: 'workbox1', command: 'ls' }])
      const id1 = await engine.run(wf)
      const id2 = await engine.run(wf)
      expect(id1).not.toBe(id2)
    })

    it('stepResults contains all steps after completion', async () => {
      const wf = makeWorkflow([
        { id: 's1', type: 'terminal', target: 'workbox1', command: 'git status' },
        { id: 's2', type: 'terminal', target: 'workbox2', command: 'npm --version' },
      ])
      const execId = await engine.run(wf)
      await tick(100)
      const status = engine.getStatus(execId)
      expect(status?.stepResults).toHaveLength(2)
      expect(status?.stepResults.map(s => s.stepId)).toEqual(['s1', 's2'])
    })
  })

  describe('step types', () => {
    it('mcp step calls invokeMcp', async () => {
      const wf = makeWorkflow([
        { id: 's1', type: 'mcp', target: 'searchbox1', command: 'feishu_search', params: { query: 'kw' } },
      ])
      const execId = await engine.run(wf)
      await tick(100)
      expect(adapters.invokeMcp).toHaveBeenCalledWith('feishu_search', { query: 'kw' })
      expect(engine.getStatus(execId)?.status).toBe('completed')
    })

    it('cc-switch step calls switchCcModel', async () => {
      const wf = makeWorkflow([{ id: 's1', type: 'cc-switch', target: 'focused', command: 'gpt4' }])
      const execId = await engine.run(wf)
      await tick(100)
      expect(adapters.switchCcModel).toHaveBeenCalledWith('gpt4')
      expect(engine.getStatus(execId)?.status).toBe('completed')
    })

    it('editor step calls openInEditor', async () => {
      const wf = makeWorkflow([{ id: 's1', type: 'editor', target: 'learnbox', command: '# Hello' }])
      await engine.run(wf)
      await tick(100)
      expect(adapters.openInEditor).toHaveBeenCalledWith('learnbox', '# Hello', undefined)
    })

    it('notify step sends via PanelBus', async () => {
      const handler = vi.fn()
      bus.subscribe('workbox1', handler)
      const wf = makeWorkflow([{ id: 's1', type: 'notify', target: 'workbox1', command: 'Done!' }])
      await engine.run(wf)
      await tick(100)
      expect(handler).toHaveBeenCalledOnce()
      expect(handler.mock.calls[0][0].content).toBe('Done!')
    })

    it('delay step waits approximately the specified time', async () => {
      const wf = makeWorkflow([{ id: 's1', type: 'delay', target: 'focused', command: '100' }])
      const execId = await engine.run(wf)
      await tick(200)
      const delayResult = engine.getStatus(execId)?.stepResults[0]
      expect(delayResult?.durationMs).toBeGreaterThanOrEqual(90)
    })
  })

  describe('parallel execution', () => {
    it('waitFor none steps run concurrently', async () => {
      const order: string[] = []
      const slowAdapters = makeMockAdapters({
        sendTerminalCommand: vi.fn().mockImplementation(async (_panelId, cmd) => {
          await new Promise(r => setTimeout(r, cmd === 'slow' ? 100 : 20))
          order.push(cmd)
          return { success: true }
        }),
      })
      const eng = new WorkflowEngine(slowAdapters, bus)
      const wf = makeWorkflow([
        { id: 's1', type: 'terminal', target: 'workbox1', command: 'slow', waitFor: 'none' },
        { id: 's2', type: 'terminal', target: 'workbox2', command: 'fast', waitFor: 'none' },
      ])
      const start = Date.now()
      await eng.run(wf)
      await tick(200)
      expect(Date.now() - start).toBeLessThan(250)
    })

    it('waitFor complete steps run sequentially', async () => {
      const order: string[] = []
      const slowAdapters = makeMockAdapters({
        sendTerminalCommand: vi.fn().mockImplementation(async (_panelId, cmd) => {
          await new Promise(r => setTimeout(r, 30))
          order.push(cmd)
          return { success: true }
        }),
      })
      const eng = new WorkflowEngine(slowAdapters, bus)
      const wf = makeWorkflow([
        { id: 's1', type: 'terminal', target: 'workbox1', command: 'cmd1', waitFor: 'complete' },
        { id: 's2', type: 'terminal', target: 'workbox2', command: 'cmd2', waitFor: 'complete' },
      ])
      await eng.run(wf)
      await tick(200)
      expect(order).toEqual(['cmd1', 'cmd2'])
    })
  })

  describe('error handling', () => {
    it('step failure without continueOnError marks workflow failed', async () => {
      const failAdapters = makeMockAdapters({
        sendTerminalCommand: vi.fn().mockResolvedValue({ success: false, error: 'not found' }),
      })
      const eng = new WorkflowEngine(failAdapters, bus)
      const wf = makeWorkflow([{ id: 's1', type: 'terminal', target: 'workbox1', command: 'bad-cmd' }])
      const execId = await eng.run(wf)
      await tick(100)
      expect(eng.getStatus(execId)?.status).toBe('failed')
    })

    it('continueOnError: true skips failure and continues', async () => {
      const failAdapters = makeMockAdapters({
        sendTerminalCommand: vi.fn()
          .mockResolvedValueOnce({ success: false, error: 'error' })
          .mockResolvedValueOnce({ success: true }),
      })
      const eng = new WorkflowEngine(failAdapters, bus)
      const wf = makeWorkflow([
        { id: 's1', type: 'terminal', target: 'workbox1', command: 'bad', continueOnError: true },
        { id: 's2', type: 'terminal', target: 'workbox1', command: 'good' },
      ])
      const execId = await eng.run(wf)
      await tick(100)
      const status = eng.getStatus(execId)
      expect(status?.status).toBe('completed')
      expect(status?.stepResults[0].success).toBe(false)
      expect(status?.stepResults[1].success).toBe(true)
    })
  })

  describe('cancel', () => {
    it('cancel() aborts execution', async () => {
      const slowAdapters = makeMockAdapters({
        sendTerminalCommand: vi.fn().mockImplementation(
          () => new Promise(r => setTimeout(() => r({ success: true }), 500))
        ),
      })
      const eng = new WorkflowEngine(slowAdapters, bus)
      const wf = makeWorkflow([{ id: 's1', type: 'terminal', target: 'workbox1', command: 'slow' }])
      const execId = await eng.run(wf)
      await tick(20)
      expect(eng.cancel(execId)).toBe(true)
      expect(eng.getStatus(execId)?.status).toBe('cancelled')
    })

    it('cancelling non-existent execution returns false', () => {
      expect(engine.cancel('non-existent')).toBe(false)
    })
  })

  describe('events', () => {
    it('execution:start fires on run', async () => {
      const handler = vi.fn()
      engine.on('execution:start', handler)
      const wf = makeWorkflow([{ id: 's1', type: 'terminal', target: 'workbox1', command: 'ls' }])
      await engine.run(wf)
      expect(handler).toHaveBeenCalledOnce()
    })

    it('execution:done fires on completion', async () => {
      const handler = vi.fn()
      engine.on('execution:done', handler)
      const wf = makeWorkflow([{ id: 's1', type: 'terminal', target: 'workbox1', command: 'ls' }])
      await engine.run(wf)
      await tick(100)
      expect(handler).toHaveBeenCalledOnce()
    })

    it('step:done fires with correct stepId', async () => {
      const handler = vi.fn()
      engine.on('step:done', handler)
      const wf = makeWorkflow([{ id: 'my-step', type: 'terminal', target: 'workbox1', command: 'ls' }])
      await engine.run(wf)
      await tick(100)
      expect(handler.mock.calls[0][0].stepId).toBe('my-step')
    })

    it('execution:failed fires on failure', async () => {
      const handler = vi.fn()
      const failAdapters = makeMockAdapters({
        sendTerminalCommand: vi.fn().mockResolvedValue({ success: false }),
      })
      const eng = new WorkflowEngine(failAdapters, bus)
      eng.on('execution:failed', handler)
      const wf = makeWorkflow([{ id: 's1', type: 'terminal', target: 'workbox1', command: 'bad' }])
      await eng.run(wf)
      await tick(100)
      expect(handler).toHaveBeenCalledOnce()
    })
  })

  describe('getRunning', () => {
    it('running execution appears in getRunning', async () => {
      const slowAdapters = makeMockAdapters({
        sendTerminalCommand: vi.fn().mockImplementation(
          () => new Promise(r => setTimeout(() => r({ success: true }), 500))
        ),
      })
      const eng = new WorkflowEngine(slowAdapters, bus)
      const wf = makeWorkflow([{ id: 's1', type: 'terminal', target: 'workbox1', command: 'slow' }])
      const execId = await eng.run(wf)
      await tick(20)
      expect(eng.getRunning()).toContain(execId)
    })

    it('completed execution not in getRunning', async () => {
      const wf = makeWorkflow([{ id: 's1', type: 'terminal', target: 'workbox1', command: 'ls' }])
      const execId = await engine.run(wf)
      await tick(100)
      expect(engine.getRunning()).not.toContain(execId)
    })
  })
})