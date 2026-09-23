// 頁面與背景之間的橋。頁面碰不到 chrome.*，背景碰不到頁面的 window。
// 每一步寫 console（頁面的 DevTools 看得到），「按了沒反應」時才有線索。

const SOURCE = 'maplestory-toolkit-hotkeys'
const log = (...args) => console.log('[快捷鍵]', ...args)

// 背景 → 頁面
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.source === SOURCE && msg.type === 'slot') {
    log('收到第', msg.slot, '格，轉給頁面')
    window.postMessage({ source: SOURCE, type: 'slot', slot: msg.slot }, '*')
  }
})

// 頁面 → 背景
window.addEventListener('message', (e) => {
  if (e.source !== window) return
  const d = e.data
  if (!d || d.source !== SOURCE) return
  if (d.type === 'openShortcuts') {
    log('頁面要求開快捷鍵設定頁')
    chrome.runtime.sendMessage({ source: SOURCE, type: 'openShortcuts' })
  }
})

// 把目前綁定送進頁面。注入時送一次；使用者去設定頁綁完鍵切回來時再送一次——
// Chrome 沒有「綁定變更」事件，只能趁回到前景時重問。
function pushBindings() {
  chrome.runtime.sendMessage({ source: SOURCE, type: 'getBindings' }, (bindings) => {
    if (chrome.runtime.lastError) {
      log('問綁定失敗：', chrome.runtime.lastError.message)
      return
    }
    if (!bindings) return
    log('綁定', bindings)
    window.postMessage({ source: SOURCE, type: 'bindings', bindings }, '*')
  })
}

log('已注入', location.href)
pushBindings()
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) pushBindings()
})
