// FileSystemStorage.spec.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { FileSystemStorage } from '@adapters/storage/FileSystemStorage'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { Workflow } from '@core/types/workflow.types'

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'cc-switch-test-'))
}

function makeWf(overrides?: Partial<Workflow>): Workflow {
  return {
    id: 'test-wf',
    name: 'Test Workflow',
    description: 'desc',
    tags: ['test'],
    version: '1.0',
    steps: [{ id: 's1', type: 'terminal', target: 'workbox1', command: 'ls' }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

describe('FileSystemStorage', () => {
  let tempDir: string
  let storage: FileSystemStorage

  beforeEach(() => {
    tempDir = makeTempDir()
    storage = new FileSystemStorage(tempDir)
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('initialization', () => {
    it('auto-creates workflows directory', () => {
      expect(existsSync(storage.getDir())).toBe(true)
    })

    it('empty directory returns empty list', async () => {
      expect(await storage.list()).toEqual([])
    })
  })

  describe('save & get', () => {
    it('saves and retrieves workflow', async () => {
      await storage.save(makeWf({ id: 'my-wf' }))
      const result = await storage.get('my-wf')
      expect(result?.id).toBe('my-wf')
      expect(result?.name).toBe('Test Workflow')
    })

    it('non-existent id returns null', async () => {
      expect(await storage.get('non-existent')).toBeNull()
    })

    it('updates existing workflow', async () => {
      await storage.save(makeWf({ id: 'wf1', name: 'Old Name' }))
      await storage.save(makeWf({ id: 'wf1', name: 'New Name' }))
      expect((await storage.get('wf1'))?.name).toBe('New Name')
    })
  })

  describe('list', () => {
    it('lists all saved workflows', async () => {
      await storage.save(makeWf({ id: 'wf1' }))
      await storage.save(makeWf({ id: 'wf2' }))
      await storage.save(makeWf({ id: 'wf3' }))
      expect(await storage.list()).toHaveLength(3)
    })

    it('skips corrupted JSON files', async () => {
      writeFileSync(join(storage.getDir(), 'broken.json'), '{ invalid }', 'utf-8')
      await storage.save(makeWf({ id: 'valid' }))
      const list = await storage.list()
      expect(list.some(w => w.id === 'valid')).toBe(true)
      expect(list).toHaveLength(1)
    })
  })

  describe('delete', () => {
    it('deletes saved workflow', async () => {
      await storage.save(makeWf({ id: 'to-delete' }))
      expect(await storage.delete('to-delete')).toBe(true)
      expect(await storage.get('to-delete')).toBeNull()
    })

    it('non-existent returns false', async () => {
      expect(await storage.delete('non-existent')).toBe(false)
    })
  })

  describe('export', () => {
    it('exports workflow as JSON', async () => {
      await storage.save(makeWf({ id: 'exportable' }))
      const json = await storage.export('exportable')
      expect(JSON.parse(json).id).toBe('exportable')
    })

    it('exported JSON has no createdAt/updatedAt/builtin', async () => {
      await storage.save(makeWf({ id: 'clean' }))
      const parsed = JSON.parse(await storage.export('clean'))
      expect(parsed.createdAt).toBeUndefined()
      expect(parsed.updatedAt).toBeUndefined()
      expect(parsed.builtin).toBeUndefined()
    })

    it('non-existent throws', async () => {
      await expect(storage.export('no-such')).rejects.toThrow()
    })
  })

  describe('import', () => {
    it('imports valid JSON', async () => {
      const result = await storage.import(JSON.stringify(makeWf({ id: 'to-import' })))
      expect(result.id).toBe('to-import')
    })

    it('imported workflow queryable', async () => {
      await storage.import(JSON.stringify(makeWf({ id: 'imported' })))
      expect(await storage.get('imported')).toBeTruthy()
    })

    it('invalid JSON throws', async () => {
      await expect(storage.import('{ broken }')).rejects.toThrow()
    })

    it('imported workflow has builtin = false', async () => {
      const result = await storage.import(JSON.stringify(makeWf({ id: 'imp2', builtin: true })))
      expect(result.builtin).toBe(false)
    })
  })
})