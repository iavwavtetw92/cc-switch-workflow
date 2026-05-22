<template>
  <div class="app">

    <!-- ══ 监控 + 快捷输入面板 ══════════════════════════════ -->
    <PanelControlBar />

    <!-- ══ 工作框区域 ════════════════════════════════════════ -->
    <div class="workboxes">
      <div
        v-for="p in panelStore.panels"
        :key="p.id"
        v-show="p.visible"
        class="wb-slot"
        :class="{ focused: panelStore.focusedPanelId === p.id }"
      >
        <WorkBox :id="p.id" />
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { usePanelStore }      from './stores/panelStore'
import PanelControlBar        from './components/central/PanelControlBar.vue'
import WorkBox                from './components/panels/WorkBox.vue'

const panelStore = usePanelStore()

onMounted(() => panelStore.restore())
onUnmounted(() => panelStore.save())
</script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: #0d0d16;
  color: #cdd6f4;
  font-family: 'Consolas', 'Fira Code', monospace;
  height: 100vh;
  overflow: hidden;
}
</style>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* 工作框横排，每个均分宽度 */
.workboxes {
  display: flex;
  flex: 1;
  gap: 4px;
  padding: 4px;
  min-height: 0;
  background: #0d0d16;
}

.wb-slot {
  flex: 1;
  min-width: 0;
  border: 1px solid #1e1e2e;
  border-radius: 6px;
  overflow: hidden;
  transition: border-color 0.15s;
}

.wb-slot.focused {
  border-color: #89b4fa55;
}
</style>