<template>
  <div
    class="wb"
    :class="{ focused: panelStore.focusedPanelId === id }"
    @click="panelStore.setFocused(id as any)"
  >
    <!-- ── 输出区 ──────────────────────────────────────────── -->
    <div class="wb-out" ref="outEl">
      <pre
        v-for="(ln, i) in lines"
        :key="i"
        :class="['ln', ln.t]"
      >{{ ln.s }}</pre>

      <!-- AI 流式行 -->
      <pre v-if="streaming" class="ln ai-stream">{{ streamBuf }}<span class="cursor">▌</span></pre>
    </div>

    <!-- ── 输入栏 ──────────────────────────────────────────── -->
    <div class="wb-bar" :class="{ ai: mode === 'ai' }">
      <button
        class="mode-btn"
        :class="mode"
        :title="mode === 'cmd' ? 'Tab → AI 模式' : 'Tab → 终端模式'"
        @click.stop="toggleMode"
      >{{ mode === 'cmd' ? '❯' : '🤖' }}</button>

      <input
        ref="inputEl"
        v-model="text"
        class="wb-inp"
        autocomplete="off"
        spellcheck="false"
        :placeholder="mode === 'cmd'
          ? (connected ? `${shortCwd}❯` : '未连接…')
          : `问 ${providerName}…`"
        @keydown.enter="onEnter"
        @keydown.tab.prevent="toggleMode"
        @keydown.up.prevent="histUp"
        @keydown.down.prevent="histDown"
      />

      <button v-if="streaming" class="stop-btn" @click.stop="stopAi">■</button>
      <span v-if="!connected && mode==='cmd'" class="badge err">未连接</span>
      <span v-else-if="mode==='ai'" class="badge ai-badge">AI</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { usePanelStore } from '../../stores/panelStore'

const props = defineProps<{ id: string }>()
const panelStore = usePanelStore()

// ── 类型 ────────────────────────────────────────────────────
type LineType = 'cmd' | 'out' | 'err' | 'sys' | 'ai-q' | 'ai-r' | 'ai-stream'
interface Line { s: string; t: LineType }

// ── 状态 ────────────────────────────────────────────────────
const lines      = ref<Line[]>([])
const text       = ref('')
const mode       = ref<'cmd' | 'ai'>('cmd')
const connected  = ref(false)
const ptyId      = ref<string | null>(null)
const hist       = ref<string[]>([])
const histIdx    = ref(-1)
const streaming  = ref(false)
const streamBuf  = ref('')
const providerName = ref('AI')
const outEl      = ref<HTMLDivElement>()
const inputEl    = ref<HTMLInputElement>()

// ── 工作目录 ─────────────────────────────────────────────────
const cwd = computed(() => panelStore.getPanelById(props.id)?.cwd ?? 'D:\\')
const shortCwd = computed(() => {
  const parts = cwd.value.replace(/\\/g, '/').split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : cwd.value
})

// ── PTY ──────────────────────────────────────────────────────
async function initPty() {
  push(`工作框 [${props.id}]  正在连接…`, 'sys')
  try {
    const res = await window.electronAPI.terminalCreate({
      boxId: props.id,
      cwd: cwd.value,
    })
    ptyId.value  = res?.ptyId ?? null
    connected.value = !!ptyId.value
    push(connected.value
      ? `● 已连接  ${cwd.value}  (Tab 切换 AI 模式)`
      : '○ PTY 创建失败，请检查 node-pty 安装', connected.value ? 'sys' : 'err')
  } catch (e) {
    push(`连接失败: ${e}`, 'err')
  }
}

// ── 全局 terminal:data / terminal:exit 监听 ──────────────────
// 注意：preload 的 on() 是全局广播，需要手动过滤 ptyId
const onData = (pid: string, data: string) => {
  if (pid !== ptyId.value) return
  // 清理 ANSI 转义序列
  const clean = data
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b[^[\]]/g, '')
    .replace(/\x1b/g, '')
    .replace(/\r/g, '')
  clean.split('\n').forEach(l => { if (l) push(l, 'out') })
  scroll()
}
const onExit = (pid: string) => {
  if (pid !== ptyId.value) return
  connected.value = false
  push('[进程已退出]', 'sys')
  scroll()
}

