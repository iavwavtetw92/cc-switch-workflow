// ============================================================
// FileSystemStorage — Adapter Layer
// 工作流 JSON 文件持久化
// 目录结构：
//   <userDataDir>/workflows/
//     ├── <id>.json
//     └── ...
// ============================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import type { IWorkflowStorage } from '../../core/types/adapter.types'
import type { Workflow } from '../../core/types/workflow.types'
import { WorkflowValidator } from '../../core/workflow/WorkflowValidator'

export class FileSystemStorage implements IWorkflowStorage {
  private readonly dir: string
  private validator = new WorkflowValidator()

  constructor(userDataDir: string) {
    this.dir = join(userDataDir, 'workflows')
    this.ensureDir()
  }

  private ensureDir(): void {
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true })
    }
  }

  async list(): Promise<Workflow[]> {
    const files = readdirSync(this.dir).filter(f => f.endsWith('.json'))
    const workflows: Workflow[] = []

    for (const file of files) {
      try {
        const json = readFileSync(join(this.dir, file), 'utf-8')
        const parsed = JSON.parse(json) as Workflow
        workflows.push(parsed)
      } catch {
        // 损坏的文件跳过
      }
    }

    return workflows
  }

  async get(id: string): Promise<Workflow | null> {
    const path = this.filePath(id)
    if (!existsSync(path)) return null

    try {
      const json = readFileSync(path, 'utf-8')
      return JSON.parse(json) as Workflow
    } catch {
      return null
    }
  }

  async save(workflow: Workflow): Promise<void> {
    const path = this.filePath(workflow.id)
    writeFileSync(path, JSON.stringify(workflow, null, 2), 'utf-8')
  }

  async delete(id: string): Promise<boolean> {
    const path = this.filePath(id)
    if (!existsSync(path)) return false

    try {
      unlinkSync(path)
      return true
    } catch {
      return false
    }
  }

  async export(id: string): Promise<string> {
    const wf = await this.get(id)
    if (!wf) throw new Error(`工作流 ${id} 不存在`)

    const { createdAt, updatedAt, builtin, ...exportable } = wf
    return JSON.stringify(exportable, null, 2)
  }

  async import(json: string): Promise<Workflow> {
    const { workflow, result } = this.validator.parseAndValidate(json)
    if (!result.valid || !workflow) {
      throw new Error(`导入失败: ${result.errors.map(e => e.message).join(', ')}`)
    }
    workflow.builtin = false
    await this.save(workflow)
    return workflow
  }

  private filePath(id: string): string {
    // 对 ID 做简单的文件名安全处理
    const safeId = id.replace(/[^a-zA-Z0-9-_]/g, '_')
    return join(this.dir, `${safeId}.json`)
  }

  /** 获取存储目录（测试用） */
  getDir(): string {
    return this.dir
  }
}
