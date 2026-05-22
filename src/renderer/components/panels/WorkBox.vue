<template>
  <div
    class="work-box"
    :class="{ 'is-focused': panelStore.focusedPanelId === id }"
    @click="panelStore.setFocused(id as any)"
  >
    <!-- 输出区域 -->
    <div class="wb-output" ref="outputEl">
      <pre
        v-for="(line, i) in allLines"
        :key="i"
        :class="['line', line.type]"
      >{{ line.text }}</pre>

      <!-- AI 流式输出（附加在末尾） -->
      <template v-if="isStreaming">
        <pre class="line ai-prompt">🤖 {{ streamBuffer || '▌' }}</pre>
      </template>
    </div>

    <!-- 命令输入栏 -->
    <div class="wb-input-bar" :class="{ 'ai-mode': inputMode === 'ai' }">
      <!-- 模式切换按钮 -->
      <button
        class="mode-toggle"
        :class="inputMode"
        :title="inputMode === 'terminal' ? '切换为 AI 模式 (Tab)' : '切换为终端模式 (Tab)'"
        @click.stop="toggleMode"
      >
        {{ inputMode === 'terminal' ? '❯' : '🤖' }}
      </button>

      <input
        :id="`${id}-cmd-input`"
        v-model="cmdInput"
        ref="inputEl"
        class="wb-cmd-input"
        type="text"
        :placeholder="inputMode === 'terminal'
          ? `${cwdShort} 执行命令…`
          : `问 ${providerName} 任何问题…`"
        autocomplete="off"
        spellcheck="false"
        @keydown.enter="onEnter"
        @keydown.tab.prevent="toggleMode"
        @keydown.up.prevent="historyUp"
        @keydown.down.prevent="historyDown"
      />

      <!-- AI 模式：停止按钮 -->
      <button
        v-if="inputMode === 'ai' && isStreaming"
        class="wb-stop-btn"
        @click.stop="cancelAi"
        title="停止生成"
      >■</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { usePanelStore }      from '../../stores/panelStore'
import { useWorkflowUiStore } from '../../stores/workflowUiStore'
import { useTerminal }        from '../../composables/useTerminal'
import { useAi }              from '../../composables/useAi'

const props = defineProps<{ id: string }>()

const panelStore    = usePanelStore()
const workflowStore = useWorkflowUiStore()
const { connected, outputLines, sendCommand } = useTerminal(props.id)
const { isStreaming, chatStream, cancel: cancelAi } = useAi()

// ── 状态 ────────────────────────────────────────────────────
const cmdInput    = ref('')
const inputMode   = ref<'terminal' | 'ai'>('terminal')
const history     = ref<string[]>([])
const histIdx     = ref(-1)
const outputEl    = ref<HTMLDivElement>()
const inputEl     = ref<HTMLInputElement>()
const streamBuffer = ref('')
const providerName = ref('CC Switch AI')

const localLines = ref<Array<{ text: string; type: string }>>([
  { text: `工作框 [${props.id}]  ${connected.value ? '● 已连接' : '○ 未连接'}  |  Tab 键切换 AI/终端`, type: 'header' },
])

const allLines = computed(() => [
  ...localLines.value,
  ...outputLines.value.map(l => ({ text: l.text, type: l.type })),
])

// ── 工作目录 ─────────────────────────────────────────────────
const cwd = computed(() => panelStore.getPanelById(props.id)?.cwd ?? 'D:\\')
const cwdShort = computed(() => {
  const p = cwd.value
  const parts = p.replace(/\\/g, '/').split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : p
})

// ── 加载当前 Provider 名称 ───────────────────────────────────
onMounted(async () => {
  try {
    const p = await window.electronAPI?.ccSwitchCurrent()
    if (p?.name) providerName.value = p.name
  } catch {}
})

// ── 连接状态 ─────────────────────────────────────────────────
watch(connected, (v) => {
  localLines.value[0] = {
    text: `工作框 [${props.id}]  ${v ? '● 已连接' : '○ 未连接'}  |  Tab 键切换 AI/终端`,
    type: 'header',
  }
})

// ── 自动滚动 ─────────────────────────────────────────────────
watch([allLines, streamBuffer, isStreaming], () => {
  nextTick(() => {
    if (outputEl.value) outputEl.value.scrollTop = outputEl.value.scrollHeight
  })
}, { deep: true })

// ── 方法 ─────────────────────────────────────────────────────

function toggleMode() {
  inputMode.value = inputMode.value === 'terminal' ? 'ai' : 'terminal'
  nextTick(() => inputEl.value?.focus())
}

async function onEnter() {
  const input = cmdInput.value.trim()
  if (!input) return

  if (inputMode.value === 'ai') {
    await runAi(input)
  } else {
    await runCommand(input)
  }
}

async function runCommand(cmd: string) {
  localLines.value.push({ text: `❯ ${cmd}`, type: 'command' })
  history.value.unshift(cmd)
  if (history.value.length > 100) history.value.pop()
  histIdx.value  = -1
  cmdInput.value = ''

  panelStore.updateStatus(props.id, 'running')
  try {
    await sendCommand(cmd)
  } catch {
    panelStore.updateStatus(props.id, 'error')
    return
  }
  panelStore.updateStatus(props.id, 'idle')
}

