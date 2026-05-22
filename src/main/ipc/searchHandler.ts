// ============================================================
// searchHandler — Main Process IPC Handler
// 在项目目录中搜索文件内容（使用 fs + 递归读取）
// ============================================================

import { ipcMain } from 'electron'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, extname } from 'path'

const TEXT_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.vue', '.json', '.md',
  '.txt', '.yaml', '.yml', '.toml', '.css', '.html', '.py',
  '.go', '.rs', '.java', '.c', '.cpp', '.h', '.sh', '.bat',
])

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage',
  '.vite', 'out', 'release',
])

interface SearchMatch {
  file:    string
  line:    number
  content: string
}

function searchInDir(
  dir: string,
  query: string,
  maxResults = 50,
  results: SearchMatch[] = [],
): SearchMatch[] {
  if (results.length >= maxResults) return results

  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return results
  }

  for (const entry of entries) {
    if (results.length >= maxResults) break
    if (SKIP_DIRS.has(entry)) continue

    const fullPath = join(dir, entry)
    let stat
    try { stat = statSync(fullPath) } catch { continue }

    if (stat.isDirectory()) {
      searchInDir(fullPath, query, maxResults, results)
    } else if (stat.isFile() && TEXT_EXTS.has(extname(entry).toLowerCase())) {
      try {
        const content = readFileSync(fullPath, 'utf-8')
        const lines = content.split('\n')
        const lq = query.toLowerCase()

        lines.forEach((line, idx) => {
          if (results.length >= maxResults) return
          if (line.toLowerCase().includes(lq)) {
            results.push({
              file:    fullPath,
              line:    idx + 1,
              content: line.trim().substring(0, 200),
            })
          }
        })
      } catch { /* 跳过不可读文件 */ }
    }
  }

  return results
}

export function registerSearchHandlers(): void {
  ipcMain.handle('project:search', async (_event, { query, path }: { query: string; path: string }) => {
    try {
      const results = searchInDir(path, query, 50)
      return results
    } catch (err) {
      return []
    }
  })
}
