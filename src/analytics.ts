// Google Analytics（GA4）：只想知道有多少人在用、用哪隻王。
// 只送匿名的頁面瀏覽——沒有帳號、沒有 DC handle、沒有紀錄內容；本機開發不算使用，不送。
// 網站是 hash 路由，GA 認不出換頁，所以關掉它自動送的那一次，改由 router 換頁時自己送。

export const GA_ID = 'G-MDZ9RLFEZ5'

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

export function initAnalytics(id: string = GA_ID): void {
  if (window.gtag) return
  window.dataLayer = window.dataLayer ?? []
  // GA 要的是 arguments 物件本身，不能換成陣列
  window.gtag = function () {
    window.dataLayer!.push(arguments)
  }
  window.gtag('js', new Date())
  window.gtag('config', id, { send_page_view: false })
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`
  document.head.appendChild(s)
}

// 報表用的路徑：編輯頁帶的是隨機的紀錄 id，每筆都變成一個頁面會碎掉，收成一個
export function pagePath(path: string): string {
  return path.replace(/^\/loot\/edit\/.*$/, '/loot/edit')
}

/** 換頁時送一次；path 是 hash 後面那段，例如 /boss-toolkit/cygnus */
export function pageView(path: string): void {
  const p = pagePath(path)
  window.gtag?.('event', 'page_view', {
    page_path: p,
    page_location: `${location.origin}${location.pathname}#${p}`,
    page_title: document.title,
  })
}
