<template>
  <div class="learn-box">
    <!-- 工具栏 -->
    <div class="lb-toolbar">
      <span class="lb-title">📝 学习笔记</span>
      <label class="feishu-toggle">
        <input type="checkbox" v-model="syncToFeishu" />
        <span>同步飞书</span>
      </label>
      <button class="lb-btn save-btn" @click="saveNote">保存</button>
      <button class="lb-btn clear-btn" @click="clearNote">清空</button>
    </div>

    <!-- 编辑器区域 -->
    <textarea
      v-model="content"
      class="editor-area"
      placeholder="开始记录你的学习内容...（支持 Markdown）"
    ></textarea>

    <!-- 保存提示 -->
    <div class="save-toast" v-if="savedToast">✓ 已保存</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useWorkflowUiStore } from '../../stores/workflowUiStore'

const props = defineProps<{ id: string }>()

const workflowStore = useWorkflowUiStore()

const content     = ref('')
const syncToFeishu = ref(false)
const savedToast  = ref(false)

onMounted(() => {
  const saved = localStorage.getItem(`learnbox-content-${props.id}`)
  content.value = saved ?? '# 学习笔记\n\n开始记录你的学习内容...\n'
})

function saveNote() {
  localStorage.setItem(`learnbox-content-${props.id}`, content.value)
  savedToast.value = true
  setTimeout(() => { savedToast.value = false }, 1500)

  if (syncToFeishu.value) {
    window.electronAPI?.mcpInvoke({
      tool: 'feishu_create',
      params: {
        title:   `笔记 - ${new Date().toLocaleDateString('zh-CN')}`,
        content: content.value,
      }
    }).catch(err => console.warn('[LearnBox] 飞书同步失败:', err))
  }
}

function clearNote() {
  content.value = ''
}

// 监听工作流分发的面板消息（mcp-result / data）
watch(
  () => workflowStore.panelMessages[props.id],
  (msg) => {
    if (!msg) return
    workflowStore.clearPanelMessage(props.id)
    if (msg.type === 'data' || msg.type === 'mcp-result') {
      content.value += `\n\n> 来源: ${msg.source ?? 'workflow'}\n${msg.content}\n`
    }
  },
)
</script>

<style scoped>
.learn-box {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #11111b;
  border: 1px solid #313244;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
}

/* ── 工具栏 ─────────────────────────────────────────────── */
.lb-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #181825;
  border-bottom: 1px solid #313244;
  font-size: 12px;
  min-height: 32px;
}

.lb-title {
  color: #f9e2af;
  font-weight: 600;
  margin-right: auto;
}

.feishu-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #6c7086;
  cursor: pointer;
  font-size: 11px;
}
.feishu-toggle input { cursor: pointer; }

.lb-btn {
  padding: 3px 10px;
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid #45475a;
  background: #1e1e2e;
  color: #cdd6f4;
  transition: all 0.12s;
}
.lb-btn:hover { background: #313244; }
.save-btn { border-color: #89b4fa44; color: #89b4fa; }
.save-btn:hover { border-color: #89b4fa; background: #1e3a5f; }
.clear-btn { border-color: #f38ba844; color: #f38ba8; }
.clear-btn:hover { border-color: #f38ba8; background: #3a1e1e; }

/* ── 编辑器 ─────────────────────────────────────────────── */
.editor-area {
  flex: 1;
  background: #11111b;
  border: none;
  padding: 14px;
  font-size: 13px;
  line-height: 1.7;
  color: #cdd6f4;
  font-family: 'Consolas', 'Fira Code', monospace;
  resize: none;
  outline: none;
}
.editor-area::placeholder { color: #45475a; }

/* ── 保存提示 ───────────────────────────────────────────── */
.save-toast {
  position: absolute;
  bottom: 12px;
  right: 12px;
  background: #a6e3a1;
  color: #1e1e2e;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 6px;
  animation: fadeInOut 1.5s ease;
}

@keyframes fadeInOut {
  0%   { opacity: 0; transform: translateY(4px); }
  20%  { opacity: 1; transform: translateY(0); }
  80%  { opacity: 1; }
  100% { opacity: 0; }
}
</style>