// ============================================================
// CcSwitchAdapter — Adapter Layer
// 读取本地 cc-switch.db，支持扫描数据库位置
// 使用 sql.js（纯 JS SQLite，不需要编译）
// ============================================================

import { readFileSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { ICcSwitchAdapter, Provider } from '../../core/types/adapter.types'

// cc-switch.db 固定位置列表（按优先级排序）
const FIXED_DB_PATHS = [
  join(homedir(), '.config', 'cc-switch', 'cc-switch.db'),
  join(homedir(), 'AppData', 'Roaming', 'cc-switch', 'cc-switch.db'),
  join(homedir(), 'AppData', 'Local', 'cc-switch', 'cc-switch.db'),
  'C:\\ProgramData\\cc-switch\\cc-switch.db',
  join(homedir(), '.cc-switch', 'cc-switch.db'),
  // 常见开发目录
  'D:\\cc-switch\\cc-switch.db',
  'C:\\cc-switch\\cc-switch.db',
]

// 扫描范围（深度优先）
const SCAN_ROOTS = [
  homedir(),
  'C:\\',
  'D:\\',
]
const MAX_SCAN_DEPTH = 4
const SCAN_EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'Windows', 'Program Files', 'Program Files (x86)',
  '$Recycle.Bin', 'System Volume Information', 'Recovery',
])

export class CcSwitchAdapter implements ICcSwitchAdapter {
  private db: any = null
  private dbPath: string | null = null
  private SQL: any = null

  // --------------------------------------------------------
  // 数据库路径扫描
  // --------------------------------------------------------

  /**
   * 扫描本地 cc-switch.db 文件位置
   * 1. 先检查固定路径
   * 2. 再深度扫描常见目录
   */
  async scanDatabasePath(): Promise<string | null> {
    // 1. 检查固定路径
    for (const p of FIXED_DB_PATHS) {
      if (this.isValidDb(p)) {
        return p
      }
    }

    // 2. 深度扫描
    for (const root of SCAN_ROOTS) {
      const found = this.scanDir(root, 0)
      if (found) return found
    }

    return null
  }

  private isValidDb(path: string): boolean {
    try {
      return existsSync(path) && statSync(path).isFile() && statSync(path).size > 0
    } catch {
      return false
    }
  }

  private scanDir(dir: string, depth: number): string | null {
    if (depth > MAX_SCAN_DEPTH) return null

    try {
      const { readdirSync } = require('fs')
      const entries = readdirSync(dir, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isDirectory() && entry.name === 'cc-switch.db') {
          const fullPath = join(dir, entry.name)
          if (this.isValidDb(fullPath)) return fullPath
        }
      }

      for (const entry of entries) {
        if (entry.isDirectory() && !SCAN_EXCLUDE_DIRS.has(entry.name)) {
          const found = this.scanDir(join(dir, entry.name), depth + 1)
          if (found) return found
        }
      }
    } catch {
      // 无权限目录跳过
    }

