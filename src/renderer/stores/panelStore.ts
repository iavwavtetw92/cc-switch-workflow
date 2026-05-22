// Pinia状态管理 - 面板状态
import { defineStore } from 'pinia'

interface PanelState {
  status: 'idle' | 'running' | 'waiting' | 'error'
  lastCommand?: string
  lastOutput?: string
  cwd?: string
}

interface PanelInput {
  type: 'command' | 'data' | 'terminal-output' | 'search-result' | 'mcp-document'
  content: string
  source?: string
}

interface WorkMode {
  name: string
  layout: string[]
  panelConfig: Record<string, any>
}

export const usePanelStore = defineStore('panel', {
  state: () => ({
    focusedPanel: 'workbox1',
    panelStates: {
      workbox1: { status: 'idle', cwd: 'D:\\' },
      workbox2: { status: 'idle', cwd: 'D:\\' },
      learnbox: { status: 'idle' },
      searchbox1: { status: 'idle' },
      searchbox2: { status: 'idle' }
    } as Record<string, PanelState>,
    panelInputs: {} as Record<string, PanelInput>,
    workModes: [] as WorkMode[],
    currentWorkMode: 'default'
  }),

  actions: {
    // 设置焦点面板
    setFocusedPanel(panelId: string) {
      this.focusedPanel = panelId
    },

    // 更新面板状态
    updateStatus(panelId: string, status: PanelState['status']) {
      if (this.panelStates[panelId]) {
        this.panelStates[panelId].status = status
      }
    },

    // 发送数据到面板
    sendToPanel(panelId: string, input: PanelInput) {
      this.panelInputs[panelId] = input

      // 清除输入（触发一次后清除）
      setTimeout(() => {
        delete this.panelInputs[panelId]
      }, 100)
    },

    // 执行命令
    async executeCommand(target: string, command: string) {
      if (target === 'all') {
        // 发送到所有工作框
        this.sendToPanel('workbox1', { type: 'command', content: command })
        this.sendToPanel('workbox2', { type: 'command', content: command })
      } else if (target.startsWith('workbox')) {
        this.sendToPanel(target, { type: 'command', content: command })
      }
    },

    // MCP调用
    async invokeMCP(tool: string, params: any) {
      try {
        const result = await (window.electronAPI as any)?.mcpInvoke({ tool, params })

        // 根据工具类型处理结果
        if (tool === 'feishu_search') {
          this.sendToPanel('searchbox1', {
            type: 'mcp-document',
            content: JSON.stringify(result)
          })
        } else if (tool === 'feishu_read') {
          this.sendToPanel('learnbox', {
            type: 'mcp-document',
            content: result.content || ''
          })
        }

        return result
      } catch (e) {
        console.error('MCP调用失败:', e)
        return null
      }
    },

    // 保存状态
    saveState() {
      const state = {
        focusedPanel: this.focusedPanel,
        panelStates: this.panelStates,
        currentWorkMode: this.currentWorkMode
      }
      localStorage.setItem('panel-state', JSON.stringify(state))
    },

    // 加载保存的状态
    loadSavedState() {
      const saved = localStorage.getItem('panel-state')
      if (saved) {
        const state = JSON.parse(saved)
        this.focusedPanel = state.focusedPanel || 'workbox1'
        this.panelStates = state.panelStates || this.panelStates
        this.currentWorkMode = state.currentWorkMode || 'default'
      }
    },

    // 保存工作模式
    saveWorkMode() {
      const name = `模式-${Date.now()}`
      const mode: WorkMode = {
        name,
        layout: Object.keys(this.panelStates),
        panelConfig: {
          focusedPanel: this.focusedPanel,
          cwd: {
            workbox1: this.panelStates.workbox1?.cwd,
            workbox2: this.panelStates.workbox2?.cwd
          }
        }
      }

      this.workModes.push(mode)
      localStorage.setItem('work-modes', JSON.stringify(this.workModes))
    },

    // 加载工作模式
    loadWorkMode() {
      const saved = localStorage.getItem('work-modes')
      if (saved) {
        this.workModes = JSON.parse(saved)
      }

      // 应用最后一个模式
      if (this.workModes.length > 0) {
        const mode = this.workModes[this.workModes.length - 1]
        this.currentWorkMode = mode.name

        if (mode.panelConfig.focusedPanel) {
          this.focusedPanel = mode.panelConfig.focusedPanel
        }

        if (mode.panelConfig.cwd) {
          if (mode.panelConfig.cwd.workbox1) {
            this.panelStates.workbox1.cwd = mode.panelConfig.cwd.workbox1
          }
          if (mode.panelConfig.cwd.workbox2) {
            this.panelStates.workbox2.cwd = mode.panelConfig.cwd.workbox2
          }
        }
      }
    }
  }
})