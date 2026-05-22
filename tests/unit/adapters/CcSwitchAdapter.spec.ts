// CcSwitchAdapter.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CcSwitchAdapter } from '@adapters/cc-switch/CcSwitchAdapter'

function makeMockDb(tables: Record<string, { columns: string[]; rows: any[][] }>) {
  const mockRun = vi.fn()
  const mockDb = {
    run: mockRun,
    exec: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('sqlite_master')) {
        return [{ values: Object.keys(tables).map(t => [t]), columns: ['name'] }]
      }
      for (const [tableName, tableData] of Object.entries(tables)) {
        if (sql.includes(tableName)) {
          return [{ columns: tableData.columns, values: tableData.rows }]
        }
      }
      return []
    }),
    export: vi.fn().mockReturnValue(new Uint8Array([0])),
  }
  return mockDb
}

function makeAdapter(db?: any): CcSwitchAdapter {
  const adapter = new CcSwitchAdapter()
  // Force no db and no path so scan cannot find real db
  ;(adapter as any).db = db ?? null
  ;(adapter as any).dbPath = db ? '/fake/path' : 'FORCE_NONE'
  ;(adapter as any).SQL = {}
  return adapter
}

describe('CcSwitchAdapter', () => {
  describe('getProviders', () => {
    it('reads providers from DB', async () => {
      const mockDb = makeMockDb({
        providers: {
          columns: ['id', 'name', 'type', 'is_active', 'base_url'],
          rows: [
            ['openai', 'OpenAI', 'openai', 1, 'https://api.openai.com'],
            ['anthropic', 'Anthropic', 'claude', 0, 'https://api.anthropic.com'],
          ],
        },
      })
      const adapter = makeAdapter(mockDb)

      const providers = await adapter.getProviders()
      expect(providers).toHaveLength(2)
      expect(providers[0].id).toBe('openai')
      expect(providers[0].isActive).toBe(true)
      expect(providers[1].id).toBe('anthropic')
      expect(providers[1].isActive).toBe(false)
    })

    it('returns empty array when DB unavailable', async () => {
      const adapter = makeAdapter(null)
      expect(await adapter.getProviders()).toEqual([])
    })

    it('returns empty array when table has no rows', async () => {
      const mockDb = makeMockDb({
        providers: { columns: ['id', 'name', 'type', 'is_active'], rows: [] },
      })
      const adapter = makeAdapter(mockDb)
      expect(await adapter.getProviders()).toEqual([])
    })
  })

  describe('getCurrentProvider', () => {
    it('returns active provider', async () => {
      const mockDb = makeMockDb({
        providers: {
          columns: ['id', 'name', 'type', 'is_active'],
          rows: [
            ['openai', 'OpenAI', 'openai', 0],
            ['anthropic', 'Anthropic', 'claude', 1],
          ],
        },
      })
      const adapter = makeAdapter(mockDb)
      const current = await adapter.getCurrentProvider()
      expect(current?.id).toBe('anthropic')
    })

    it('returns first provider when none active', async () => {
      const mockDb = makeMockDb({
        providers: {
          columns: ['id', 'name', 'type', 'is_active'],
          rows: [['openai', 'OpenAI', 'openai', 0]],
        },
      })
      const adapter = makeAdapter(mockDb)
      expect((await adapter.getCurrentProvider())?.id).toBe('openai')
    })

    it('returns null when no DB', async () => {
      const adapter = makeAdapter(null)
      expect(await adapter.getCurrentProvider()).toBeNull()
    })
  })

  describe('switchProvider', () => {
    it('executes correct SQL', async () => {
      const mockDb = makeMockDb({
        providers: {
          columns: ['id', 'name', 'type', 'is_active'],
          rows: [['openai', 'OpenAI', 'openai', 1]],
        },
      })
      const adapter = makeAdapter(mockDb)
      ;(adapter as any).dbPath = null

      const ok = await adapter.switchProvider('anthropic')
      expect(ok).toBe(true)
      expect(mockDb.run).toHaveBeenCalledWith('UPDATE providers SET is_active = 0')
      expect(mockDb.run).toHaveBeenCalledWith('UPDATE providers SET is_active = 1 WHERE id = ?', ['anthropic'])
    })

    it('returns false when DB unavailable', async () => {
      const adapter = makeAdapter(null)
      expect(await adapter.switchProvider('any')).toBe(false)
    })
  })

  describe('column name compatibility', () => {
    it('supports is_active column name', async () => {
      const mockDb = makeMockDb({
        providers: {
          columns: ['id', 'name', 'type', 'is_active'],
          rows: [['gpt4', 'GPT-4', 'openai', 1]],
        },
      })
      const adapter = makeAdapter(mockDb)
      expect((await adapter.getProviders())[0].isActive).toBe(true)
    })

    it('supports active column name', async () => {
      const mockDb = makeMockDb({
        providers: {
          columns: ['id', 'name', 'type', 'active'],
          rows: [['gpt4', 'GPT-4', 'openai', 1]],
        },
      })
      const adapter = makeAdapter(mockDb)
      expect((await adapter.getProviders())[0].isActive).toBe(true)
    })

    it('models field supports JSON string', async () => {
      const mockDb = makeMockDb({
        providers: {
          columns: ['id', 'name', 'type', 'is_active', 'models'],
          rows: [['openai', 'OpenAI', 'openai', 1, '["gpt-4","gpt-3.5"]']],
        },
      })
      const adapter = makeAdapter(mockDb)
      const providers = await adapter.getProviders()
      expect(providers[0].models).toEqual(['gpt-4', 'gpt-3.5'])
    })
  })

  describe('scanDatabasePath', () => {
    it('scan returns string or null', async () => {
      const adapter = new CcSwitchAdapter()
      const result = await adapter.scanDatabasePath()
      expect(result === null || typeof result === 'string').toBe(true)
      if (result) {
        console.log('[test] Found cc-switch.db at:', result)
      }
    })
  })
})