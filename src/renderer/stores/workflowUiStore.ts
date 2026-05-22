// ============================================================
// workflowUiStore — 工作流 UI 层状态
// 职责：工作流列表缓存、当前执行状态、面板消息分发
// 业务逻辑由 useWorkflow composable 驱动，store 只存状态
// ============================================================

import { defineStore } from 'pinia'
import type { Workflow } from '@core/types/workflow.types'

export interface StepStatus {
  stepId:    string
  status:    'pending' | 'running' | 'done' | 'error'
  startedAt?: number
  doneAt?:   number
}

export interface ExecutionState {
  execId:     string
  workflowId: string
  steps:      StepStatus[]
  status:     'running' | 'done' | 'error' | 'cancelled'
  startedAt:  number
  doneAt?:    number
}

export interface PanelMessage {
  type:    'command' | 'data' | 'search-result' | 'mcp-result'
  content: string
  source?: string
}

export const useWorkflowUiStore = defineStore('workflowUi', {
  state: () => ({
    /** 所有工作流列表（含内置+用户自定义） */
    workflows: [] as Workflow[],
    /** 是否正在加载 */
    loading: false,
    /** 当前正在执行的工作流状态 */
    currentExecution: null as ExecutionState | null,
    /** 面板待消费消息队列（workbox1/2/learnbox/search... → message） */
    panelMessages: {} as Record<string, PanelMessage | null>,
    /** WorkflowPicker 是否展开 */
    pickerOpen: false,
    /** 搜索过滤关键词 */
    pickerQuery: '',
  }),

  getters: {
    /** 根据 pickerQuery 过滤的工作流列表 */
    filteredWorkflows(state): Workflow[] {
      const q = state.pickerQuery.trim().toLowerCase()
      if (!q) return state.workflows
      return state.workflows.filter(wf =>
        wf.name.toLowerCase().includes(q) ||
        wf.id.toLowerCase().includes(q) ||
        wf.tags?.some(t => t.toLowerCase().includes(q))
      )
    },

    isRunning(state): boolean {
      return state.currentExecution?.status === 'running'
    },
  },

  actions: {
    setWorkflows(list: Workflow[]) {
      this.workflows = list
    },

    setLoading(v: boolean) {
      this.loading = v
    },

    openPicker() {
      this.pickerOpen = true
      this.pickerQuery = ''
    },

    closePicker() {
      this.pickerOpen = false
      this.pickerQuery = ''
    },

    setPickerQuery(q: string) {
      this.pickerQuery = q
    },

    // ── 执行状态管理 ─────────────────────────────────────────

    startExecution(execId: string, workflow: Workflow) {
      this.currentExecution = {
        execId,
        workflowId: workflow.id,
        steps: workflow.steps.map(s => ({ stepId: s.id, status: 'pending' })),
        status: 'running',
        startedAt: Date.now(),
      }
    },

    updateStepStatus(execId: string, stepId: string, status: StepStatus['status']) {
      if (this.currentExecution?.execId !== execId) return
      const step = this.currentExecution.steps.find(s => s.stepId === stepId)
      if (!step) return
      step.status = status
      if (status === 'running') step.startedAt = Date.now()
      if (status === 'done' || status === 'error') step.doneAt = Date.now()
    },

    finishExecution(execId: string, success: boolean) {
      if (this.currentExecution?.execId !== execId) return
      this.currentExecution.status = success ? 'done' : 'error'
      this.currentExecution.doneAt = Date.now()
    },

    clearExecution() {
      this.currentExecution = null
    },

    // ── 面板消息分发 ─────────────────────────────────────────

    /** 推送消息给指定面板（组件通过 watch 消费后应调用 clearPanelMessage） */
    sendToPanel(panelId: string, message: PanelMessage) {
      this.panelMessages[panelId] = message
    },

    clearPanelMessage(panelId: string) {
      this.panelMessages[panelId] = null
    },
  },
})
