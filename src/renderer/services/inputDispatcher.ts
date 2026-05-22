// 输入分发服务 - 解析统一输入并分发到目标
export class InputDispatcher {
  dispatch(input: string): DispatchResult {
    // 1. 命令模式：以 > 开头
    if (input.startsWith('>')) {
      const cmdName = input.slice(1).trim()
      return {
        type: 'command',
        name: cmdName
      }
    }

    // 2. 快捷分发：以 @目标 开头
    if (input.startsWith('@')) {
      return this.parseTargetDispatch(input)
    }

    // 3. MCP调用：以 mcp: 开头
    if (input.startsWith('mcp:')) {
      return this.parseMCPInvoke(input)
    }

    // 4. 默认：直接内容
    return {
      type: 'direct',
      target: 'current',
      content: input
    }
  }

  parseTargetDispatch(input: string): DispatchResult {
    // @1:git status → target='workbox1', content='git status'
    // @s:搜索词 → target='searchbox1', content='搜索词'
    // @learn:笔记内容 → target='learnbox', content='笔记内容'

    const match = input.match(/^@(\d|s|s2|l|m):(.*)/)
    if (!match) {
      return { type: 'direct', target: 'current', content: input }
    }

    const targetMap: Record<string, string> = {
      '1': 'workbox1',
      '2': 'workbox2',
      's': 'searchbox1',
      's2': 'searchbox2',
      'l': 'learnbox',
      'm': 'mcp'
    }

    const target = targetMap[match[1]] || 'workbox1'
    const content = match[2].trim()

    return {
      type: 'direct',
      target,
      content
    }
  }

  parseMCPInvoke(input: string): DispatchResult {
    // mcp:feishu_search:关键词
    // mcp:feishu_read:doc_id

    const parts = input.slice(4).split(':')
    const tool = parts[0] || ''
    const params = parts.slice(1).join(':')

    return {
      type: 'mcp',
      tool,
      params: { query: params }
    }
  }
}

interface DispatchResult {
  type: 'command' | 'direct' | 'mcp'
  name?: string
  target?: string
  content?: string
  tool?: string
  params?: any
}