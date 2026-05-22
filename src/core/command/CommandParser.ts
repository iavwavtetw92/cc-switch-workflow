// ============================================================
// CommandParser — Core Layer
// 统一输入解析器，纯函数，无副作用，100% 可单测
// ============================================================

import type {
  ParsedCommand,
  CommandAlias,
} from '../types/command.types'

/** 目标标识符映射表 */
const TARGET_MAP: Record<string, string> = {
  '1':  'workbox1',
  '2':  'workbox2',
  's':  'searchbox1',
  's1': 'searchbox1',
  's2': 'searchbox2',
  'l':  'learnbox',
  'learn': 'learnbox',
}

export class CommandParser {
  private aliases: Map<string, string>

  constructor(aliases: CommandAlias[] = []) {
    this.aliases = new Map(aliases.map(a => [a.alias.toLowerCase(), a.workflowId]))
  }

  /**
   * 更新别名表（动态注册工作流别名）
   */
  updateAliases(aliases: CommandAlias[]): void {
    this.aliases.clear()
    for (const a of aliases) {
      this.aliases.set(a.alias.toLowerCase(), a.workflowId)
    }
  }

  /**
   * 解析用户输入，返回结构化命令
   *
   * 支持的格式：
   *   >workflow-id          → { type: 'workflow', workflowId: 'workflow-id' }
   *   >gs                   → { type: 'workflow-alias', alias: 'gs' } (若别名已注册则 workflow)
   *   @1:ls -la             → { type: 'direct', target: 'workbox1', content: 'ls -la' }
   *   @l:# Title            → { type: 'direct', target: 'learnbox', content: '# Title' }
   *   mcp:feishu_search:kw  → { type: 'mcp', tool: 'feishu_search', params: {query:'kw'} }
   *   mcp:feishu_read:id    → { type: 'mcp', tool: 'feishu_read', params: {doc_id:'id'} }
   *   cc:switch:gpt4        → { type: 'cc-switch', action: 'switch', modelId: 'gpt4' }
   *   cc:list               → { type: 'cc-list' }
   *   普通文本               → { type: 'plain', content: '...' }
   */
  parse(raw: string): ParsedCommand {
    const input = raw.trim()

    if (!input) {
      return { type: 'plain', raw, content: '' }
    }

    // 1. 工作流触发：以 > 开头
    if (input.startsWith('>')) {
      return this.parseWorkflowTrigger(input, raw)
    }

    // 2. 面板直发：以 @目标: 开头
    if (input.startsWith('@')) {
      return this.parseDirectDispatch(input, raw)
    }

    // 3. MCP 调用：以 mcp: 开头
    if (input.toLowerCase().startsWith('mcp:')) {
      return this.parseMcpInvoke(input, raw)
    }

    // 4. CC Switch：以 cc: 开头
    if (input.toLowerCase().startsWith('cc:')) {
      return this.parseCcSwitch(input, raw)
    }

    // 5. 默认：普通文本
    return { type: 'plain', raw, content: input }
  }

  // --------------------------------------------------------
  // 私有解析方法
  // --------------------------------------------------------

  private parseWorkflowTrigger(input: string, raw: string): ParsedCommand {
    const id = input.slice(1).trim()

    if (!id) {
      // 裸 > 号，返回 plain
      return { type: 'plain', raw, content: input }
    }

    // 检查是否为注册的别名
    const resolvedId = this.aliases.get(id.toLowerCase())
    if (resolvedId) {
      return { type: 'workflow', raw, workflowId: resolvedId, alias: id }
    }

    return { type: 'workflow', raw, workflowId: id }
  }

  private parseDirectDispatch(input: string, raw: string): ParsedCommand {
    // 格式：@target:content
    const match = input.match(/^@([^:]+):(.*)$/s)
    if (!match) {
      // 没有冒号，视为 plain
      return { type: 'plain', raw, content: input }
    }

    const targetKey = match[1].trim().toLowerCase()
    const content = match[2]  // 保留原始内容（含换行）

    const target = TARGET_MAP[targetKey] ?? targetKey

    return { type: 'direct', raw, target, content }
  }

  private parseMcpInvoke(input: string, raw: string): ParsedCommand {
    // 格式：mcp:tool_name:param_value
    // 或：  mcp:tool_name:key=val&key2=val2
    const body = input.slice(4)  // 去掉 'mcp:'
    const colonIdx = body.indexOf(':')

    if (colonIdx === -1) {
      // 只有工具名，无参数
      return { type: 'mcp', raw, tool: body.trim(), params: {} }
    }

    const tool = body.slice(0, colonIdx).trim()
    const paramStr = body.slice(colonIdx + 1)

    const params = this.parseMcpParams(tool, paramStr)

    return { type: 'mcp', raw, tool, params }
  }

  /**
   * MCP 参数解析：
   * - feishu_search: 直接文本作为 query
   * - feishu_read:   直接文本作为 doc_id
   * - feishu_create: title=xxx&content=yyy 或直接文本作为 title
   * - feishu_collect_info: 直接文本作为 title
   * - 其他: 尝试 key=val&... 格式，否则作为 query
   */
  private parseMcpParams(tool: string, paramStr: string): Record<string, unknown> {
    // 尝试解析 key=val&... 格式
    if (paramStr.includes('=')) {
      try {
        const pairs = paramStr.split('&')
        const result: Record<string, unknown> = {}
        for (const pair of pairs) {
          const eqIdx = pair.indexOf('=')
          if (eqIdx > 0) {
            result[pair.slice(0, eqIdx).trim()] = decodeURIComponent(pair.slice(eqIdx + 1))
          }
        }
        if (Object.keys(result).length > 0) return result
      } catch {
        // 解析失败，降级
      }
    }

    // 根据工具名决定默认参数 key
    const defaultKeyMap: Record<string, string> = {
      feishu_search: 'query',
      feishu_read: 'doc_id',
      feishu_create: 'title',
      feishu_collect_info: 'title',
    }

    const key = defaultKeyMap[tool] ?? 'query'
    return { [key]: paramStr }
  }

  private parseCcSwitch(input: string, raw: string): ParsedCommand {
    // 格式：cc:list
    // 格式：cc:switch:modelId
    const body = input.slice(3).toLowerCase()  // 去掉 'cc:'
    const parts = body.split(':')
    const action = parts[0]?.trim()

    if (action === 'list') {
      return { type: 'cc-list', raw }
    }

    if (action === 'switch') {
      const modelId = parts[1]?.trim()
      return { type: 'cc-switch', raw, action: 'switch', modelId }
    }

    // 未知 cc 子命令，视为 plain
    return { type: 'plain', raw, content: input }
  }
}
