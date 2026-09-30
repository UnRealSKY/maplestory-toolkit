import { describe, it, expect, beforeEach } from 'vitest'
import { initAnalytics, pageView, pagePath, GA_ID } from '#src/analytics'

beforeEach(() => {
  delete window.gtag
  delete window.dataLayer
  document.querySelectorAll('script[src*="googletagmanager"]').forEach((s) => s.remove())
})

describe('Google Analytics', () => {
  it('沒初始化（本機開發）時 pageView 什麼都不做', () => {
    expect(() => pageView('/boss-toolkit/cygnus')).not.toThrow()
    expect(window.dataLayer).toBeUndefined()
  })

  it('初始化：掛上 gtag、關掉自動的 page_view、載入 gtag.js', () => {
    initAnalytics()
    const layer = window.dataLayer as IArguments[]
    expect(layer.map((a) => a[0])).toEqual(['js', 'config'])
    expect(layer[1][1]).toBe(GA_ID)
    expect(layer[1][2]).toEqual({ send_page_view: false })
    const script = document.querySelector('script[src*="googletagmanager"]') as HTMLScriptElement
    expect(script.src).toContain(`id=${GA_ID}`)
    expect(script.async).toBe(true)
  })

  it('重複初始化不會掛第二份', () => {
    initAnalytics()
    initAnalytics()
    expect(document.querySelectorAll('script[src*="googletagmanager"]')).toHaveLength(1)
    expect((window.dataLayer as unknown[]).length).toBe(2)
  })

  it('編輯頁的紀錄 id 收掉，其他路徑原樣', () => {
    expect(pagePath('/loot/edit/3f1c-abc?focus=dist')).toBe('/loot/edit')
    expect(pagePath('/loot/edit/split-demo')).toBe('/loot/edit')
    expect(pagePath('/boss-toolkit/cygnus')).toBe('/boss-toolkit/cygnus')
    expect(pagePath('/loot/pending')).toBe('/loot/pending')
  })

  it('pageView 送 hash 後面的路徑，看得出哪隻王', () => {
    initAnalytics()
    pageView('/boss-toolkit/cygnus')
    const layer = window.dataLayer as IArguments[]
    const ev = layer[layer.length - 1]
    expect(ev[0]).toBe('event')
    expect(ev[1]).toBe('page_view')
    expect(ev[2]).toMatchObject({ page_path: '/boss-toolkit/cygnus' })
    expect((ev[2] as { page_location: string }).page_location.endsWith('#/boss-toolkit/cygnus')).toBe(true)
  })
})
