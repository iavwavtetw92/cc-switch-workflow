<template>
  <div class="status-bar">
    <!-- 左侧：焦点面板 + CC 模型 + 执行状态 -->
    <div class="status-left">
      <span class="seg">
        <span class="seg-icon">◎</span>
        {{ layoutStore.focusedPanelLabel }}
      </span>

      <span v-if="currentProvider" class="seg cc-seg">
        <span class="seg-icon">⟳</span>
        {{ currentProvider.name }}
      </span>

      <!-- 工作流执行状态条 -->
      <ExecutionStatus
        @cancel="cancelExec"
        @dismiss="workflowStore.clearExecution()"
      />
    </div>

    <!-- 右侧：导入/导出 + 时间 -->
    <div class="status-right">
      <!-- 导入工作流按钮 -->
      <button class="status-btn" @click="importExportRef?.openImport()">
        📥 导入
      </button>

      <span class="time-seg">{{ currentTime }}</span>
    </div>

    <!-- 导入/导出组件（不渲染 UI，仅暴露方法） -->
    <WorkflowImportExport ref="importExportRef" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useLayoutStore }         from '../../stores/layoutStore'
import { useWorkflowUiStore }     from '../../stores/workflowUiStore'
import ExecutionStatus            from '../workflow/ExecutionStatus.vue'
import WorkflowImportExport       from '../workflow/WorkflowImportExport.vue'

const layoutStore    = useLayoutStore()
const workflowStore  = useWorkflowUiStore()

const currentProvider  = ref<any>(null)
const currentTime      = ref('')
const importExportRef  = ref<InstanceType<typeof WorkflowImportExport>>()

let timeInterval: ReturnType<typeof setInterval>

onMounted(async () => {
  // 加载当前 CC 模型
  try {
    currentProvider.value = await window.electronAPI?.ccSwitchCurrent()
  } catch { /* 未连接时静默失败 */ }

  // 时钟
  const tick = () => {
    currentTime.value = new Date().toLocaleTimeString('zh-CN', {
      hour:   '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }
  tick()
  timeInterval = setInterval(tick, 1000)
})

onUnmounted(() => clearInterval(timeInterval))

function cancelExec(execId: string) {
  // 通知 workflowUiStore 取消（实际引擎取消由 WorkflowEngine 处理）
  workflowStore.finishExecution(execId, false)
  workflowStore.clearExecution()
}
</script>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px;
  background: #181825;
  border-top: 1px solid #313244;
  font-size: 12px;
  color: #6c7086;
  min-height: 32px;
  gap: 8px;
}

.status-left,
.status-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.seg {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.seg-icon { font-size: 11px; }

.cc-seg { color: #fab387; }

.status-btn {
  background: none;
  border: 1px solid #313244;
  border-radius: 4px;
  color: #6c7086;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 8px;
  transition: border-color 0.1s, color 0.1s;
}
.status-btn:hover { border-color: #89b4fa; color: #89b4fa; }

.time-seg {
  font-family: monospace;
  font-size: 12px;
  color: #585b70;
}
</style>