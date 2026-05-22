<template>
  <div class="central-controller">
    <!-- 面板控制栏（核心：监控 + 预设 + 命令发送） -->
    <PanelControlBar />

    <!-- 第二行：工作流 + CC Switch 模型 -->
    <div class="cc-action-row">
      <button
        class="ctrl-btn workflow-btn"
        title="工作流选择器 (Ctrl+P)"
        @click="workflowStore.openPicker()"
      >
        ⚡ 工作流
        <span class="wf-count">{{ workflowStore.workflows.length }}</span>
      </button>

      <button
        v-if="currentProvider"
        class="ctrl-btn cc-btn"
        title="CC Switch 当前模型"
      >
        🤖 {{ currentProvider.name }}
      </button>

      <span v-else class="ctrl-dim">CC Switch 未连接</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted }       from 'vue'
import PanelControlBar          from './PanelControlBar.vue'
import { useWorkflowUiStore }   from '../../stores/workflowUiStore'

const workflowStore   = useWorkflowUiStore()
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
  flex-direction: column;
  background: #13131f;
  border-bottom: 1px solid #2d2b55;
}

.cc-action-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: #181825;
  border-top: 1px solid #1e1e2e;
}

.ctrl-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 11px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid #313244;
  background: #1e1e2e;
  color: #cdd6f4;
  white-space: nowrap;
  transition: border-color 0.12s, background 0.12s;
}
.ctrl-btn:hover { background: #313244; }

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

.ctrl-dim { font-size: 11px; color: #45475a; }
</style>