// PanelBus.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PanelBus } from '@core/panel/PanelBus'
import type { PanelMessage } from '@core/types/panel.types'

describe('PanelBus', () => {
  let bus: PanelBus

  beforeEach(() => {
    bus = new PanelBus()
  })

  describe('sendToPanel', () => {
    it('sends message to subscribed panel', () => {
      const handler = vi.fn()
      bus.subscribe('workbox1', handler)
      bus.sendToPanel('workbox1', 'command', 'ls -la')
      expect(handler).toHaveBeenCalledOnce()
      const msg: PanelMessage = handler.mock.calls[0][0]
      expect(msg.target).toBe('workbox1')
      expect(msg.type).toBe('command')
      expect(msg.content).toBe('ls -la')
    })

    it('message has id and timestamp', () => {
      const handler = vi.fn()
      bus.subscribe('workbox1', handler)
      const before = Date.now()
      bus.sendToPanel('workbox1', 'command', 'pwd')
      const msg: PanelMessage = handler.mock.calls[0][0]
      expect(msg.id).toBeTruthy()
      expect(msg.timestamp).toBeGreaterThanOrEqual(before)
    })

    it('message IDs are unique', () => {
      const ids: string[] = []
      bus.subscribeAll(msg => ids.push(msg.id))
      bus.sendToPanel('workbox1', 'command', 'cmd1')
      bus.sendToPanel('workbox1', 'command', 'cmd2')
      bus.sendToPanel('workbox2', 'command', 'cmd3')
      expect(new Set(ids).size).toBe(3)
    })

    it('other panel subscribers do not receive message', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      bus.subscribe('workbox1', handler1)
      bus.subscribe('workbox2', handler2)
      bus.sendToPanel('workbox1', 'command', 'ls')
      expect(handler1).toHaveBeenCalledOnce()
      expect(handler2).not.toHaveBeenCalled()
    })

    it('passes meta and source', () => {
      const handler = vi.fn()
      bus.subscribe('learnbox', handler)
      bus.sendToPanel('learnbox', 'editor-open', '# Title', { lang: 'md' }, 'workflow-engine')
      const msg: PanelMessage = handler.mock.calls[0][0]
      expect(msg.meta).toEqual({ lang: 'md' })
      expect(msg.source).toBe('workflow-engine')
    })

    it('returns the sent message object', () => {
      const msg = bus.sendToPanel('workbox1', 'command', 'test')
      expect(msg.content).toBe('test')
    })
  })

  describe('broadcast', () => {
    it('broadcasts to all 5 panels', () => {
      const targets: string[] = []
      bus.subscribeAll(msg => targets.push(msg.target))
      bus.broadcast('terminal-clear', '')
      const expected = ['workbox1', 'workbox2', 'learnbox', 'searchbox1', 'searchbox2']
      expect(targets).toEqual(expect.arrayContaining(expected))
      expect(targets).toHaveLength(5)
    })

    it('returns 5 message objects', () => {
      expect(bus.broadcast('notify', 'hi')).toHaveLength(5)
    })
  })

  describe('subscribe & unsubscribe', () => {
    it('unsubscribe stops receiving messages', () => {
      const handler = vi.fn()
      const unsubscribe = bus.subscribe('workbox1', handler)
      bus.sendToPanel('workbox1', 'command', 'before')
      unsubscribe()
      bus.sendToPanel('workbox1', 'command', 'after')
      expect(handler).toHaveBeenCalledOnce()
    })

    it('multiple subscribers all receive message', () => {
      const h1 = vi.fn()
      const h2 = vi.fn()
      bus.subscribe('workbox1', h1)
      bus.subscribe('workbox1', h2)
      bus.sendToPanel('workbox1', 'command', 'test')
      expect(h1).toHaveBeenCalledOnce()
      expect(h2).toHaveBeenCalledOnce()
    })
  })

  describe('subscribeAll', () => {
    it('receives all panel messages', () => {
      const handler = vi.fn()
      bus.subscribeAll(handler)
      bus.sendToPanel('workbox1', 'command', 'a')
      bus.sendToPanel('searchbox1', 'search-query', 'b')
      expect(handler).toHaveBeenCalledTimes(2)
    })

    it('unsubscribe global stops receiving', () => {
      const handler = vi.fn()
      const unsub = bus.subscribeAll(handler)
      bus.sendToPanel('workbox1', 'command', 'before')
      unsub()
      bus.sendToPanel('workbox1', 'command', 'after')
      expect(handler).toHaveBeenCalledOnce()
    })
  })

  describe('clearPanel', () => {
    it('clearing panel removes all listeners', () => {
      const handler = vi.fn()
      bus.subscribe('workbox1', handler)
      bus.clearPanel('workbox1')
      bus.sendToPanel('workbox1', 'command', 'test')
      expect(handler).not.toHaveBeenCalled()
    })
  })
})