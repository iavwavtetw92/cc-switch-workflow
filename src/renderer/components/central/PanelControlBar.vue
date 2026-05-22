<template>
  <div class="pcb">
    <!-- 面板状态 chips -->
    <div class="pcb-panels">
      <button
        v-for="p in panelStore.panels"
        :key="p.id"
        :class="['panel-chip', p.status, { 'is-active': panelStore.focusedPanelId === p.id, 'is-hidden': !p.visible }]"
        :title="`点击聚焦 · 右键切换显隐\n目录: ${p.cwd ?? '—'}\n状态: ${STATUS_TEXT[p.status]}`"
        @click="panelStore.setFocused(p.id)"
        @contextmenu.prevent="panelStore.toggleVisible(p.id)"
      >
        <span class="chip-dot"></span>
        <span class="chip-label">{{ p.label }}</span>
      </button>
    </div>

    <div class="pcb-divider"></div>

    <!-- 工作区预设 -->
    <div class="pcb-presets">
      <button
        v-for="preset in presets"
        :key="preset.name"
        class="preset-chip"
        :title="`一键恢复工作区: ${preset.name}\n${presetDesc(preset)}`"
        @click="applyPreset(preset)"
        @contextmenu.prevent="deletePreset(preset.name)"
      >
        ⚡ {{ preset.name }}
      </button>

      <!-- 保存当前工作区 -->
      <button class="preset-save-btn" title="保存当前工作区为预设" @click="showSaveDialog = true">
        + 保存
      </button>
    </div>

    <div class="pcb-divider"></div>

    <!-- 命令发送区 -->
    <div class="pcb-cmd">
      <!-- 目标面板选择 -->
      <select v-model="targetPanelId" class="pcb-target-sel">
        <option value="__all__">全部工作框</option>
        <option
          v-for="p in panelStore.workboxPanels"
          :key="p.id"
          :value="p.id"
        >{{ p.label }}</option>
      </select>

      <!-- 命令输入 -->
      <input
        v-model="cmdInput"
        class="pcb-cmd-input"
        type="text"
        placeholder="发送命令到目标面板…"
        @keydown.enter="sendCmd"
      />

      <button class="pcb-send-btn" :disabled="!cmdInput.trim()" @click="sendCmd">
        发送
      </button>
    </div>

    <!-- 保存预设弹窗 -->
    <Transition name="dialog-fade">
      <div v-if="showSaveDialog" class="save-dialog-backdrop" @click.self="showSaveDialog = false">
        <div class="save-dialog">
          <div class="sd-title">保存工作区预设</div>
          <div class="sd-desc">将保存各工作框当前目录与初始命令</div>

          <label class="sd-label">预设名称</label>
          <input
            v-model="presetName"
            class="sd-input"
            placeholder="如：KMS 项目、前端开发…"
            @keydown.enter="savePreset"
            ref="presetNameInput"
          />

          <!-- 各工作框配置 -->
          <div v-for="p in panelStore.workboxPanels" :key="p.id" class="sd-panel-row">
            <span class="sd-panel-label">{{ p.label }}</span>
            <input
              v-model="presetCwds[p.id]"
              class="sd-input sd-cwd"
              :placeholder="`目录 (当前: ${p.cwd ?? 'D:\\'})`"
            />
            <input
              v-model="presetInitCmds[p.id]"
              class="sd-input sd-cmd"
              placeholder="初始命令 (可选, 如: git status)"
            />
          </div>

          <div class="sd-actions">
            <button class="sd-btn cancel" @click="showSaveDialog = false">取消</button>
            <button class="sd-btn confirm" :disabled="!presetName.trim()" @click="savePreset">保存</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, nextTick } from 'vue'
import { usePanelStore } from '../../stores/panelStore'

const STATUS_TEXT = { idle: '空闲', running: '运行中', error: '错误' } as const

const panelStore = usePanelStore()

// ── 命令发送 ─────────────────────────────────────────────────
const targetPanelId = ref<string>('__all__')
const cmdInput      = ref('')

function sendCmd() {
  const cmd = cmdInput.value.trim()
  if (!cmd) return

  if (targetPanelId.value === '__all__') {
    panelStore.broadcastToWorkboxes({ type: 'command', content: cmd, source: 'control-bar' })
  } else {
    panelStore.sendToPanel(targetPanelId.value, { type: 'command', content: cmd, source: 'control-bar' })
  }
  cmdInput.value = ''
}

// ── 工作区预设 ────────────────────────────────────────────────
interface WorkspacePreset {
  name:     string
  panels:   Array<{ id: string; cwd: string; initCmd?: string }>
  savedAt:  number
}

