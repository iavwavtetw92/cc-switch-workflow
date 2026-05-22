<template>
  <div
    class="panel-container"
    :class="{
      'is-focused': panelStore.focusedPanelId === id,
      'is-hidden':  !meta?.visible,
    }"
  >
    <!-- 面板头部 -->
    <div class="panel-header" @click="panelStore.setFocused(id as any)">
      <span class="panel-title">{{ meta?.label ?? title }}</span>

      <div class="panel-actions">
        <!-- 状态 badge -->
        <span :class="['status-badge', meta?.status ?? 'idle']">
          {{ STATUS_TEXT[meta?.status ?? 'idle'] }}
        </span>

        <!-- 工作目录（仅 workbox） -->
        <span v-if="meta?.cwd" class="panel-cwd" :title="meta.cwd">
          {{ cwdShort }}
        </span>

        <!-- 最小化 / 恢复 -->
        <button class="ph-btn" :title="meta?.visible ? '最小化' : '展开'" @click.stop="panelStore.toggleVisible(id as any)">
          {{ meta?.visible ? '─' : '□' }}
        </button>
      </div>
    </div>

    <!-- 内容区 -->
    <div v-show="meta?.visible !== false" class="panel-content">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { usePanelStore } from '../../stores/panelStore'
import type { PanelId } from '../../stores/panelStore'

const STATUS_TEXT = {
  idle:    '空闲',
  running: '运行中',
  error:   '错误',
} as const

const props = defineProps<{
  id:         string
  title:      string
  type:       string
  detachable?: boolean
}>()

const panelStore = usePanelStore()
const meta       = computed(() => panelStore.getPanelById(props.id))

const cwdShort = computed(() => {
  const cwd = meta.value?.cwd ?? ''
  const parts = cwd.replace(/\\/g, '/').split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : cwd
})
</script>

<style scoped>
.panel-container {
  display: flex;
  flex-direction: column;
  background: #11111b;
  border: 1px solid #313244;
  border-radius: 8px;
  overflow: hidden;
  height: 100%;
  transition: border-color 0.15s;
}

.panel-container.is-focused {
  border-color: #89b4fa;
}

.panel-container.is-hidden {
  /* 最小化时只保留 header */
  height: auto;
  flex: 0 0 auto;
}

/* ── 头部 ─────────────────────────────────────────────── */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 10px;
  background: #181825;
  border-bottom: 1px solid #313244;
  cursor: pointer;
  user-select: none;
  min-height: 30px;
  gap: 8px;
}

.panel-title {
  font-size: 12px;
  font-weight: 600;
  color: #cdd6f4;
  flex-shrink: 0;
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

/* ── 状态 badge ─────────────────────────────────────── */
.status-badge {
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}

.status-badge.idle    { background: #31324466; color: #585b70; }
.status-badge.running { background: #a6e3a122; color: #a6e3a1; }
.status-badge.error   { background: #f38ba822; color: #f38ba8; }

/* ── 目录 ───────────────────────────────────────────── */
.panel-cwd {
  font-family: monospace;
  font-size: 11px;
  color: #f9e2af88;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 操作按钮 ───────────────────────────────────────── */
.ph-btn {
  background: none;
  border: 1px solid #31324466;
  border-radius: 3px;
  color: #585b70;
  font-size: 11px;
  cursor: pointer;
  padding: 1px 5px;
  transition: all 0.1s;
  line-height: 1;
}
.ph-btn:hover { color: #cdd6f4; border-color: #585b70; }

/* ── 内容区 ─────────────────────────────────────────── */
.panel-content {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}
</style>