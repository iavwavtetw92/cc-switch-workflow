<template>
  <div
    class="work-box"
    :class="{ 'is-focused': layoutStore.focusedPanel === id }"
    @click="layoutStore.setFocused(id as any)"
  >
    <!-- 工具栏 -->
    <div class="wb-toolbar">
      <span class="wb-cwd" :title="cwd">{{ cwdShort }}</span>
      <span class="wb-status" :class="connected ? 'status-ok' : 'status-off'">
        {{ connected ? '● 已连接' : '○ 未连接' }}
      </span>
      <SkillPicker
        v-model="activeSkillId"
        panel-type="workbox"
        @run="onAskAi"
      />
      <button class="wb-btn" title="清屏 (Ctrl+L)" @click.stop="clearOutput">✕</button>
    </div>

    <!-- 输出区域 -->
    <div class="wb-output" ref="outputEl" @mouseup="onSelectionChange">
      <pre
        v-for="(line, i) in allLines"
        :key="i"
        :class="['line', line.type]"
      >{{ line.text }}</pre>
    </div>

    <!-- AI 面板 -->
    <AiPanel
      :visible="aiVisible"
      :text="aiText"
      :is-streaming="isStreaming"
      :skill-name="activeSkillName"
      :model-label="modelLabel"
      :show-insert="false"
      @close="aiVisible = false"
    />

    <!-- 命令输入 -->
    <div class="wb-input-bar">
      <span class="prompt">›</span>
      <input
        :id="`${id}-cmd-input`"
        v-model="cmdInput"
        class="wb-cmd-input"
        type="text"
        :placeholder="`在 ${cwdShort} 执行…`"
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
import { useLayoutStore }      from '../../stores/layoutStore'
import { useWorkflowUiStore }  from '../../stores/workflowUiStore'
import { useTerminal }         from '../../composables/useTerminal'
import { useAi }               from '../../composables/useAi'
import AiPanel                 from '../shared/AiPanel.vue'
import SkillPicker             from '../shared/SkillPicker.vue'
import type { Skill }          from '@core/types/ai.types'

const props = defineProps<{ id: string }>()

const layoutStore   = useLayoutStore()
const workflowStore = useWorkflowUiStore()
const { connected, outputLines, sendCommand } = useTerminal(props.id)
const { isStreaming, streamText, chatStream, buildMessages, getSkills } = useAi()

// ── 状态 ────────────────────────────────────────────────────
const cmdInput     = ref('')
const history      = ref<string[]>([])
const histIdx      = ref(-1)
const outputEl     = ref<HTMLDivElement>()
const activeSkillId = ref<string | undefined>()
const aiVisible    = ref(false)
const aiText       = ref('')
const modelLabel   = ref('CC Switch AI')
const selectedText = ref('')
const skills       = ref<Skill[]>([])

const activeSkillName = computed(() =>
  skills.value.find(s => s.id === activeSkillId.value)?.name
)

// 本地附加行（欢迎信息、命令回显等），合并 PTY 输出一起显示
const localLines = ref<Array<{ text: string; type: string }>>([
  { text: `CC Switch Pro — 工作框 [${props.id}]`, type: 'header' },
  { text: `使用 > 触发工作流，或直接在此输入命令`, type: 'info' },
])

const allLines = computed(() => [
  ...localLines.value,
  ...outputLines.value.map(l => ({ text: l.text, type: l.type })),
])

// ── 计算属性 ─────────────────────────────────────────────────
const cwd = computed(() => layoutStore.panelCwd[props.id] ?? 'D:\\')

const cwdShort = computed(() => {
  const p = cwd.value
  const parts = p.replace(/\\/g, '/').split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : p
})

// ── 初始化：加载技能列表 ─────────────────────────────────────
getSkills().then(list => {
  skills.value = list.filter(s => s.panelTypes.includes('workbox'))
})

// ── 自动滚动到底部 ───────────────────────────────────────────
watch(allLines, () => {
  nextTick(() => {
    if (outputEl.value) {
      outputEl.value.scrollTop = outputEl.value.scrollHeight
    }
  })
}, { deep: true })

// ── 同步 AI 流式文本 ─────────────────────────────────────────
watch(streamText, (val) => {
  aiText.value = val
})

// ── 方法 ─────────────────────────────────────────────────────

async function onEnter() {
  const cmd = cmdInput.value.trim()
  if (!cmd) return

  localLines.value.push({ text: `❯ ${cmd}`, type: 'command' })
  history.value.unshift(cmd)
  if (history.value.length > 100) history.value.pop()
  histIdx.value = -1
  cmdInput.value = ''

  await sendCommand(cmd)
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
  localLines.value = []
  outputLines.value.splice(0)   // 响应式清空（不能直接 = []）
}

/** 捕获用户在输出区选中的文本 */
function onSelectionChange() {
  selectedText.value = window.getSelection()?.toString().trim() ?? ''
}

/** 触发 AI 技能分析 */
async function onAskAi(skillId: string) {
  activeSkillId.value = skillId

  // 优先用选中文本，否则取最后 50 行输出
  const context = selectedText.value
    || allLines.value.slice(-50).map(l => l.text).join('\n')

  aiText.value = ''
  aiVisible.value = true

  const messages = buildMessages('请分析以上内容', context)
  await chatStream(messages, skillId)
}

// ── 监听工作流分发的面板消息 ─────────────────────────────────
watch(
  () => workflowStore.panelMessages[props.id],
  async (msg) => {
    if (!msg) return
    workflowStore.clearPanelMessage(props.id)
    if (msg.type === 'command') {
      localLines.value.push({ text: `❯ ${msg.content}`, type: 'command' })
      await sendCommand(msg.content)   // sendCommand 内部检查连接状态
    } else if (msg.type === 'data' || msg.type === 'mcp-result') {
      localLines.value.push({ text: msg.content, type: 'output' })
    }
  },
  { immediate: false },
)
</script>

<style scoped>
.work-box {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #11111b;
  border: 1px solid #313244;
  border-radius: 6px;
  overflow: hidden;
  transition: border-color 0.15s;
}

.work-box.is-focused {
  border-color: #89b4fa;
}

/* ── 工具栏 ─────────────────────────────────────────────── */
.wb-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: #181825;
  border-bottom: 1px solid #313244;
  font-size: 12px;
  min-height: 32px;
}

.wb-cwd {
  color: #f9e2af;
  font-family: monospace;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wb-status {
  font-size: 11px;
}

.status-ok  { color: #a6e3a1; }
.status-off { color: #585b70; }

.wb-btn {
  background: none;
  border: none;
  color: #6c7086;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 12px;
  transition: color 0.1s, background 0.1s;
  margin-left: auto;
}
.wb-btn:hover { color: #f38ba8; background: #1e1e2e; }

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
.line.header  { color: #89b4fa; font-weight: 600; }
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
  padding: 6px 12px;
  background: #181825;
  border-top: 1px solid #313244;
}

.prompt {
  color: #a6e3a1;
  font-size: 16px;
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