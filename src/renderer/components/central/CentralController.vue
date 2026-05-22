<template>
  <div class="central-controller">
    <!-- 统一输入框 -->
    <UnifiedInput />

    <!-- 快速操作区 -->
    <div class="ctrl-actions">
      <!-- 工作流选择器按钮 -->
      <button
        class="ctrl-btn workflow-btn"
        title="工作流选择器 (Ctrl+P)"
        @click="workflowStore.openPicker()"
      >
        ⚡ 工作流
        <span class="wf-count">{{ workflowStore.workflows.length }}</span>
      </button>

      <!-- CC Switch 当前模型 -->
      <button
        v-if="currentProvider"
        class="ctrl-btn cc-btn"
        title="CC Switch — 输入 cc:list 查看所有模型"
      >
        ⟳ {{ currentProvider.name }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import UnifiedInput       from './UnifiedInput.vue'
import { useWorkflowUiStore } from '../../stores/workflowUiStore'

const workflowStore  = useWorkflowUiStore()
const currentProvider = ref<any>(null)

onMounted(async () => {
  try {
    currentProvider.value = await window.electronAPI?.ccSwitchCurrent()
  } catch {}
})
</script>

<style scoped>
.central-controller {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #181825;
  border-bottom: 1px solid #313244;
}

.ctrl-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.ctrl-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid #313244;
  background: #1e1e2e;
  color: #cdd6f4;
  white-space: nowrap;
  transition: border-color 0.15s, background 0.15s;
}

.ctrl-btn:hover {
  background: #313244;
}

.workflow-btn { border-color: #89b4fa44; color: #89b4fa; }
.workflow-btn:hover { border-color: #89b4fa; background: #1e3a5f; }

.wf-count {
  background: #313244;
  color: #6c7086;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 8px;
}

.cc-btn { border-color: #fab38744; color: #fab387; }
.cc-btn:hover { border-color: #fab387; background: #2a1f18; }
</style>