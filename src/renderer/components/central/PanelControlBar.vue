<template>
  <div class="pcb">

    <!-- ══ 第一行：工作框状态监控 + 快捷命令 ══════════════════ -->
    <div class="pcb-main">

      <!-- 工作框状态 chips -->
      <div class="panel-chips">
        <button
          v-for="p in panelStore.panels"
          :key="p.id"
          :class="['chip', p.status, { active: panelStore.focusedPanelId === p.id, hidden: !p.visible }]"
          :title="`点击聚焦 · 右键显隐\n目录: ${p.cwd}\n状态: ${STATUS_ZH[p.status]}`"
          @click="panelStore.setFocused(p.id)"
          @contextmenu.prevent="panelStore.toggleVisible(p.id)"
        >
          <span class="chip-dot"></span>
          <span class="chip-label">{{ p.label }}</span>
          <span class="chip-cwd">{{ shortPath(p.cwd) }}</span>
        </button>

        <!-- 增减工作框 -->
        <button class="chip-add" title="新增工作框" @click="addPanel" v-if="panelStore.panels.length < 4">+</button>
        <button class="chip-add remove" title="移除最后一个工作框" @click="removePanel" v-if="panelStore.panels.length > 1">−</button>
      </div>

      <div class="sep"></div>

      <!-- 快捷命令发送 -->
      <div class="cmd-area">
        <select v-model="targetId" class="target-sel">
          <option value="__all__">全部</option>
          <option v-for="p in panelStore.panels" :key="p.id" :value="p.id">{{ p.label }}</option>
        </select>
        <input
          v-model="cmdText"
          class="cmd-input"
          placeholder="发送命令到工作框…"
          @keydown.enter="sendCmd"
        />
        <button class="cmd-btn" :disabled="!cmdText.trim()" @click="sendCmd">↵ 发送</button>
      </div>

      <div class="sep"></div>

      <!-- 工作区预设 -->
      <div class="preset-area">
        <button
          v-for="pr in presets"
          :key="pr.name"
          class="preset-chip"
          :title="`恢复工作区: ${pr.name}\n右键删除`"
          @click="applyPreset(pr)"
          @contextmenu.prevent="deletePreset(pr.name)"
        >⚡ {{ pr.name }}</button>
        <button class="preset-save" @click="openSave">+ 保存</button>
      </div>

      <div class="sep"></div>

      <!-- CC Switch 状态 + 快切 -->
      <div class="cc-area">
        <span class="cc-label">CC</span>
        <button
          v-for="p in ccProviders"
          :key="p.id"
          :class="['cc-chip', { active: currentCc?.id === p.id }]"
          :title="p.baseUrl ?? p.id"
          @click="switchCc(p)"
        >
          <span class="cc-dot" :class="{ on: currentCc?.id === p.id }"></span>
          {{ p.name }}
        </button>
        <button v-if="!ccProviders.length" class="cc-chip dim" @click="loadCc">未连接 ↻</button>
        <button class="icon-btn" @click="loadCc" title="刷新">↻</button>
      </div>

    </div>

    <!-- ══ 保存预设弹窗 ══════════════════════════════════════ -->
    <Transition name="fade">
      <div v-if="showSave" class="dialog-mask" @click.self="showSave = false">
        <div class="dialog">
          <div class="dialog-title">保存工作区预设</div>
          <input
            v-model="presetName"
            class="dialog-input"
            placeholder="预设名称，如：KMS 项目"
            ref="nameInputEl"
            @keydown.enter="confirmSave"
          />
          <div v-for="p in panelStore.panels" :key="p.id" class="dialog-row">
            <span class="dialog-panel-label">{{ p.label }}</span>
            <input v-model="draftCwds[p.id]" class="dialog-input sm" :placeholder="`目录 (当前: ${p.cwd})`" />
            <input v-model="draftInitCmds[p.id]" class="dialog-input sm cmd" placeholder="初始命令（可选）" />
          </div>
          <div class="dialog-actions">
            <button class="dialog-btn" @click="showSave = false">取消</button>
            <button class="dialog-btn primary" :disabled="!presetName.trim()" @click="confirmSave">保存</button>
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, nextTick, onMounted } from 'vue'
import { usePanelStore } from '../../stores/panelStore'
import type { PanelId, PanelMeta } from '../../stores/panelStore'

