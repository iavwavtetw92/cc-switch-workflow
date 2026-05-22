<template>
  <div class="status-panel">
    <div class="status-item" v-for="status in panelStatuses" :key="status.id">
      <span class="status-label">{{ status.label }}</span>
      <span :class="['status-value', status.state]">
        <span class="status-dot"></span>
        {{ status.statusText }}
      </span>
    </div>

    <!-- CC Switch状态 -->
    <div class="status-item cc-switch">
      <span class="status-label">CC模型</span>
      <el-select
        v-model="currentProviderId"
        size="small"
        placeholder="选择模型"
        @change="switchProvider"
      >
        <el-option
          v-for="provider in providers"
          :key="provider.id"
          :label="provider.name"
          :value="provider.id"
        />
      </el-select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { usePanelStore } from '../../stores/panelStore'

const panelStore = usePanelStore()

const providers = ref<any[]>([])
const currentProviderId = ref('')

const panelStatuses = computed(() => {
  const labels = {
    workbox1: '工作框1',
    workbox2: '工作框2',
    learnbox: '学习框',
    searchbox1: '搜索1',
    searchbox2: '搜索2'
  }

  return Object.entries(panelStore.panelStates).map(([id, state]) => ({
    id,
    label: labels[id] || id,
    state: state.status,
    statusText: getStatusText(state.status)
  }))
})

function getStatusText(status: string): string {
  const texts = {
    idle: '空闲',
    running: '执行中',
    waiting: '等待',
    error: '错误'
  }
  return texts[status] || '未知'
}

onMounted(async () => {
  // 加载CC Switch providers
  try {
    providers.value = await window.electronAPI?.getProviders() || []
    const current = await window.electronAPI?.getCurrentProvider()
    if (current) {
      currentProviderId.value = current.id
    }
  } catch (e) {
    console.warn('加载CC Switch配置失败:', e)
  }
})

async function switchProvider(providerId: string) {
  await window.electronAPI?.switchProvider(providerId)
}
</script>

<style scoped>
.status-panel {
  display: flex;
  gap: 12px;
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: 8px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.status-value {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.status-value.running {
  background: rgba(166, 227, 161, 0.2);
  color: var(--success);
}

.status-value.idle {
  background: rgba(169, 183, 200, 0.2);
  color: var(--text-secondary);
}

.status-value.error {
  background: rgba(243, 139, 168, 0.2);
  color: var(--error);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.cc-switch {
  .el-select {
    width: 120px;
  }
}
</style>