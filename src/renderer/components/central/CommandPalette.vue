<template>
  <div class="command-palette">
    <el-button size="small" @click="showPalette = true">
      <span class="icon">⚡</span> 命令
    </el-button>

    <el-dialog
      v-model="showPalette"
      title="预置命令"
      width="400px"
      :modal-append-to-body="false"
    >
      <div class="command-list">
        <div
          v-for="cmd in commands"
          :key="cmd.id"
          class="command-item"
          @click="executeCommand(cmd)"
        >
          <span class="command-name">{{ cmd.name }}</span>
          <span class="command-shortcut" v-if="cmd.shortcut">{{ cmd.shortcut }}</span>
          <span class="command-target">{{ getTargetLabel(cmd.target) }}</span>
        </div>
      </div>

      <template #footer>
        <el-button @click="showCommandConfig = true">配置命令</el-button>
      </template>
    </el-dialog>

    <CommandConfig v-model="showCommandConfig" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCommandStore } from '../../stores/commandStore'
import { usePanelStore } from '../../stores/panelStore'
import CommandConfig from '../settings/CommandConfig.vue'

const commandStore = useCommandStore()
const panelStore = usePanelStore()

const showPalette = ref(false)
const showCommandConfig = ref(false)

const commands = computed(() => commandStore.commands)

const targetLabels = {
  workbox1: '工作框1',
  workbox2: '工作框2',
  searchbox1: '搜索框1',
  searchbox2: '搜索框2',
  learnbox: '学习框',
  all: '全部'
}

function getTargetLabel(target: string): string {
  return targetLabels[target] || target
}

function executeCommand(cmd: any) {
  panelStore.executeCommand(cmd.target, cmd.command)
  showPalette.value = false
}
</script>

<style scoped>
.command-palette {
  display: flex;
  align-items: center;
}

.icon {
  margin-right: 4px;
}

.command-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.command-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.command-item:hover {
  background: var(--bg-tertiary);
}

.command-name {
  font-weight: 500;
  flex: 1;
}

.command-shortcut {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 2px 6px;
  background: var(--bg-tertiary);
  border-radius: 4px;
}

.command-target {
  font-size: 12px;
  color: var(--accent);
}
</style>