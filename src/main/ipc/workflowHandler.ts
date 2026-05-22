// ============================================================
// workflowHandler — Main Process IPC Handler
// 处理工作流的 CRUD、导入/导出 IPC 请求
// 依赖 FileSystemStorage 持久化工作流 JSON
// ============================================================

import { ipcMain, app } from 'electron'
import { join } from 'path'
import { readdirSync, readFileSync } from 'fs'
import { FileSystemStorage } from '../../adapters/storage/FileSystemStorage'
import { WorkflowValidator } from '../../core/workflow/WorkflowValidator'
import type { Workflow } from '../../core/types/workflow.types'

// 内置工作流目录（打包后在 resources/workflows/，开发时在项目根目录 src/workflows/）
// 编译后 __dirname = dist/main/ipc，所以需要上溯 3 层到项目根目录
function getBuiltinWorkflowsDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'workflows')
  }
  // dist/main/ipc → dist/main → dist → project root → src/workflows
  return join(__dirname, '../../../src/workflows')
}

function loadBuiltinWorkflows(): Workflow[] {
  const dir = getBuiltinWorkflowsDir()
  const validator = new WorkflowValidator()
  const workflows: Workflow[] = []

  try {
    const files = readdirSync(dir).filter(f => f.endsWith('.json'))
    for (const file of files) {
      try {
        const json = readFileSync(join(dir, file), 'utf-8')
        const { workflow, result } = validator.parseAndValidate(json)
        if (result.valid && workflow) {
          workflow.builtin = true
          workflows.push(workflow)
        }
      } catch {
        // 损坏的内置工作流跳过
      }
    }
  } catch {
    // 目录不存在时返回空
  }

  return workflows
}

export function registerWorkflowHandlers(): void {
  const storage = new FileSystemStorage(app.getPath('userData'))

  // --------------------------------------------------------
  // workflow:list — 获取所有工作流（内置 + 用户自定义）
  // --------------------------------------------------------
  ipcMain.handle('workflow:list', async () => {
    const [userWorkflows, builtinWorkflows] = await Promise.all([
      storage.list(),
      Promise.resolve(loadBuiltinWorkflows()),
    ])

    // 用户工作流优先（同 ID 时覆盖内置）
    const map = new Map<string, Workflow>()
    for (const wf of builtinWorkflows) map.set(wf.id, wf)
    for (const wf of userWorkflows) map.set(wf.id, wf)

    return Array.from(map.values())
  })

  // --------------------------------------------------------
  // workflow:get — 获取单个工作流
  // --------------------------------------------------------
  ipcMain.handle('workflow:get', async (_event, { id }: { id: string }) => {
    // 先查用户存储
    const userWf = await storage.get(id)
    if (userWf) return userWf

    // 再查内置
    const builtins = loadBuiltinWorkflows()
    return builtins.find(wf => wf.id === id) ?? null
  })

  // --------------------------------------------------------
  // workflow:save — 保存工作流（新建或更新）
  // --------------------------------------------------------
  ipcMain.handle('workflow:save', async (_event, workflow: Workflow) => {
    try {
      await storage.save(workflow)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // --------------------------------------------------------
  // workflow:delete — 删除工作流
  // --------------------------------------------------------
  ipcMain.handle('workflow:delete', async (_event, { id }: { id: string }) => {
    try {
      const success = await storage.delete(id)
      return { success }
    } catch {
      return { success: false }
    }
  })

  // --------------------------------------------------------
  // workflow:export — 导出工作流 JSON 字符串
  // --------------------------------------------------------
  ipcMain.handle('workflow:export', async (_event, { id }: { id: string }) => {
    try {
      return await storage.export(id)
    } catch (err) {
      throw new Error(`导出失败: ${(err as Error).message}`)
    }
  })

  // --------------------------------------------------------
  // workflow:import — 导入工作流 JSON 字符串
  // --------------------------------------------------------
  ipcMain.handle('workflow:import', async (_event, json: string) => {
    try {
      const workflow = await storage.import(json)
      return { success: true, workflow }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })
}
