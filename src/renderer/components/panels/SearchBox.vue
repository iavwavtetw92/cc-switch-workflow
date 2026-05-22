<template>
  <div class="search-box">
    <!-- 搜索输入 -->
    <div class="search-input-area">
      <span class="search-icon">{{ mode === 'web' ? '🌐' : '🔍' }}</span>
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        :placeholder="mode === 'web' ? '搜索 DuckDuckGo...' : '在项目中搜索...'"
        @keydown.enter="performSearch"
      />
      <button class="search-btn" @click="performSearch" :disabled="loading">
        {{ loading ? '搜索中…' : (mode === 'web' ? '搜索' : '查找') }}
      </button>
      <!-- 搜索完成后显示 AI 汇总按钮 -->
      <SkillPicker
        v-if="results.length > 0"
        v-model="activeSkillId"
        panel-type="searchbox"
        @run="onAiSummarize"
      />
    </div>

    <!-- 项目路径（仅 project 模式） -->
    <div class="path-bar" v-if="mode === 'project'">
      <span class="path-label">路径:</span>
      <input
        v-model="projectPath"
        class="path-input"
        type="text"
        placeholder="D:\\"
        @change="savePath"
      />
    </div>

    <!-- AI 汇总卡片（固定在结果上方） -->
    <AiPanel
      :visible="aiVisible"
      :text="aiText"
      :is-streaming="isStreaming"
      skill-name="AI 汇总"
      model-label="CC Switch AI"
      :show-insert="false"
      @close="aiVisible = false"
    />

    <!-- 搜索结果 -->
    <div class="search-results">
      <div v-if="loading" class="search-loading">
        <span class="loading-dot">●</span> 搜索中…
      </div>

      <div v-else-if="results.length > 0">
        <div
          v-for="(result, i) in results"
          :key="i"
          class="search-result"
          @click="selectResult(result)"
        >
          <div class="result-title">{{ result.title }}</div>
          <div class="result-snippet">{{ result.snippet }}</div>
          <div class="result-source" v-if="result.source">{{ result.source }}</div>
        </div>
      </div>

      <div class="no-results" v-else-if="searched">
        <span>未找到「{{ lastQuery }}」的相关结果</span>
      </div>

      <div class="search-placeholder" v-else>
        <span v-if="mode === 'web'">输入关键词，在 DuckDuckGo 搜索</span>
        <span v-else>在项目目录中全文搜索</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useWorkflowUiStore } from '../../stores/workflowUiStore'
import { useAi }              from '../../composables/useAi'
import AiPanel                from '../shared/AiPanel.vue'
import SkillPicker            from '../shared/SkillPicker.vue'

const props = defineProps<{
  id: string
  mode: 'web' | 'project'
}>()

const workflowStore = useWorkflowUiStore()
const { isStreaming, streamText, chatStream, buildMessages } = useAi()

const searchQuery  = ref('')
const lastQuery    = ref('')
const results      = ref<SearchResult[]>([])
const searched     = ref(false)
const loading      = ref(false)
const projectPath  = ref('D:\\')
const activeSkillId = ref<string | undefined>()
const aiVisible    = ref(false)
const aiText       = ref('')

interface SearchResult {
  title:   string
  snippet: string
  source?: string
  url?:    string
  file?:   string
  line?:   number
}

// 同步 AI 流式文本
watch(streamText, (val) => { aiText.value = val })

onMounted(() => {
  const saved = localStorage.getItem('project-path')
  if (saved) projectPath.value = saved
})

function savePath() {
  localStorage.setItem('project-path', projectPath.value)
}

async function performSearch() {
  const query = searchQuery.value.trim()
  if (!query) return

  loading.value  = true
  searched.value = true
  lastQuery.value = query
  aiVisible.value = false   // 关闭上次 AI 汇总

  try {
    if (props.mode === 'web') {
      results.value = await webSearch(query)
    } else {
      results.value = await projectSearch(query)
    }
  } finally {
    loading.value = false
  }
}

// Web 搜索 — 构造 DuckDuckGo 搜索链接
async function webSearch(query: string): Promise<SearchResult[]> {
  const url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
  return [{
    title:   `在浏览器中搜索: ${query}`,
    snippet: url,
    url,
    source:  'DuckDuckGo',
  }]
}

