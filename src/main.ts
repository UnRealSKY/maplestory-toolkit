import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { initGroups } from './store/groups'
import { initSharedItems } from './store/sharedItems'
import { initAnalytics, pageView } from './analytics'

// number 輸入聚焦時，滾輪會意外增減數值；聚焦中滾動時讓它失焦，
// 頁面照常捲動、數值不被誤改。
document.addEventListener(
  'wheel',
  (e) => {
    const el = e.target as HTMLElement
    if (el instanceof HTMLInputElement && el.type === 'number' && document.activeElement === el) {
      el.blur()
    }
  },
  { passive: true },
)

createApp(App).use(createPinia()).use(router).mount('#app')

// 使用統計：只在正式站送，本機開發不算使用。換頁（含換王）各記一次
if (import.meta.env.PROD) {
  initAnalytics()
  router.afterEach((to) => pageView(to.fullPath))
}

// 背景載入共用名冊與品名清單（raw fetch，失敗則沿用 localStorage 快取）
initGroups()
initSharedItems()
