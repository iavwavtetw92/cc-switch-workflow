// 命令执行器 - 执行终端命令并管理进程
import { spawn, ChildProcess } from 'child_process'
import { platform } from 'os'

interface ProcessInfo {
  pid: number
  command: string
  boxId: string
  startTime: number
  cwd: string
}

interface ExecuteResult {
  success: boolean
  output: string
  error?: string
  pid?: number
}

export class CommandExecutor {
  private processes: Map<number, ProcessInfo> = new Map()
  private isWindows = platform() === 'win32'

  execute(command: string, cwd: string, boxId: string): Promise<ExecuteResult> {
    return new Promise((resolve) => {
      const shell = this.isWindows ? 'cmd.exe' : '/bin/bash'
      const shellArgs = this.isWindows ? ['/c', command] : ['-c', command]

      const proc = spawn(shell, shellArgs, {
        cwd: cwd || process.cwd(),
        env: process.env,
        windowsHide: true
      })

      let output = ''
      let errorOutput = ''

      proc.stdout.on('data', (data) => {
        output += data.toString()
      })

      proc.stderr.on('data', (data) => {
        errorOutput += data.toString()
      })

      proc.on('error', (err) => {
        resolve({
          success: false,
          output: '',
          error: err.message
        })
      })

      proc.on('close', (code) => {
        // 清理进程记录
        if (proc.pid) {
          this.processes.delete(proc.pid)
        }

        resolve({
          success: code === 0,
          output: output + errorOutput,
          pid: proc.pid
        })
      })

      // 记录进程信息（用于长时间运行的命令）
      if (proc.pid) {
        this.processes.set(proc.pid, {
          pid: proc.pid,
          command,
          boxId,
          startTime: Date.now(),
          cwd
        })
      }
    })
  }

  // 流式执行（用于终端实时输出）
  executeStream(command: string, cwd: string, boxId: string, callback: (data: string) => void): ChildProcess {
    const shell = this.isWindows ? 'cmd.exe' : '/bin/bash'
    const shellArgs = this.isWindows ? ['/c', command] : ['-c', command]

    const proc = spawn(shell, shellArgs, {
      cwd: cwd || process.cwd(),
      env: process.env
    })

    proc.stdout.on('data', (data) => callback(data.toString()))
    proc.stderr.on('data', (data) => callback(data.toString()))

    if (proc.pid) {
      this.processes.set(proc.pid, {
        pid: proc.pid,
        command,
        boxId,
        startTime: Date.now(),
        cwd
      })
    }

    return proc
  }

  kill(pid: number): boolean {
    const proc = this.processes.get(pid)
    if (proc) {
      try {
        process.kill(pid, this.isWindows ? 'SIGTERM' : 'SIGKILL')
        this.processes.delete(pid)
        return true
      } catch {
        return false
      }
    }
    return false
  }

  killAll(): void {
    for (const pid of this.processes.keys()) {
      this.kill(pid)
    }
  }

  getRunningProcesses(): ProcessInfo[] {
    return Array.from(this.processes.values())
  }

  // 项目文件搜索
  async searchProject(query: string, path: string, type: 'files' | 'content'): Promise<any[]> {
    const command = type === 'content'
      ? `grep -r "${query}" "${path}" --include="*.{js,ts,vue,json,md}" -n`
      : `find "${path}" -name "*${query}*" -type f`

    const result = await this.execute(command, path, 'search')

    if (!result.success) {
      return []
    }

    // 解析搜索结果
    return result.output.split('\n')
      .filter(line => line.trim())
      .map(line => {
        if (type === 'content') {
          const [file, lineNum, content] = line.split(':', 3)
          return { file, line: parseInt(lineNum), content: content?.trim() }
        } else {
          return { file: line.trim() }
        }
      })
  }
}