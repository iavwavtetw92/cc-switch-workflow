<template>
  <div class="app-container">
    <!-- 顶部集中控制器 -->
    <CentralController />

    <!-- 主面板区域 -->
    <div class="panels-container">
      <div class="left-panels">
        <PanelContainer id="workbox1" title="工作框 1" type="workbox" :detachable="true">
          <WorkBox id="workbox1" />
        </PanelContainer>

        <PanelContainer id="workbox2" title="工作框 2" type="workbox" :detachable="true">
          <WorkBox id="workbox2" />
        </PanelContainer>
      </div>

      <div class="middle-panel">
        <PanelContainer id="learnbox" title="学习框" type="learnbox" :detachable="true">
          <LearnBox id="learnbox" />
        </PanelContainer>
      </div>

      <div class="right-panels">
        <PanelContainer id="searchbox1" title="搜索框 (Web)" type="searchbox" :detachable="true">
          <SearchBox id="searchbox1" mode="web" />
        </PanelContainer>

        <PanelContainer id="searchbox2" title="搜索框 (项目)" type="searchbox" :detachable="true">
          <SearchBox id="searchbox2" mode="project" />
        </PanelContainer>
      </div>
    </div>

    <!-- 底部状态栏 -->
    <StatusBar />

    <!-- 工作流快速启动面板（全局 Teleport，挂载在 body） -->
    <WorkflowPicker @run="handleWorkflowRun" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { usePanelStore }         from './stores/panelStore'
import { useWorkflowUiStore }    from './stores/workflowUiStore'
import CentralController         from './components/central/CentralController.vue'
import PanelContainer            from './components/shared/PanelContainer.vue'
import WorkBox                   from './components/panels/WorkBox.vue'
import LearnBox                  from './components/panels/LearnBox.vue'
import SearchBox                 from './components/panels/SearchBox.vue'
import StatusBar                 from './components/shared/StatusBar.vue'
import WorkflowPicker            from './components/workflow/WorkflowPicker.vue'
import { IpcBridge }             from '@adapters/ipc/IpcBridge'
import type { Workflow }         from '@core/types/workflow.types'

const panelStore      = usePanelStore()
const workflowUiStore = useWorkflowUiStore()

// ── 工作流 ─────────────────────────────────────────────────
let bridge: IpcBridge | null = null

async function getBridge(): Promise<IpcBridge> {
  if (bridge) return bridge
  for (let i = 0; i < 30; i++) {
    if (window.electronAPI) break
    await new Promise(r => setTimeout(r, 100))
  }
  bridge = new IpcBridge()
  return bridge
}

async function loadWorkflows() {
  workflowUiStore.setLoading(true)
  try {
    const b = await getBridge()
    workflowUiStore.setWorkflows(await b.workflowList())
  } catch (err) {
    console.error('[App] 加载工作流失败:', err)
  } finally {
    workflowUiStore.setLoading(false)
  }
}

async function handleWorkflowRun(wf: Workflow) {
  if (workflowUiStore.isRunning) return
  workflowUiStore.closePicker()
  const execId = `exec-${Date.now()}`
  workflowUiStore.startExecution(execId, wf)

  for (const step of wf.steps) {
    if (step.type === 'terminal' || step.type === 'editor' || step.type === 'search') {
      const target = step.target === 'auto' ? 'workbox1' : step.target
      // 同时通知 panelStore（新路径）和 workflowUiStore（兼容旧路径）
      panelStore.sendToPanel(target, {
        type:    step.type === 'terminal' ? 'command' : 'data',
        content: step.command,
        source:  wf.id,
      })
    }
    if ((step as any).delayMs) {
      await new Promise(r => setTimeout(r, (step as any).delayMs))
    }
  }

  workflowUiStore.finishExecution(execId, true)
  setTimeout(() => workflowUiStore.clearExecution(), 3000)
}

onMounted(async () => {
  panelStore.restore()
  await loadWorkflows()
})

onUnmounted(() => {
  panelStore.save()
})
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #1e1e2e;
  color: #cdd6f4;
  overflow: hidden;
}

.panels-container {
  display: flex;
  flex: 1;
  gap: 6px;
  padding: 6px;
  overflow: hidden;
}

.left-panels,
.right-panels {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 6px;
  min-width: 0;
}

.middle-panel {
  flex: 1.4;
  min-width: 0;
}
</style>