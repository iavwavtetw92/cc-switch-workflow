// ============================================================
// PtyService — Main Process Service
// 使用 node-pty 管理真实伪终端（PTY）实例
// 每个 WorkBox 对应一个 PTY 实例，通过 ptyId 索引
// ============================================================

import { platform } from 'os'
import { EventEmitter } from 'events'

// node-pty 类型声明（运行时动态 require，避免 TS 编译问题）
interface IPty {
  pid: number
  cols: number
  rows: number
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(signal?: string): void
  onData(listener: (data: string) => void): { dispose(): void }
  onExit(listener: (e: { exitCode: number; signal?: number }) => void): { dispose(): void }
}

interface PtyInstance {
  ptyId: string
  boxId: string
  cwd: string
  pty: IPty
  createdAt: number
}

export class PtyService extends EventEmitter {
  private instances = new Map<string, PtyInstance>()
  private isWindows = platform() === 'win32'
  private idCounter = 0

  // --------------------------------------------------------
  // PTY 生命周期
  // --------------------------------------------------------

  /**
   * 创建新的 PTY 实例
   * @returns ptyId 唯一标识符
   */
  create(boxId: string, cwd: string, cols = 120, rows = 30): string {
    const ptyId = `pty-${boxId}-${++this.idCounter}-${Date.now()}`

    let pty: IPty
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodePty = require('node-pty')
      const shell = this.isWindows
        ? (process.env.COMSPEC ?? 'cmd.exe')
        : (process.env.SHELL ?? '/bin/bash')

      pty = nodePty.spawn(shell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: cwd || process.cwd(),
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        },
      }) as IPty
    } catch (err) {
      // node-pty 未安装时降级为 fallback（仅用于开发调试）
      console.warn('[PtyService] node-pty 不可用，使用 fallback 模式:', err)
      pty = this.createFallbackPty(ptyId, cwd)
    }

    // 监听输出，转发给 IPC
    pty.onData((data: string) => {
      this.emit('data', ptyId, data)
    })

    pty.onExit(({ exitCode }) => {
      this.emit('exit', ptyId, exitCode)
      this.instances.delete(ptyId)
    })

    this.instances.set(ptyId, { ptyId, boxId, cwd, pty, createdAt: Date.now() })
    return ptyId
  }

  /** 向 PTY 写入数据（用户输入） */
  write(ptyId: string, data: string): boolean {
    const inst = this.instances.get(ptyId)
    if (!inst) return false
    inst.pty.write(data)
    return true
  }

  /** 调整终端大小 */
  resize(ptyId: string, cols: number, rows: number): boolean {
    const inst = this.instances.get(ptyId)
    if (!inst) return false
    try {
      inst.pty.resize(cols, rows)
      return true
    } catch {
      return false
    }
  }

  /** 关闭 PTY */
  kill(ptyId: string): boolean {
    const inst = this.instances.get(ptyId)
    if (!inst) return false
    try {
      inst.pty.kill()
      this.instances.delete(ptyId)
      return true
    } catch {
      return false
    }
  }

  /** 关闭所有 PTY（应用退出时调用） */
  killAll(): void {
    for (const ptyId of this.instances.keys()) {
      this.kill(ptyId)
    }
  }

  /** 获取所有运行中的 PTY 信息 */
  list(): Array<{ ptyId: string; boxId: string; cwd: string; createdAt: number }> {
    return Array.from(this.instances.values()).map(({ ptyId, boxId, cwd, createdAt }) => ({
      ptyId, boxId, cwd, createdAt,
    }))
  }

  // --------------------------------------------------------
  // Fallback PTY（node-pty 不可用时的降级实现）
  // 使用 child_process.spawn 模拟，不支持交互式输入
  // --------------------------------------------------------

  private createFallbackPty(_ptyId: string, cwd: string): IPty {
    const { spawn } = require('child_process') as typeof import('child_process')
    const dataListeners = new Set<(data: string) => void>()
    const exitListeners = new Set<(e: { exitCode: number }) => void>()

    const shell = this.isWindows ? 'cmd.exe' : '/bin/bash'
    const proc = spawn(shell, [], {
      cwd: cwd || process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    proc.stdout?.on('data', (d: Buffer) => dataListeners.forEach(l => l(d.toString())))
    proc.stderr?.on('data', (d: Buffer) => dataListeners.forEach(l => l(d.toString())))
    proc.on('exit', (code: number | null) => {
      exitListeners.forEach(l => l({ exitCode: code ?? 0 }))
    })

    return {
      pid: proc.pid ?? 0,
      cols: 120,
      rows: 30,
      write: (data: string) => proc.stdin?.write(data),
      resize: () => { /* fallback 不支持 resize */ },
      kill: (signal?: string) => proc.kill(signal as NodeJS.Signals),
      onData: (listener: (data: string) => void) => {
        dataListeners.add(listener)
        return { dispose: () => dataListeners.delete(listener) }
      },
      onExit: (listener: (e: { exitCode: number }) => void) => {
        exitListeners.add(listener)
        return { dispose: () => exitListeners.delete(listener) }
      },
    }
  }
}
