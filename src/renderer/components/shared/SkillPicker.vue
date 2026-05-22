<template>
  <div class="skill-picker" ref="rootEl">
    <button
      class="skill-trigger"
      :class="{ 'is-open': open }"
      @click.stop="toggle"
      :title="`AI 技能包 (${skills.length})`"
    >
      🤖 <span class="skill-label">{{ selectedSkill?.name ?? 'AI 技能' }}</span>
      <span class="skill-arrow">{{ open ? '▲' : '▼' }}</span>
    </button>

    <Transition name="skill-drop">
      <div v-if="open" class="skill-dropdown">
        <button
          v-for="skill in skills"
          :key="skill.id"
          class="skill-item"
          :class="{ 'is-active': modelValue === skill.id }"
          @click="select(skill.id)"
        >
          <span class="skill-item-icon">{{ skill.icon }}</span>
          <span class="skill-item-name">{{ skill.name }}</span>
        </button>
        <div class="skill-divider" v-if="modelValue"></div>
        <button v-if="modelValue" class="skill-item skill-clear" @click="select(undefined)">
          <span class="skill-item-icon">✕</span>
          <span class="skill-item-name">不使用技能</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { Skill } from '@core/types/ai.types'

const props = defineProps<{
  modelValue?: string
  panelType:   'workbox' | 'learnbox' | 'searchbox'
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', id: string | undefined): void
  (e: 'run', skillId: string): void
}>()

const open         = ref(false)
const skills       = ref<Skill[]>([])
const selectedSkill = ref<Skill | undefined>()
const rootEl       = ref<HTMLDivElement>()

onMounted(async () => {
  try {
    const all: Skill[] = await (window.electronAPI as any).aiSkills() ?? []
    skills.value = all.filter(s => s.panelTypes.includes(props.panelType))
  } catch {
    skills.value = []
  }

  // 点击外部关闭
  document.addEventListener('click', onOutsideClick)
})

onUnmounted(() => {
  document.removeEventListener('click', onOutsideClick)
})

function onOutsideClick(e: MouseEvent) {
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) {
    open.value = false
  }
}

function toggle() {
  open.value = !open.value
}

function select(id: string | undefined) {
  emit('update:modelValue', id)
  selectedSkill.value = id ? skills.value.find(s => s.id === id) : undefined
  open.value = false
  if (id) emit('run', id)
}
</script>

<style scoped>
.skill-picker {
  position: relative;
  display: inline-flex;
}

.skill-trigger {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  background: #1a1a2e;
  border: 1px solid #7c6af744;
  border-radius: 6px;
  color: #a78bfa;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.12s;
}
.skill-trigger:hover,
.skill-trigger.is-open {
  border-color: #7c6af7;
  background: #2d2b55;
}

.skill-label {
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.skill-arrow { font-size: 9px; color: #6c7086; }

/* ── 下拉菜单 ─────────────────────────────────────────── */
.skill-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 160px;
  background: #1e1e2e;
  border: 1px solid #45475a;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  z-index: 1000;
  overflow: hidden;
  padding: 4px;
}

.skill-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  background: transparent;
  border: none;
  border-radius: 5px;
  color: #cdd6f4;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}
.skill-item:hover { background: #313244; }
.skill-item.is-active { background: #2d2b55; color: #a78bfa; }
.skill-item.skill-clear { color: #6c7086; }
.skill-item.skill-clear:hover { color: #f38ba8; }

.skill-item-icon { font-size: 14px; flex-shrink: 0; }
.skill-item-name { flex: 1; }

.skill-divider {
  height: 1px;
  background: #313244;
  margin: 3px 6px;
}

/* ── 过渡 ─────────────────────────────────────────────── */
.skill-drop-enter-active,
.skill-drop-leave-active {
  transition: opacity 0.12s, transform 0.12s;
}
.skill-drop-enter-from,
.skill-drop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
