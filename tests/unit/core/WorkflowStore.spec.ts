// WorkflowStore.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkflowStore } from '@core/workflow/WorkflowStore'
import type { IWorkflowStorage } from '@core/types/adapter.types'
import type { Workflow } from '@core/types/workflow.types'

function makeStorage(initial: Workflow[] = []): IWorkflowStorage {
  const store: Map<string, Workflow> = new Map(initial.map(w => [w.id, w]))
  return {
    list: vi.fn(async () => Array.from(store.values())),
    get: vi.fn(async (id) => store.get(id) ?? null),
    save: vi.fn(async (wf) => { store.set(wf.id, wf) }),
    delete: vi.fn(async (id) => { const had = store.has(id); store.delete(id); return had }),
    export: vi.fn(async (id) => JSON.stringify(store.get(id))),
    import: vi.fn(async (json) => {
      const wf = JSON.parse(json) as Workflow
      store.set(wf.id, wf)
      return wf
    }),
  }
}

function makeWf(overrides?: Partial<Workflow>): Workflow {
  return {
    id: 'test-wf',
    name: 'Test Workflow',
    description: '',
    tags: ['test'],
    version: '1.0',
    steps: [{ id: 's1', type: 'terminal', target: 'workbox1', command: 'ls' }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

async function tick(ms = 10): Promise<void> {
  await new Promise(r => setTimeout(r, ms))
}

describe('WorkflowStore', () => {
  let storage: IWorkflowStorage
  let store: WorkflowStore

  beforeEach(() => {
    storage = makeStorage()
    store = new WorkflowStore(storage)
  })

  describe('list', () => {
    it('empty storage returns empty array', async () => {
      expect(await store.list()).toEqual([])
    })

    it('returns all saved workflows', async () => {
      await store.save(makeWf({ id: 'wf1', name: 'WF1' }))
      await store.save(makeWf({ id: 'wf2', name: 'WF2' }))
      expect(await store.list()).toHaveLength(2)
    })

    it('filters by tags', async () => {
      await store.save(makeWf({ id: 'wf1', tags: ['git'] }))
      await store.save(makeWf({ id: 'wf2', tags: ['npm'] }))
      await store.save(makeWf({ id: 'wf3', tags: ['git', 'daily'] }))
      const result = await store.list({ tags: ['git'] })
      expect(result.map(w => w.id)).toEqual(expect.arrayContaining(['wf1', 'wf3']))
      expect(result.some(w => w.id === 'wf2')).toBe(false)
    })

    it('filters by builtin', async () => {
      await store.loadBuiltin([makeWf({ id: 'builtin-wf', builtin: true })])
      await store.save(makeWf({ id: 'user-wf', builtin: false }))
      const builtins = await store.list({ builtin: true })
      const customs = await store.list({ builtin: false })
      expect(builtins.some(w => w.id === 'builtin-wf')).toBe(true)
      expect(customs.some(w => w.id === 'user-wf')).toBe(true)
    })
  })

  describe('get', () => {
    it('gets existing workflow', async () => {
      await store.save(makeWf({ id: 'my-wf' }))
      expect((await store.get('my-wf'))?.id).toBe('my-wf')
    })

    it('non-existent id returns null', async () => {
      expect(await store.get('non-existent')).toBeNull()
    })
  })

  describe('search', () => {
    it('searches by name', async () => {
      await store.save(makeWf({ id: 'wf1', name: 'Git Daily Flow' }))
      await store.save(makeWf({ id: 'wf2', name: 'NPM Build' }))
      const result = await store.search('git')
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('wf1')
    })

    it('searches by description', async () => {
      await store.save(makeWf({ id: 'wf1', description: 'feishu document manager' }))
      expect(await store.search('feishu')).toHaveLength(1)
    })

    it('searches by tag', async () => {
      await store.save(makeWf({ id: 'wf1', tags: ['git', 'daily'] }))
      expect((await store.search('daily')).some(w => w.id === 'wf1')).toBe(true)
    })

    it('case insensitive', async () => {
      await store.save(makeWf({ id: 'wf1', name: 'Git Status' }))
      expect(await store.search('GIT')).toHaveLength(1)
    })
  })

  describe('save', () => {
    it('creates new workflow', async () => {
      const result = await store.save(makeWf({ id: 'new-wf' }))
      expect(result.success).toBe(true)
      expect(await store.get('new-wf')).toBeTruthy()
    })

    it('updates existing workflow', async () => {
      await store.save(makeWf({ id: 'wf1', name: 'Old Name' }))
      await store.save(makeWf({ id: 'wf1', name: 'New Name' }))
      expect((await store.get('wf1'))?.name).toBe('New Name')
    })

    it('invalid workflow returns error', async () => {
      const result = await store.save({ ...makeWf(), id: '' })
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it('calls storage.save', async () => {
      await store.save(makeWf())
      expect(storage.save).toHaveBeenCalledOnce()
    })
  })

  describe('delete', () => {
    it('deletes existing workflow', async () => {
      await store.save(makeWf({ id: 'to-delete' }))
      expect(await store.delete('to-delete')).toBe(true)
      expect(await store.get('to-delete')).toBeNull()
    })

    it('deleting non-existent returns false', async () => {
      expect(await store.delete('non-existent')).toBe(false)
    })

    it('deleting builtin workflow throws', async () => {
      await store.loadBuiltin([makeWf({ id: 'builtin', builtin: true })])
      await expect(store.delete('builtin')).rejects.toThrow()
    })
  })

  describe('import', () => {
    it('imports valid JSON', async () => {
      const result = await store.import(JSON.stringify(makeWf({ id: 'imported' })))
      expect(result.success).toBe(true)
      expect(result.workflow?.id).toBe('imported')
    })

    it('invalid JSON returns error', async () => {
      expect((await store.import('invalid json')).success).toBe(false)
    })

    it('ID conflict auto-generates new ID', async () => {
      await store.save(makeWf({ id: 'conflict-id' }))
      const result = await store.import(JSON.stringify(makeWf({ id: 'conflict-id' })))
      expect(result.success).toBe(true)
      expect(result.workflow?.id).not.toBe('conflict-id')
    })

    it('imported workflow has builtin = false', async () => {
      const result = await store.import(JSON.stringify(makeWf({ id: 'imp2', builtin: true })))
      expect(result.workflow?.builtin).toBe(false)
    })
  })

  describe('export', () => {
    it('exports existing workflow as JSON', async () => {
      await store.save(makeWf({ id: 'to-export' }))
      const json = await store.export('to-export')
      expect(JSON.parse(json!).id).toBe('to-export')
    })

    it('non-existent workflow returns null', async () => {
      expect(await store.export('no-such')).toBeNull()
    })

    it('exported JSON has no createdAt/updatedAt', async () => {
      await store.save(makeWf({ id: 'clean-export' }))
      const json = await store.export('clean-export')
      const parsed = JSON.parse(json!)
      expect(parsed.createdAt).toBeUndefined()
      expect(parsed.updatedAt).toBeUndefined()
    })
  })

  describe('loadBuiltin', () => {
    it('builtin workflows are queryable', async () => {
      await store.loadBuiltin([makeWf({ id: 'builtin-1', builtin: true })])
      const wf = await store.get('builtin-1')
      expect(wf?.builtin).toBe(true)
    })

    it('loadBuiltin does not call storage.save', async () => {
      await store.loadBuiltin([makeWf({ id: 'b1' })])
      expect(storage.save).not.toHaveBeenCalled()
    })
  })
})