const presets       = ref<WorkspacePreset[]>([])
const showSaveDialog = ref(false)
const presetName    = ref('')
const presetCwds    = reactive<Record<string, string>>({})
const presetInitCmds = reactive<Record<string, string>>({})
const presetNameInput = ref<HTMLInputElement>()

onMounted(() => {
  loadPresets()
  // 初始化各工作框预设输入为当前目录
  panelStore.workboxPanels.forEach(p => {
    presetCwds[p.id]    = p.cwd ?? 'D:\\'
    presetInitCmds[p.id] = ''
  })
})

function loadPresets() {
  try {
    const raw = localStorage.getItem('workspace-presets')
    presets.value = raw ? JSON.parse(raw) : []
  } catch {
    presets.value = []
  }
}

function savePresets() {
  localStorage.setItem('workspace-presets', JSON.stringify(presets.value))
}

function presetDesc(p: WorkspacePreset): string {
  return p.panels.map(pp => `${pp.id}: ${pp.cwd}${pp.initCmd ? ` → ${pp.initCmd}` : ''}`).join('\n')
}

function savePreset() {
  const name = presetName.value.trim()
  if (!name) return

  const preset: WorkspacePreset = {
    name,
    savedAt: Date.now(),
    panels: panelStore.workboxPanels.map(p => ({
      id:      p.id,
      cwd:     presetCwds[p.id] || p.cwd || 'D:\\',
      initCmd: presetInitCmds[p.id]?.trim() || undefined,
    })),
  }

  // 同名预设覆盖
  const idx = presets.value.findIndex(p => p.name === name)
  if (idx >= 0) presets.value[idx] = preset
  else presets.value.unshift(preset)

  savePresets()
  presetName.value = ''
  showSaveDialog.value = false
}

async function applyPreset(preset: WorkspacePreset) {
  for (const cfg of preset.panels) {
    // 更新 panelStore 中的 cwd
    panelStore.setCwd(cfg.id, cfg.cwd)

    // 发送 cd 命令
    panelStore.sendToPanel(cfg.id, {
      type:    'command',
      content: `cd /d "${cfg.cwd}"`,
      source:  `preset:${preset.name}`,
    })

    // 如果有初始命令，延迟 300ms 再发（等 cd 完成）
    if (cfg.initCmd) {
      await new Promise(r => setTimeout(r, 300))
      panelStore.sendToPanel(cfg.id, {
        type:    'command',
        content: cfg.initCmd,
        source:  `preset:${preset.name}`,
      })
    }
  }
}

function deletePreset(name: string) {
  presets.value = presets.value.filter(p => p.name !== name)
  savePresets()
}

// 打开弹窗时自动聚焦输入框
import { watch } from 'vue'
watch(showSaveDialog, async (v) => {
  if (v) {
    // 刷新当前目录到输入框
    panelStore.workboxPanels.forEach(p => {
      presetCwds[p.id] = p.cwd ?? 'D:\\'
    })
    await nextTick()
    presetNameInput.value?.focus()
  }
})
</script>

<style scoped>
.pcb {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 4px 10px;
  background: #13131f;
  border-bottom: 1px solid #2d2b55;
  font-size: 12px;
  flex-wrap: wrap;
  row-gap: 4px;
}

/* ── 面板状态 chips ──────────────────────────────────────── */
.pcb-panels {
  display: flex;
  align-items: center;
  gap: 4px;
}

