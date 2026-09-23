// 收全域快捷鍵，轉給所有開著工具箱的分頁。
//
// 六個指令都不帶建議鍵：全域指令的建議鍵只能 Ctrl+Shift+數字（Chromium 的
// CanAutoAssign 寫死的），而那組鍵在楓之谷裡 Ctrl 是攻擊、Shift 常被綁技能，
// 預設了也是要被改掉。使用者到 chrome://extensions/shortcuts 綁一次就好。
//
// 每一步都寫 console：在 chrome://extensions 這張卡片的「服務工作者」連結裡看。
// 「按了沒反應」時這是唯一的線索，不能靜靜吞掉。

const SOURCE = 'maplestory-toolkit-hotkeys'
// 跟 manifest 的 host_permissions 同一組。tabs.query 用 url 過濾要靠 host permission，
// 只有 content_scripts.matches 是不夠的——那樣會拿到空陣列、一封都送不出去。
const MATCHES = [
  'https://unrealsky.github.io/maplestory-toolkit/*',
  'http://localhost:5173/*',
]

const log = (...args) => console.log('[快捷鍵]', ...args)

chrome.commands.onCommand.addListener(async (command) => {
  const slot = Number(command.replace('slot', ''))
  log('收到指令', command, '→ 第', slot, '格')
  if (!slot) return
  const tabs = await chrome.tabs.query({ url: MATCHES })
  log('開著工具箱的分頁', tabs.length, '個', tabs.map((t) => t.url))
  if (!tabs.length) {
    log('沒有分頁可以送——工具箱沒開，或 manifest 的 host_permissions 少了那個網址')
    return
  }
  for (const tab of tabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, { source: SOURCE, type: 'slot', slot })
      log('已送到分頁', tab.id)
    } catch (e) {
      // 分頁可能還沒注入完（剛開、或正在導航）。記下來，別吞掉
      log('送到分頁', tab.id, '失敗：', e?.message ?? e)
    }
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
    currentBindings().then((b) => {
      log('回覆綁定', b)
      sendResponse(b)
    })
    return true // 非同步回覆
  }
  if (msg.type === 'openShortcuts') {
    // 網頁自己開不了 chrome:// 網址，Chrome 也沒有 openShortcutSettings()
    log('開快捷鍵設定頁')
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })
  }
})
