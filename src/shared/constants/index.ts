// 默认预置命令配置
export const DEFAULT_COMMANDS = [
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
    id: 'cmd-pip-install',
    name: 'PIP安装',
    category: 'terminal',
    target: 'workbox2',
    command: 'pip install -r requirements.txt',
    description: '安装Python依赖',
    enabled: true
  },
  {
    id: 'cmd-python-run',
    name: 'Python运行',
    category: 'terminal',
    target: 'workbox2',
    command: 'python main.py',
    description: '运行Python主程序',
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
  }
]

// 工作模式配置
export const DEFAULT_WORK_MODES = [
  {
    name: '开发模式',
    layout: ['workbox1', 'workbox2', 'learnbox'],
    description: '适合日常开发工作'
  },
  {
    name: '搜索模式',
    layout: ['searchbox1', 'searchbox2', 'learnbox'],
    description: '适合资料收集和整理'
  },
  {
    name: '全览模式',
    layout: ['workbox1', 'workbox2', 'learnbox', 'searchbox1', 'searchbox2'],
    description: '显示所有面板'
  },
  {
    name: '专注模式',
    layout: ['workbox1'],
    description: '仅显示单个工作框'
  }
]

// 面板配置
export const PANEL_CONFIG = {
  workbox1: {
    label: '工作框 1',
    type: 'workbox',
    icon: '⚡',
    detachable: true
  },
  workbox2: {
    label: '工作框 2',
    type: 'workbox',
    icon: '⚡',
    detachable: true
  },
  learnbox: {
    label: '学习框',
    type: 'learnbox',
    icon: '📖',
    detachable: true
  },
  searchbox1: {
    label: '搜索框 (Web)',
    type: 'searchbox',
    icon: '🔍',
    mode: 'web',
    detachable: true
  },
  searchbox2: {
    label: '搜索框 (项目)',
    type: 'searchbox',
    icon: '📁',
    mode: 'project',
    detachable: true
  }
}