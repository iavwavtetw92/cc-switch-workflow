<template>
  <div
    class="wb"
    :class="{ focused: panelStore.focusedPanelId === id }"
    @click="focus"
  >
    <!-- xterm 挂载点 -->
    <div ref="xtermEl" class="xterm-wrap"></div>

    <!-- AI 模式输入栏（叠在下方，平时隐藏） -->
    <div v-if="aiMode" class="ai-bar">
      <span class="ai-label">🤖 {{ providerName }}</span>
      <input
        ref="aiInputEl"
        v-model="aiText"
        class="ai-inp"
        :placeholder="`问 ${providerName}…`"
        @keydown.enter="sendAi"
        @keydown.escape="exitAiMode"
      />
      <button v-if="streaming" class="stop-btn" @click="stopAi">■</button>
      <button v-else class="exit-btn" @click="exitAiMode" title="退出 AI 模式 (Esc)">✕</button>
    </div>

    <!-- 底部状态栏 -->
    <div class="wb-status">
      <span class="dot" :class="connected ? 'on' : 'off'"></span>
      <span class="status-cwd">{{ shortCwd }}</span>
      <span class="status-sep">|</span>
      <button class="ai-toggle" @click="enterAiMode" :title="`切换 AI 模式 (Ctrl+\`)`">
        🤖 {{ providerName }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { usePanelStore } from '../../stores/panelStore'
import 'xterm/css/xterm.css'

const props = defineProps<{ id: string }>()
const panelStore = usePanelStore()

// ── refs ─────────────────────────────────────────────────────
const xtermEl  = ref<HTMLDivElement>()
const aiInputEl = ref<HTMLInputElement>()

// ── Terminal state ────────────────────────────────────────────
let term: Terminal | null = null
let fitAddon: FitAddon | null = null
let ptyIdVal: string | null = null
const connected  = ref(false)

// ── AI state ──────────────────────────────────────────────────
const aiMode      = ref(false)
const aiText      = ref('')
const streaming   = ref(false)
const providerName = ref('AI')

// ── Computed ──────────────────────────────────────────────────
const cwd = computed(() => panelStore.getPanelById(props.id)?.cwd ?? 'D:\\')
const shortCwd = computed(() => {
  const parts = cwd.value.replace(/\\/g, '/').split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : cwd.value
})

// ── IPC listeners (stored for cleanup) ───────────────────────
const onData = (pid: string, data: string) => {
  if (pid !== ptyIdVal) return
  term?.write(data)
}
const onExit = (pid: string) => {
  if (pid !== ptyIdVal) return
  connected.value = false
  term?.writeln('\r\n\x1b[90m[进程已退出]\x1b[0m')
  panelStore.updateStatus(props.id, 'idle')
}

// ── Init xterm ────────────────────────────────────────────────
function initXterm() {
  if (!xtermEl.value) return

  term = new Terminal({
    theme: {
      background:  '#0d0d16',
      foreground:  '#cdd6f4',
      cursor:      '#89b4fa',
      selectionBackground: '#89b4fa33',
      black:       '#45475a', red:     '#f38ba8',
      green:       '#a6e3a1', yellow:  '#f9e2af',
      blue:        '#89b4fa', magenta: '#cba6f7',
      cyan:        '#94e2d5', white:   '#bac2de',
      brightBlack: '#585b70', brightRed:    '#f38ba8',
      brightGreen: '#a6e3a1', brightYellow: '#f9e2af',
      brightBlue:  '#89b4fa', brightMagenta:'#cba6f7',
      brightCyan:  '#94e2d5', brightWhite:  '#a6adc8',
    },
    fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
    fontSize: 13,
    lineHeight: 1.4,
    cursorBlink: true,
    scrollback: 3000,
    allowTransparency: true,
    convertEol: false,
  })

  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(new WebLinksAddon())
  term.open(xtermEl.value)
  fitAddon.fit()

  // 用户在 xterm 里的键盘输入 → 直接发给 PTY
  term.onData((data: string) => {
    if (ptyIdVal) {
      window.electronAPI.terminalInput({ ptyId: ptyIdVal, data })
    }
  })

  // 窗口大小变化时 refit
  const ro = new ResizeObserver(() => {
    fitAddon?.fit()
    if (ptyIdVal && term) {
      window.electronAPI.terminalResize({
        ptyId: ptyIdVal,
        cols: term.cols,
        rows: term.rows,
      })
    }
  })
  ro.observe(xtermEl.value)
  cleanups.push(() => ro.disconnect())
}

// ── Connect PTY ───────────────────────────────────────────────
const cleanups: Array<() => void> = []

async function connectPty() {
  term?.writeln(`\x1b[90m正在连接 ${cwd.value}…\x1b[0m`)
  try {
    const res = await window.electronAPI.terminalCreate({
      boxId: props.id,
      cwd: cwd.value,
    })
    ptyIdVal = res?.ptyId ?? null
    connected.value = !!ptyIdVal
    if (!ptyIdVal) {
      term?.writeln('\x1b[31m[PTY 创建失败]\x1b[0m')
      return
    }
    // 连接成功，resize 一次
    if (term && fitAddon) {
      fitAddon.fit()
      await window.electronAPI.terminalResize({
        ptyId: ptyIdVal,
        cols: term.cols,
        rows: term.rows,
      })
    }
    panelStore.updateStatus(props.id, 'idle')
  } catch (e) {
    term?.writeln(`\x1b[31m[连接失败: ${e}]\x1b[0m`)
  }
}

// ── AI mode ───────────────────────────────────────────────────
async function enterAiMode() {
  try {
    const p = await window.electronAPI.ccSwitchCurrent()
    if (p?.name) providerName.value = p.name
  } catch {}
  aiMode.value = true
  nextTick(() => aiInputEl.value?.focus())
}

function exitAiMode() {
  aiMode.value = false
  term?.focus()
}

async function sendAi() {
  const prompt = aiText.value.trim()
  if (!prompt || streaming.value) return
  aiText.value = ''

  // 在 xterm 里回显问题
  term?.writeln(`\r\n\x1b[94m❯ [AI] ${prompt}\x1b[0m`)
  streaming.value = true
  panelStore.updateStatus(props.id, 'running')

  const sid = `ai-${props.id}-${Date.now()}`
  let full = ''

  const onChunk = (s: string, chunk: string) => {
    if (s !== sid) return
    full += chunk
    term?.write(chunk)  // 流式直写 xterm
  }
  const onDone = (s: string, text: string) => {
    if (s !== sid) return
    cleanup()
    streaming.value = false
    term?.writeln('\r\n\x1b[90m─────\x1b[0m')
    panelStore.updateStatus(props.id, 'idle')
  }
  const onErr = (s: string, err: string) => {
    if (s !== sid) return
    cleanup()
    streaming.value = false
    term?.writeln(`\r\n\x1b[31m❌ ${err}\x1b[0m`)
    panelStore.updateStatus(props.id, 'error')
  }
  function cleanup() {
    window.electronAPI.off('ai:stream-chunk', onChunk)
    window.electronAPI.off('ai:stream-done',  onDone)
    window.electronAPI.off('ai:stream-error', onErr)
  }

  window.electronAPI.on('ai:stream-chunk', onChunk)
  window.electronAPI.on('ai:stream-done',  onDone)
  window.electronAPI.on('ai:stream-error', onErr)

  await window.electronAPI.aiChatStream({
    sessionId: sid,
    messages: [{ role: 'user', content: prompt }],
  })
}

function stopAi() {
  streaming.value = false
  term?.writeln('\r\n\x1b[33m[已停止]\x1b[0m')
  panelStore.updateStatus(props.id, 'idle')
}

// ── Focus ─────────────────────────────────────────────────────
function focus() {
  panelStore.setFocused(props.id as any)
  if (!aiMode.value) term?.focus()
}

// ── PanelStore message dispatch ───────────────────────────────
watch(
  () => panelStore.messages[props.id],
  async (msg) => {
    if (!msg) return
    panelStore.clearMessage(props.id)
    if (msg.type === 'command' && ptyIdVal) {
      term?.writeln(`\x1b[92m❯ ${msg.content}\x1b[0m`)
      await window.electronAPI.terminalInput({ ptyId: ptyIdVal, data: msg.content + '\r' })
    }
  },
)

// ── Lifecycle ─────────────────────────────────────────────────
onMounted(async () => {
  initXterm()
  window.electronAPI.on('terminal:data', onData)
  window.electronAPI.on('terminal:exit', onExit)
  await connectPty()

  // 加载 provider 名称
  try {
    const p = await window.electronAPI.ccSwitchCurrent()
    if (p?.name) providerName.value = p.name
  } catch {}

  term?.focus()
})

onUnmounted(() => {
  window.electronAPI.off('terminal:data', onData)
  window.electronAPI.off('terminal:exit', onExit)
  cleanups.forEach(fn => fn())
  if (ptyIdVal) window.electronAPI.terminalKill({ ptyId: ptyIdVal })
  term?.dispose()
})
</script>

<style scoped>
.wb {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0d0d16;
  overflow: hidden;
  border-radius: 6px;
  border: 1px solid transparent;
  transition: border-color 0.15s;
}
.wb.focused { border-color: #89b4fa44; }

/* xterm 区域填满 */
.xterm-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 4px 6px 0;
}

/* ── AI 输入栏 ───────────────────────────────────────────── */
.ai-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #160f2a;
  border-top: 1px solid #7c6af733;
  flex-shrink: 0;
}
.ai-label {
  font-size: 11px;
  color: #cba6f7;
  font-weight: 600;
  flex-shrink: 0;
  white-space: nowrap;
}
.ai-inp {
  flex: 1;
  background: #1e1e2e;
  border: 1px solid #7c6af733;
  border-radius: 6px;
  color: #cba6f7;
  font-size: 13px;
  font-family: inherit;
  padding: 4px 10px;
  outline: none;
  transition: border-color 0.12s;
  min-width: 0;
}
.ai-inp:focus { border-color: #7c6af7; }
.ai-inp::placeholder { color: #45475a; }
.stop-btn, .exit-btn {
  background: none;
  border: 1px solid;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  padding: 2px 8px;
  flex-shrink: 0;
  transition: all 0.1s;
}
.stop-btn { border-color: #f38ba844; color: #f38ba8; }
.stop-btn:hover { background: #2a1520; border-color: #f38ba8; }
.exit-btn { border-color: #45475a; color: #585b70; }
.exit-btn:hover { color: #cdd6f4; border-color: #585b70; }

/* ── 状态栏 ─────────────────────────────────────────────── */
.wb-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  background: #11111b;
  border-top: 1px solid #1e1e2e;
  flex-shrink: 0;
  font-size: 11px;
}
.dot {
  width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
}
.dot.on  { background: #a6e3a1; box-shadow: 0 0 4px #a6e3a1; }
.dot.off { background: #45475a; }
.status-cwd {
  color: #45475a;
  font-family: 'Consolas', monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex: 1; min-width: 0;
}
.status-sep { color: #1e1e2e; }
.ai-toggle {
  background: none; border: none; cursor: pointer;
  color: #45475a; font-size: 11px; padding: 1px 4px;
  border-radius: 3px; transition: color 0.1s; flex-shrink: 0;
  white-space: nowrap;
}
.ai-toggle:hover { color: #cba6f7; }
</style>