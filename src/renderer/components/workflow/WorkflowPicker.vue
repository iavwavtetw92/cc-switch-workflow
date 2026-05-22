<template>
  <!-- WorkflowPicker — 工作流快速启动面板 -->
  <Teleport to="body">
    <Transition name="picker-fade">
      <div
        v-if="store.pickerOpen"
        class="picker-overlay"
        @mousedown.self="store.closePicker()"
      >
        <div class="picker-panel" role="dialog" aria-label="工作流选择器">

          <!-- 搜索框 -->
          <div class="picker-search">
            <span class="search-icon">⚡</span>
            <input
              ref="searchInput"
              v-model="store.pickerQuery"
              type="text"
              class="search-input"
              placeholder="搜索工作流…（输入 ID、名称或标签）"
              @keydown.esc="store.closePicker()"
              @keydown.enter="runSelected()"
              @keydown.up.prevent="moveSelection(-1)"
              @keydown.down.prevent="moveSelection(1)"
            />
            <kbd class="esc-hint">ESC</kbd>
          </div>

          <!-- 工作流列表 -->
          <div class="picker-list" ref="listEl">
            <div
              v-if="store.filteredWorkflows.length === 0"
              class="picker-empty"
            >
              没有匹配的工作流
            </div>

            <button
              v-for="(wf, idx) in store.filteredWorkflows"
              :key="wf.id"
              :class="['picker-item', { 'is-selected': idx === selectedIdx }]"
              @click="run(wf)"
              @mouseenter="selectedIdx = idx"
            >
              <span class="item-icon">{{ wf.icon ?? '▶' }}</span>
              <div class="item-body">
                <span class="item-name">{{ wf.name }}</span>
                <span class="item-desc">{{ wf.description }}</span>
              </div>
              <div class="item-meta">
                <span
                  v-for="tag in (wf.tags ?? []).slice(0, 3)"
                  :key="tag"
                  class="tag"
                >{{ tag }}</span>
                <span class="step-count">{{ wf.steps.length }} 步</span>
              </div>
            </button>
          </div>

          <!-- 底部提示 -->
          <div class="picker-footer">
            <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
            <span><kbd>Enter</kbd> 执行</span>
            <span><kbd>ESC</kbd> 关闭</span>
            <span class="count">{{ store.filteredWorkflows.length }} / {{ store.workflows.length }}</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useWorkflowUiStore } from '../../stores/workflowUiStore'
import type { Workflow } from '@core/types/workflow.types'

const store = useWorkflowUiStore()

const searchInput = ref<HTMLInputElement>()
const listEl      = ref<HTMLDivElement>()
const selectedIdx = ref(0)

const emit = defineEmits<{
  (e: 'run', workflow: Workflow): void
}>()

// 打开时自动聚焦搜索框
watch(() => store.pickerOpen, async (open) => {
  if (open) {
    selectedIdx.value = 0
    await nextTick()
    searchInput.value?.focus()
  }
})

// 过滤后重置选中项
watch(() => store.filteredWorkflows, () => {
  selectedIdx.value = 0
})

function moveSelection(dir: -1 | 1) {
  const max = store.filteredWorkflows.length - 1
  selectedIdx.value = Math.max(0, Math.min(selectedIdx.value + dir, max))
  // 滚动到可见区域
  const items = listEl.value?.querySelectorAll('.picker-item')
  items?.[selectedIdx.value]?.scrollIntoView({ block: 'nearest' })
}

function run(wf: Workflow) {
  store.closePicker()
  emit('run', wf)
}

function runSelected() {
  const wf = store.filteredWorkflows[selectedIdx.value]
  if (wf) run(wf)
}
</script>

<style scoped>
/* ── 遮罩层 ─────────────────────────────────────────────── */
.picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  z-index: 9000;
  backdrop-filter: blur(4px);
}

/* ── 面板 ───────────────────────────────────────────────── */
.picker-panel {
  width: 640px;
  max-height: 70vh;
  background: #1e1e2e;
  border: 1px solid #45475a;
  border-radius: 12px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── 搜索区 ─────────────────────────────────────────────── */
.picker-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid #313244;
}

.search-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 16px;
  color: #cdd6f4;
  font-family: 'Consolas', monospace;
}

.search-input::placeholder {
  color: #585b70;
}

.esc-hint {
  font-size: 11px;
  color: #6c7086;
  background: #313244;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #45475a;
}

/* ── 列表区 ─────────────────────────────────────────────── */
.picker-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}

.picker-empty {
  text-align: center;
  color: #6c7086;
  padding: 32px;
  font-size: 14px;
}

.picker-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #cdd6f4;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s, border-color 0.12s;
}

.picker-item.is-selected,
.picker-item:hover {
  background: #313244;
  border-color: #89b4fa44;
}

.item-icon {
  font-size: 20px;
  flex-shrink: 0;
  width: 28px;
  text-align: center;
}

.item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-name {
  font-size: 14px;
  font-weight: 600;
  color: #cdd6f4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-desc {
  font-size: 12px;
  color: #6c7086;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-meta {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-shrink: 0;
}

.tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 10px;
  background: #313244;
  color: #89b4fa;
  border: 1px solid #45475a;
}

.step-count {
  font-size: 11px;
  color: #585b70;
  margin-left: 4px;
}

/* ── 底部提示 ───────────────────────────────────────────── */
.picker-footer {
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 8px 16px;
  border-top: 1px solid #313244;
  font-size: 11px;
  color: #6c7086;
}

.picker-footer kbd {
  font-size: 10px;
  background: #313244;
  border: 1px solid #45475a;
  border-radius: 3px;
  padding: 1px 5px;
  margin-right: 2px;
}

.count {
  margin-left: auto;
}

/* ── 过渡动画 ───────────────────────────────────────────── */
.picker-fade-enter-active,
.picker-fade-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}
.picker-fade-enter-from,
.picker-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.97);
}
</style>
