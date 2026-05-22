// ============================================================
// WorkflowValidator — Core Layer
// 工作流 JSON Schema 校验器，纯逻辑，无框架依赖
// ============================================================

import type { Workflow } from '../types/workflow.types'


export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

export interface ValidationError {
  field: string
  message: string
}

const VALID_STEP_TYPES = new Set([
  'terminal', 'editor', 'search', 'mcp', 'cc-switch', 'delay', 'notify',
])
const VALID_TARGETS = new Set([
  'workbox1', 'workbox2', 'learnbox', 'searchbox1', 'searchbox2',
  'auto', 'focused', 'all-workbox',
])
const VALID_WAIT_FOR = new Set(['none', 'complete', 'ready'])

export class WorkflowValidator {
  /**
   * 校验完整工作流对象
   */
  validate(wf: unknown): ValidationResult {
    const errors: ValidationError[] = []

    if (typeof wf !== 'object' || wf === null || Array.isArray(wf)) {
      return { valid: false, errors: [{ field: 'root', message: '工作流必须是对象' }] }
    }

    const w = wf as Record<string, unknown>

    // id
    if (!w.id || typeof w.id !== 'string' || !w.id.trim()) {
      errors.push({ field: 'id', message: 'id 不能为空且必须是字符串' })
    } else if (!/^[a-z0-9-_]+$/.test(w.id as string)) {
      errors.push({ field: 'id', message: 'id 只能包含小写字母、数字、- 和 _' })
    }

    // name
    if (!w.name || typeof w.name !== 'string' || !(w.name as string).trim()) {
      errors.push({ field: 'name', message: 'name 不能为空' })
    }

    // version
    if (!w.version || typeof w.version !== 'string') {
      errors.push({ field: 'version', message: 'version 是必填字段，建议使用 "1.0"' })
    }

    // tags
    if (!Array.isArray(w.tags)) {
      errors.push({ field: 'tags', message: 'tags 必须是数组（可以为空数组 []）' })
    }

    // steps
    if (!Array.isArray(w.steps)) {
      errors.push({ field: 'steps', message: 'steps 必须是数组' })
    } else if ((w.steps as unknown[]).length === 0) {
      errors.push({ field: 'steps', message: 'steps 至少包含一个步骤' })
    } else {
      const stepErrors = this.validateSteps(w.steps as unknown[])
      errors.push(...stepErrors)
    }

    // trigger（可选）
    if (w.trigger !== undefined && w.trigger !== null) {
      const triggerErrors = this.validateTrigger(w.trigger)
      errors.push(...triggerErrors)
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * 从 JSON 字符串解析并校验
   */
  parseAndValidate(json: string): { workflow?: Workflow; result: ValidationResult } {
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch (e) {
      return {
        result: {
          valid: false,
          errors: [{ field: 'json', message: `JSON 解析失败: ${(e as Error).message}` }],
        },
      }
    }

    const result = this.validate(parsed)
    if (result.valid) {
      // 补全可选字段
      const wf = parsed as Record<string, unknown>
      wf.createdAt = wf.createdAt ?? Date.now()
      wf.updatedAt = Date.now()
      wf.description = wf.description ?? ''
      wf.tags = wf.tags ?? []
      return { workflow: wf as unknown as Workflow, result }
    }
    return { result }
  }

  // --------------------------------------------------------
  // 私有校验方法
  // --------------------------------------------------------

  private validateSteps(steps: unknown[]): ValidationError[] {
    const errors: ValidationError[] = []

    steps.forEach((step, idx) => {
      const prefix = `steps[${idx}]`

      if (typeof step !== 'object' || step === null) {
        errors.push({ field: prefix, message: '步骤必须是对象' })
        return
      }

      const s = step as Record<string, unknown>

      // id
      if (!s.id || typeof s.id !== 'string') {
        errors.push({ field: `${prefix}.id`, message: '步骤 id 不能为空' })
      }

      // type
      if (!s.type || !VALID_STEP_TYPES.has(s.type as string)) {
        errors.push({
          field: `${prefix}.type`,
          message: `步骤 type 无效，合法值：${[...VALID_STEP_TYPES].join(', ')}`,
        })
      }

      // target
      if (!s.target || !VALID_TARGETS.has(s.target as string)) {
        errors.push({
          field: `${prefix}.target`,
          message: `步骤 target 无效，合法值：${[...VALID_TARGETS].join(', ')}`,
        })
      }

      // command（delay 步骤的 command 用作毫秒数）
      if (s.command === undefined || s.command === null || s.command === '') {
        errors.push({ field: `${prefix}.command`, message: '步骤 command 不能为空' })
      }

      // waitFor（可选）
      if (s.waitFor !== undefined && !VALID_WAIT_FOR.has(s.waitFor as string)) {
        errors.push({
          field: `${prefix}.waitFor`,
          message: `waitFor 无效，合法值：${[...VALID_WAIT_FOR].join(', ')}`,
        })
      }

      // timeout 必须是非负数
      if (s.timeout !== undefined && (typeof s.timeout !== 'number' || s.timeout < 0)) {
        errors.push({ field: `${prefix}.timeout`, message: 'timeout 必须是非负整数（毫秒）' })
      }
    })

    return errors
  }

  private validateTrigger(trigger: unknown): ValidationError[] {
    const errors: ValidationError[] = []
    if (typeof trigger !== 'object' || trigger === null) {
      errors.push({ field: 'trigger', message: 'trigger 必须是对象' })
      return errors
    }

    const t = trigger as Record<string, unknown>
    const validTypes = new Set(['shortcut', 'schedule', 'manual'])

    if (!t.type || !validTypes.has(t.type as string)) {
      errors.push({ field: 'trigger.type', message: 'trigger.type 必须是 shortcut | schedule | manual' })
    }

    if (t.type === 'shortcut' && !t.shortcut) {
      errors.push({ field: 'trigger.shortcut', message: 'shortcut 触发器必须提供 shortcut 字段' })
    }

    if (t.type === 'schedule' && !t.cron) {
      errors.push({ field: 'trigger.cron', message: 'schedule 触发器必须提供 cron 字段' })
    }

    return errors
  }
}
