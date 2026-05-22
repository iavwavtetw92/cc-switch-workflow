// ============================================================
// Built-in Skills — Core Layer
// 内置技能包定义，无框架依赖
// ============================================================

import type { Skill } from '../types/ai.types'

export const BUILTIN_SKILLS: Skill[] = [
  {
    id:         'explain-error',
    name:       '解释错误',
    icon:       '🔍',
    panelTypes: ['workbox'],
    inputMode:  'selection',
    prompt: `你是一个终端错误分析专家。用户会提供终端输出内容，请：
1. 用一句话说明错误原因
2. 给出 2-3 个具体的解决步骤（用命令行格式）
3. 如果有多种可能原因，按可能性排序列出

回答要简洁，直接给出可操作的方案。`,
  },
  {
    id:         'suggest-command',
    name:       '推荐命令',
    icon:       '⚡',
    panelTypes: ['workbox'],
    inputMode:  'selection',
    prompt: `你是一个命令行专家。根据用户提供的终端上下文（当前目录、已执行的命令和输出），推荐下一步最有用的命令。
格式：
- 直接给出命令（代码块格式）
- 一句话说明用途
- 如有多个选项，最多列 3 个`,
  },
  {
    id:         'code-review',
    name:       '代码审查',
    icon:       '🧐',
    panelTypes: ['workbox'],
    inputMode:  'selection',
    prompt: `你是一个资深代码审查专家。对用户提供的代码进行审查，重点关注：
1. 潜在 bug 或逻辑错误（Critical/High 优先）
2. 性能问题
3. 安全隐患
4. 可读性改进建议

每个问题注明严重程度（Critical/High/Medium/Low），并给出修改建议。`,
  },
  {
    id:         'summarize-note',
    name:       '总结笔记',
    icon:       '📝',
    panelTypes: ['learnbox'],
    inputMode:  'all',
    prompt: `你是一个学习助手。对用户的笔记内容进行总结：
1. 提炼 3-5 个核心要点（bullet points）
2. 识别笔记中的知识结构
3. 在末尾补充 1-2 个相关的延伸学习建议

保持原有的技术术语，输出用 Markdown 格式。`,
  },
  {
    id:         'expand-note',
    name:       '扩写笔记',
    icon:       '✨',
    panelTypes: ['learnbox'],
    inputMode:  'all',
    prompt: `你是一个技术写作专家。对用户的笔记进行扩写和完善：
1. 补充缺失的细节和背景知识
2. 为代码示例添加注释说明
3. 将简短的要点扩展为完整的段落
4. 保持原有结构，在合适位置插入补充内容

输出完整的 Markdown 文档。`,
  },
  {
    id:         'summarize-search',
    name:       'AI 汇总',
    icon:       '🤖',
    panelTypes: ['searchbox'],
    inputMode:  'query+results',
    prompt: `你是一个信息整合专家。根据用户的搜索词和搜索结果，提供一个结构化的汇总：
1. 用 2-3 句话直接回答搜索意图
2. 列出最相关的 3-5 个关键发现
3. 如果结果来自代码文件，指出最值得关注的文件和位置

回答要精炼，避免重复搜索结果中已有的内容。`,
  },
]

/** 按面板类型过滤技能 */
export function getSkillsForPanel(
  panelType: 'workbox' | 'learnbox' | 'searchbox',
): Skill[] {
  return BUILTIN_SKILLS.filter(s => s.panelTypes.includes(panelType))
}

/** 根据 ID 获取技能 */
export function getSkillById(id: string): Skill | undefined {
  return BUILTIN_SKILLS.find(s => s.id === id)
}