async function runAi(prompt: string) {
  history.value.unshift(prompt)
  if (history.value.length > 100) history.value.pop()
  histIdx.value  = -1
  cmdInput.value = ''

  // 在输出区插入问题行
  localLines.value.push({ text: `❯ [AI] ${prompt}`, type: 'ai-query' })
  streamBuffer.value = ''

  panelStore.updateStatus(props.id, 'running')

  await chatStream(
    [{ role: 'user', content: prompt }],
    undefined,
    (chunk) => { streamBuffer.value += chunk },
    (full)  => {
      // 流结束 → 把完整文本固化到 localLines
      streamBuffer.value = ''
      // 按行拆分，保留空行
      full.split('\n').forEach(line => {
        localLines.value.push({ text: line, type: 'ai-response' })
      })
      localLines.value.push({ text: '', type: 'ai-response' })
      panelStore.updateStatus(props.id, 'idle')
    },
  )
}

function historyUp() {
  if (!history.value.length) return
  histIdx.value = Math.min(histIdx.value + 1, history.value.length - 1)
  cmdInput.value = history.value[histIdx.value]
}

function historyDown() {
  if (histIdx.value <= 0) { histIdx.value = -1; cmdInput.value = ''; return }
  histIdx.value--
  cmdInput.value = history.value[histIdx.value]
}

// ── 监听 panelStore 消息（控制栏 / 工作流分发） ──────────────
watch(
  () => panelStore.messages[props.id],
  async (msg) => {
    if (!msg) return
    panelStore.clearMessage(props.id)
    if (msg.type === 'command') {
      await runCommand(msg.content)
    } else if (msg.type === 'data' || msg.type === 'mcp-result') {
      localLines.value.push({ text: msg.content, type: 'output' })
    }
  },
)

// ── 兼容 workflowUiStore 消息 ────────────────────────────────
watch(
  () => workflowStore.panelMessages[props.id],
  async (msg) => {
    if (!msg) return
    workflowStore.clearPanelMessage(props.id)
    if (msg.type === 'command') {
      await runCommand(msg.content)
    } else {
      localLines.value.push({ text: msg.content, type: 'output' })
    }
  },
)
</script>

<style scoped>
.work-box {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #11111b;
  overflow: hidden;
}

/* ── 输出区 ─────────────────────────────────────────────── */
.wb-output {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  font-family: 'Consolas', 'Fira Code', monospace;
  font-size: 13px;
  line-height: 1.6;
  min-height: 0;
}

.line { margin: 0; white-space: pre-wrap; word-break: break-all; }
.line.header     { color: #585b70; font-size: 11px; margin-bottom: 6px; }
.line.command    { color: #a6e3a1; }
.line.output     { color: #cdd6f4; }
.line.error      { color: #f38ba8; }
.line.system     { color: #6c7086; font-style: italic; }
.line.ai-query   { color: #89b4fa; font-weight: 600; margin-top: 6px; }
.line.ai-response {
  color: #cba6f7;
  padding-left: 16px;
  border-left: 2px solid #7c6af733;
}
.line.ai-prompt  { color: #cba6f7; font-style: italic; }

/* ── 输入栏 ─────────────────────────────────────────────── */
.wb-input-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: #181825;
  border-top: 1px solid #313244;
  transition: border-top-color 0.15s, background 0.15s;
}

.wb-input-bar.ai-mode {
  background: #1a1030;
  border-top-color: #7c6af744;
}

/* ── 模式切换按钮 ────────────────────────────────────────── */
.mode-toggle {
  width: 26px;
  height: 22px;
  border-radius: 5px;
  border: 1px solid #313244;
  background: #1e1e2e;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.12s;
  color: #6c7086;
  padding: 0;
  line-height: 1;
}
.mode-toggle.terminal { color: #a6e3a1; border-color: #a6e3a144; }
.mode-toggle.terminal:hover { background: #1e3a2e; border-color: #a6e3a1; }
.mode-toggle.ai { color: #cba6f7; border-color: #7c6af744; background: #2d1b50; }
.mode-toggle.ai:hover { background: #3d2b65; border-color: #7c6af7; }

/* ── 输入框 ─────────────────────────────────────────────── */
.wb-cmd-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #cdd6f4;
  font-size: 13px;
  font-family: 'Consolas', 'Fira Code', monospace;
  min-width: 0;
}
.ai-mode .wb-cmd-input { color: #cba6f7; }
.wb-cmd-input::placeholder { color: #45475a; }

/* ── 停止按钮 ───────────────────────────────────────────── */
.wb-stop-btn {
  background: none;
  border: 1px solid #f38ba844;
  border-radius: 4px;
  color: #f38ba8;
  font-size: 11px;
  cursor: pointer;
  padding: 1px 6px;
  transition: all 0.1s;
  flex-shrink: 0;
}
.wb-stop-btn:hover { background: #2a1520; border-color: #f38ba8; }
</style>