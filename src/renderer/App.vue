<template>
  <div class="app">

    <!-- ══ 顶栏 ══════════════════════════════════════════════ -->
    <header class="topbar">
      <!-- 工作区预设 -->
      <div class="preset-area" v-if="presets.length">
        <button
          v-for="p in presets"
          :key="p.name"
          class="preset-btn"
          :title="`恢复工作区: ${p.name}`"
          @click="applyPreset(p)"
        >⚡ {{ p.name }}</button>
        <button class="preset-btn ghost" @click="saveCurrentAsPreset">+ 保存</button>
      </div>
      <button v-else class="preset-btn ghost" @click="saveCurrentAsPreset">+ 保存工作区</button>

      <div class="topbar-spacer"></div>

      <!-- CC Switch 状态 + 快切 -->
      <div class="cc-area">
        <span class="cc-label">CC Switch</span>
        <button
          v-for="p in ccProviders"
          :key="p.id"
          class="cc-chip"
          :class="{ active: currentCc?.id === p.id }"
          @click="switchCc(p)"
        >
          <span class="cc-dot" :class="{ on: currentCc?.id === p.id }"></span>
          {{ p.name }}
        </button>
        <button class="icon-btn" title="刷新" @click="loadCc">↻</button>
      </div>
    </header>

    <!-- ══ 标签栏 ═════════════════════════════════════════════ -->
    <div class="tabbar">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab"
        :class="{ active: activeTabId === tab.id }"
        @click="activeTabId = tab.id"
        @dblclick="renameTab(tab)"
      >
        <span class="tab-cwd" :title="tab.cwd">{{ shortPath(tab.cwd) }}</span>
        <span class="tab-status" :class="tab.status"></span>
        <button class="tab-close" @click.stop="closeTab(tab.id)" v-if="tabs.length > 1">×</button>
      </button>
      <button class="tab-add" @click="addTab" title="新终端 (Ctrl+T)">+</button>
    </div>

    <!-- ══ 终端输出区 ══════════════════════════════════════════ -->
    <div class="terminal-output" ref="outputEl">
      <template v-if="activeTab">
        <pre
          v-for="(line, i) in activeTab.lines"
          :key="i"
          :class="['line', line.type]"
        >{{ line.text }}</pre>

        <!-- AI 流式输出 -->
        <pre v-if="isStreaming && activeTab.id === aiTargetTabId" class="line ai-stream">{{ streamBuf }}<span class="cursor">▌</span></pre>
      </template>
    </div>

    <!-- ══ 输入栏 ══════════════════════════════════════════════ -->
    <div class="inputbar" :class="{ 'ai-active': aiMode }">
      <button
        class="mode-btn"
        :class="{ active: aiMode }"
        :title="aiMode ? '切回终端模式 (Tab)' : '切换 AI 模式 (Tab)'"
        @click="toggleAiMode"
      >{{ aiMode ? '🤖' : '❯_' }}</button>

      <input
        ref="inputEl"
        v-model="inputText"
        class="cmd-input"
        :placeholder="aiMode
          ? (currentCc ? `问 ${currentCc.name}…` : '请先选择 CC Switch provider')
          : `${activeTab ? shortPath(activeTab.cwd) : 'D:\\'} 输入命令…`"
        autocomplete="off"
        spellcheck="false"
        @keydown.enter="onEnter"
        @keydown.tab.prevent="toggleAiMode"
        @keydown.up.prevent="histUp"
        @keydown.down.prevent="histDown"
        @keydown.ctrl.t.prevent="addTab"
      />

      <button v-if="isStreaming" class="action-btn stop" @click="stopAi">■</button>
      <span class="input-hint" v-if="!aiMode">Tab=AI</span>
    </div>

    <!-- ══ 保存预设弹窗 ══════════════════════════════════════════ -->
    <Transition name="fade">
      <div v-if="showPresetDialog" class="dialog-mask" @click.self="showPresetDialog = false">
        <div class="dialog">
          <div class="dialog-title">保存工作区预设</div>
          <input v-model="presetName" class="dialog-input" placeholder="预设名称，如：KMS项目" @keydown.enter="confirmSavePreset" />
          <div v-for="tab in tabs" :key="tab.id" class="dialog-row">
            <span class="dialog-label">终端 {{ tab.id }}</span>
            <input v-model="tab.cwd" class="dialog-input small" placeholder="工作目录" />
          </div>
          <div class="dialog-actions">
            <button class="dialog-btn" @click="showPresetDialog = false">取消</button>
            <button class="dialog-btn primary" @click="confirmSavePreset">保存</button>
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'

