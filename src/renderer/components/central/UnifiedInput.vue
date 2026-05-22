<template>
  <div class="unified-input-container">
    <!-- 主输入框 -->
    <div class="input-wrapper" :class="modeClass">
      <span class="mode-indicator">{{ modeIcon }}</span>
      <input
        id="unified-command-input"
        ref="inputEl"
        v-model="inputText"
        type="text"
        class="unified-input"
        :placeholder="placeholder"
        autocomplete="off"
        spellcheck="false"
        @keydown.enter.prevent="submit"
        @keydown.tab.prevent="handleTab"
        @keydown.esc="onEsc"
      />
      <!-- 工作流快速启动按钮 -->
      <button
        class="workflow-btn"
        title="打开工作流选择器 (Ctrl+P)"
        @click="store.openPicker()"
      >
        ⚡
      </button>
    </div>

    <!-- 提示文字 -->
    <div class="input-hint" :class="modeClass">{{ hintText }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useCommandInput } from '../../composables/useCommandInput'
import { useWorkflowUiStore } from '../../stores/workflowUiStore'

const { inputText, hintText, submit, handleTab } = useCommandInput()
const store  = useWorkflowUiStore()
const inputEl = ref<HTMLInputElement>()

// ── 模式样式计算 ─────────────────────────────────────────────
const modeClass = computed(() => {
  const v = inputText.value
  if (v.startsWith('>'))    return 'mode-workflow'
  if (v.startsWith('@'))    return 'mode-direct'
  if (v.toLowerCase().startsWith('mcp:')) return 'mode-mcp'
  if (v.toLowerCase().startsWith('cc:'))  return 'mode-cc'
  return 'mode-plain'
})

const modeIcon = computed(() => {
  const m = modeClass.value
  if (m === 'mode-workflow') return '▶'
  if (m === 'mode-direct')   return '→'
  if (m === 'mode-mcp')      return '◎'
  if (m === 'mode-cc')       return '⟳'
  return '›'
})

const placeholder = computed(() => {
  const m = modeClass.value
  if (m === 'mode-workflow') return '工作流 ID 或别名…  例: git-daily'
  if (m === 'mode-direct')   return '目标:内容…  例: @1:npm run dev'
  if (m === 'mode-mcp')      return 'MCP 工具…  例: mcp:feishu_search:关键词'
  if (m === 'mode-cc')       return 'CC Switch…  例: cc:list 或 cc:switch:模型ID'
  return '输入命令或 > 触发工作流…'
})

function onEsc() {
  if (inputText.value) {
    inputText.value = ''
  } else {
    store.closePicker()
  }
}

// Ctrl+P 全局快捷键打开 WorkflowPicker
function handleGlobalKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
    e.preventDefault()
    store.openPicker()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKey)
  inputEl.value?.focus()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKey)
})
</script>

<style scoped>
.unified-input-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

/* ── 输入框包装 ─────────────────────────────────────────── */
.input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #181825;
  border: 2px solid #313244;
  border-radius: 8px;
  padding: 0 10px;
  transition: border-color 0.18s, box-shadow 0.18s;
}

.input-wrapper:focus-within {
  box-shadow: 0 0 0 3px rgba(137,180,250,0.15);
}

/* 模式颜色 */
.input-wrapper.mode-workflow:focus-within { border-color: #a6e3a1; box-shadow: 0 0 0 3px rgba(166,227,161,0.15); }
.input-wrapper.mode-direct:focus-within   { border-color: #89b4fa; }
.input-wrapper.mode-mcp:focus-within      { border-color: #cba6f7; box-shadow: 0 0 0 3px rgba(203,166,247,0.15); }
.input-wrapper.mode-cc:focus-within       { border-color: #fab387; box-shadow: 0 0 0 3px rgba(250,179,135,0.15); }

.mode-indicator {
  font-size: 13px;
  color: #585b70;
  flex-shrink: 0;
  transition: color 0.18s;
}

.mode-workflow .mode-indicator { color: #a6e3a1; }
.mode-direct   .mode-indicator { color: #89b4fa; }
.mode-mcp      .mode-indicator { color: #cba6f7; }
.mode-cc       .mode-indicator { color: #fab387; }

.unified-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 14px;
  color: #cdd6f4;
  font-family: 'Consolas', 'Fira Code', monospace;
  padding: 9px 0;
}

.unified-input::placeholder {
  color: #45475a;
}

.workflow-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
  border-radius: 4px;
  transition: background 0.12s;
  line-height: 1;
  flex-shrink: 0;
}

.workflow-btn:hover {
  background: #313244;
}

/* ── 提示文字 ───────────────────────────────────────────── */
.input-hint {
  font-size: 11px;
  color: #45475a;
  padding: 0 12px;
  transition: color 0.18s;
}

.input-hint.mode-workflow { color: #a6e3a1; }
.input-hint.mode-direct   { color: #89b4fa; }
.input-hint.mode-mcp      { color: #cba6f7; }
.input-hint.mode-cc       { color: #fab387; }
</style>