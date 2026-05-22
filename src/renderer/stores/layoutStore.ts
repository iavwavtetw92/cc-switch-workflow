// ============================================================
// layoutStore — 面板布局与焦点状态
// 职责：仅管理 UI 层的面板焦点与布局信息
// ============================================================

import { defineStore } from 'pinia'

export type PanelId = 'workbox1' | 'workbox2' | 'learnbox' | 'searchbox1' | 'searchbox2'

const ALL_PANELS: PanelId[] = ['workbox1', 'workbox2', 'learnbox', 'searchbox1', 'searchbox2']

export const useLayoutStore = defineStore('layout', {
  state: () => ({
    /** 当前获得焦点的面板 */
    focusedPanel: 'workbox1' as PanelId,
    /** 各面板的工作目录 */
    panelCwd: {
      workbox1: 'D:\\',
      workbox2: 'D:\\',
    } as Record<string, string>,
    /** 各面板是否可见 */
    panelVisible: {
      workbox1:   true,
      workbox2:   true,
      learnbox:   true,
      searchbox1: true,
      searchbox2: true,
    } as Record<PanelId, boolean>,
  }),

  getters: {
    allPanels: () => ALL_PANELS,

    focusedPanelLabel(state): string {
      const labels: Record<PanelId, string> = {
        workbox1:   '工作框1',
        workbox2:   '工作框2',
        learnbox:   '学习框',
        searchbox1: '搜索框1',
        searchbox2: '搜索框2',
      }
      return labels[state.focusedPanel] ?? state.focusedPanel
    },
  },

  actions: {
    setFocused(panelId: PanelId) {
      this.focusedPanel = panelId
    },

    /** Tab 键循环切换焦点面板 */
    cycleFocus() {
      const idx = ALL_PANELS.indexOf(this.focusedPanel)
      this.focusedPanel = ALL_PANELS[(idx + 1) % ALL_PANELS.length]
    },

    setCwd(panelId: string, cwd: string) {
      this.panelCwd[panelId] = cwd
    },

    // ── 持久化 ──────────────────────────────────────────────
    save() {
      localStorage.setItem('layout-state', JSON.stringify({
        focusedPanel: this.focusedPanel,
        panelCwd:     this.panelCwd,
      }))
    },

    restore() {
      try {
        const raw = localStorage.getItem('layout-state')
        if (!raw) return
        const saved = JSON.parse(raw)
        if (saved.focusedPanel) this.focusedPanel = saved.focusedPanel
        if (saved.panelCwd)     this.panelCwd = { ...this.panelCwd, ...saved.panelCwd }
      } catch {
        // 忽略损坏的数据
      }
    },
  },
})