// ── 类型 ─────────────────────────────────────────────────────
interface CcProvider { id: string; name: string; isActive: boolean; baseUrl?: string }
interface TermLine   { text: string; type: 'cmd'|'output'|'error'|'system'|'ai-query'|'ai-response'|'ai-stream' }
interface Tab {
  id:     number
  cwd:    string
  ptyId:  string | null
  status: 'idle' | 'running' | 'error'
  lines:  TermLine[]
  hist:   string[]
  histIdx: number
}
interface Preset { name: string; tabs: Array<{ cwd: string }> }

// ── CC Switch ─────────────────────────────────────────────────
const ccProviders   = ref<CcProvider[]>([])
const currentCc     = ref<CcProvider | null>(null)

async function loadCc() {
  try {
    const [all, cur] = await Promise.all([
      window.electronAPI.ccSwitchProviders(),
      window.electronAPI.ccSwitchCurrent(),
    ])
    ccProviders.value = all ?? []
    currentCc.value   = cur ?? ccProviders.value.find(p => p.isActive) ?? null
  } catch (e) {
    console.error('[CC]', e)
  }
}

async function switchCc(p: CcProvider) {
  try {
    await window.electronAPI.ccSwitchSwitch({ providerId: p.id })
    currentCc.value = p
    addLine(activeTab.value!, `✓ 已切换到 ${p.name}`, 'system')
  } catch {}
}

// ── 标签页 ────────────────────────────────────────────────────
let tabCounter = 1
const tabs        = ref<Tab[]>([])
const activeTabId = ref<number>(1)

const activeTab = computed(() => tabs.value.find(t => t.id === activeTabId.value))

function newTab(cwd = 'D:\\'): Tab {
  return {
    id:      tabCounter++,
    cwd,
    ptyId:   null,
    status:  'idle',
    lines:   [{ text: `● 工作目录: ${cwd}  (Tab=切换AI模式)`, type: 'system' }],
    hist:    [],
    histIdx: -1,
  }
}

async function addTab(cwd?: string) {
  const tab = newTab(cwd ?? activeTab.value?.cwd ?? 'D:\\')
  tabs.value.push(tab)
  activeTabId.value = tab.id
  await initPty(tab)
  nextTick(() => inputEl.value?.focus())
}

function closeTab(id: number) {
  const idx = tabs.value.findIndex(t => t.id === id)
  if (idx < 0) return
  tabs.value.splice(idx, 1)
  if (activeTabId.value === id) {
    activeTabId.value = tabs.value[Math.max(0, idx - 1)]?.id ?? tabs.value[0]?.id
  }
}

function renameTab(tab: Tab) {
  const input = prompt('工作目录', tab.cwd)
  if (input) { tab.cwd = input; sendCmd(tab, `cd /d "${input}"`) }
}

function shortPath(cwd: string) {
  const parts = cwd.replace(/\\/g, '/').split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : cwd
}

// ── PTY ──────────────────────────────────────────────────────
async function initPty(tab: Tab) {
  try {
    const result = await window.electronAPI.terminalCreate({ boxId: `tab-${tab.id}`, cwd: tab.cwd })
    tab.ptyId = result?.ptyId ?? null

    // 监听终端输出
    window.electronAPI.on('terminal:data', (ptyId: string, data: string) => {
      if (ptyId !== tab.ptyId) return
      // 把原始输出按换行拆分写入
      const cleaned = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      cleaned.split('\n').forEach(line => {
        if (line) addLine(tab, line, 'output')
      })
      scrollBottom()
    })

    window.electronAPI.on('terminal:exit', (ptyId: string) => {
      if (ptyId !== tab.ptyId) return
      addLine(tab, '[进程已退出]', 'system')
      tab.status = 'idle'
    })
  } catch (e) {
    addLine(tab, `[PTY 初始化失败: ${e}]`, 'error')
  }
}

// ── 命令执行 ──────────────────────────────────────────────────
async function sendCmd(tab: Tab, cmd: string) {
  tab.status = 'running'
  try {
    if (tab.ptyId) {
      await window.electronAPI.terminalInput({ ptyId: tab.ptyId, data: cmd + '\r' })
    }
  } catch {
    tab.status = 'error'
    return
  }
  tab.status = 'idle'
}

