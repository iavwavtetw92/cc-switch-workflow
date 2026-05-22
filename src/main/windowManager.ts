// 窗口管理器 - 管理主窗口和分离的面板窗口
import { BrowserWindow } from 'electron'
import { join } from 'path'

interface WindowStatus {
  id: string
  type: 'main' | 'detached'
  panelType?: string
  title: string
  isVisible: boolean
  isFocused: boolean
}

export class WindowManager {
  private mainWindow: BrowserWindow
  private detachedWindows: Map<string, BrowserWindow> = new Map()
  private isDev: boolean

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
    this.isDev = process.env.NODE_ENV === 'development' || !require('electron').app.isPackaged
  }

  // 分离面板为独立窗口
  detachPanel(panelId: string, panelType: string): { success: boolean; windowId?: string } {
    if (this.detachedWindows.has(panelId)) {
      return { success: false }
    }

    const panelTitles = {
      workbox1: '工作框 1',
      workbox2: '工作框 2',
      learnbox: '学习框',
      searchbox1: '搜索框 (Web)',
      searchbox2: '搜索框 (项目)'
    }

    const detachedWindow = new BrowserWindow({
      width: 800,
      height: 600,
      title: `CC Switch Pro - ${(panelTitles as Record<string,string>)[panelType] ?? panelType}`,
      parent: this.mainWindow,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    // 加载分离视图
    const url = this.isDev
      ? `http://localhost:5173?detached=${panelId}&type=${panelType}`
      : join(__dirname, '../renderer/index.html?detached=' + panelId)

    detachedWindow.loadURL(url)

    // 窗口关闭时通知主窗口
    detachedWindow.on('closed', () => {
      this.detachedWindows.delete(panelId)
      this.mainWindow.webContents.send('panel-reattached', panelId)
    })

    this.detachedWindows.set(panelId, detachedWindow)

    return { success: true, windowId: panelId }
  }

  // 重新附加面板
  attachPanel(panelId: string): boolean {
    const window = this.detachedWindows.get(panelId)
    if (window) {
      window.close()
      return true
    }
    return false
  }

  // 获取所有窗口状态
  getAllWindowStatus(): WindowStatus[] {
    const statuses: WindowStatus[] = [
      {
        id: 'main',
        type: 'main',
        title: 'CC Switch Pro',
        isVisible: this.mainWindow.isVisible(),
        isFocused: this.mainWindow.isFocused()
      }
    ]

    for (const [id, window] of this.detachedWindows.entries()) {
      statuses.push({
        id,
        type: 'detached',
        title: window.getTitle(),
        isVisible: window.isVisible(),
        isFocused: window.isFocused()
      })
    }

    return statuses
  }

  // 获取分离窗口
  getDetachedWindow(panelId: string): BrowserWindow | undefined {
    return this.detachedWindows.get(panelId)
  }

  // 关闭所有分离窗口
  closeAllDetached(): void {
    for (const window of this.detachedWindows.values()) {
      window.close()
    }
    this.detachedWindows.clear()
  }
}