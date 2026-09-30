import { describe, it, expect } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MarkdownDialog from '#src/components/MarkdownDialog.vue'

const TABLE_MD = '## 六個格子\n\n| 格 | 動作 |\n|---|---|\n| 1 | 反盾開始 |\n\n> 提醒一句'

describe('MarkdownDialog', () => {
  it('關著的時候不抓、不渲染', async () => {
    let calls = 0
    const w = mount(MarkdownDialog, {
      props: { open: false, title: '說明', pageUrl: 'https://example.com', load: async () => { calls++; return 'x' } },
    })
    await flushPromises()
    expect(calls).toBe(0)
    expect(w.find('.dialog').exists()).toBe(false)
  })

  it('打開才抓，表格與引言都渲染出來', async () => {
    const w = mount(MarkdownDialog, {
      props: { open: false, title: '說明', pageUrl: 'https://example.com', load: async () => TABLE_MD, wide: true },
    })
    await w.setProps({ open: true })
    await flushPromises()
    expect(w.find('.head h3').text()).toBe('說明')
    expect(w.find('.dialog').classes()).toContain('wide')
    expect(w.find('.md table').exists()).toBe(true)
    expect(w.find('.md th').text()).toBe('格')
    expect(w.find('.md blockquote').exists()).toBe(true)
  })

  it('關了再開不重抓', async () => {
    let calls = 0
    const w = mount(MarkdownDialog, {
      props: { open: true, title: '說明', pageUrl: 'https://example.com', load: async () => { calls++; return '內容' } },
    })
    await flushPromises()
    await w.setProps({ open: false })
    await w.setProps({ open: true })
    await flushPromises()
    expect(calls).toBe(1)
  })

  it('抓失敗顯示原因與 GitHub 連結', async () => {
    const w = mount(MarkdownDialog, {
      props: { open: true, title: '說明', pageUrl: 'https://example.com/readme', load: async () => { throw new Error('HTTP 404') } },
    })
    await flushPromises()
    expect(w.find('.field-error').text()).toContain('HTTP 404')
    expect(w.find('.field-error a').attributes('href')).toBe('https://example.com/readme')
  })
})
