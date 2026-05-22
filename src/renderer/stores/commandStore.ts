// Pinia状态管理 - 命令配置
import { defineStore } from 'pinia'

interface CommandConfig {
  id: string
  name: string
  shortcut?: string
  category: 'terminal' | 'system' | 'mcp' | 'custom'
  target: 'workbox1' | 'workbox2' | 'all' | 'searchbox1' | 'searchbox2' | 'learnbox'
  command: string
  params?: CommandParam[]
  description: string
  enabled: boolean
}

interface CommandParam {
  name: string
  type: 'string' | 'number' | 'file' | 'directory'
  default?: any
  required: boolean
}

// 默认预置命令
const defaultCommands: CommandConfig[] = [
  {
    id: 'cmd-git-status',
    name: 'Git状态',
    shortcut: 'Ctrl+G',
    category: 'terminal',
    target: 'workbox1',
    command: 'git status',
    description: '查看Git仓库状态',
    enabled: true
  },
  {
    id: 'cmd-git-log',
    name: 'Git日志',
    category: 'terminal',
    target: 'workbox1',
    command: 'git log --oneline -10',
    description: '查看最近10条Git提交',
    enabled: true
  },
  {
    id: 'cmd-npm-dev',
    name: 'NPM开发',
    category: 'terminal',
    target: 'workbox1',
    command: 'npm run dev',
    description: '运行npm开发脚本',
    enabled: true
  },
  {
    id: 'cmd-npm-build',
    name: 'NPM构建',
    category: 'terminal',
    target: 'workbox1',
    command: 'npm run build',
    description: '运行npm构建脚本',
    enabled: true
  },
  {
    id: 'cmd-dir',
    name: '查看目录',
    category: 'terminal',
    target: 'workbox2',
    command: 'dir',
    description: '列出当前目录文件',
    enabled: true
  },
  {
    id: 'cmd-clear',
    name: '清屏',
    shortcut: 'Ctrl+L',
    category: 'terminal',
    target: 'all',
    command: 'clear',
    description: '清空终端输出',
    enabled: true
  },
  {
    id: 'cmd-feishu-search',
    name: '飞书搜索',
    category: 'mcp',
    target: 'searchbox1',
    command: 'mcp:feishu_search',
    params: [{ name: 'query', type: 'string', required: true }],
    description: '在飞书知识库中搜索',
    enabled: true
  },
  {
    id: 'cmd-project-find',
    name: '项目查找',
    category: 'terminal',
    target: 'searchbox2',
    command: 'project-search',
    params: [{ name: 'query', type: 'string', required: true }],
    description: '在项目文件中搜索',
    enabled: true
  }
]

export const useCommandStore = defineStore('command', {
  state: () => ({
    commands: [] as CommandConfig[]
  }),

  actions: {
    // 加载命令配置
    loadCommands() {
      const saved = localStorage.getItem('commands-config')
      if (saved) {
        this.commands = JSON.parse(saved)
      } else {
        this.commands = defaultCommands
        this.saveCommands()
      }
    },

    // 保存命令配置
    saveCommands() {
      localStorage.setItem('commands-config', JSON.stringify(this.commands))
    },

    // 添加命令
    addCommand(command: CommandConfig) {
      this.commands.push(command)
      this.saveCommands()
    },

    // 更新命令
    updateCommand(id: string, command: Partial<CommandConfig>) {
      const index = this.commands.findIndex(c => c.id === id)
      if (index !== -1) {
        this.commands[index] = { ...this.commands[index], ...command }
        this.saveCommands()
      }
    },

    // 删除命令
    removeCommand(id: string) {
      this.commands = this.commands.filter(c => c.id !== id)
      this.saveCommands()
    },

    // 获取命令
    getCommand(name: string): CommandConfig | undefined {
      return this.commands.find(c => c.name === name || c.id === name)
    },

    // 按分类获取命令
    getCommandsByCategory(category: string): CommandConfig[] {
      return this.commands.filter(c => c.category === category)
    }
  }
})