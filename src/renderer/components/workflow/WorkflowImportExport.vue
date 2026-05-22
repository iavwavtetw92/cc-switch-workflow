<template>
  <!-- WorkflowImportExport — 工作流导入/导出对话框 -->

  <!-- 触发按钮（嵌入使用时的 slot） -->
  <slot :open-import="openImport" :export-workflow="exportWorkflow" />

  <!-- 导入对话框 -->
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="showImport" class="dialog-overlay" @mousedown.self="closeImport">
        <div class="dialog-panel">
          <div class="dialog-header">
            <span class="dialog-title">📥 导入工作流</span>
            <button class="dialog-close" @click="closeImport">✕</button>
          </div>

          <div class="dialog-body">
            <p class="dialog-hint">
              粘贴工作流 JSON，或选择 .json 文件导入
            </p>

            <!-- 文件选择 -->
            <label class="file-pick">
              <input
                ref="fileInput"
                type="file"
                accept=".json,application/json"
                class="file-input-hidden"
                @change="onFileChange"
              />
              <span class="file-pick-btn">📂 选择文件</span>
              <span class="file-pick-name">{{ fileName || '未选择文件' }}</span>
            </label>

            <!-- 或分隔 -->
            <div class="or-divider"><span>或直接粘贴 JSON</span></div>

            <!-- JSON 文本输入 -->
            <textarea
              v-model="jsonText"
              class="json-textarea"
              placeholder='{"id": "my-workflow", "name": "我的工作流", ...}'
              rows="10"
              spellcheck="false"
            />

            <!-- 错误提示 -->
            <div v-if="importError" class="import-error">⚠ {{ importError }}</div>
          </div>

          <div class="dialog-footer">
            <button class="btn-cancel" @click="closeImport">取消</button>
            <button
              class="btn-primary"
              :disabled="!jsonText.trim() || importing"
              @click="doImport"
            >
              {{ importing ? '导入中…' : '确认导入' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- 导出成功提示 -->
  <Teleport to="body">
    <Transition name="toast-fade">
      <div v-if="exportToast" class="export-toast">
        ✓ 已复制到剪贴板
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useWorkflow } from '../../composables/useWorkflow'

const { importWorkflow, exportWorkflow: exportWf } = useWorkflow()

// ── 导入 ─────────────────────────────────────────────────────
const showImport  = ref(false)
const jsonText    = ref('')
const fileName    = ref('')
const importing   = ref(false)
const importError = ref('')
const fileInput   = ref<HTMLInputElement>()

function openImport() {
  showImport.value  = true
  jsonText.value    = ''
  fileName.value    = ''
  importError.value = ''
}

function closeImport() {
  showImport.value = false
}

async function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  fileName.value = file.name
  jsonText.value = await file.text()
  importError.value = ''
}

async function doImport() {
  const json = jsonText.value.trim()
  if (!json) return

  importing.value   = true
  importError.value = ''

  const result = await importWorkflow(json)

  importing.value = false

  if (result.success) {
    closeImport()
  } else {
    importError.value = result.error ?? '导入失败'
  }
}

// ── 导出 ─────────────────────────────────────────────────────
const exportToast = ref(false)

async function exportWorkflow(id: string) {
  try {
    const json = await exportWf(id)
    await navigator.clipboard.writeText(json)
    exportToast.value = true
    setTimeout(() => { exportToast.value = false }, 2000)
  } catch (err) {
    console.error('[WorkflowImportExport] 导出失败:', err)
  }
}

defineExpose({ openImport, exportWorkflow })
</script>

<style scoped>
/* ── 遮罩 ───────────────────────────────────────────────── */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9100;
  backdrop-filter: blur(3px);
}

/* ── 面板 ───────────────────────────────────────────────── */
.dialog-panel {
  width: 560px;
  background: #1e1e2e;
  border: 1px solid #45475a;
  border-radius: 12px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid #313244;
}

.dialog-title {
  font-size: 15px;
  font-weight: 600;
  color: #cdd6f4;
}

.dialog-close {
  background: none;
  border: none;
  color: #6c7086;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 4px;
  transition: color 0.1s, background 0.1s;
}
.dialog-close:hover { color: #f38ba8; background: #313244; }

.dialog-body {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dialog-hint {
  font-size: 13px;
  color: #6c7086;
  margin: 0;
}

/* ── 文件选择 ───────────────────────────────────────────── */
.file-pick {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.file-input-hidden {
  display: none;
}

.file-pick-btn {
  padding: 6px 12px;
  background: #313244;
  border: 1px solid #45475a;
  border-radius: 6px;
  font-size: 13px;
  color: #cdd6f4;
  white-space: nowrap;
  transition: background 0.1s;
}
.file-pick-btn:hover { background: #45475a; }

.file-pick-name {
  font-size: 12px;
  color: #6c7086;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 分隔线 ─────────────────────────────────────────────── */
.or-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: #45475a;
}
.or-divider::before,
.or-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #313244;
}

/* ── Textarea ───────────────────────────────────────────── */
.json-textarea {
  background: #11111b;
  border: 1px solid #313244;
  border-radius: 6px;
  color: #cdd6f4;
  font-family: 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.5;
  padding: 10px 12px;
  resize: vertical;
  outline: none;
  transition: border-color 0.15s;
}
.json-textarea:focus { border-color: #89b4fa; }
.json-textarea::placeholder { color: #45475a; }

.import-error {
  font-size: 12px;
  color: #f38ba8;
  background: #3a1a1a;
  border: 1px solid #f38ba844;
  border-radius: 4px;
  padding: 6px 10px;
}

/* ── Footer ─────────────────────────────────────────────── */
.dialog-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 18px;
  border-top: 1px solid #313244;
}

.btn-cancel {
  padding: 7px 16px;
  background: #313244;
  border: 1px solid #45475a;
  border-radius: 6px;
  color: #cdd6f4;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.1s;
}
.btn-cancel:hover { background: #45475a; }

.btn-primary {
  padding: 7px 20px;
  background: #89b4fa;
  border: none;
  border-radius: 6px;
  color: #11111b;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.1s, opacity 0.1s;
}
.btn-primary:hover:not(:disabled) { background: #b4d0fa; }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── 导出 Toast ─────────────────────────────────────────── */
.export-toast {
  position: fixed;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  background: #a6e3a1;
  color: #11111b;
  padding: 8px 20px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  z-index: 9200;
  pointer-events: none;
}

/* ── 过渡 ───────────────────────────────────────────────── */
.dialog-fade-enter-active,
.dialog-fade-leave-active { transition: all 0.18s; }
.dialog-fade-enter-from,
.dialog-fade-leave-to { opacity: 0; transform: scale(0.96); }

.toast-fade-enter-active,
.toast-fade-leave-active { transition: all 0.25s; }
.toast-fade-enter-from,
.toast-fade-leave-to { opacity: 0; transform: translateX(-50%) translateY(8px); }
</style>
