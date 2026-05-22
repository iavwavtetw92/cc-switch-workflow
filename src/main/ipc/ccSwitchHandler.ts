// ============================================================
// ccSwitchHandler — Main Process IPC Handler
// 处理 CC Switch 模型切换相关 IPC 请求
// 依赖 CcSwitchAdapter 读取/写入本地 cc-switch.db
// ============================================================

import { ipcMain } from 'electron'
import { CcSwitchAdapter } from '../../adapters/cc-switch/CcSwitchAdapter'

export function registerCcSwitchHandlers(): void {
  const adapter = new CcSwitchAdapter()

  // --------------------------------------------------------
  // cc-switch:providers — 获取所有 Provider 列表
  // --------------------------------------------------------
  ipcMain.handle('cc-switch:providers', async () => {
    try {
      return await adapter.getProviders()
    } catch (err) {
      console.error('[ccSwitchHandler] getProviders 失败:', err)
      return []
    }
  })

  // --------------------------------------------------------
  // cc-switch:current — 获取当前激活的 Provider
  // --------------------------------------------------------
  ipcMain.handle('cc-switch:current', async () => {
    try {
      return await adapter.getCurrentProvider()
    } catch (err) {
      console.error('[ccSwitchHandler] getCurrentProvider 失败:', err)
      return null
    }
  })

  // --------------------------------------------------------
  // cc-switch:switch — 切换到指定 Provider
  // --------------------------------------------------------
  ipcMain.handle('cc-switch:switch', async (_event, { providerId }: { providerId: string }) => {
    try {
      const success = await adapter.switchProvider(providerId)
      return { success }
    } catch (err) {
      console.error('[ccSwitchHandler] switchProvider 失败:', err)
      return { success: false, error: (err as Error).message }
    }
  })

  // --------------------------------------------------------
  // cc-switch:scan — 扫描数据库路径（调试用）
  // --------------------------------------------------------
  ipcMain.handle('cc-switch:scan', async () => {
    try {
      const path = await adapter.scanDatabasePath()
      return { path }
    } catch {
      return { path: null }
    }
  })
}
