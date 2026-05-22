// CC Switch数据库读取器
import initSqlJs, { Database } from 'sql.js'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

interface ProviderConfig {
  id: string
  name: string
  apiUrl: string
  modelName: string
  isActive: boolean
}

export class CCSwitchReader {
  private db: Database | null = null
  private dbPath: string
  private settingsPath: string

  constructor(ccSwitchDataPath: string) {
    // 使用用户实际的CC Switch数据路径
    this.dbPath = join(ccSwitchDataPath, 'cc-switch.db')
    this.settingsPath = join(ccSwitchDataPath, 'settings.json')
  }

  async loadDatabase(): Promise<void> {
    const SQL = await initSqlJs({
      locateFile: (file: string) => join(__dirname, '../../../node_modules/sql.js/dist', file)
    })

    const buffer = readFileSync(this.dbPath)
    this.db = new SQL.Database(buffer)
  }

  // 获取所有providers
  async getAllProviders(): Promise<ProviderConfig[]> {
    if (!this.db) {
      await this.loadDatabase()
    }

    const result = this.db!.exec(`
      SELECT id, name, api_url, model_name, is_active
      FROM providers
      WHERE deleted = 0 OR deleted IS NULL
    `)

    if (result.length === 0) {
      return []
    }

    const columns = result[0].columns
    return result[0].values.map(row => {
      const obj: Record<string, any> = {}
      columns.forEach((col: string, i: number) => {
        obj[col] = row[i]
      })
      return {
        id: obj.id || '',
        name: obj.name || '',
        apiUrl: obj.api_url || '',
        modelName: obj.model_name || '',
        isActive: Boolean(obj.is_active)
      } as ProviderConfig
    })
  }

  // 获取当前活跃provider
  async getCurrentProvider(): Promise<ProviderConfig | null> {
    try {
      const settings = JSON.parse(readFileSync(this.settingsPath, 'utf-8'))
      const currentId = settings.currentProviderClaude

      if (!currentId) {
        return null
      }

      const providers = await this.getAllProviders()
      return providers.find(p => p.id === currentId) || null
    } catch {
      return null
    }
  }

  // 切换provider
  async switchProvider(providerId: string): Promise<boolean> {
    try {
      // 修改settings.json
      const settings = JSON.parse(readFileSync(this.settingsPath, 'utf-8'))
      settings.currentProviderClaude = providerId
      writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2))

      // CC Switch会自动监听文件变化并重载
      return true
    } catch {
      return false
    }
  }

  // 关闭数据库
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}