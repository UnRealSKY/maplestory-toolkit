import { describe, it, expect } from 'vitest'
import { isPipeTable, renderTable, renderMarkdown } from '#src/format/markdown'

const TABLE = ['| 格 | 反盾 | 女皇 |', '|---|---|---|', '| 1 | 反盾開始 | 反盾 |', '| 2 | **反盾結束** | 變豬 |'].join('\n')

describe('pipe table', () => {
  it('表頭加分隔線才算表格', () => {
    expect(isPipeTable(TABLE)).toBe(true)
    expect(isPipeTable('| 只有一列 |')).toBe(false)
    expect(isPipeTable('| a | b |\n| 不是分隔線 | x |')).toBe(false)
  })

  it('轉成 thead / tbody，儲存格內的粗體照樣渲染', () => {
    const html = renderTable(TABLE)
    expect(html).toContain('<thead><tr><th>格</th><th>反盾</th><th>女皇</th></tr></thead>')
    expect(html).toContain('<tr><td>1</td><td>反盾開始</td><td>反盾</td></tr>')
    expect(html).toContain('<td><strong>反盾結束</strong></td>')
  })
})

describe('renderMarkdown', () => {
  it('段落之間的空行切段，各自成段', () => {
    const html = renderMarkdown('第一段\n\n第二段')
    expect(html).toContain('第一段')
    expect(html).toContain('第二段')
    expect(html).not.toContain('第一段第二段')
  })

  it('清單底下縮排的圖片是圖片，不是程式碼', () => {
    const html = renderMarkdown('1. 第一步\n\n   ![圖](https://x/a.png)\n\n2. 第二步')
    expect(html).toContain('<img src="https://x/a.png"')
    expect(html).not.toContain('<pre')
  })

  it('被空行切開的編號清單接續編號', () => {
    const html = renderMarkdown('1. 第一步\n\n   ![圖](https://x/a.png)\n\n2. 第二步\n\n3. 第三步')
    expect(html).toContain('<ol start="2">')
    expect(html).toContain('<ol start="3">')
    expect(html.match(/<ol start="1">/)).toBeNull()
  })

  it('單獨一段的 --- 是分隔線，不是三個減號', () => {
    const html = renderMarkdown('上面\n\n---\n\n下面')
    expect(html).toContain('<hr>')
    expect(html).not.toContain('---')
  })

  it('表格段落轉成 table，其餘照 snarkdown', () => {
    const html = renderMarkdown(`## 六個格子\n\n${TABLE}\n\n- 一條清單`)
    expect(html).toContain('<h2')
    expect(html).toContain('<table>')
    expect(html).toContain('<li>一條清單</li>')
  })
})
