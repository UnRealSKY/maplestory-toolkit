// 收全域快捷鍵，轉給所有開著工具箱的分頁。
//
// 六個指令都不帶建議鍵：全域指令的建議鍵只能 Ctrl+Shift+數字（Chromium 的
// CanAutoAssign 寫死的），而那組鍵在楓之谷裡 Ctrl 是攻擊、Shift 常被綁技能，
// 預設了也是要被改掉。使用者到 chrome://extensions/shortcuts 綁一次就好。

const SOURCE = 'maplestory-toolkit-hotkeys'
const MATCHES = [
  'https://unrealsky.github.io/maplestory-toolkit/*',
  'http://localhost:5173/*',
]

async function toolkitTabs() {
  return chrome.tabs.query({ url: MATCHES })
}

chrome.commands.onCommand.addListener(async (command) => {
  const slot = Number(command.replace('slot', ''))
  if (!slot) return
  for (const tab of await toolkitTabs()) {
    // 分頁可能還沒注入完（剛開、或正在導航），送不到就跳過，不必吵使用者
    chrome.tabs.sendMessage(tab.id, { source: SOURCE, type: 'slot', slot }).catch(() => {})
  }
})

// 目前的綁定。Chrome 沒有「綁定變更」事件，所以是用問的。
async function currentBindings() {
  const out = {}
  for (const c of await chrome.commands.getAll()) {
    if (c.name.startsWith('slot')) out[c.name] = c.shortcut || ''
  }
  return out
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.source !== SOURCE) return
  if (msg.type === 'getBindings') {
    currentBindings().then(sendResponse)
    return true // 非同步回覆
  }
  if (msg.type === 'openShortcuts') {
    // 網頁自己開不了 chrome:// 網址，Chrome 也沒有 openShortcutSettings()
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })
  }
})
