// ============================================================
// panelStore — 面板状态唯一真相来源
// 合并原 panelStore + layoutStore 中的面板相关状态
// ============================================================

import { defineStore } from 'pinia'

export type PanelId = 'workbox1' | 'workbox2' | 'learnbox' | 'searchbox1' | 'searchbox2'
export type PanelStatus = 'idle' | 'running' | 'error'
export type PanelType   = 'workbox' | 'learnbox' | 'searchbox'

export interface PanelMeta {
  id:      PanelId
  label:   string
  type:    PanelType
  visible: boolean
  status:  PanelStatus
  cwd?:    string
}

export interface PanelMessage {
  type:    'command' | 'data' | 'mcp-result'
  content: string
  source?: string
}

const DEFAULT_PANELS: PanelMeta[] = [
  { id: 'workbox1',   label: '工作框 1', type: 'workbox',   visible: true, status: 'idle', cwd: 'D:\\' },
  { id: 'workbox2',   label: '工作框 2', type: 'workbox',   visible: true, status: 'idle', cwd: 'D:\\' },
  { id: 'learnbox',   label: '学习框',   type: 'learnbox',  visible: true, status: 'idle' },
  { id: 'searchbox1', label: '搜索 Web', type: 'searchbox', visible: true, status: 'idle' },
  { id: 'searchbox2', label: '搜索项目', type: 'searchbox', visible: true, status: 'idle' },
]

export const usePanelStore = defineStore('panel', {
  state: () => ({
    /** 面板元数据列表（顺序即为显示顺序） */
    panels: DEFAULT_PANELS as PanelMeta[],
    /** 当前聚焦的面板 */
    focusedPanelId: 'workbox1' as PanelId,
    /** 面板待消费消息（消费后需手动调用 clearMessage） */
    messages: {} as Record<string, PanelMessage | null>,
  }),

  getters: {
    /** 当前聚焦面板的元数据 */
    focusedPanel(state): PanelMeta | undefined {
      return state.panels.find(p => p.id === state.focusedPanelId)
    },

    /** 所有工作框面板 */
    workboxPanels(state): PanelMeta[] {
      return state.panels.filter(p => p.type === 'workbox')
    },

    /** 可见面板列表 */
    visiblePanels(state): PanelMeta[] {
      return state.panels.filter(p => p.visible)
    },

    /** 通过 id 取面板元数据 */
    getPanelById(state) {
      return (id: string) => state.panels.find(p => p.id === id)
    },
  },

  actions: {
    // ── 焦点 ────────────────────────────────────────────────

    setFocused(id: PanelId) {
      this.focusedPanelId = id
    },

    cycleFocus() {
      const visible = this.panels.filter(p => p.visible)
      const idx = visible.findIndex(p => p.id === this.focusedPanelId)
      const next = visible[(idx + 1) % visible.length]
      if (next) this.focusedPanelId = next.id
    },

    // ── 状态 ────────────────────────────────────────────────

    updateStatus(id: string, status: PanelStatus) {
      const panel = this.panels.find(p => p.id === id)
      if (panel) panel.status = status
    },

    // ── 可见性 ──────────────────────────────────────────────

    toggleVisible(id: PanelId) {
      const panel = this.panels.find(p => p.id === id)
      if (panel) panel.visible = !panel.visible
    },

    setVisible(id: PanelId, v: boolean) {
      const panel = this.panels.find(p => p.id === id)
      if (panel) panel.visible = v
    },

    // ── 工作目录 ─────────────────────────────────────────────

    setCwd(id: string, cwd: string) {
      const panel = this.panels.find(p => p.id === id)
      if (panel) panel.cwd = cwd
    },

    // ── 消息分发 ─────────────────────────────────────────────

    /** 向指定面板发送消息（面板 watch 后调用 clearMessage） */
    sendToPanel(id: string, msg: PanelMessage) {
      this.messages[id] = msg
    },

    /** 广播命令到所有工作框 */
    broadcastToWorkboxes(msg: PanelMessage) {
      this.workboxPanels.forEach(p => {
        if (p.visible) this.messages[p.id] = { ...msg }
      })
    },

    clearMessage(id: string) {
      this.messages[id] = null
    },

    // ── 持久化 ──────────────────────────────────────────────

    save() {
      localStorage.setItem('panel-store', JSON.stringify({
        focusedPanelId: this.focusedPanelId,
        panels: this.panels.map(p => ({
          id:      p.id,
          visible: p.visible,
          cwd:     p.cwd,
        })),
      }))
    },

    restore() {
      try {
        const raw = localStorage.getItem('panel-store')
        if (!raw) return
        const saved = JSON.parse(raw)
        if (saved.focusedPanelId) this.focusedPanelId = saved.focusedPanelId
        if (Array.isArray(saved.panels)) {
          saved.panels.forEach((s: any) => {
            const p = this.panels.find(p => p.id === s.id)
            if (p) {
              if (s.visible !== undefined) p.visible = s.visible
              if (s.cwd)                   p.cwd     = s.cwd
            }
          })
        }
      } catch { /* 损坏数据忽略 */ }
    },
  },
})