// ── AI 模式 ───────────────────────────────────────────────────
const aiMode       = ref(false)
const isStreaming   = ref(false)
const streamBuf    = ref('')
const aiTargetTabId = ref<number | null>(null)

function toggleAiMode() {
  aiMode.value = !aiMode.value
  nextTick(() => inputEl.value?.focus())
}

async function sendAi(prompt: string) {
  if (!currentCc.value) {
    addLine(activeTab.value!, '❌ 请先选择 CC Switch provider', 'error')
    return
  }
  const tab = activeTab.value!
  addLine(tab, `❯ [AI] ${prompt}`, 'ai-query')
  aiTargetTabId.value = tab.id
  isStreaming.value   = true
  streamBuf.value     = ''

  const sessionId = `s${Date.now()}`
  let full        = ''

  const onChunk = (sid: string, chunk: string) => {
    if (sid !== sessionId) return
    full         += chunk
    streamBuf.value = full
    scrollBottom()
  }
  const onDone  = (sid: string, text: string) => {
    if (sid !== sessionId) return
    cleanup()
    streamBuf.value = ''
    isStreaming.value = false
    // 按行写入
    ;(text || full).split('\n').forEach(l => addLine(tab, l, 'ai-response'))
    addLine(tab, '', 'ai-response')
    scrollBottom()
  }
  const onError = (sid: string, err: string) => {
    if (sid !== sessionId) return
    cleanup()
    streamBuf.value = ''
    isStreaming.value = false
    addLine(tab, `❌ ${err}`, 'error')
  }
  function cleanup() {
    window.electronAPI.off('ai:stream-chunk', onChunk)
    window.electronAPI.off('ai:stream-done',  onDone)
    window.electronAPI.off('ai:stream-error', onError)
  }

  window.electronAPI.on('ai:stream-chunk', onChunk)
  window.electronAPI.on('ai:stream-done',  onDone)
  window.electronAPI.on('ai:stream-error', onError)
  await window.electronAPI.aiChatStream({ sessionId, messages: [{ role: 'user', content: prompt }] })
}

function stopAi() {
  if (streamBuf.value) {
    addLine(activeTab.value!, streamBuf.value + '\n[已停止]', 'ai-response')
  }
  streamBuf.value = ''
  isStreaming.value = false
}

// ── 输入处理 ──────────────────────────────────────────────────
const inputText = ref('')
const inputEl   = ref<HTMLInputElement>()

async function onEnter() {
  const text = inputText.value.trim()
  if (!text) return
  inputText.value = ''

  const tab = activeTab.value
  if (!tab) return

  if (aiMode.value) {
    await sendAi(text)
  } else {
    tab.hist.unshift(text)
    tab.histIdx = -1
    addLine(tab, `❯ ${text}`, 'cmd')
    await sendCmd(tab, text)
  }
  scrollBottom()
}

function histUp() {
  const tab = activeTab.value
  if (!tab || !tab.hist.length) return
  tab.histIdx = Math.min(tab.histIdx + 1, tab.hist.length - 1)
  inputText.value = tab.hist[tab.histIdx]
}
function histDown() {
  const tab = activeTab.value
  if (!tab) return
  if (tab.histIdx <= 0) { tab.histIdx = -1; inputText.value = ''; return }
  tab.histIdx--
  inputText.value = tab.hist[tab.histIdx]
}

// ── 预设 ─────────────────────────────────────────────────────
const presets         = ref<Preset[]>([])
const showPresetDialog = ref(false)
const presetName      = ref('')

function loadPresets() {
  try { presets.value = JSON.parse(localStorage.getItem('cmd-presets') ?? '[]') } catch {}
}
function savePresets() {
  localStorage.setItem('cmd-presets', JSON.stringify(presets.value))
}
function saveCurrentAsPreset() {
  presetName.value  = ''
  showPresetDialog.value = true
}
function confirmSavePreset() {
  const name = presetName.value.trim()
  if (!name) return
  const preset: Preset = { name, tabs: tabs.value.map(t => ({ cwd: t.cwd })) }
  const idx = presets.value.findIndex(p => p.name === name)
  if (idx >= 0) presets.value[idx] = preset
  else presets.value.unshift(preset)
  savePresets()
  showPresetDialog.value = false
}
async function applyPreset(preset: Preset) {
  // 关闭所有现有标签，按预设打开
  tabs.value = []
  tabCounter = 1
  for (const cfg of preset.tabs) {
    await addTab(cfg.cwd)
  }
}

