// ============================================================
// FeishuMcpAdapter — Adapter Layer
// 飞书 MCP 适配器：封装飞书相关 MCP 工具调用
// 工具名称参考飞书 MCP Server 标准接口
// ============================================================

import type { McpClient } from './McpClient'

export interface FeishuSearchResult {
  title: string
  url: string
  snippet: string
  docType: string
  updatedAt?: string
}

export interface FeishuDocContent {
  title: string
  content: string
  docType: string
  url: string
}

export class FeishuMcpAdapter {
  private client: McpClient

  constructor(client: McpClient) {
    this.client = client
  }

  /** 检查飞书 MCP 服务是否可用 */
  async isAvailable(): Promise<boolean> {
    return this.client.isAvailable()
  }

  /**
   * 搜索飞书文档/知识库
   * @param query 搜索关键词
   * @param limit 最大返回数量（默认 10）
   */
  async search(query: string, limit = 10): Promise<FeishuSearchResult[]> {
    try {
      const result = await this.client.invoke('feishu_search', { query, limit }) as any

      if (Array.isArray(result)) {
        return result.map(this.mapToSearchResult)
      }

      if (result?.items && Array.isArray(result.items)) {
        return result.items.map(this.mapToSearchResult)
      }

      return []
    } catch (err) {
      console.error('[FeishuMcpAdapter] search 失败:', err)
      return []
    }
  }

  /**
   * 读取飞书文档内容
   * @param url 文档 URL 或 token
   */
  async readDoc(url: string): Promise<FeishuDocContent | null> {
    try {
      const result = await this.client.invoke('feishu_read', { url }) as any

      if (!result) return null

      return {
        title:   result.title ?? result.name ?? '无标题',
        content: result.content ?? result.body ?? result.text ?? '',
        docType: result.doc_type ?? result.type ?? 'doc',
        url:     result.url ?? url,
      }
    } catch (err) {
      console.error('[FeishuMcpAdapter] readDoc 失败:', err)
      return null
    }
  }

  /**
   * 获取知识库目录结构
   * @param spaceId 知识空间 ID（可选）
   */
  async getKnowledgeTree(spaceId?: string): Promise<unknown[]> {
    try {
      const params: Record<string, unknown> = {}
      if (spaceId) params.space_id = spaceId
      const result = await this.client.invoke('feishu_knowledge_tree', params) as any

      return Array.isArray(result) ? result : result?.items ?? []
    } catch {
      return []
    }
  }

  // --------------------------------------------------------
  // 内部映射
  // --------------------------------------------------------

  private mapToSearchResult(item: any): FeishuSearchResult {
    return {
      title:     item.title ?? item.name ?? '无标题',
      url:       item.url ?? item.link ?? '',
      snippet:   item.snippet ?? item.summary ?? item.content?.slice(0, 200) ?? '',
      docType:   item.doc_type ?? item.type ?? 'doc',
      updatedAt: item.updated_at ?? item.update_time ?? undefined,
    }
  }
}
