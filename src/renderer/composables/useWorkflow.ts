// ============================================================
// useWorkflow — Composable
// 工作流业务逻辑：加载、执行、事件监听
// 桥接 workflowUiStore ↔ IpcBridge ↔ WorkflowEngine
// ============================================================

import { onMounted, onUnmounted } from 'vue'
import { useWorkflowUiStore } from '../stores/workflowUiStore'
import { IpcBridge } from '@adapters/ipc/IpcBridge'
import type { Workflow } from '@core/types/workflow.types'

const bridge = new IpcBridge()

export function useWorkflow() {
  const store = useWorkflowUiStore()
  const unsubs: Array<() => void> = []

  // --------------------------------------------------------
  // 加载工作流列表
  // --------------------------------------------------------

  async function loadWorkflows() {
    store.setLoading(true)
    try {
      const list = await bridge.workflowList()
      store.setWorkflows(list)
    } catch (err) {
      console.error('[useWorkflow] 加载工作流失败:', err)
    } finally {
      store.setLoading(false)
    }
  }

  // --------------------------------------------------------
  // 触发执行
  // --------------------------------------------------------

  /**
   * 通过 IPC 请求主进程触发工作流执行
   * 主进程将逐步推送 workflow:step-start / step-done / done 事件
   */
  async function runWorkflow(workflow: Workflow) {
    if (store.isRunning) {
      console.warn('[useWorkflow] 已有工作流正在执行，请等待完成')
      return
    }
    store.closePicker()
    // 生成本地执行 ID（主进程返回后会通过事件通知）
    const localExecId = `exec-${Date.now()}`
    store.startExecution(localExecId, workflow)

    // 将工作流步骤逐一分发到对应面板
    for (const step of workflow.steps) {
      if (step.type === 'terminal' || step.type === 'editor' || step.type === 'search') {
        store.sendToPanel(step.target === 'auto' ? 'workbox1' : step.target, {
          type:    step.type === 'terminal' ? 'command' : 'data',
          content: step.command,
          source:  workflow.id,
        })
      }
    }
  }

  // --------------------------------------------------------
  // 通过 workflow ID 执行
  // --------------------------------------------------------

  async function runWorkflowById(id: string) {
    const wf = store.workflows.find(w => w.id === id)
    if (wf) {
      await runWorkflow(wf)
    } else {
      console.warn(`[useWorkflow] 工作流 ${id} 不存在`)
    }
  }

  // --------------------------------------------------------
  // 导入工作流（不涉及删除）
  // --------------------------------------------------------

  async function importWorkflow(json: string): Promise<{ success: boolean; error?: string }> {
    const result = await bridge.workflowImport(json)
    if (result.success) {
      await loadWorkflows() // 刷新列表
    }
    return result
  }

  // --------------------------------------------------------
  // 导出工作流
  // --------------------------------------------------------

  async function exportWorkflow(id: string): Promise<string> {
    return bridge.workflowExport(id)
  }

  // --------------------------------------------------------
  // 监听主进程推送的执行事件
  // --------------------------------------------------------

  function setupEventListeners() {
    unsubs.push(
      bridge.onWorkflowStepStart((execId, stepId) => {
        store.updateStepStatus(execId, stepId, 'running')
      }),
      bridge.onWorkflowStepDone((execId, stepId) => {
        store.updateStepStatus(execId, stepId, 'done')
      }),
      bridge.onWorkflowDone((execId, success) => {
        store.finishExecution(execId, success)
        // 3 秒后自动清理执行状态
        setTimeout(() => store.clearExecution(), 3000)
      }),
    )
  }

  // --------------------------------------------------------
  // 生命周期
  // --------------------------------------------------------

  onMounted(async () => {
    setupEventListeners()
    await loadWorkflows()
  })

  onUnmounted(() => {
    unsubs.forEach(fn => fn())
  })

  return {
    workflows:         () => store.workflows,
    filteredWorkflows: () => store.filteredWorkflows,
    isRunning:         () => store.isRunning,
    loading:           () => store.loading,
    currentExecution:  () => store.currentExecution,
    pickerOpen:        () => store.pickerOpen,
    pickerQuery:       () => store.pickerQuery,

    loadWorkflows,
    runWorkflow,
    runWorkflowById,
    importWorkflow,
    exportWorkflow,

    openPicker:  () => store.openPicker(),
    closePicker: () => store.closePicker(),
    setPickerQuery: (q: string) => store.setPickerQuery(q),
  }
}