// ── 工具函数 ─────────────────────────────────────────────────
const outputEl = ref<HTMLDivElement>()

function addLine(tab: Tab, text: string, type: TermLine['type']) {
  tab.lines.push({ text, type })
  if (tab.lines.length > 2000) tab.lines.splice(0, 200)
}

function scrollBottom() {
  nextTick(() => {
    if (outputEl.value) outputEl.value.scrollTop = outputEl.value.scrollHeight
  })
}

watch(activeTabId, () => scrollBottom())

// ── 初始化 ───────────────────────────────────────────────────
onMounted(async () => {
  loadPresets()
  await loadCc()
  await addTab('D:\\')
  inputEl.value?.focus()
})
</script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: #0d0d16;
  color: #cdd6f4;
  font-family: 'Segoe UI', system-ui, sans-serif;
  height: 100vh;
  overflow: hidden;
}
</style>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #0d0d16;
  overflow: hidden;
}

/* ── 顶栏 ───────────────────────────────────────────────── */
.topbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  height: 40px;
  background: #11111b;
  border-bottom: 1px solid #1e1e2e;
  flex-shrink: 0;
  -webkit-app-region: drag;
}
.topbar > * { -webkit-app-region: no-drag; }
.topbar-spacer { flex: 1; }

.preset-area { display: flex; align-items: center; gap: 4px; }
.preset-btn {
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 11px;
  cursor: pointer;
  border: 1px solid #7c6af733;
  background: #1a1a2e;
  color: #a78bfa;
  white-space: nowrap;
  transition: all 0.12s;
}
.preset-btn:hover  { border-color: #7c6af7; background: #2d2b55; }
.preset-btn.ghost  { border-style: dashed; color: #6c7086; border-color: #45475a; background: transparent; }
.preset-btn.ghost:hover { color: #cdd6f4; }

/* CC Switch */
.cc-area { display: flex; align-items: center; gap: 5px; }
.cc-label { font-size: 11px; color: #45475a; padding-right: 2px; }
.cc-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 11px;
  cursor: pointer;
  border: 1px solid #313244;
  background: #1e1e2e;
  color: #6c7086;
  transition: all 0.12s;
  white-space: nowrap;
}
.cc-chip:hover { color: #cdd6f4; border-color: #45475a; }
.cc-chip.active { color: #89b4fa; border-color: #89b4fa44; background: #1e2d4a; }
.cc-dot { width: 6px; height: 6px; border-radius: 50%; background: #45475a; flex-shrink: 0; }
.cc-dot.on { background: #89b4fa; box-shadow: 0 0 5px #89b4fa; }
.icon-btn {
  background: none; border: none; color: #585b70;
  font-size: 15px; cursor: pointer; padding: 3px 5px;
  border-radius: 4px; transition: color 0.1s;
}
.icon-btn:hover { color: #cdd6f4; }

/* ── 标签栏 ─────────────────────────────────────────────── */
.tabbar {
  display: flex;
  align-items: stretch;
  background: #11111b;
  border-bottom: 1px solid #1e1e2e;
  flex-shrink: 0;
  overflow-x: auto;
}
.tabbar::-webkit-scrollbar { height: 2px; }
.tabbar::-webkit-scrollbar-thumb { background: #313244; }

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 12px;
  cursor: pointer;
  border: none;
  border-right: 1px solid #1e1e2e;
  background: transparent;
  color: #585b70;
  white-space: nowrap;
  transition: background 0.1s, color 0.1s;
  min-width: 80px;
  position: relative;
}
.tab:hover  { background: #1e1e2e; color: #cdd6f4; }
.tab.active { background: #0d0d16; color: #cdd6f4; border-bottom: 2px solid #89b4fa; }

.tab-cwd   { max-width: 120px; overflow: hidden; text-overflow: ellipsis; font-family: monospace; }
.tab-status { width: 5px; height: 5px; border-radius: 50%; background: #45475a; flex-shrink: 0; }
.tab-status.running { background: #a6e3a1; box-shadow: 0 0 4px #a6e3a1; }
.tab-status.error   { background: #f38ba8; }
.tab-close {
  background: none; border: none; color: #45475a; cursor: pointer;
  font-size: 13px; padding: 0 2px; border-radius: 2px; line-height: 1;
  transition: color 0.1s; flex-shrink: 0;
}
.tab-close:hover { color: #f38ba8; }

.tab-add {
  padding: 0 14px;
  background: none;
  border: none;
  color: #45475a;
  font-size: 18px;
  cursor: pointer;
  transition: color 0.1s;
  flex-shrink: 0;
}
.tab-add:hover { color: #89b4fa; }

/* ── 终端输出 ────────────────────────────────────────────── */
.terminal-output {
  flex: 1;
  overflow-y: auto;
  padding: 10px 14px;
  font-family: 'Consolas', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 13px;
  line-height: 1.6;
  min-height: 0;
  background: #0d0d16;
}
.terminal-output::-webkit-scrollbar { width: 4px; }
.terminal-output::-webkit-scrollbar-thumb { background: #1e1e2e; border-radius: 2px; }

.line { margin: 0; white-space: pre-wrap; word-break: break-all; }
.line.cmd         { color: #a6e3a1; }
.line.output      { color: #cdd6f4; }
.line.error       { color: #f38ba8; }
.line.system      { color: #45475a; font-style: italic; }
.line.ai-query    { color: #89b4fa; margin-top: 6px; font-weight: 600; }
.line.ai-response { color: #cba6f7; padding-left: 14px; border-left: 2px solid #7c6af722; }
.line.ai-stream   { color: #cba6f7; font-style: italic; }

.cursor { animation: blink 0.8s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }

/* ── 输入栏 ─────────────────────────────────────────────── */
.inputbar {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 12px;
  background: #11111b;
  border-top: 1px solid #1e1e2e;
  flex-shrink: 0;
  transition: background 0.15s, border-top-color 0.15s;
}
.inputbar.ai-active {
  background: #160f2a;
  border-top-color: #7c6af744;
}

.mode-btn {
  width: 30px; height: 24px;
  border-radius: 6px;
  border: 1px solid #313244;
  background: #1e1e2e;
  color: #6c7086;
  font-size: 12px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: all 0.12s;
  padding: 0;
}
.mode-btn:hover { border-color: #585b70; color: #cdd6f4; }
.mode-btn.active { background: #2d1b50; border-color: #7c6af744; color: #cba6f7; }

.cmd-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #cdd6f4;
  font-size: 13px;
  font-family: 'Consolas', 'Fira Code', monospace;
  min-width: 0;
}
.ai-active .cmd-input { color: #cba6f7; }
.cmd-input::placeholder { color: #313244; }

.action-btn {
  padding: 3px 10px;
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid;
  transition: all 0.12s;
  flex-shrink: 0;
}
.action-btn.stop { border-color: #f38ba844; background: #2a1520; color: #f38ba8; }
.action-btn.stop:hover { background: #3a1a28; border-color: #f38ba8; }

.input-hint { font-size: 10px; color: #313244; flex-shrink: 0; }

/* ── 弹窗 ───────────────────────────────────────────────── */
.dialog-mask {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.65);
  z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}
.dialog {
  background: #1e1e2e;
  border: 1px solid #7c6af7;
  border-radius: 12px;
  padding: 20px 24px;
  width: 400px;
  max-width: 95vw;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.6);
}
.dialog-title { font-size: 14px; font-weight: 700; color: #cdd6f4; }
.dialog-label { font-size: 11px; color: #89b4fa; font-weight: 600; }
.dialog-row { display: flex; align-items: center; gap: 8px; }
.dialog-input {
  width: 100%;
  background: #11111b;
  border: 1px solid #313244;
  border-radius: 6px;
  color: #cdd6f4;
  font-size: 13px;
  padding: 7px 10px;
  outline: none;
  font-family: monospace;
  transition: border-color 0.12s;
}
.dialog-input.small { font-size: 12px; }
.dialog-input:focus { border-color: #7c6af7; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.dialog-btn {
  padding: 6px 18px; border-radius: 6px; font-size: 13px; cursor: pointer; transition: all 0.12s;
  border: 1px solid #45475a; background: transparent; color: #6c7086;
}
.dialog-btn:hover { color: #cdd6f4; border-color: #585b70; }
.dialog-btn.primary { background: #2d2b55; border-color: #7c6af7; color: #a78bfa; }
.dialog-btn.primary:hover { background: #3d3b6f; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>