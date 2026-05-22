// ============================================================
// Electron 主进程入口 — 重构版（模块化 IPC 注册）
// ============================================================

import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { PtyService }            from './services/PtyService'
import { AiService }             from './services/AiService'
import { CcSwitchAdapter }       from '../adapters/cc-switch/CcSwitchAdapter'
import { registerTerminalHandlers } from './ipc/terminalHandler'
import { registerWorkflowHandlers } from './ipc/workflowHandler'
import { registerCcSwitchHandlers } from './ipc/ccSwitchHandler'
import { registerSearchHandlers }   from './ipc/searchHandler'
import { registerAiHandlers }       from './ipc/aiHandler'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow: BrowserWindow | null = null
const ptyService   = new PtyService()
const ccSwitch     = new CcSwitchAdapter()
const aiService    = new AiService(ccSwitch)

// --------------------------------------------------------
// 创建主窗口
// --------------------------------------------------------

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'CC Switch Pro',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // 允许 preload 访问 Node API
    },
  })

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    ptyService.killAll()
  })
}

// --------------------------------------------------------
// 注册所有 IPC Handler
// --------------------------------------------------------

function registerAllIpcHandlers(): void {
  // 终端（PTY）
  registerTerminalHandlers(ptyService, () => mainWindow?.webContents ?? null)

  // 工作流 CRUD
  registerWorkflowHandlers()

  // CC Switch 模型切换
  registerCcSwitchHandlers()

  // 项目搜索
  registerSearchHandlers()

  // AI 增强（通过 CC Switch provider 调用模型）
  registerAiHandlers(aiService, () => mainWindow?.webContents ?? null)
}

// --------------------------------------------------------
// 应用生命周期
// --------------------------------------------------------

app.whenReady().then(async () => {
  registerAllIpcHandlers()
  await createWindow()
})

app.on('window-all-closed', () => {
  ptyService.killAll()
  app.quit()
})

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow()
  }
})