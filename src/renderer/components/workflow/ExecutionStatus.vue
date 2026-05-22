<template>
  <!-- ExecutionStatus — 工作流执行状态条 -->
  <Transition name="status-slide">
    <div v-if="exec" class="exec-status" :class="`status-${exec.status}`">
      <span class="exec-icon">{{ statusIcon }}</span>

      <div class="exec-body">
        <span class="exec-name">{{ workflowName }}</span>

        <!-- 步骤进度点 -->
        <div class="step-dots">
          <span
            v-for="step in exec.steps"
            :key="step.stepId"
            class="dot"
            :class="`dot-${step.status}`"
            :title="step.stepId"
          />
        </div>
      </div>

      <span class="exec-label">{{ statusLabel }}</span>

      <button
        v-if="exec.status === 'running'"
        class="cancel-btn"
        title="取消执行"
        @click="$emit('cancel', exec.execId)"
      >
        ✕
      </button>

      <button
        v-if="exec.status !== 'running'"
        class="dismiss-btn"
        @click="$emit('dismiss')"
      >
        ✕
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useWorkflowUiStore } from '../../stores/workflowUiStore'

const store = useWorkflowUiStore()
const exec  = computed(() => store.currentExecution)

defineEmits<{
  (e: 'cancel',  execId: string): void
  (e: 'dismiss'): void
}>()

const workflowName = computed(() => {
  const wf = store.workflows.find(w => w.id === exec.value?.workflowId)
  return wf?.name ?? exec.value?.workflowId ?? ''
})

const statusIcon = computed(() => {
  const s = exec.value?.status
  if (s === 'running')   return '⟳'
  if (s === 'done')      return '✓'
  if (s === 'error')     return '✗'
  if (s === 'cancelled') return '○'
  return '…'
})

const statusLabel = computed(() => {
  const s   = exec.value?.status
  const done = exec.value?.steps.filter(x => x.status === 'done').length ?? 0
  const total = exec.value?.steps.length ?? 0
  if (s === 'running')   return `${done}/${total} 步`
  if (s === 'done')      return '已完成'
  if (s === 'error')     return '执行失败'
  if (s === 'cancelled') return '已取消'
  return ''
})
</script>

<style scoped>
.exec-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.status-running   { background: #1e3a5f; border-color: #89b4fa44; color: #89b4fa; }
.status-done      { background: #1a3a2a; border-color: #a6e3a144; color: #a6e3a1; }
.status-error     { background: #3a1a1a; border-color: #f38ba844; color: #f38ba8; }
.status-cancelled { background: #2a2a3a; border-color: #45475a;   color: #6c7086; }

.exec-icon { font-size: 14px; }

.exec-body {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.exec-name {
  font-weight: 600;
  white-space: nowrap;
}

.step-dots {
  display: flex;
  gap: 3px;
  align-items: center;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background 0.2s;
}
.dot-pending { background: #45475a; }
.dot-running { background: #89b4fa; animation: pulse 0.8s infinite alternate; }
.dot-done    { background: #a6e3a1; }
.dot-error   { background: #f38ba8; }

@keyframes pulse { to { opacity: 0.4; } }

.exec-label { font-size: 11px; color: inherit; opacity: 0.8; white-space: nowrap; }

.cancel-btn,
.dismiss-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  opacity: 0.6;
  font-size: 12px;
  padding: 2px 4px;
  border-radius: 3px;
  transition: opacity 0.1s, background 0.1s;
}
.cancel-btn:hover,
.dismiss-btn:hover { opacity: 1; background: rgba(255,255,255,0.1); }

/* ── 进入/离开动画 ─────────────────────────────────────── */
.status-slide-enter-active,
.status-slide-leave-active { transition: all 0.2s ease; }
.status-slide-enter-from,
.status-slide-leave-to     { opacity: 0; transform: translateY(-6px); }
</style>
