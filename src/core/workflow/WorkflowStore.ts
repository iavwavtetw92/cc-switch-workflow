// ============================================================
// WorkflowStore — Core Layer
// 工作流内存 CRUD，依赖注入 IWorkflowStorage 做持久化
// 纯逻辑，无框架依赖
// ============================================================

import type { Workflow } from '../types/workflow.types'
import type { IWorkflowStorage } from '../types/adapter.types'
import { WorkflowValidator } from './WorkflowValidator'

export class WorkflowStore {
  private cache: Map<string, Workflow> = new Map()
  private loaded = false
  private validator = new WorkflowValidator()

  constructor(private storage: IWorkflowStorage) {}

  // --------------------------------------------------------
  // 查询
  // --------------------------------------------------------

  async list(filter?: { tags?: string[]; builtin?: boolean }): Promise<Workflow[]> {
    await this.ensureLoaded()
    let workflows = Array.from(this.cache.values())

    if (filter?.tags && filter.tags.length > 0) {
      workflows = workflows.filter(wf =>
        filter.tags!.some(tag => wf.tags.includes(tag)),
      )
    }

    if (filter?.builtin !== undefined) {
      workflows = workflows.filter(wf => !!wf.builtin === filter.builtin)
    }

    return workflows.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async get(id: string): Promise<Workflow | null> {
    await this.ensureLoaded()
    return this.cache.get(id) ?? null
  }

  async search(keyword: string): Promise<Workflow[]> {
    await this.ensureLoaded()
    const kw = keyword.toLowerCase()
    return Array.from(this.cache.values()).filter(wf =>
      wf.name.toLowerCase().includes(kw) ||
      wf.description.toLowerCase().includes(kw) ||
      wf.tags.some(t => t.toLowerCase().includes(kw)),
    )
  }

  // --------------------------------------------------------
  // 写入
  // --------------------------------------------------------

  async save(workflow: Workflow): Promise<{ success: boolean; error?: string }> {
    const result = this.validator.validate(workflow)
    if (!result.valid) {
      return {
        success: false,
        error: result.errors.map(e => `${e.field}: ${e.message}`).join('; '),
      }
    }

    const now = Date.now()
    const existing = this.cache.get(workflow.id)
    const toSave: Workflow = {
      ...workflow,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await this.storage.save(toSave)
    this.cache.set(toSave.id, toSave)

    return { success: true }
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureLoaded()
    const wf = this.cache.get(id)

    if (!wf) return false
    if (wf.builtin) {
      throw new Error(`内置工作流 "${wf.name}" 不可删除`)
    }

    const ok = await this.storage.delete(id)
    if (ok) this.cache.delete(id)
    return ok
  }

  // --------------------------------------------------------
  // 导入 / 导出
  // --------------------------------------------------------

  async import(json: string): Promise<{ success: boolean; workflow?: Workflow; error?: string }> {
    const { workflow, result } = this.validator.parseAndValidate(json)

    if (!result.valid || !workflow) {
      return {
        success: false,
        error: result.errors.map(e => `${e.field}: ${e.message}`).join('; '),
      }
    }

    // 若 ID 冲突，自动生成新 ID
    if (this.cache.has(workflow.id)) {
      workflow.id = `${workflow.id}-imported-${Date.now()}`
    }

    workflow.builtin = false
    const saveResult = await this.save(workflow)
    if (!saveResult.success) {
      return { success: false, error: saveResult.error }
    }

    return { success: true, workflow }
  }

  async export(id: string): Promise<string | null> {
    const wf = await this.get(id)
    if (!wf) return null
    // 导出时去掉内部时间戳，保持可移植性
    const { createdAt, updatedAt, ...exportable } = wf
    return JSON.stringify(exportable, null, 2)
  }

  // --------------------------------------------------------
  // 批量加载（内置工作流）
  // --------------------------------------------------------

  async loadBuiltin(workflows: Workflow[]): Promise<void> {
    for (const wf of workflows) {
      const toLoad: Workflow = {
        ...wf,
        builtin: true,
        createdAt: wf.createdAt ?? Date.now(),
        updatedAt: wf.updatedAt ?? Date.now(),
      }
      this.cache.set(toLoad.id, toLoad)
    }
  }

  // --------------------------------------------------------
  // 内部方法
  // --------------------------------------------------------

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    const workflows = await this.storage.list()
    for (const wf of workflows) {
      // 内置工作流已通过 loadBuiltin 加载，用户自定义覆盖内置（同 ID）
      if (!wf.builtin) {
        this.cache.set(wf.id, wf)
      }
    }
    this.loaded = true
  }

  /** 清空缓存（测试用） */
  _reset(): void {
    this.cache.clear()
    this.loaded = false
  }
}
