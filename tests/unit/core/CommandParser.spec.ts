// CommandParser.spec.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { CommandParser } from '@core/command/CommandParser'
import type { CommandAlias } from '@core/types/command.types'

const ALIASES: CommandAlias[] = [
  { alias: 'gs', workflowId: 'git-status' },
  { alias: 'dev', workflowId: 'npm-dev' },
]

describe('CommandParser', () => {
  let parser: CommandParser

  beforeEach(() => {
    parser = new CommandParser(ALIASES)
  })

  describe('workflow trigger (>)', () => {
    it('parses workflow ID', () => {
      const result = parser.parse('>git-daily')
      expect(result.type).toBe('workflow')
      expect(result.workflowId).toBe('git-daily')
    })

    it('resolves registered alias gs -> git-status', () => {
      const result = parser.parse('>gs')
      expect(result.type).toBe('workflow')
      expect(result.workflowId).toBe('git-status')
      expect(result.alias).toBe('gs')
    })

    it('alias is case-insensitive', () => {
      const result = parser.parse('>GS')
      expect(result.workflowId).toBe('git-status')
    })

    it('unregistered alias returns workflow with alias as id', () => {
      const result = parser.parse('>unknown-wf')
      expect(result.type).toBe('workflow')
      expect(result.workflowId).toBe('unknown-wf')
    })

    it('bare > downgrades to plain', () => {
      expect(parser.parse('>').type).toBe('plain')
    })

    it('>dev alias resolves', () => {
      expect(parser.parse('>dev').workflowId).toBe('npm-dev')
    })

    it('strips spaces after >', () => {
      expect(parser.parse('>  git-daily  ').workflowId).toBe('git-daily')
    })
  })

  describe('direct dispatch (@)', () => {
    it('@1:ls -> workbox1', () => {
      const r = parser.parse('@1:ls -la')
      expect(r.type).toBe('direct')
      expect(r.target).toBe('workbox1')
      expect(r.content).toBe('ls -la')
    })

    it('@2:pwd -> workbox2', () => {
      const r = parser.parse('@2:pwd')
      expect(r.target).toBe('workbox2')
    })

    it('@s:query -> searchbox1', () => {
      const r = parser.parse('@s:search term')
      expect(r.target).toBe('searchbox1')
    })

    it('@s2:query -> searchbox2', () => {
      const r = parser.parse('@s2:project search')
      expect(r.target).toBe('searchbox2')
    })

    it('@l:content -> learnbox', () => {
      const r = parser.parse('@l:# Title')
      expect(r.target).toBe('learnbox')
      expect(r.content).toBe('# Title')
    })

    it('@learn:content -> learnbox full name', () => {
      expect(parser.parse('@learn:content').target).toBe('learnbox')
    })

    it('content with colon splits on first colon only', () => {
      const r = parser.parse('@1:a:b:c')
      expect(r.content).toBe('a:b:c')
    })

    it('@ without colon degrades to plain', () => {
      expect(parser.parse('@1 no colon').type).toBe('plain')
    })
  })

  describe('MCP invocation (mcp:)', () => {
    it('mcp:feishu_search:keyword -> query param', () => {
      const r = parser.parse('mcp:feishu_search:keyword')
      expect(r.type).toBe('mcp')
      expect(r.tool).toBe('feishu_search')
      expect(r.params).toEqual({ query: 'keyword' })
    })

    it('mcp:feishu_read:doc123 -> doc_id param', () => {
      const r = parser.parse('mcp:feishu_read:doc123')
      expect(r.params).toEqual({ doc_id: 'doc123' })
    })

    it('key=value params parsed correctly', () => {
      const r = parser.parse('mcp:feishu_create:title=test&content=body')
      expect(r.params).toEqual({ title: 'test', content: 'body' })
    })

    it('tool only with no params', () => {
      const r = parser.parse('mcp:feishu_search')
      expect(r.tool).toBe('feishu_search')
      expect(r.params).toEqual({})
    })

    it('MCP: uppercase is recognized', () => {
      expect(parser.parse('MCP:feishu_search:kw').type).toBe('mcp')
    })
  })

  describe('CC Switch (cc:)', () => {
    it('cc:list -> cc-list', () => {
      expect(parser.parse('cc:list').type).toBe('cc-list')
    })

    it('cc:switch:gpt4 -> cc-switch', () => {
      const r = parser.parse('cc:switch:gpt4')
      expect(r.type).toBe('cc-switch')
      expect(r.action).toBe('switch')
      expect(r.modelId).toBe('gpt4')
    })

    it('cc:LIST is case-insensitive', () => {
      expect(parser.parse('cc:LIST').type).toBe('cc-list')
    })

    it('unknown cc subcommand degrades to plain', () => {
      expect(parser.parse('cc:unknown').type).toBe('plain')
    })
  })

  describe('plain text', () => {
    it('plain string', () => {
      const r = parser.parse('hello world')
      expect(r.type).toBe('plain')
      expect(r.content).toBe('hello world')
    })

    it('empty string', () => {
      const r = parser.parse('')
      expect(r.content).toBe('')
    })

    it('only whitespace', () => {
      expect(parser.parse('   ').type).toBe('plain')
    })
  })

  describe('dynamic alias update', () => {
    it('new alias takes effect after updateAliases', () => {
      parser.updateAliases([{ alias: 'clear', workflowId: 'clear-all' }])
      expect(parser.parse('>clear').workflowId).toBe('clear-all')
    })

    it('old aliases cleared after updateAliases', () => {
      parser.updateAliases([])
      expect(parser.parse('>gs').workflowId).toBe('gs')
    })
  })

  describe('raw field preserved', () => {
    it('all formats preserve raw input', () => {
      const inputs = ['>gs', '@1:ls', 'mcp:feishu:q', 'cc:list', 'plain']
      for (const input of inputs) {
        expect(parser.parse(input).raw).toBe(input)
      }
    })
  })
})