onMounted(async () => {
  window.electronAPI.on('terminal:data', onData)
  window.electronAPI.on('terminal:exit', onExit)
  await initPty()

  // 加载当前 CC Switch provider 名称
  try {
    const p = await window.electronAPI.ccSwitchCurrent()
    if (p?.name) providerName.value = p.name
  } catch {}
})

onUnmounted(() => {
  window.electronAPI.off('terminal:data', onData)
  window.electronAPI.off('terminal:exit', onExit)
  if (ptyId.value) window.electronAPI.terminalKill({ ptyId: ptyId.value })
})

// ── 发送命令 ─────────────────────────────────────────────────
async function sendCmd(cmd: string) {
  if (!ptyId.value) { push('未连接', 'err'); return }
  panelStore.updateStatus(props.id, 'running')
  await window.electronAPI.terminalInput({ ptyId: ptyId.value, data: cmd + '\r' })
  // 状态会在下次输出到达时更新；这里粗略延迟回 idle
  setTimeout(() => panelStore.updateStatus(props.id, 'idle'), 500)
}

// ── AI 模式 ──────────────────────────────────────────────────
let aiSession = ''

async function sendAi(prompt: string) {
  push(`❯ [AI] ${prompt}`, 'ai-q')
  streaming.value = true
  streamBuf.value = ''
  panelStore.updateStatus(props.id, 'running')

  const sid = `ai-${props.id}-${Date.now()}`
  aiSession    = sid
  let fullText = ''

  const onChunk = (s: string, chunk: string) => {
    if (s !== sid) return
    fullText   += chunk
    streamBuf.value = fullText
    scroll()
  }
  const onDone = (s: string, full: string) => {
    if (s !== sid) return
    cleanup()
    streamBuf.value = ''
    streaming.value = false
    ;(full || fullText).split('\n').forEach(l => push(l, 'ai-r'))
    push('', 'ai-r')
    panelStore.updateStatus(props.id, 'idle')
    scroll()
  }
  const onErr = (s: string, err: string) => {
    if (s !== sid) return
    cleanup()
    streamBuf.value = ''
    streaming.value = false
    push(`❌ ${err}`, 'err')
    panelStore.updateStatus(props.id, 'error')
    scroll()
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
  if (streamBuf.value) push(streamBuf.value + '\n[已停止]', 'ai-r')
  streamBuf.value = ''
  streaming.value = false
  panelStore.updateStatus(props.id, 'idle')
}

// ── 输入处理 ─────────────────────────────────────────────────
async function onEnter() {
  const t = text.value.trim()
  if (!t) return
  text.value = ''
  hist.value.unshift(t)
  if (hist.value.length > 200) hist.value.pop()
  histIdx.value = -1

  if (mode.value === 'ai') {
    await sendAi(t)
  } else {
    push(`❯ ${t}`, 'cmd')
    await sendCmd(t)
  }
}

function histUp() {
  if (!hist.value.length) return
  histIdx.value = Math.min(histIdx.value + 1, hist.value.length - 1)
  text.value = hist.value[histIdx.value]
}
function histDown() {
  if (histIdx.value <= 0) { histIdx.value = -1; text.value = ''; return }
  histIdx.value--
  text.value = hist.value[histIdx.value]
}

function toggleMode() {
  mode.value = mode.value === 'cmd' ? 'ai' : 'cmd'
  // 切换 AI 模式时刷新 provider 名称
  if (mode.value === 'ai') {
    window.electronAPI.ccSwitchCurrent().then(p => {
      if (p?.name) providerName.value = p.name
    }).catch(() => {})
  }
  nextTick(() => inputEl.value?.focus())
}

// ── panelStore 消息分发（控制栏发命令） ─────────────────────
watch(
  () => panelStore.messages[props.id],
  async (msg) => {
    if (!msg) return
    panelStore.clearMessage(props.id)
    if (msg.type === 'command') {
      push(`❯ ${msg.content}`, 'cmd')
      await sendCmd(msg.content)
    } else {
      push(msg.content, 'out')
    }
  },
)

// ── 工具 ─────────────────────────────────────────────────────
function push(s: string, t: LineType) {
  lines.value.push({ s, t })
  // 最多保留 3000 行
  if (lines.value.length > 3000) lines.value.splice(0, 300)
}

function scroll() {
  nextTick(() => {
    if (outEl.value) outEl.value.scrollTop = outEl.value.scrollHeight
  })
}

watch(lines, scroll, { deep: false })
</script>

<style scoped>
.wb {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0d0d16;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid transparent;
  transition: border-color 0.15s;
}
.wb.focused { border-color: #89b4fa44; }

/* ── 输出区 ─────────────────────────────────────────────── */
.wb-out {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px 4px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  min-height: 0;
}
.wb-out::-webkit-scrollbar { width: 4px; }
.wb-out::-webkit-scrollbar-thumb { background: #1e1e2e; border-radius: 2px; }

.ln { margin: 0; white-space: pre-wrap; word-break: break-all; display: block; }
.ln.cmd      { color: #a6e3a1; }
.ln.out      { color: #cdd6f4; }
.ln.err      { color: #f38ba8; }
.ln.sys      { color: #45475a; font-style: italic; }
.ln.ai-q     { color: #89b4fa; font-weight: 600; margin-top: 6px; }
.ln.ai-r     { color: #cba6f7; padding-left: 12px; border-left: 2px solid #7c6af722; }
.ln.ai-stream { color: #cba6f799; padding-left: 12px; border-left: 2px solid #7c6af744; font-style: italic; }

.cursor { animation: blink 0.8s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }

/* ── 输入栏 ─────────────────────────────────────────────── */
.wb-bar {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  background: #11111b;
  border-top: 1px solid #1e1e2e;
  transition: background 0.15s, border-top-color 0.15s;
  flex-shrink: 0;
}
.wb-bar.ai {
  background: #160f2a;
  border-top-color: #7c6af733;
}

.mode-btn {
  width: 28px; height: 22px;
  border-radius: 5px;
  border: 1px solid #1e1e2e;
  background: #181825;
  color: #45475a;
  font-size: 12px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; padding: 0; line-height: 1;
  transition: all 0.12s;
}
.mode-btn.cmd { color: #a6e3a1; border-color: #a6e3a122; }
.mode-btn.cmd:hover { background: #0d2a1a; border-color: #a6e3a1; }
.mode-btn.ai { color: #cba6f7; border-color: #7c6af733; background: #2d1b50; }
.mode-btn.ai:hover { background: #3d2b65; border-color: #7c6af7; }

.wb-inp {
  flex: 1; min-width: 0;
  background: transparent; border: none; outline: none;
  color: #cdd6f4; font-size: 13px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
}
.wb-bar.ai .wb-inp { color: #cba6f7; }
.wb-inp::placeholder { color: #313244; }

.stop-btn {
  background: none; border: 1px solid #f38ba833;
  border-radius: 4px; color: #f38ba8; font-size: 11px;
  cursor: pointer; padding: 1px 6px; flex-shrink: 0;
  transition: all 0.1s;
}
.stop-btn:hover { background: #2a1520; border-color: #f38ba8; }

.badge {
  font-size: 10px; padding: 1px 5px; border-radius: 3px;
  flex-shrink: 0; font-weight: 600;
}
.badge.err { background: #2a1520; color: #f38ba8; }
.badge.ai-badge { background: #2d1b50; color: #cba6f7; }
</style>