<template>
  <div class="learn-box">
    <!-- 工具栏 -->
    <div class="lb-toolbar">
      <span class="lb-title">📝 学习笔记</span>
      <label class="feishu-toggle" title="同步到飞书文档">
        <input type="checkbox" v-model="syncToFeishu" />
        <span>飞书</span>
      </label>
      <!-- AI 区：选技能 + 执行按钮 -->
      <div class="lb-ai-bar">
        <SkillPicker v-model="activeSkillId" panel-type="learnbox" />
        <button
          class="lb-ai-btn"
          :disabled="!activeSkillId || isStreaming"
          :title="activeSkillId ? '用 AI 处理笔记' : '请先选择技能'"
          @click="onAskAi"
        >
          {{ isStreaming ? '生成中…' : '▶ AI' }}
        </button>
      </div>
      <button class="lb-btn save-btn" @click="saveNote">保存</button>
    </div>

    <!-- 编辑器区域 -->
    <textarea
      v-model="content"
      class="editor-area"
      placeholder="开始记录你的学习内容...（支持 Markdown）"
    ></textarea>

    <!-- AI 面板（在编辑器下方） -->
    <AiPanel
      :visible="aiVisible"
      :text="aiText"
      :is-streaming="isStreaming"
      :skill-name="activeSkillName"
      model-label="CC Switch AI"
      :show-insert="true"
      @close="aiVisible = false"
      @insert="insertAiResult"
    />

    <!-- 保存提示 -->
    <div class="save-toast" v-if="savedToast">✓ 已保存</div>
    <!-- 错误提示 -->
    <div class="err-toast" v-if="errToast">{{ errToast }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useWorkflowUiStore } from '../../stores/workflowUiStore'
import { useAi }              from '../../composables/useAi'
import AiPanel                from '../shared/AiPanel.vue'
import SkillPicker            from '../shared/SkillPicker.vue'

const props = defineProps<{ id: string }>()

const workflowStore = useWorkflowUiStore()
const { isStreaming, streamText, chatStream, buildMessages, getSkills } = useAi()

const content       = ref('')
const syncToFeishu  = ref(false)
const savedToast    = ref(false)
const errToast      = ref('')
const activeSkillId = ref<string | undefined>()
const aiVisible     = ref(false)
const aiText        = ref('')
const skillList     = ref<Array<{ id: string; name: string }>>([])

const activeSkillName = computed(() =>
  skillList.value.find(s => s.id === activeSkillId.value)?.name
)

onMounted(async () => {
  const saved = localStorage.getItem(`learnbox-content-${props.id}`)
  content.value = saved ?? '# 学习笔记\n\n开始记录你的学习内容...\n'
  skillList.value = (await getSkills()).filter(s => s.panelTypes.includes('learnbox'))
})

// 同步 AI 流式文本
watch(streamText, (val) => { aiText.value = val })

function saveNote() {
  try {
    localStorage.setItem(`learnbox-content-${props.id}`, content.value)
    savedToast.value = true
    setTimeout(() => { savedToast.value = false }, 1500)

    if (syncToFeishu.value && window.electronAPI) {
      window.electronAPI.mcpInvoke({
        tool:   'feishu_create',
        params: {
          title:   `笔记 - ${new Date().toLocaleDateString('zh-CN')}`,
          content: content.value,
        },
      }).catch((err: Error) => {
        showErr(`飞书同步失败: ${err.message}`)
      })
    }
  } catch (err) {
    showErr(`保存失败: ${(err as Error).message}`)
  }
}

function showErr(msg: string) {
  errToast.value = msg
  setTimeout(() => { errToast.value = '' }, 3000)
}

/** 触发 AI 技能 */
async function onAskAi() {
  if (!activeSkillId.value) return
  aiText.value = ''
  aiVisible.value = true
  const messages = buildMessages('请处理以上笔记内容', content.value)
  await chatStream(messages, activeSkillId.value)
}

/** 将 AI 结果追加到笔记末尾 */
function insertAiResult(text: string) {
  const name = activeSkillName.value ?? 'AI 分析'
  content.value += `\n\n---\n> 🤖 ${name}\n\n${text}\n`
  saveNote()
  aiVisible.value = false
}

// 监听工作流分发的面板消息
watch(
  () => workflowStore.panelMessages[props.id],
  (msg) => {
    if (!msg) return
    workflowStore.clearPanelMessage(props.id)
    if (msg.type === 'data' || msg.type === 'mcp-result') {
      content.value += `\n\n> 来源: ${msg.source ?? 'workflow'}\n${msg.content}\n`
    }
  },
)
</script>

<style scoped>
.learn-box {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #11111b;
  border: 1px solid #313244;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
}

/* ── 工具栏 ─────────────────────────────────────────────── */
.lb-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: #181825;
  border-bottom: 1px solid #313244;
  font-size: 12px;
  min-height: 32px;
  flex-wrap: nowrap;
}

.lb-title {
  color: #f9e2af;
  font-weight: 600;
  flex-shrink: 0;
}

.feishu-toggle {
  display: flex;
  align-items: center;
  gap: 3px;
  color: #6c7086;
  cursor: pointer;
  font-size: 11px;
  flex-shrink: 0;
}
.feishu-toggle input { cursor: pointer; width: 12px; height: 12px; }

.lb-ai-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  flex-shrink: 0;
}

.lb-ai-btn {
  padding: 3px 9px;
  border-radius: 5px;
  font-size: 11px;
  cursor: pointer;
  border: 1px solid #7c6af744;
  background: #1a1a2e;
  color: #a78bfa;
  white-space: nowrap;
  transition: all 0.12s;
}
.lb-ai-btn:not(:disabled):hover { border-color: #7c6af7; background: #2d2b55; }
.lb-ai-btn:disabled { opacity: 0.4; cursor: default; }

.lb-btn {
  padding: 3px 10px;
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid #45475a;
  background: #1e1e2e;
  color: #cdd6f4;
  transition: all 0.12s;
  flex-shrink: 0;
}
.lb-btn:hover { background: #313244; }
.save-btn { border-color: #89b4fa44; color: #89b4fa; }
.save-btn:hover { border-color: #89b4fa; background: #1e3a5f; }

/* ── 编辑器 ─────────────────────────────────────────────── */
.editor-area {
  flex: 1;
  background: #11111b;
  border: none;
  padding: 14px;
  font-size: 13px;
  line-height: 1.7;
  color: #cdd6f4;
  font-family: 'Consolas', 'Fira Code', monospace;
  resize: none;
  outline: none;
  min-height: 0;
}
.editor-area::placeholder { color: #45475a; }

/* ── 提示 ───────────────────────────────────────────────── */
.save-toast,
.err-toast {
  position: absolute;
  bottom: 12px;
  right: 12px;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 6px;
  animation: fadeInOut 1.5s ease forwards;
  pointer-events: none;
}
.save-toast { background: #a6e3a1; color: #1e1e2e; }
.err-toast  { background: #f38ba8; color: #1e1e2e; animation-duration: 3s; }

@keyframes fadeInOut {
  0%   { opacity: 0; transform: translateY(4px); }
  15%  { opacity: 1; transform: translateY(0); }
  75%  { opacity: 1; }
  100% { opacity: 0; }
}
</style>