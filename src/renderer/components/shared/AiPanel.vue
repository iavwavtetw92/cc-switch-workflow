<template>
  <!-- AI 输出面板 — 流式打字效果，可嵌入任意面板 -->
  <Transition name="ai-panel-slide">
    <div v-if="visible" class="ai-panel">
      <!-- 头部 -->
      <div class="ai-header">
        <span class="ai-icon">🤖</span>
        <span class="ai-model">{{ modelLabel }}</span>
        <span class="ai-skill" v-if="skillName">{{ skillName }}</span>
        <div class="ai-header-right">
          <span v-if="isStreaming" class="ai-streaming-badge">生成中…</span>
          <button class="ai-close" @click="$emit('close')" title="关闭">✕</button>
        </div>
      </div>

      <!-- 内容区（流式打字） -->
      <div class="ai-content" ref="contentEl">
        <div
          class="ai-text"
          v-html="renderedText"
        ></div>
        <!-- 光标动效 -->
        <span v-if="isStreaming" class="ai-cursor">▋</span>
      </div>

      <!-- 底部操作 -->
      <div class="ai-footer" v-if="!isStreaming && text">
        <button class="ai-action-btn" @click="copyText" :class="{ 'copied': copied }">
          {{ copied ? '✓ 已复制' : '复制' }}
        </button>
        <button class="ai-action-btn" @click="$emit('insert', text)" v-if="showInsert">
          插入到面板
        </button>
        <button class="ai-action-btn danger" @click="$emit('close')">
          关闭
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps<{
  visible:    boolean
  text:       string
  isStreaming: boolean
  skillName?: string
  modelLabel?: string
  showInsert?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'insert', text: string): void
}>()

const contentEl = ref<HTMLDivElement>()
const copied    = ref(false)

// 简单的 Markdown → HTML 转换（不依赖外部库）
const renderedText = computed(() => {
  const t = props.text
  if (!t) return '<span class="ai-placeholder">…</span>'

  return t
    // 代码块
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="ai-code"><code>$2</code></pre>')
    // 行内代码
    .replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>')
    // 粗体
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // 标题
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // 列表
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    // 换行
    .replace(/\n/g, '<br>')
})

// 流式时自动滚动到底部
watch(() => props.text, () => {
  if (props.isStreaming) {
    nextTick(() => {
      if (contentEl.value) {
        contentEl.value.scrollTop = contentEl.value.scrollHeight
      }
    })
  }
})

async function copyText() {
  await navigator.clipboard.writeText(props.text)
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}
</script>

<style scoped>
.ai-panel {
  background: #1a1a2e;
  border: 1px solid #7c6af7;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 24px rgba(124, 106, 247, 0.2);
}

/* ── 头部 ─────────────────────────────────────────────── */
.ai-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  background: #13131f;
  border-bottom: 1px solid #2d2b55;
  font-size: 12px;
}

.ai-icon { font-size: 14px; }

.ai-model {
  color: #a78bfa;
  font-weight: 600;
  font-family: monospace;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-skill {
  background: #2d2b55;
  color: #c4b5fd;
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 11px;
}

.ai-header-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-streaming-badge {
  color: #a78bfa;
  font-size: 11px;
  animation: pulse 1.2s ease infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

.ai-close {
  background: none;
  border: none;
  color: #6c7086;
  cursor: pointer;
  font-size: 13px;
  padding: 2px 4px;
  border-radius: 3px;
  transition: color 0.1s;
}
.ai-close:hover { color: #f38ba8; }

/* ── 内容区 ─────────────────────────────────────────────── */
.ai-content {
  flex: 1;
  padding: 12px 14px;
  overflow-y: auto;
  max-height: 280px;
  font-size: 13px;
  line-height: 1.7;
  color: #cdd6f4;
  position: relative;
}

.ai-text :deep(h1),
.ai-text :deep(h2),
.ai-text :deep(h3) {
  color: #a78bfa;
  margin: 8px 0 4px;
}

.ai-text :deep(pre.ai-code) {
  background: #11111b;
  border: 1px solid #313244;
  border-radius: 6px;
  padding: 10px 12px;
  overflow-x: auto;
  font-family: 'Consolas', monospace;
  font-size: 12px;
  color: #a6e3a1;
  margin: 6px 0;
}

.ai-text :deep(code.ai-inline-code) {
  background: #313244;
  color: #f9e2af;
  padding: 1px 5px;
  border-radius: 3px;
  font-family: 'Consolas', monospace;
  font-size: 12px;
}

.ai-text :deep(li) {
  margin: 3px 0;
  padding-left: 4px;
}
.ai-text :deep(li)::before {
  content: '• ';
  color: #a78bfa;
}

.ai-placeholder { color: #45475a; font-style: italic; }

.ai-cursor {
  display: inline-block;
  color: #a78bfa;
  animation: blink 0.7s step-end infinite;
  margin-left: 1px;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}

/* ── 底部 ─────────────────────────────────────────────── */
.ai-footer {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  background: #13131f;
  border-top: 1px solid #2d2b55;
}

.ai-action-btn {
  padding: 4px 12px;
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid #45475a;
  background: #1e1e2e;
  color: #cdd6f4;
  transition: all 0.12s;
}
.ai-action-btn:hover { background: #313244; border-color: #a78bfa; }
.ai-action-btn.copied { border-color: #a6e3a1; color: #a6e3a1; }
.ai-action-btn.danger { border-color: #f38ba844; color: #f38ba8; }
.ai-action-btn.danger:hover { border-color: #f38ba8; background: #3a1e1e; }

/* ── 过渡动画 ─────────────────────────────────────────── */
.ai-panel-slide-enter-active,
.ai-panel-slide-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.ai-panel-slide-enter-from,
.ai-panel-slide-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
