# CC Switch Pro

快捷开发工作流工具 - 基于 Electron + Vue 3 的多窗口协同工作流管理应用。

## 功能特性

- **多面板工作流**: 2个工作框（终端）、1个学习框（笔记）、2个搜索框
- **统一输入端**: 一个输入框分发命令到不同面板
- **预置命令**: 可配置快捷命令，一键执行
- **面板分离**: 支持将面板拖拽为独立窗口
- **工作模式预置**: 保存和加载工作布局
- **CC Switch集成**: 读取和切换CC Switch模型配置
- **飞书MCP**: 集成飞书开放平台，快速收集信息
- **数据协同**: 面板间数据可传输共享

## 快速开始

### 安装依赖
```bash
npm install
```

### 开发模式
```bash
npm run electron:dev
```

### 构建
```bash
npm run electron:build
```

## 统一输入语法

| 语法 | 说明 | 示例 |
|------|------|------|
| `>命令名` | 执行预置命令 | `>git-status` |
| `@目标:内容` | 分发到指定面板 | `@1:git status` |
| `mcp:工具:参数` | MCP调用 | `mcp:feishu_search:关键词` |
| 默认 | 发送到焦点面板 | 直接输入 |

目标代号: `1`=工作框1, `2`=工作框2, `s`=搜索框1, `s2`=搜索框2, `l`=学习框

## 目录结构

```
src/
├── main/           # Electron主进程
├── preload/        # 预加载脚本
├── renderer/       # Vue应用
│   ├── components/ # UI组件
│   ├── stores/     # Pinia状态
│   └── services/   # 服务层
└── shared/         # 共享代码
    ├── types/      # TypeScript类型
    └ constants/   # 常量配置
```

## 配置飞书MCP

在 `data/mcp/feishu-config.json` 中配置飞书API:

```json
{
  "appId": "your_app_id",
  "appSecret": "your_app_secret"
}
```

## License

MIT