const STATUS_ZH = { idle: '空闲', running: '运行中', error: '错误' } as const

const panelStore = usePanelStore()

// ── CC Switch ────────────────────────────────────────────────
interface CcProvider { id: string; name: string; isActive: boolean; baseUrl?: string }
const ccProviders = ref<CcProvider[]>([])
const currentCc   = ref<CcProvider | null>(null)

async function loadCc() {
  try {
    const [all, cur] = await Promise.all([
      window.electronAPI.ccSwitchProviders(),
      window.electronAPI.ccSwitchCurrent(),
    ])
    ccProviders.value = all ?? []
    currentCc.value   = cur ?? ccProviders.value.find(p => p.isActive) ?? null
  } catch {}
}

async function switchCc(p: CcProvider) {
  try {
    await window.electronAPI.ccSwitchSwitch({ providerId: p.id })
    currentCc.value = p
  } catch (e) { console.error('[CC] switch failed', e) }
}

onMounted(loadCc)

// ── 快捷命令 ────────────────────────────────────────────────
const targetId = ref<string>('__all__')
const cmdText  = ref('')

function sendCmd() {
  const cmd = cmdText.value.trim()
  if (!cmd) return
  if (targetId.value === '__all__') {
    panelStore.broadcastToWorkboxes({ type: 'command', content: cmd, source: 'control' })
  } else {
    panelStore.sendToPanel(targetId.value, { type: 'command', content: cmd, source: 'control' })
  }
  cmdText.value = ''
}

// ── 工作框增减 ───────────────────────────────────────────────
const PANEL_IDS: PanelId[] = ['workbox1', 'workbox2', 'workbox3', 'workbox4']

function addPanel() {
  const used = new Set(panelStore.panels.map(p => p.id))
  const next  = PANEL_IDS.find(id => !used.has(id))
  if (!next) return
  const n = panelStore.panels.length + 1
  panelStore.panels.push({ id: next, label: `工作框 ${n}`, visible: true, status: 'idle', cwd: 'D:\\' })
}

function removePanel() {
  if (panelStore.panels.length <= 1) return
  const removed = panelStore.panels.pop()
  if (removed && panelStore.focusedPanelId === removed.id) {
    panelStore.focusedPanelId = panelStore.panels[panelStore.panels.length - 1].id
  }
}

// ── 工作区预设 ───────────────────────────────────────────────
interface Preset {
  name:    string
  panels:  Array<{ id: string; cwd: string; initCmd?: string }>
  savedAt: number
}

const presets  = ref<Preset[]>([])
const showSave = ref(false)
const presetName = ref('')
const draftCwds    = reactive<Record<string, string>>({})
const draftInitCmds = reactive<Record<string, string>>({})
const nameInputEl = ref<HTMLInputElement>()

function loadPresets() {
  try { presets.value = JSON.parse(localStorage.getItem('wb-presets') ?? '[]') } catch {}
}
function savePresets() {
  localStorage.setItem('wb-presets', JSON.stringify(presets.value))
}

function openSave() {
  presetName.value = ''
  panelStore.panels.forEach(p => {
    draftCwds[p.id]    = p.cwd
    draftInitCmds[p.id] = ''
  })
  showSave.value = true
  nextTick(() => nameInputEl.value?.focus())
}

function confirmSave() {
  const name = presetName.value.trim()
  if (!name) return
  const preset: Preset = {
    name,
    savedAt: Date.now(),
    panels:  panelStore.panels.map(p => ({
      id:      p.id,
      cwd:     draftCwds[p.id] || p.cwd,
      initCmd: draftInitCmds[p.id]?.trim() || undefined,
    })),
  }
  const idx = presets.value.findIndex(p => p.name === name)
  if (idx >= 0) presets.value[idx] = preset
  else presets.value.unshift(preset)
  savePresets()
  showSave.value = false
}

