import { describe, it, expect, vi, afterEach } from 'vitest'
import { stripTitle, fetchReadme, README_RAW_URL, README_PAGE_URL } from '#src/format/readme'

afterEach(() => vi.unstubAllGlobals())

describe('說明（README）', () => {
  it('拿掉開頭的專案名大標題，保留其餘', () => {
    expect(stripTitle('# 天天的楓之谷工具箱\n\n打王用的。\n\n## 選王')).toBe('打王用的。\n\n## 選王')
  })

  it('抓下來之後：圖片指向 raw、連結指向 GitHub 頁面、autolink 展開', async () => {
    const md = '# 標題\n\n![圖](docs/screenshots/13-hud.png)\n\n見 [說明](docs/loot-toolkit.md)，網址 <https://example.com/>'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(md, { status: 200 })))
    const out = await fetchReadme()
    expect(out).toContain('![圖](https://raw.githubusercontent.com/UnRealSKY/maplestory-toolkit/main/docs/screenshots/13-hud.png)')
    expect(out).toContain('[說明](https://github.com/UnRealSKY/maplestory-toolkit/blob/main/docs/loot-toolkit.md)')
    expect(out).toContain('[https://example.com/](https://example.com/)')
    expect(out.startsWith('![圖]')).toBe(true)
  })

  it('抓不到就丟錯，讓對話框顯示改去 GitHub 看', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    await expect(fetchReadme()).rejects.toThrow('HTTP 404')
  })

  it('兩個網址指向同一份檔案', () => {
    expect(README_RAW_URL).toBe('https://raw.githubusercontent.com/UnRealSKY/maplestory-toolkit/main/README.md')
    expect(README_PAGE_URL).toBe('https://github.com/UnRealSKY/maplestory-toolkit#readme')
  })
})
