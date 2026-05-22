<template>
  <div class="learn-box">
    <!-- 工具栏 -->
    <div class="lb-toolbar">
      <span class="lb-title">📝 学习笔记</span>
      <label class="feishu-toggle">
        <input type="checkbox" v-model="syncToFeishu" />
        <span>同步飞书</span>
      </label>
      <SkillPicker
        v-model="activeSkillId"
        panel-type="learnbox"
        @run="onAskAi"
      />
      <button class="lb-btn save-btn" @click="saveNote">保存</button>
    </div>

    <!-- 编辑器区域 -->
    <textarea
      v-model="content"
      class="editor-area"
      placeholder="开始记录你的学习内容...（支持 Markdown）"
    ></textarea>

    <!-- AI 面板（插入到编辑器下方） -->
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useWorkflowUiStore } from '../../stores/workflowUiStore'
import { useAi }              from '../../composables/useAi'
import AiPanel                from '../shared/AiPanel.vue'
import SkillPicker            from '../shared/SkillPicker.vue'
import type { Skill }         from '@core/types/ai.types'

const props = defineProps<{ id: string }>()

const workflowStore = useWorkflowUiStore()
const { isStreaming, streamText, chatStream, buildMessages, getSkills } = useAi()

const content       = ref('')
const syncToFeishu  = ref(false)
const savedToast    = ref(false)
const activeSkillId = ref<string | undefined>()
const aiVisible     = ref(false)
const aiText        = ref('')
const skills        = ref<Skill[]>([])

const activeSkillName = computed(() =>
  skills.value.find(s => s.id === activeSkillId.value)?.name
)

onMounted(async () => {
  const saved = localStorage.getItem(`learnbox-content-${props.id}`)
  content.value = saved ?? '# 学习笔记\n\n开始记录你的学习内容...\n'
  skills.value = (await getSkills()).filter(s => s.panelTypes.includes('learnbox'))
})

// 同步 AI 流式文本
watch(streamText, (val) => { aiText.value = val })

function saveNote() {
  localStorage.setItem(`learnbox-content-${props.id}`, content.value)
  savedToast.value = true
  setTimeout(() => { savedToast.value = false }, 1500)

  if (syncToFeishu.value) {
    window.electronAPI?.mcpInvoke({
      tool: 'feishu_create',
      params: {
        title:   `笔记 - ${new Date().toLocaleDateString('zh-CN')}`,
        content: content.value,
      }
    }).catch(err => console.warn('[LearnBox] 飞书同步失败:', err))
  }
}

/** 触发 AI 技能 */
async function onAskAi(skillId: string) {
  activeSkillId.value = skillId
  aiText.value = ''
  aiVisible.value = true

  const messages = buildMessages('请处理以上笔记内容', content.value)
  await chatStream(messages, skillId)
}

/** 将 AI 结果追加到笔记末尾 */
function insertAiResult(text: string) {
  const skill = skills.value.find(s => s.id === activeSkillId.value)
  content.value += `\n\n---\n> 🤖 AI ${skill?.name ?? '分析'}\n\n${text}\n`
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
  gap: 8px;
  padding: 6px 10px;
  background: #181825;
  border-bottom: 1px solid #313244;
  font-size: 12px;
  min-height: 32px;
}

.lb-title {
  color: #f9e2af;
  font-weight: 600;
  margin-right: auto;
}

.feishu-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #6c7086;
  cursor: pointer;
  font-size: 11px;
}
.feishu-toggle input { cursor: pointer; }

.lb-btn {
  padding: 3px 10px;
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid #45475a;
  background: #1e1e2e;
  color: #cdd6f4;
  transition: all 0.12s;
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

/* ── 保存提示 ───────────────────────────────────────────── */
.save-toast {
  position: absolute;
  bottom: 12px;
  right: 12px;
  background: #a6e3a1;
  color: #1e1e2e;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 6px;
  animation: fadeInOut 1.5s ease;
  pointer-events: none;
}

@keyframes fadeInOut {
  0%   { opacity: 0; transform: translateY(4px); }
  20%  { opacity: 1; transform: translateY(0); }
  80%  { opacity: 1; }
  100% { opacity: 0; }
}
</style>