    return null
  }

  // --------------------------------------------------------
  // 数据库初始化
  // --------------------------------------------------------

  private async ensureDb(): Promise<boolean> {
    if (this.db) return true

    // 自动寻找数据库路径
    if (!this.dbPath) {
      this.dbPath = await this.scanDatabasePath()
    }

    if (!this.dbPath) {
      console.warn('[CcSwitchAdapter] 未找到 cc-switch.db，请确认 cc-switch 已安装')
      return false
    }

    try {
      // 懒加载 sql.js（纯 JS SQLite）
      if (!this.SQL) {
        const initSqlJs = require('sql.js')
        this.SQL = await initSqlJs()
      }
      const dbBuffer = readFileSync(this.dbPath)
      this.db = new this.SQL.Database(dbBuffer)
      return true
    } catch (err) {
      console.error('[CcSwitchAdapter] 打开数据库失败:', err)
      return false
    }
  }

  // --------------------------------------------------------
  // Provider 操作
  // --------------------------------------------------------

  async getProviders(): Promise<Provider[]> {
    if (!(await this.ensureDb())) return []

    try {
      // 尝试常见的表结构（cc-switch 可能用 providers 表）
      const result = this.queryProviders()
      return result
    } catch (err) {
      console.error('[CcSwitchAdapter] 查询 providers 失败:', err)
      return []
    }
  }

  async getCurrentProvider(): Promise<Provider | null> {
    if (!(await this.ensureDb())) return null

    try {
      const providers = await this.getProviders()
      // 优先内存记录（switchProvider 写入），其次 DB isActive 字段，最后取第一个
      if (this._activeProviderId) {
        return providers.find(p => p.id === this._activeProviderId) ?? providers[0] ?? null
      }
      return providers.find(p => p.isActive) ?? providers[0] ?? null
    } catch {
      return null
    }
  }

  // 内存中维护当前活跃 provider（当 DB 列不支持时的兜底）
  private _activeProviderId: string | null = null

  async switchProvider(providerId: string): Promise<boolean> {
    if (!(await this.ensureDb())) return false

    // 先尝试探测实际列名
    const activeCol = this.detectActiveColumn()

    if (activeCol) {
      try {
        // 找到实际的 active 列，写 DB
        const tbl = this.detectProviderTable()
        if (tbl) {
          this.db.run(`UPDATE ${tbl} SET ${activeCol} = 0`)
          this.db.run(`UPDATE ${tbl} SET ${activeCol} = 1 WHERE id = ?`, [providerId])
          if (this.dbPath) {
            const { writeFileSync } = require('fs')
            writeFileSync(this.dbPath, Buffer.from(this.db.export()))
          }
        }
      } catch (err) {
        console.warn('[CcSwitchAdapter] DB 写入失败，改用内存模式:', err)
      }
    } else {
      console.info('[CcSwitchAdapter] DB 无 active 列，使用内存跟踪 active provider')
    }

    // 无论 DB 写成功与否，内存中记录
    this._activeProviderId = providerId
    return true
  }

  private detectProviderTable(): string | null {
    try {
      const tables = this.db.exec("SELECT name FROM sqlite_master WHERE type='table'")
      const names: string[] = (tables[0]?.values ?? []).map((r: any[]) => r[0])
      return names.find(t =>
        ['providers', 'provider', 'models', 'model_configs', 'config'].includes(t.toLowerCase())
      ) ?? null
    } catch { return null }
  }

  private detectActiveColumn(): string | null {
    try {
      const tbl = this.detectProviderTable()
      if (!tbl) return null
      const info = this.db.exec(`PRAGMA table_info(${tbl})`)
      const cols: string[] = (info[0]?.values ?? []).map((r: any[]) => r[1])
      return cols.find(c => ['is_active', 'isactive', 'active', 'enabled', 'selected'].includes(c.toLowerCase())) ?? null
    } catch { return null }
  }

  // --------------------------------------------------------
  // 私有：查询 providers 表（兼容不同列名）
  // --------------------------------------------------------

  private queryProviders(): Provider[] {
    if (!this.db) return []

    try {
      // 先查表结构
      const tables = this.db.exec(
        "SELECT name FROM sqlite_master WHERE type='table'"
      )
      const tableNames: string[] = (tables[0]?.values ?? []).map((r: any[]) => r[0])

      // 找 providers/provider/models/config 相关表
      const targetTable = tableNames.find(t =>
        ['providers', 'provider', 'models', 'model_configs', 'config'].includes(t.toLowerCase())
      )

      if (!targetTable) {
        console.warn('[CcSwitchAdapter] 未找到 providers 表，已有表:', tableNames)
        return []
      }

      const result = this.db.exec(`SELECT * FROM ${targetTable} LIMIT 100`)
      if (!result[0]) return []

      const { columns, values } = result[0]

      return values.map((row: any[]) => {
        const obj: Record<string, any> = {}
        columns.forEach((col: string, i: number) => { obj[col] = row[i] })

        return this.mapRowToProvider(obj)
      })
    } catch (err) {
      throw new Error(`查询失败: ${(err as Error).message}`)
    }
  }

  private mapRowToProvider(row: Record<string, any>): Provider {
    // 兼容多种列名风格
    return {
      id:       String(row.id ?? row.provider_id ?? row.name ?? ''),
      name:     String(row.name ?? row.provider_name ?? row.label ?? row.id ?? ''),
      type:     String(row.type ?? row.provider_type ?? 'unknown'),
      isActive: !!(row.is_active ?? row.isActive ?? row.active ?? row.enabled ?? false),
      baseUrl:  row.base_url ?? row.baseUrl ?? row.url ?? undefined,
      models:   this.parseModels(row.models ?? row.model_list ?? null),
    }
  }

  private parseModels(raw: unknown): string[] | undefined {
    if (!raw) return undefined
    if (Array.isArray(raw)) return raw.map(String)
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) } catch { return [raw] }
    }
    return undefined
  }

  // --------------------------------------------------------
  // 测试工具
  // --------------------------------------------------------

  /** 手动设置数据库路径（测试用） */
  _setDbPath(path: string): void {
    this.dbPath = path
    this.db = null
  }

  /** 注入 sql.js 实例（测试用） */
  _setSql(sql: any): void {
    this.SQL = sql
  }
}
