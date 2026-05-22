// ============================================================
// useCommandInput — Composable
// 统一输入框逻辑：接入 CommandParser，分发到对应目标
// ============================================================

import { ref, computed } from 'vue'
import { CommandParser } from '@core/command/CommandParser'
import { useLayoutStore } from '../stores/layoutStore'
import { useWorkflowUiStore } from '../stores/workflowUiStore'
import { useWorkflow } from './useWorkflow'
import type { ParsedCommand } from '@core/types/command.types'

const parser = new CommandParser()

export function useCommandInput() {
  const layoutStore   = useLayoutStore()
  const workflowStore = useWorkflowUiStore()
  const { runWorkflowById, workflows } = useWorkflow()

  const inputText  = ref('')

  // --------------------------------------------------------
  // 动态更新 CommandParser 别名（工作流加载后调用）
  // --------------------------------------------------------

  function syncAliases() {
    const aliases = workflows()
      .flatMap(wf => (wf.trigger?.shortcut
        ? [{ alias: wf.trigger.shortcut, workflowId: wf.id }]
        : []))
    parser.updateAliases(aliases)
  }

  // --------------------------------------------------------
  // 输入提示
  // --------------------------------------------------------

  const hintText = computed(() => {
    const v = inputText.value
    if (v.startsWith('>'))   return `工作流模式 — 输入工作流 ID 或别名，例如 >git-daily`
    if (v.startsWith('@'))   return `面板直发 — 例如 @1:git status / @l:# 笔记`
    if (v.toLowerCase().startsWith('mcp:')) return `MCP 调用 — 例如 mcp:feishu_search:关键词`
    if (v.toLowerCase().startsWith('cc:'))  return `CC Switch — cc:list 或 cc:switch:模型ID`
    return `发送到: ${layoutStore.focusedPanelLabel}`
  })

  // --------------------------------------------------------
  // 解析并执行输入
  // --------------------------------------------------------

  async function submit() {
    const raw = inputText.value.trim()
    if (!raw) return

    const cmd: ParsedCommand = parser.parse(raw)
    inputText.value = ''

    switch (cmd.type) {
      case 'workflow': {
        syncAliases()
        if (cmd.workflowId) await runWorkflowById(cmd.workflowId)
        break
      }

      case 'direct': {
        workflowStore.sendToPanel(cmd.target === 'focused' ? layoutStore.focusedPanel : (cmd.target ?? layoutStore.focusedPanel), {
          type:    'command',
          content: cmd.content ?? raw,
        })
        break
      }

      case 'plain': {
        // 发送到当前焦点面板
        workflowStore.sendToPanel(layoutStore.focusedPanel, {
          type:    'command',
          content: cmd.content ?? raw,})
        break
      }

      case 'mcp': {
        const mcpTool = cmd.tool ?? ''
        workflowStore.sendToPanel('searchbox1', {
          type:    'data',
          content: `正在调用 MCP 工具: ${mcpTool}...`,
          source:  'mcp',
        })
        // 实际 MCP 调用委托给主进程
        window.electronAPI?.mcpInvoke({ tool: mcpTool, params: (cmd.params ?? {}) as Record<string, unknown> })
          .then((result: unknown) => {
            workflowStore.sendToPanel('searchbox1', {
              type:    'mcp-result',
              content: JSON.stringify(result, null, 2),
              source:  mcpTool,
            })
          })
          .catch((err: Error) => {
            workflowStore.sendToPanel('searchbox1', {
              type:    'data',
              content: `MCP 调用失败: ${err.message}`,
              source:  'mcp-error',
            })
          })
        break
      }

      case 'cc-list': {
        window.electronAPI?.ccSwitchProviders().then((providers: any[]) => {
          const text = providers.map((p, i) =>
            `${p.isActive ? '✓' : ' '} [${i + 1}] ${p.name} (${p.type})`
          ).join('\n')
          workflowStore.sendToPanel('workbox1', {
            type: 'data',
            content: `CC Switch 可用模型:\n${text}`,
          })
        })
        break
      }

      case 'cc-switch': {
        if (cmd.modelId) {
          window.electronAPI?.ccSwitchSwitch({ providerId: cmd.modelId }).then((r: any) => {
            workflowStore.sendToPanel('workbox1', {
              type: 'data',
              content: r.success ? `✓ 已切换到 ${cmd.modelId}` : `切换失败`,
            })
          })
        }
        break
      }
    }
  }

  // Tab 切换焦点
  function handleTab(e: KeyboardEvent) {
    e.preventDefault()
    layoutStore.cycleFocus()
  }

  return {
    inputText,
    hintText,
    submit,
    handleTab,
    syncAliases,
  }
}
