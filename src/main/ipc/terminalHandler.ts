// ============================================================
// terminalHandler — Main Process IPC Handler
// 处理 Renderer 发来的终端相关 IPC 请求
// 依赖 PtyService，将 PTY 事件推送回 Renderer
// ============================================================

import { ipcMain, WebContents } from 'electron'
import type { PtyService } from '../services/PtyService'

export function registerTerminalHandlers(ptyService: PtyService, getWebContents: () => WebContents | null): void {

  // --------------------------------------------------------
  // terminal:create — 创建 PTY 实例
  // --------------------------------------------------------
  ipcMain.handle('terminal:create', async (_event, { boxId, cwd }: { boxId: string; cwd: string }) => {
    const ptyId = ptyService.create(boxId, cwd)
    return { ptyId }
  })

  // --------------------------------------------------------
  // terminal:input — 向 PTY 写入用户输入
  // --------------------------------------------------------
  ipcMain.handle('terminal:input', async (_event, { ptyId, data }: { ptyId: string; data: string }) => {
    ptyService.write(ptyId, data)
  })

  // --------------------------------------------------------
  // terminal:resize — 调整终端大小
  // --------------------------------------------------------
  ipcMain.handle('terminal:resize', async (_event, { ptyId, cols, rows }: { ptyId: string; cols: number; rows: number }) => {
    ptyService.resize(ptyId, cols, rows)
  })

  // --------------------------------------------------------
  // terminal:kill — 关闭 PTY
  // --------------------------------------------------------
  ipcMain.handle('terminal:kill', async (_event, { ptyId }: { ptyId: string }) => {
    return ptyService.kill(ptyId)
  })

  // --------------------------------------------------------
  // PTY 事件 → 推送到 Renderer
  // --------------------------------------------------------

  // 终端输出数据
  ptyService.on('data', (ptyId: string, data: string) => {
    const wc = getWebContents()
    if (wc && !wc.isDestroyed()) {
      wc.send('terminal:data', ptyId, data)
    }
  })

  // 进程退出
  ptyService.on('exit', (ptyId: string, code: number) => {
    const wc = getWebContents()
    if (wc && !wc.isDestroyed()) {
      wc.send('terminal:exit', ptyId, code)
    }
  })
}
