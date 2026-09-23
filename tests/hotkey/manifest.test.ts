import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// 擴充套件本身沒有測試框架，但 manifest 是純資料，能守的規則就在這裡守。
const manifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8'))

describe('擴充套件 manifest', () => {
  it('六個指令、全部全域、全部不帶建議鍵', () => {
    const cmds = Object.entries(manifest.commands as Record<string, { global?: boolean; suggested_key?: unknown }>)
    expect(cmds.map(([name]) => name)).toEqual(['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6'])
    expect(cmds.every(([, c]) => c.global === true)).toBe(true)
    expect(cmds.every(([, c]) => c.suggested_key === undefined)).toBe(true)
  })

  it('host_permissions 涵蓋每一條 content script 的 match——tabs.query 用 url 過濾要靠它', () => {
    // content_scripts.matches 不算 host permission；少了這個，背景用 tabs.query 找工具箱
    // 分頁會拿到空陣列，按鍵就送不出去。曾經真的踩到。
    const matches: string[] = manifest.content_scripts.flatMap((cs: { matches: string[] }) => cs.matches)
    for (const m of matches) expect(manifest.host_permissions).toContain(m)
  })

  it('不要 tabs 權限——那會讓擴充套件看到所有分頁的網址，host_permissions 就夠', () => {
    expect(manifest.permissions ?? []).not.toContain('tabs')
  })
})
