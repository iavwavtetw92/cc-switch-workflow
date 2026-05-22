<template>
  <el-dialog
    v-model="visible"
    title="命令配置"
    width="600px"
    :modal-append-to-body="false"
  >
    <div class="command-config">
      <!-- 命令列表 -->
      <div class="command-list">
        <div
          v-for="cmd in commands"
          :key="cmd.id"
          class="command-item"
          :class="{ disabled: !cmd.enabled }"
        >
          <div class="command-info">
            <span class="command-name">{{ cmd.name }}</span>
            <span class="command-target">{{ getTargetLabel(cmd.target) }}</span>
          </div>
          <div class="command-actions">
            <el-button size="small" text @click="editCommand(cmd)">编辑</el-button>
            <el-button size="small" text @click="deleteCommand(cmd.id)">删除</el-button>
            <el-checkbox v-model="cmd.enabled" size="small" />
          </div>
        </div>
      </div>

      <!-- 新增命令 -->
      <div class="add-command-section">
        <el-button @click="showAddDialog = true">+ 新增命令</el-button>
      </div>
    </div>

    <!-- 新增/编辑对话框 -->
    <el-dialog
      v-model="showAddDialog"
      title="编辑命令"
      width="400px"
      append-to-body
    >
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="命令名称">
          <el-input v-model="editForm.name" />
        </el-form-item>
        <el-form-item label="执行命令">
          <el-input v-model="editForm.command" />
        </el-form-item>
        <el-form-item label="目标面板">
          <el-select v-model="editForm.target">
            <el-option label="工作框1" value="workbox1" />
            <el-option label="工作框2" value="workbox2" />
            <el-option label="全部工作框" value="all" />
            <el-option label="搜索框1" value="searchbox1" />
            <el-option label="搜索框2" value="searchbox2" />
          </el-select>
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="editForm.category">
            <el-option label="终端" value="terminal" />
            <el-option label="系统" value="system" />
            <el-option label="MCP" value="mcp" />
            <el-option label="自定义" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item label="快捷键">
          <el-input v-model="editForm.shortcut" placeholder="如: Ctrl+G" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editForm.description" type="textarea" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="saveCommand">保存</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCommandStore } from '../../stores/commandStore'

const visible = defineModel<boolean>()
const commandStore = useCommandStore()

const showAddDialog = ref(false)
const editForm = ref({
  id: '',
  name: '',
  command: '',
  target: 'workbox1',
  category: 'terminal',
  shortcut: '',
  description: '',
  enabled: true
})

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

function editCommand(cmd: any) {
  editForm.value = { ...cmd }
  showAddDialog.value = true
}

function saveCommand() {
  if (!editForm.value.name || !editForm.value.command) return

  if (editForm.value.id) {
    commandStore.updateCommand(editForm.value.id, editForm.value)
  } else {
    commandStore.addCommand({
      ...editForm.value,
      id: `cmd-${Date.now()}`
    })
  }

  showAddDialog.value = false
  editForm.value = {
    id: '',
    name: '',
    command: '',
    target: 'workbox1',
    category: 'terminal',
    shortcut: '',
    description: '',
    enabled: true
  }
}

function deleteCommand(id: string) {
  commandStore.removeCommand(id)
}

// 加载命令配置
if (visible.value) {
  commandStore.loadCommands()
}
</script>

<style scoped>
.command-config {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.command-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.command-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 8px;
}

.command-item.disabled {
  opacity: 0.5;
}

.command-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.command-name {
  font-weight: 500;
}

.command-target {
  font-size: 12px;
  color: var(--accent);
}

.command-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.add-command-section {
  display: flex;
  justify-content: center;
}
</style>