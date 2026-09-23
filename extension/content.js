// 頁面與背景之間的橋。頁面碰不到 chrome.*，背景碰不到頁面的 window。

const SOURCE = 'maplestory-toolkit-hotkeys'

// 背景 → 頁面
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.source === SOURCE && msg.type === 'slot') {
    window.postMessage({ source: SOURCE, type: 'slot', slot: msg.slot }, '*')
  }
})

// 頁面 → 背景
window.addEventListener('message', (e) => {
  if (e.source !== window) return
  const d = e.data
  if (!d || d.source !== SOURCE) return
  if (d.type === 'openShortcuts') {
    chrome.runtime.sendMessage({ source: SOURCE, type: 'openShortcuts' })
  }
})

// 把目前綁定送進頁面。注入時送一次；使用者去設定頁綁完鍵切回來時再送一次——
// Chrome 沒有「綁定變更」事件，只能趁回到前景時重問。
function pushBindings() {
  chrome.runtime.sendMessage({ source: SOURCE, type: 'getBindings' }, (bindings) => {
    if (chrome.runtime.lastError || !bindings) return
    window.postMessage({ source: SOURCE, type: 'bindings', bindings }, '*')
  })
}

pushBindings()
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) pushBindings()
})
