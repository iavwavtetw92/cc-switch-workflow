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
    </div>

    <!-- 命令输入 -->
    <div class="wb-input-bar">
      <span class="prompt">›</span>
      <input
        :id="`${id}-cmd-input`"
        v-model="cmdInput"
        class="wb-cmd-input"
        type="text"
        :placeholder="`${cwdShort} 执行命令…`"
        autocomplete="off"
        spellcheck="false"
        @keydown.enter="onEnter"
        @keydown.up.prevent="historyUp"
        @keydown.down.prevent="historyDown"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { usePanelStore }     from '../../stores/panelStore'
import { useWorkflowUiStore } from '../../stores/workflowUiStore'
import { useTerminal }        from '../../composables/useTerminal'

const props = defineProps<{ id: string }>()

const panelStore    = usePanelStore()
const workflowStore = useWorkflowUiStore()
const { connected, outputLines, sendCommand } = useTerminal(props.id)

// ── 状态 ────────────────────────────────────────────────────
const cmdInput = ref('')
const history  = ref<string[]>([])
const histIdx  = ref(-1)
const outputEl = ref<HTMLDivElement>()

const localLines = ref<Array<{ text: string; type: string }>>([
  { text: `工作框 [${props.id}]  ${connected.value ? '● 已连接' : '○ 未连接'}`, type: 'header' },
])

const allLines = computed(() => [
  ...localLines.value,
  ...outputLines.value.map(l => ({ text: l.text, type: l.type })),
])

// ── 计算属性 ─────────────────────────────────────────────────
const cwd = computed(() => panelStore.getPanelById(props.id)?.cwd ?? 'D:\\')

const cwdShort = computed(() => {
  const p = cwd.value
  const parts = p.replace(/\\/g, '/').split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : p
})

// ── 连接状态变化时更新欢迎行 ─────────────────────────────────
watch(connected, (v) => {
  localLines.value[0] = {
    text: `工作框 [${props.id}]  ${v ? '● 已连接' : '○ 未连接'}`,
    type: 'header',
  }
})

// ── 自动滚动到底部 ───────────────────────────────────────────
watch(allLines, () => {
  nextTick(() => {
    if (outputEl.value) outputEl.value.scrollTop = outputEl.value.scrollHeight
  })
}, { deep: true })

// ── 方法 ─────────────────────────────────────────────────────

async function onEnter() {
  const cmd = cmdInput.value.trim()
  if (!cmd) return
  await runCommand(cmd)
}

async function runCommand(cmd: string) {
  localLines.value.push({ text: `❯ ${cmd}`, type: 'command' })
  history.value.unshift(cmd)
  if (history.value.length > 100) history.value.pop()
  histIdx.value  = -1
  cmdInput.value = ''

  // 上报状态给 panelStore → PanelContainer 的 badge 会更新
  panelStore.updateStatus(props.id, 'running')
  try {
    await sendCommand(cmd)
  } catch {
    panelStore.updateStatus(props.id, 'error')
    return
  }
  panelStore.updateStatus(props.id, 'idle')
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

function clearOutput() {
  localLines.value = [{ text: `工作框 [${props.id}]`, type: 'header' }]
  outputLines.value.splice(0)
  panelStore.updateStatus(props.id, 'idle')
}

// ── 监听 panelStore 消息（工作流 / 控制栏发来的命令） ────────
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
  { immediate: false },
)

// ── 兼容旧 workflowUiStore 消息（工作流分发） ────────────────
watch(
  () => workflowStore.panelMessages[props.id],
  async (msg) => {
    if (!msg) return
    workflowStore.clearPanelMessage(props.id)
    if (msg.type === 'command') {
      await runCommand(msg.content)
    } else if (msg.type === 'data' || msg.type === 'mcp-result') {
      localLines.value.push({ text: msg.content, type: 'output' })
    }
  },
  { immediate: false },
)

// 暴露给父组件（PanelControlBar 可调用）
defineExpose({ clearOutput })
</script>

<style scoped>
.work-box {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #11111b;
  overflow: hidden;
}

.work-box.is-focused .wb-input-bar {
  border-top-color: #89b4fa44;
}

/* ── 输出区 ─────────────────────────────────────────────── */
.wb-output {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  font-family: 'Consolas', 'Fira Code', monospace;
  font-size: 13px;
  line-height: 1.55;
  min-height: 0;
}

.line { margin: 0; white-space: pre-wrap; word-break: break-all; }
.line.header  { color: #89b4fa; font-weight: 600; margin-bottom: 4px; }
.line.info    { color: #f9e2af; }
.line.command { color: #a6e3a1; }
.line.output  { color: #cdd6f4; }
.line.error   { color: #f38ba8; }
.line.system  { color: #6c7086; font-style: italic; }

/* ── 命令输入栏 ─────────────────────────────────────────── */
.wb-input-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  background: #181825;
  border-top: 1px solid #313244;
  transition: border-top-color 0.15s;
}

.prompt {
  color: #a6e3a1;
  font-size: 15px;
  font-weight: bold;
  flex-shrink: 0;
}

.wb-cmd-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #cdd6f4;
  font-size: 13px;
  font-family: 'Consolas', 'Fira Code', monospace;
}
.wb-cmd-input::placeholder { color: #45475a; }
</style>