async function applyPreset(pr: Preset) {
  for (const cfg of pr.panels) {
    panelStore.setCwd(cfg.id, cfg.cwd)
    panelStore.sendToPanel(cfg.id, { type: 'command', content: `cd /d "${cfg.cwd}"`, source: `preset:${pr.name}` })
    if (cfg.initCmd) {
      await new Promise(r => setTimeout(r, 350))
      panelStore.sendToPanel(cfg.id, { type: 'command', content: cfg.initCmd, source: `preset:${pr.name}` })
    }
  }
}

function deletePreset(name: string) {
  presets.value = presets.value.filter(p => p.name !== name)
  savePresets()
}

// ── 工具 ────────────────────────────────────────────────────
function shortPath(cwd: string) {
  const parts = (cwd ?? '').replace(/\\/g, '/').split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : cwd
}

onMounted(loadPresets)
</script>

<style scoped>
.pcb {
  background: #11111b;
  border-bottom: 1px solid #1e1e2e;
  flex-shrink: 0;
}

/* ── 主行 ───────────────────────────────────────────────── */
.pcb-main {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 5px 10px;
  flex-wrap: wrap;
  row-gap: 4px;
  min-height: 38px;
}

.sep {
  width: 1px; height: 18px;
  background: #1e1e2e;
  margin: 0 8px;
  flex-shrink: 0;
}

/* ── 工作框状态 chips ────────────────────────────────────── */
.panel-chips {
  display: flex;
  align-items: center;
  gap: 4px;
}

.chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 16px;
  font-size: 11px;
  cursor: pointer;
  border: 1px solid #1e1e2e;
  background: #1a1a2a;
  color: #585b70;
  transition: all 0.12s;
  white-space: nowrap;
  max-width: 160px;
}
.chip:hover { color: #cdd6f4; border-color: #313244; }
.chip.active { color: #89b4fa; border-color: #89b4fa55; background: #0f1f38; }
.chip.hidden { opacity: 0.35; }

.chip-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #313244; flex-shrink: 0;
  transition: background 0.2s, box-shadow 0.2s;
}
.chip.idle    .chip-dot { background: #313244; }
.chip.running .chip-dot { background: #a6e3a1; box-shadow: 0 0 5px #a6e3a1; }
.chip.error   .chip-dot { background: #f38ba8; }
.chip.active  .chip-dot { background: #89b4fa; box-shadow: 0 0 5px #89b4fa; }

.chip-label { font-weight: 600; flex-shrink: 0; }
.chip-cwd {
  color: #45475a; font-family: monospace; font-size: 10px;
  overflow: hidden; text-overflow: ellipsis; max-width: 70px;
}

.chip-add {
  padding: 3px 8px; border-radius: 12px; font-size: 13px;
  cursor: pointer; border: 1px dashed #313244;
  background: transparent; color: #45475a; transition: all 0.1s;
  line-height: 1;
}
.chip-add:hover { color: #89b4fa; border-color: #89b4fa; }
.chip-add.remove:hover { color: #f38ba8; border-color: #f38ba8; }

/* ── 命令发送 ────────────────────────────────────────────── */
.cmd-area {
  display: flex; align-items: center; gap: 5px; flex: 1; min-width: 200px;
}

.target-sel {
  background: #1a1a2a; border: 1px solid #1e1e2e; border-radius: 6px;
  color: #cdd6f4; font-size: 11px; padding: 3px 6px;
  cursor: pointer; outline: none; flex-shrink: 0;
}
.target-sel:focus { border-color: #89b4fa55; }

.cmd-input {
  flex: 1; min-width: 0;
  background: #1a1a2a; border: 1px solid #1e1e2e; border-radius: 6px;
  color: #cdd6f4; font-size: 12px; padding: 4px 8px; outline: none;
  font-family: 'Consolas', monospace; transition: border-color 0.12s;
}
.cmd-input:focus { border-color: #89b4fa55; }
.cmd-input::placeholder { color: #313244; }

.cmd-btn {
  padding: 4px 12px; border-radius: 6px; font-size: 11px; cursor: pointer;
  border: 1px solid #89b4fa33; background: #0f1f38; color: #89b4fa;
  white-space: nowrap; flex-shrink: 0; transition: all 0.12s;
}
.cmd-btn:hover:not(:disabled) { background: #1a3a6a; border-color: #89b4fa; }
.cmd-btn:disabled { opacity: 0.3; cursor: default; }

/* ── 预设 ────────────────────────────────────────────────── */
.preset-area { display: flex; align-items: center; gap: 4px; flex-wrap: nowrap; }

.preset-chip {
  padding: 3px 10px; border-radius: 12px; font-size: 11px; cursor: pointer;
  border: 1px solid #7c6af733; background: #1a1030; color: #a78bfa;
  white-space: nowrap; transition: all 0.12s;
}
.preset-chip:hover { border-color: #7c6af7; background: #2d1b50; }

.preset-save {
  padding: 3px 10px; border-radius: 12px; font-size: 11px; cursor: pointer;
  border: 1px dashed #313244; background: transparent; color: #45475a;
  white-space: nowrap; transition: all 0.12s;
}
.preset-save:hover { color: #cdd6f4; border-color: #585b70; }

/* ── CC Switch ───────────────────────────────────────────── */
.cc-area { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }

.cc-label { font-size: 10px; color: #45475a; font-weight: 600; letter-spacing: 0.5px; }

.cc-chip {
  display: flex; align-items: center; gap: 5px;
  padding: 3px 10px; border-radius: 12px; font-size: 11px; cursor: pointer;
  border: 1px solid #1e1e2e; background: #1a1a2a; color: #585b70;
  white-space: nowrap; transition: all 0.12s;
}
.cc-chip:hover { color: #cdd6f4; border-color: #313244; }
.cc-chip.active { color: #89b4fa; border-color: #89b4fa55; background: #0f1f38; }
.cc-chip.dim { color: #45475a; font-style: italic; }

.cc-dot { width: 6px; height: 6px; border-radius: 50%; background: #313244; flex-shrink: 0; }
.cc-dot.on { background: #89b4fa; box-shadow: 0 0 5px #89b4fa; }

.icon-btn {
  background: none; border: none; color: #45475a; font-size: 14px;
  cursor: pointer; padding: 2px 4px; border-radius: 3px; transition: color 0.1s;
}
.icon-btn:hover { color: #cdd6f4; }

/* ── 弹窗 ────────────────────────────────────────────────── */
.dialog-mask {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 999;
  display: flex; align-items: center; justify-content: center;
}
.dialog {
  background: #1e1e2e; border: 1px solid #7c6af7; border-radius: 12px;
  padding: 20px 24px; width: 460px; max-width: 95vw;
  display: flex; flex-direction: column; gap: 10px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.6);
}
.dialog-title { font-size: 14px; font-weight: 700; color: #cdd6f4; }
.dialog-panel-label { font-size: 11px; color: #89b4fa; font-weight: 600; white-space: nowrap; flex-shrink: 0; }
.dialog-row { display: flex; align-items: center; gap: 8px; }
.dialog-input {
  width: 100%; background: #11111b; border: 1px solid #313244; border-radius: 6px;
  color: #cdd6f4; font-size: 13px; padding: 7px 10px; outline: none;
  font-family: 'Consolas', monospace; transition: border-color 0.12s; box-sizing: border-box;
}
.dialog-input.sm { font-size: 12px; flex: 1; min-width: 0; }
.dialog-input.cmd { color: #a6e3a1; }
.dialog-input:focus { border-color: #7c6af7; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.dialog-btn {
  padding: 6px 18px; border-radius: 6px; font-size: 13px; cursor: pointer;
  border: 1px solid #313244; background: transparent; color: #6c7086; transition: all 0.12s;
}
.dialog-btn:hover { color: #cdd6f4; border-color: #45475a; }
.dialog-btn.primary { background: #2d1b50; border-color: #7c6af7; color: #a78bfa; }
.dialog-btn.primary:hover:not(:disabled) { background: #3d2b65; }
.dialog-btn.primary:disabled { opacity: 0.4; cursor: default; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
