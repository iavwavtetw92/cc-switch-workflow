# CC-Switch-Pro 项目结果文档

## 项目概述

**CC-Switch-Pro** 是一个基于 Electron + Vue 3 的多窗口协同工作流工具，旨在提升开发效率。

### 核心功能
- **2个工作框** - 终端模拟，执行命令
- **1个学习框** - Monaco Editor编辑器，支持Markdown
- **2个搜索框** - Web搜索 + 项目文件搜索
- **集中控制器** - 统一输入端 + 命令分发
- **飞书MCP集成** - 文档搜索、读取、创建、信息收集
- **CC Switch集成** - 读取模型配置、模型切换

---

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 框架 | Electron + Vue 3 | 跨平台桌面应用 |
| UI | Element Plus | 中文友好、组件丰富 |
| 终端 | xterm.js | 工作框终端模拟 |
| 编辑器 | Monaco Editor | 学习框代码编辑 |
| 状态管理 | Pinia | Vue 3推荐 |
| 数据同步 | BroadcastChannel + localStorage | 跨窗口通信 |
| 进程管理 | Node.js child_process | 命令执行 |

---

## 项目结构

```
D:/CC-Switch-Pro/
├── package.json              # 项目配置
├── vite.config.ts            # Vite构建配置
├── tsconfig.json             # TypeScript配置
├── electron-builder.json     # Electron打包配置
├── src/
│   ├── main/                 # Electron主进程
│   │   ├── index.ts          # 主进程入口
│   │   ├── commandExecutor.ts # 命令执行器
│   │   └── windowManager.ts  # 窗口管理器
│   │
│   ├── preload/              # 预加载脚本
│   │   └── index.ts          # 暴露API给渲染进程
│   │
│   ├── renderer/             # Vue渲染进程
│   │   ├── index.html        # 入口HTML
│   │   ├── main.ts           # Vue入口
│   │   ├── App.vue           # 根组件
│   │   ├── components/
│   │   │   ├── central/      # 集中控制器组件
│   │   │   │   ├── CentralController.vue
│   │   │   │   ├── UnifiedInput.vue
│   │   │   │   ├── StatusPanel.vue
│   │   │   │   └── CommandPalette.vue
│   │   │   ├── panels/       # 面板组件
│   │   │   │   ├── WorkBox.vue
│   │   │   │   ├── LearnBox.vue
│   │   │   │   └── SearchBox.vue
│   │   │   ├── shared/       # 共享组件
│   │   │   │   ├── PanelContainer.vue
│   │   │   │   └── StatusBar.vue
│   │   │   └── settings/
│   │   │       └── CommandConfig.vue
│   │   ├── stores/           # Pinia状态管理
│   │   │   ├── panelStore.ts
│   │   │   └── commandStore.ts
│   │   ├── services/         # 服务层
│   │   │   ├── dataChannel.ts
│   │   │   └── inputDispatcher.ts
│   │   └── styles/
│   │       └── main.css
│   │
│   ├── shared/               # 共享代码
│   │   ├── types/
│   │   │   └── index.ts      # 类型定义
│   │   └── constants/
│   │
│   └── external/             # 外部集成
│       ├── cc-switch/
│       │   └── reader.ts     # CC Switch数据库读取器
│       └── mcp-servers/
│           └── feishu-mcp/   # 飞书MCP服务器
│               ├── server.ts
│               └── package.json
│
├── data/                     # 数据存储
└── dist/                     # 构建输出
```

---

## 运行方式

### 开发模式
```bash
cd D:/CC-Switch-Pro
npm run dev
```
启动Vite开发服务器，访问地址会显示在终端输出中。

### Electron开发模式
```bash
npm run electron:dev
```
同时启动Vite和Electron应用。

### 构建
```bash
npm run build       # 构建Vue应用
npm run electron:build  # 打包Electron应用
```

---

## 当前状态

### 已完成
- ✅ 项目框架搭建
- ✅ 基础组件实现
- ✅ Vite配置修复（入口路径问题）
- ✅ 开发服务器可正常运行

### 待完善
- ⏳ 终端集成（xterm.js实际运行）
- ⏳ Monaco Editor集成
- ⏳ 飞书MCP API实际调用（需配置飞书App ID/Secret）
- ⏳ CC Switch数据库读取功能
- ⏳ 预置命令配置保存
- ⏳ 状态监控面板

---

## 已解决的问题

### 问题：访问localhost出现404错误

**原因**：Vite配置中`rollupOptions.input`指向了子目录的index.html，但Vite默认期望在root目录找到入口文件。

**解决方案**：修改`vite.config.ts`，将`root`设置为`src/renderer`目录：

```typescript
export default defineConfig({
  plugins: [vue()],
  root: resolve(__dirname, 'src/renderer'),  // 添加此行
  // ...其他配置
})
```

---

## 端口占用情况

由于多个端口被占用，开发服务器可能使用以下端口之一：
- 5173（默认）
- 5174
- 5175
- 5176
- 5177
- 5178

启动后查看终端输出获取实际端口。

---

## 统一输入分发规则

| 格式 | 说明 | 示例 |
|------|------|------|
| `>命令名` | 执行预置命令 | `>git status` |
| `@目标:内容` | 分发到指定框 | `@1:ls`（发送到工作框1） |
| `mcp:工具:参数` | MCP调用 | `mcp:feishu_search:关键词` |
| 默认 | 发送到焦点框 | 直接输入内容 |

目标标识：
- `@1` - 工作框1
- `@2` - 工作框2
- `@s` - 搜索框
- `@l` - 学习框

---

## 飞书MCP工具

| 工具名 | 功能 | 参数 |
|--------|------|------|
| `feishu_search` | 文档搜索 | query, limit |
| `feishu_read` | 读取文档 | doc_id, format |
| `feishu_create` | 创建文档 | title, content, folder_id |
| `feishu_collect_info` | 收集信息 | title, content, tags |

**注意**：需要配置飞书开放平台的App ID和App Secret才能实际调用。

---

## 下一步建议

1. **测试基础UI** - 确认所有面板正常显示
2. **集成xterm.js** - 实现终端实际功能
3. **集成Monaco Editor** - 实现编辑器功能
4. **配置飞书API** - 完成MCP工具的实际调用
5. **实现CC Switch读取** - 从cc-switch.db读取模型配置

---

*文档生成时间：2026-05-22*