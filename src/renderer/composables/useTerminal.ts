// ============================================================
// useTerminal — Composable
// 管理单个 WorkBox 的真实 PTY 终端连接
// ============================================================

import { ref, onMounted, onUnmounted } from 'vue'
import { useLayoutStore } from '../stores/layoutStore'

// ── 全局单例：等 electronAPI 就绪后初始化一次 ────────────────
let _adapterPromise: Promise<import('@adapters/ipc/IpcBridge').IpcTerminalAdapter> | null = null

function getAdapter() {
  if (_adapterPromise) return _adapterPromise
  _adapterPromise = (async () => {
    // 等待 preload 注入 electronAPI（最多 5 秒）
    for (let i = 0; i < 50; i++) {
      if (window.electronAPI) break
      await new Promise(r => setTimeout(r, 100))
    }
    if (!window.electronAPI) {
      throw new Error('electronAPI 未就绪，请检查 preload 是否正确编译到 dist/preload/index.js')
    }
    const { IpcBridge, IpcTerminalAdapter } = await import('@adapters/ipc/IpcBridge')
    const bridge = new IpcBridge()
    return new IpcTerminalAdapter(bridge)
  })()
  return _adapterPromise
}

// ── ANSI 转义序列清理（覆盖 Windows cmd / PowerShell / bash）──
function stripAnsi(raw: string): string {
  return raw
    // CSI 序列：ESC [ ... 字母
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    // OSC 序列：ESC ] ... ST 或 BEL
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    // 其他 ESC 序列
    .replace(/\x1b[^[\]]/g, '')
    // 裸 ESC
    .replace(/\x1b/g, '')
    // Windows 特有的 \r（保留换行用于分割，之后再处理）
    .replace(/\r/g, '')
}

export function useTerminal(boxId: string) {
  const layoutStore = useLayoutStore()

  const ptyId      = ref<string | null>(null)
  const connected  = ref(false)
  const outputLines = ref<Array<{ text: string; type: 'output' | 'error' | 'system' }>>([])

  const unsubs: Array<() => void> = []

  // ── 连接 PTY ─────────────────────────────────────────────

  async function connect(cwd?: string) {
    const dir = cwd ?? layoutStore.panelCwd[boxId] ?? 'D:\\'
    try {
      const adapter = await getAdapter()
      const id = await adapter.create(boxId, dir)
      ptyId.value = id
      connected.value = true

      // 监听该 ptyId 的输出
      unsubs.push(
        adapter.onData(id, raw => {
          const cleaned = stripAnsi(raw)
          // 按换行拆分，每行单独追加
          const lines = cleaned.split('\n')
          for (const line of lines) {
            if (line.trim()) {
              outputLines.value.push({ text: line, type: 'output' })
            }
          }
        }),
        adapter.onExit(id, code => {
          connected.value = false
          outputLines.value.push({
            text: `[进程已退出，退出码: ${code}]`,
            type: 'system',
          })
        }),
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      outputLines.value.push({ text: `[连接失败: ${msg}]`, type: 'error' })
      console.error(`[useTerminal:${boxId}] 连接 PTY 失败:`, err)
    }
  }

  // ── 写入原始数据（不追加额外换行）────────────────────────

  async function write(data: string) {
    if (!ptyId.value) {
      console.warn(`[useTerminal:${boxId}] 尚未连接，无法写入`)
      return
    }
    const adapter = await getAdapter()
    await adapter.write(ptyId.value, data)
  }

  // ── 发送命令（追加一个 \r 作为回车）─────────────────────

  async function sendCommand(cmd: string) {
    if (!ptyId.value) {
      outputLines.value.push({ text: `[未连接，命令未执行: ${cmd}]`, type: 'error' })
      return
    }
    await write(cmd + '\r')
  }

  // ── 调整终端大小 ─────────────────────────────────────────

  async function resize(cols: number, rows: number) {
    if (!ptyId.value) return
    const adapter = await getAdapter()
    await adapter.resize(ptyId.value, cols, rows)
  }

  // ── 断开连接 ─────────────────────────────────────────────

  async function disconnect() {
    unsubs.forEach(fn => fn())
    unsubs.length = 0
    if (ptyId.value) {
      try {
        const adapter = await getAdapter()
        await adapter.kill(ptyId.value)
      } catch { /* 忽略断开时的错误 */ }
      ptyId.value = null
      connected.value = false
    }
  }

  // ── 生命周期 ─────────────────────────────────────────────

  onMounted(() => connect())
  onUnmounted(() => disconnect())

  return {
    ptyId,
    connected,
    outputLines,
    connect,
    disconnect,
    write,
    sendCommand,
    resize,
  }
}
