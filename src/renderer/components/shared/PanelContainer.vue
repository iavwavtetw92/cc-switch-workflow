<template>
  <div class="panel-container" :class="{ detached: isDetached }">
    <div class="panel-header">
      <span class="panel-title">{{ title }}</span>
      <div class="panel-actions">
        <span :class="['status-badge', status]">
          {{ statusText }}
        </span>
        <el-button
          v-if="detachable && !isDetached"
          size="small"
          text
          @click="detachPanel"
        >
          ⛶ 分离
        </el-button>
        <el-button
          v-if="isDetached"
          size="small"
          text
          @click="closeDetached"
        >
          ✕ 关闭
        </el-button>
      </div>
    </div>
    <div class="panel-content" @click="focusPanel">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePanelStore } from '../../stores/panelStore'

const props = defineProps<{
  id: string
  title: string
  type: string
  detachable?: boolean
}>()

const emit = defineEmits(['detached', 'closed'])

const panelStore = usePanelStore()
const isDetached = ref(false)

const status = computed(() => panelStore.panelStates[props.id]?.status || 'idle')

const statusText = computed(() => {
  const texts = {
    idle: '空闲',
    running: '执行中',
    waiting: '等待输入',
    error: '错误'
  }
  return texts[status.value] || '未知'
})

function focusPanel() {
  panelStore.setFocusedPanel(props.id)
}

async function detachPanel() {
  const result = await window.electronAPI?.detachPanel(props.id, props.type)
  if (result?.success) {
    isDetached.value = true
    emit('detached', props.id)
  }
}

function closeDetached() {
  emit('closed', props.id)
}
</script>

<style scoped>
.panel-container {
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  height: 100%;
}

.panel-container.detached {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border);
}

.panel-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.status-badge.running {
  background: rgba(166, 227, 161, 0.2);
  color: var(--success);
}

.status-badge.idle {
  background: rgba(169, 183, 200, 0.2);
  color: var(--text-secondary);
}

.status-badge.waiting {
  background: rgba(249, 226, 175, 0.2);
  color: var(--warning);
}

.status-badge.error {
  background: rgba(243, 139, 168, 0.2);
  color: var(--error);
}

.panel-content {
  flex: 1;
  overflow: auto;
}
</style>