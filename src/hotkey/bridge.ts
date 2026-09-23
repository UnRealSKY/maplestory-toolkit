// 頁面與擴充套件之間的橋。
//
// 頁面碰不到 chrome.*，content script 是唯一的通道，兩邊用 window.postMessage 溝通。
// 訊息一律帶 source：頁面上任何腳本都能發 postMessage，不驗來源等於誰都能遙控面板。

import { ref } from 'vue'
import { runSlot } from './run'

export const MSG_SOURCE = 'maplestory-toolkit-hotkeys'

/** 六格目前各綁了什麼鍵，例如 { slot1: 'Alt+1' }；沒綁的是空字串 */
export const bindings = ref<Record<string, string>>({})
/** 擴充套件有沒有在線。沒裝就一直是 false，頁面跟沒有這個功能時完全一樣 */
export const extensionReady = ref(false)

function onMessage(e: MessageEvent) {
  const d = e.data
  if (!d || typeof d !== 'object') return
  const msg = d as { source?: unknown; type?: unknown; slot?: unknown; bindings?: unknown }
  if (msg.source !== MSG_SOURCE) return

  if (msg.type === 'slot' && typeof msg.slot === 'number') {
    runSlot(msg.slot)
    return
  }
  if (msg.type === 'bindings' && msg.bindings && typeof msg.bindings === 'object') {
    bindings.value = { ...(msg.bindings as Record<string, string>) }
    extensionReady.value = true
  }
}

/** 掛上監聽，回傳解除函式 */
export function startHotkeyBridge(): () => void {
  window.addEventListener('message', onMessage)
  return () => window.removeEventListener('message', onMessage)
}

/** 網頁自己開不了 chrome:// 網址，只能請擴充套件代開 */
export function requestOpenShortcuts(): void {
  window.postMessage({ source: MSG_SOURCE, type: 'openShortcuts' }, '*')
}