.panel-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 12px;
  font-size: 11px;
  cursor: pointer;
  border: 1px solid transparent;
  background: #1e1e2e;
  color: #585b70;
  transition: all 0.12s;
  white-space: nowrap;
}
.panel-chip:hover { color: #cdd6f4; border-color: #45475a; }
.panel-chip.is-active { color: #89b4fa; border-color: #89b4fa44; background: #1e3a5f; }
.panel-chip.is-hidden { opacity: 0.35; text-decoration: line-through; }

.chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #585b70;
  flex-shrink: 0;
  transition: background 0.12s;
}
.panel-chip.running .chip-dot { background: #a6e3a1; box-shadow: 0 0 4px #a6e3a1; }
.panel-chip.error   .chip-dot { background: #f38ba8; }
.panel-chip.idle    .chip-dot { background: #45475a; }
.panel-chip.is-active .chip-dot { background: #89b4fa; }

.chip-label { font-weight: 500; }

/* ── 分隔线 ─────────────────────────────────────────────── */
.pcb-divider {
  width: 1px;
  height: 18px;
  background: #2d2b55;
  margin: 0 8px;
  flex-shrink: 0;
}

/* ── 工作区预设 ─────────────────────────────────────────── */
.pcb-presets {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
  overflow-x: auto;
  max-width: 320px;
}

.preset-chip {
  padding: 3px 9px;
  border-radius: 12px;
  font-size: 11px;
  cursor: pointer;
  border: 1px solid #7c6af733;
  background: #1a1a2e;
  color: #a78bfa;
  white-space: nowrap;
  transition: all 0.12s;
  flex-shrink: 0;
}
.preset-chip:hover { border-color: #7c6af7; background: #2d2b55; }

.preset-save-btn {
  padding: 3px 9px;
  border-radius: 12px;
  font-size: 11px;
  cursor: pointer;
  border: 1px dashed #45475a;
  background: transparent;
  color: #6c7086;
  white-space: nowrap;
  transition: all 0.12s;
  flex-shrink: 0;
}
.preset-save-btn:hover { color: #cdd6f4; border-color: #585b70; }

/* ── 命令发送区 ─────────────────────────────────────────── */
.pcb-cmd {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
  min-width: 240px;
}

.pcb-target-sel {
  background: #1e1e2e;
  border: 1px solid #313244;
  border-radius: 5px;
  color: #cdd6f4;
  font-size: 11px;
  padding: 3px 6px;
  cursor: pointer;
  outline: none;
  flex-shrink: 0;
}
.pcb-target-sel:focus { border-color: #89b4fa; }

.pcb-cmd-input {
  flex: 1;
  background: #1e1e2e;
  border: 1px solid #313244;
  border-radius: 5px;
  color: #cdd6f4;
  font-size: 12px;
  padding: 3px 8px;
  outline: none;
  font-family: 'Consolas', monospace;
  min-width: 0;
}
.pcb-cmd-input:focus { border-color: #89b4fa; }
.pcb-cmd-input::placeholder { color: #45475a; }

.pcb-send-btn {
  padding: 3px 12px;
  background: #1e3a5f;
  border: 1px solid #89b4fa44;
  border-radius: 5px;
  color: #89b4fa;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.12s;
  flex-shrink: 0;
}
.pcb-send-btn:hover:not(:disabled) { background: #264f7d; border-color: #89b4fa; }
.pcb-send-btn:disabled { opacity: 0.4; cursor: default; }

/* ── 保存预设弹窗 ───────────────────────────────────────── */
.save-dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.save-dialog {
  background: #1e1e2e;
  border: 1px solid #7c6af7;
  border-radius: 12px;
  padding: 20px 24px;
  width: 460px;
  max-width: 95vw;
  box-shadow: 0 16px 48px rgba(0,0,0,0.6);
}

.sd-title {
  font-size: 15px;
  font-weight: 700;
  color: #cdd6f4;
  margin-bottom: 4px;
}

.sd-desc {
  font-size: 12px;
  color: #6c7086;
  margin-bottom: 14px;
}

.sd-label {
  display: block;
  font-size: 11px;
  color: #a78bfa;
  margin-bottom: 5px;
  font-weight: 600;
}

.sd-input {
  width: 100%;
  background: #11111b;
  border: 1px solid #313244;
  border-radius: 6px;
  color: #cdd6f4;
  font-size: 13px;
  padding: 7px 10px;
  outline: none;
  box-sizing: border-box;
  margin-bottom: 10px;
  font-family: inherit;
  transition: border-color 0.12s;
}
.sd-input:focus { border-color: #7c6af7; }

.sd-panel-row {
  background: #13131f;
  border: 1px solid #2d2b55;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
}

.sd-panel-label {
  display: block;
  font-size: 11px;
  color: #89b4fa;
  font-weight: 600;
  margin-bottom: 6px;
}

.sd-cwd { margin-bottom: 6px; font-family: monospace; }
.sd-cmd { margin-bottom: 0; font-family: monospace; color: #a6e3a1; }

.sd-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.sd-btn {
  padding: 7px 20px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.12s;
}
.sd-btn.cancel {
  background: transparent;
  border: 1px solid #45475a;
  color: #6c7086;
}
.sd-btn.cancel:hover { border-color: #585b70; color: #cdd6f4; }
.sd-btn.confirm {
  background: #2d2b55;
  border: 1px solid #7c6af7;
  color: #a78bfa;
}
.sd-btn.confirm:hover:not(:disabled) { background: #3d3b6f; }
.sd-btn.confirm:disabled { opacity: 0.4; cursor: default; }

/* ── 弹窗过渡 ───────────────────────────────────────────── */
.dialog-fade-enter-active,
.dialog-fade-leave-active { transition: opacity 0.15s; }
.dialog-fade-enter-from,
.dialog-fade-leave-to { opacity: 0; }
</style>
