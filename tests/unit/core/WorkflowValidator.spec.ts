// WorkflowValidator.spec.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { WorkflowValidator } from '@core/workflow/WorkflowValidator'
import type { Workflow } from '@core/types/workflow.types'

function makeValidWorkflow(overrides?: Partial<Workflow>): Workflow {
  return {
    id: 'git-daily',
    name: 'Git Daily Flow',
    description: '',
    icon: '',
    tags: ['git'],
    version: '1.0',
    builtin: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    steps: [
      { id: 'step-1', type: 'terminal', target: 'workbox1', command: 'git status' },
    ],
    ...overrides,
  }
}

describe('WorkflowValidator', () => {
  let validator: WorkflowValidator

  beforeEach(() => {
    validator = new WorkflowValidator()
  })

  describe('valid workflows', () => {
    it('standard workflow passes', () => {
      const result = validator.validate(makeValidWorkflow())
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('multi-step workflow passes', () => {
      const wf = makeValidWorkflow({
        steps: [
          { id: 's1', type: 'terminal', target: 'workbox1', command: 'git status' },
          { id: 's2', type: 'terminal', target: 'workbox2', command: 'npm run dev', waitFor: 'none' },
          { id: 's3', type: 'mcp', target: 'searchbox1', command: 'feishu_search' },
          { id: 's4', type: 'delay', target: 'focused', command: '1000' },
        ],
      })
      expect(validator.validate(wf).valid).toBe(true)
    })

    it('workflow with shortcut trigger passes', () => {
      const wf = makeValidWorkflow({ trigger: { type: 'shortcut', shortcut: 'Ctrl+Shift+G' } })
      expect(validator.validate(wf).valid).toBe(true)
    })

    it('schedule trigger passes', () => {
      const wf = makeValidWorkflow({ trigger: { type: 'schedule', cron: '0 * * * *' } })
      expect(validator.validate(wf).valid).toBe(true)
    })

    it('manual trigger passes', () => {
      const wf = makeValidWorkflow({ trigger: { type: 'manual' } })
      expect(validator.validate(wf).valid).toBe(true)
    })
  })

  describe('id validation', () => {
    it('empty id fails', () => {
      const result = validator.validate(makeValidWorkflow({ id: '' }))
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'id')).toBe(true)
    })

    it('id with special chars fails', () => {
      const result = validator.validate(makeValidWorkflow({ id: 'git flow!' }))
      expect(result.valid).toBe(false)
    })

    it('id with underscore and hyphen passes', () => {
      const result = validator.validate(makeValidWorkflow({ id: 'git_daily-v2' }))
      expect(result.valid).toBe(true)
    })
  })

  describe('steps validation', () => {
    it('empty steps array fails', () => {
      const result = validator.validate(makeValidWorkflow({ steps: [] }))
      expect(result.valid).toBe(false)
    })

    it('invalid step type fails', () => {
      const wf = makeValidWorkflow({
        steps: [{ id: 's1', type: 'invalid' as any, target: 'workbox1', command: 'cmd' }],
      })
      expect(validator.validate(wf).valid).toBe(false)
    })

    it('invalid step target fails', () => {
      const wf = makeValidWorkflow({
        steps: [{ id: 's1', type: 'terminal', target: 'box9' as any, command: 'cmd' }],
      })
      expect(validator.validate(wf).valid).toBe(false)
    })

    it('empty command fails', () => {
      const wf = makeValidWorkflow({
        steps: [{ id: 's1', type: 'terminal', target: 'workbox1', command: '' }],
      })
      expect(validator.validate(wf).valid).toBe(false)
    })

    it('missing step id reports correct field', () => {
      const wf = makeValidWorkflow({
        steps: [{ id: '', type: 'terminal', target: 'workbox1', command: 'ls' }],
      })
      const result = validator.validate(wf)
      expect(result.errors.some(e => e.field === 'steps[0].id')).toBe(true)
    })

    it('invalid waitFor fails', () => {
      const wf = makeValidWorkflow({
        steps: [{ id: 's1', type: 'terminal', target: 'workbox1', command: 'ls', waitFor: 'invalid' as any }],
      })
      expect(validator.validate(wf).valid).toBe(false)
    })

    it('negative timeout fails', () => {
      const wf = makeValidWorkflow({
        steps: [{ id: 's1', type: 'terminal', target: 'workbox1', command: 'ls', timeout: -100 }],
      })
      expect(validator.validate(wf).valid).toBe(false)
    })
  })

  describe('trigger validation', () => {
    it('shortcut trigger without shortcut field fails', () => {
      const wf = makeValidWorkflow({ trigger: { type: 'shortcut' } })
      const result = validator.validate(wf)
      expect(result.errors.some(e => e.field === 'trigger.shortcut')).toBe(true)
    })

    it('schedule trigger without cron fails', () => {
      const wf = makeValidWorkflow({ trigger: { type: 'schedule' } })
      expect(validator.validate(wf).valid).toBe(false)
    })
  })

  describe('parseAndValidate', () => {
    it('valid JSON returns workflow', () => {
      const json = JSON.stringify(makeValidWorkflow())
      const { workflow, result } = validator.parseAndValidate(json)
      expect(result.valid).toBe(true)
      expect(workflow).toBeTruthy()
    })

    it('invalid JSON format returns error', () => {
      const { result } = validator.parseAndValidate('{ invalid json }')
      expect(result.valid).toBe(false)
      expect(result.errors[0].field).toBe('json')
    })

    it('parseAndValidate auto-fills updatedAt', () => {
      const wf = { ...makeValidWorkflow() }
      delete (wf as any).updatedAt
      const { workflow } = validator.parseAndValidate(JSON.stringify(wf))
      expect(workflow?.updatedAt).toBeDefined()
    })

    it('non-object input fails', () => {
      expect(validator.validate([1, 2, 3]).valid).toBe(false)
    })
  })

  describe('multiple error reporting', () => {
    it('reports multiple field errors at once', () => {
      const result = validator.validate({
        id: '',
        name: '',
        version: '',
        tags: 'not-array',
        steps: [],
      })
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(3)
    })
  })
})