// 项目搜索 — 通过 IPC 调用主进程 fs 搜索
async function projectSearch(query: string): Promise<SearchResult[]> {
  try {
    const raw = await (window.electronAPI as any)?.projectSearch?.({
      query,
      path: projectPath.value,
    })
    if (!raw) return []
    return (raw as any[]).map(r => ({
      title:   (r.file as string)?.split(/[/\\]/).pop() ?? r.file,
      snippet: (r.content as string)?.substring(0, 120) ?? '',
      source:  `${r.file} : 行 ${r.line}`,
      file:    r.file,
      line:    r.line,
    }))
  } catch {
    return []
  }
}

/** AI 汇总搜索结果 */
async function onAiSummarize(skillId: string) {
  activeSkillId.value = skillId
  aiText.value = ''
  aiVisible.value = true

  // 将所有结果拼装成上下文
  const context = results.value
    .map(r => `【${r.title}】\n${r.snippet}${r.source ? `\n来源: ${r.source}` : ''}`)
    .join('\n\n')

  const messages = buildMessages(
    `搜索关键词: "${lastQuery.value}"，请汇总以上搜索结果的关键信息`,
    context,
  )
  await chatStream(messages, skillId)
}

function selectResult(result: SearchResult) {
  if (result.url) {
    ;(window as any).open?.(result.url, '_blank')
    return
  }

  // 项目搜索结果 → 发送到学习框
  workflowStore.sendToPanel('learnbox', {
    type:    'data',
    content: `\`\`\`\n${result.snippet}\n\`\`\``,
    source:  result.source,
  })
}

// 监听工作流分发的面板消息
watch(
  () => workflowStore.panelMessages[props.id],
  (msg) => {
    if (!msg) return
    workflowStore.clearPanelMessage(props.id)
    if (msg.type === 'data' || msg.type === 'mcp-result') {
      try {
        const parsed = JSON.parse(msg.content)
        if (Array.isArray(parsed)) {
          results.value = parsed
          searched.value = true
        }
      } catch {
        results.value = [{ title: 'MCP 结果', snippet: msg.content, source: msg.source }]
        searched.value = true
      }
    }
  },
)
</script>

<style scoped>
.search-box {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #11111b;
  border: 1px solid #313244;
  border-radius: 6px;
  overflow: hidden;
}

/* ── 搜索输入区 ─────────────────────────────────────────── */
.search-input-area {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #181825;
  border-bottom: 1px solid #313244;
  flex-wrap: wrap;
}

.search-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  min-width: 120px;
  background: #11111b;
  border: 1px solid #313244;
  border-radius: 5px;
  padding: 6px 10px;
  font-size: 13px;
  color: #cdd6f4;
  outline: none;
  transition: border-color 0.15s;
}
.search-input:focus { border-color: #89b4fa; }
.search-input::placeholder { color: #45475a; }

.search-btn {
  padding: 6px 14px;
  background: #1e3a5f;
  border: 1px solid #89b4fa44;
  border-radius: 5px;
  color: #89b4fa;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.12s;
}
.search-btn:hover:not(:disabled) { background: #264f7d; border-color: #89b4fa; }
.search-btn:disabled { opacity: 0.5; cursor: default; }

/* ── 路径栏 ─────────────────────────────────────────────── */
.path-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: #181825;
  border-bottom: 1px solid #1e1e2e;
  font-size: 11px;
}

.path-label { color: #6c7086; flex-shrink: 0; }

.path-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #f9e2af;
  font-family: monospace;
  font-size: 11px;
}

/* ── 结果列表 ───────────────────────────────────────────── */
.search-results {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
  min-height: 0;
}

.search-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 24px;
  color: #6c7086;
  font-size: 13px;
}

.loading-dot {
  animation: pulse 1s infinite;
  color: #89b4fa;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}

.search-result {
  padding: 10px 12px;
  background: #1e1e2e;
  border: 1px solid transparent;
  border-radius: 7px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: all 0.12s;
}
.search-result:hover {
  background: #313244;
  border-color: #45475a;
}

.result-title {
  font-size: 13px;
  font-weight: 600;
  color: #89b4fa;
  margin-bottom: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-snippet {
  font-size: 12px;
  color: #a6adc8;
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.result-source {
  font-size: 11px;
  color: #585b70;
  margin-top: 4px;
}

.no-results,
.search-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #45475a;
  font-size: 13px;
  text-align: center;
  padding: 24px;
}
</style>