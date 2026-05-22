// ============================================================
// layoutStore — 向后兼容代理层
// 直接委托给 panelStore，避免全量修改现有组件引用
// ============================================================

import { defineStore } from 'pinia'
import { usePanelStore } from './panelStore'
import type { PanelId } from './panelStore'

export type { PanelId }

export const useLayoutStore = defineStore('layout', {
  state: () => ({
    // 空 state，全部通过 panelStore
  }),

  getters: {
    focusedPanel(): PanelId {
      return usePanelStore().focusedPanelId
    },

    focusedPanelLabel(): string {
      return usePanelStore().focusedPanel?.label ?? ''
    },

    panelCwd(): Record<string, string> {
      const store = usePanelStore()
      const result: Record<string, string> = {}
      store.panels.forEach(p => {
        if (p.cwd) result[p.id] = p.cwd
      })
      return result
    },

    panelVisible(): Record<string, boolean> {
      const store = usePanelStore()
      const result: Record<string, boolean> = {}
      store.panels.forEach(p => { result[p.id] = p.visible })
      return result
    },
  },

  actions: {
    setFocused(id: PanelId) {
      usePanelStore().setFocused(id)
    },

    cycleFocus() {
      usePanelStore().cycleFocus()
    },

    setCwd(id: string, cwd: string) {
      usePanelStore().setCwd(id, cwd)
    },

    save() {
      usePanelStore().save()
    },

    restore() {
      usePanelStore().restore()
    },
  },
})
