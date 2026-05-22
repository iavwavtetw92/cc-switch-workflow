// ============================================================
// CcSwitchAdapter — 基于真实 CC Switch 数据结构
// - providers 列表：从 cc-switch.db 读（列名 api_url, model_name）
// - 当前 provider：从 settings.json 的 currentProviderClaude 读
// - 切换 provider：写 settings.json，CC Switch 自动监听文件变化
// ============================================================

import { readFileSync, existsSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import type { ICcSwitchAdapter, Provider } from '../../core/types/adapter.types'


// CC Switch 数据目录候选（按优先级）
const CC_DATA_DIRS = [
  join(homedir(), 'AppData', 'Roaming', 'cc-switch'),
  join(homedir(), 'AppData', 'Local', 'cc-switch'),
  join(homedir(), '.config', 'cc-switch'),
  join(homedir(), '.cc-switch'),
  'C:\\ProgramData\\cc-switch',
]

export class CcSwitchAdapter implements ICcSwitchAdapter {
  private db:       any    = null
  private dataDir:  string | null = null
  private SQL:      any    = null

  // ── 找到 CC Switch 数据目录 ──────────────────────────────
  private async findDataDir(): Promise<string | null> {
    if (this.dataDir) return this.dataDir

    for (const dir of CC_DATA_DIRS) {
      const dbPath = join(dir, 'cc-switch.db')
      if (existsSync(dbPath) && statSync(dbPath).size > 0) {
        this.dataDir = dir
        return dir
      }
    }

    // 深度扫描兜底
    const found = this.scanForDb()
    if (found) {
      this.dataDir = dirname(found)
      return this.dataDir
    }

    return null
  }

  private scanForDb(): string | null {
    const roots = [homedir(), 'C:\\', 'D:\\']
    const exclude = new Set(['node_modules', '.git', 'Windows', 'Program Files',
      'Program Files (x86)', '$Recycle.Bin', 'System Volume Information'])

    const scan = (dir: string, depth: number): string | null => {
      if (depth > 4) return null
      try {
        const { readdirSync } = require('fs')
        const entries = readdirSync(dir, { withFileTypes: true })
        for (const e of entries) {
          if (!e.isDirectory() && e.name === 'cc-switch.db') {
            const p = join(dir, e.name)
            if (existsSync(p) && statSync(p).size > 0) return p
          }
        }
        for (const e of entries) {
          if (e.isDirectory() && !exclude.has(e.name)) {
            const r = scan(join(dir, e.name), depth + 1)
            if (r) return r
          }
        }
      } catch {}
      return null
    }

    for (const root of roots) {
      const r = scan(root, 0)
      if (r) return r
    }
    return null
  }

  // ── 打开 DB ──────────────────────────────────────────────
  private async ensureDb(): Promise<boolean> {
    if (this.db) return true

    const dir = await this.findDataDir()
    if (!dir) {
      console.warn('[CcSwitchAdapter] 未找到 CC Switch 数据目录')
      return false
    }

    try {
      if (!this.SQL) {
        const initSqlJs = require('sql.js')
        this.SQL = await initSqlJs()
      }
      const buf = readFileSync(join(dir, 'cc-switch.db'))
      this.db = new this.SQL.Database(buf)
      console.info('[CcSwitchAdapter] 已加载 DB:', join(dir, 'cc-switch.db'))
      return true
    } catch (err) {
      console.error('[CcSwitchAdapter] 打开 DB 失败:', err)
      return false
    }
  }


  async scanDatabasePath(): Promise<string | null> {
    const dir = await this.findDataDir()
    return dir ? join(dir, 'cc-switch.db') : null
  }

  async getProviders(): Promise<Provider[]> {
    if (!(await this.ensureDb())) return []

    try {
      // 先探查表结构
      const tables = this.db.exec("SELECT name FROM sqlite_master WHERE type='table'")
      const tableNames: string[] = (tables[0]?.values ?? []).map((r: any[]) => r[0])
      console.info('[CcSwitchAdapter] 表列表:', tableNames)

      const tbl = tableNames.find(t =>
        ['providers', 'provider', 'models', 'model_configs'].includes(t.toLowerCase())
      )
      if (!tbl) {
        console.warn('[CcSwitchAdapter] 未找到 providers 表，已有表:', tableNames)
        return []
      }

      // 探查列名
      const pragma = this.db.exec(`PRAGMA table_info(${tbl})`)
      const cols: string[] = (pragma[0]?.values ?? []).map((r: any[]) => r[1])
      console.info('[CcSwitchAdapter] 列名:', cols)

      const result = this.db.exec(`SELECT * FROM ${tbl} LIMIT 100`)
      if (!result[0]) return []

      const { columns, values } = result[0]
      return values.map((row: any[]) => {
        const obj: Record<string, any> = {}
        columns.forEach((c: string, i: number) => { obj[c] = row[i] })
        return this.mapRow(obj)
      })
    } catch (err) {
      console.error('[CcSwitchAdapter] 查询失败:', err)
      return []
    }
  }

  async getCurrentProvider(): Promise<Provider | null> {
    if (!(await this.ensureDb())) return null

    try {
      const providers = await this.getProviders()
      // is_current 列标记当前激活的 provider
      return providers.find(p => p.isActive) ?? providers[0] ?? null
    } catch {
      return null
    }
  }

  async switchProvider(providerId: string): Promise<boolean> {
    if (!(await this.ensureDb())) return false

    try {
      // CC Switch 真实切换机制：更新 providers 表的 is_current 列
      this.db.run(`UPDATE providers SET is_current = 0`)
      this.db.run(`UPDATE providers SET is_current = 1 WHERE id = ?`, [providerId])
      // 写回 DB 文件
      const { writeFileSync } = require('fs')
      const data = this.db.export()
      writeFileSync(join(this.dataDir!, 'cc-switch.db'), Buffer.from(data))
      console.info('[CcSwitchAdapter] 已切换 provider:', providerId)
      return true
    } catch (err) {
      console.error('[CcSwitchAdapter] 切换失败:', err)
      return false
    }
  }

  // ── 行映射（兼容多种列名） ───────────────────────────────
  private mapRow(row: Record<string, any>): Provider {
    // settings_config 列存 JSON，包含 apiKey/baseUrl/model 等
    let config: Record<string, any> = {}
    try {
      if (row.settings_config) config = JSON.parse(row.settings_config)
    } catch {}

    return {
      id:        String(row.id ?? ''),
      name:      String(row.name ?? row.id ?? ''),
      type:      String(row.provider_type ?? row.app_type ?? row.type ?? 'unknown'),
      // 真实 active 列是 is_current
      isActive:  !!(row.is_current ?? row.is_active ?? false),
      baseUrl:   config.baseUrl ?? config.apiUrl ?? config.api_url ?? config.base_url ?? row.website_url ?? undefined,
      models:    this.parseModels(config.models ?? config.model ?? null),
      // 透传给 AiService
      apiUrl:    config.baseUrl ?? config.apiUrl ?? config.api_url ?? undefined,
      modelName: config.model  ?? config.modelName ?? config.model_name ?? undefined,
      apiKey:    config.apiKey ?? config.api_key ?? undefined,
    } as any
  }

  private parseModels(raw: unknown): string[] | undefined {
    if (!raw) return undefined
    if (Array.isArray(raw)) return raw.map(String)
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) } catch { return [raw] }
    }
    return undefined
  }

  // ── 测试工具 ─────────────────────────────────────────────
  _setDbPath(path: string): void {
    this.dataDir = dirname(path)
    this.db = null
  }
  _setSql(sql: any): void { this.SQL = sql }
}
