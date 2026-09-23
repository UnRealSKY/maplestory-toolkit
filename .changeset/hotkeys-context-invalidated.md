---
'maplestory-toolkit': patch
---

快捷鍵擴充套件在 `chrome://extensions` 重新載入或更新之後，還開著的工具箱分頁切回來會在 console 噴錯（舊的 content script 已失效卻還在跑）。現在會安靜退場並提示重新整理頁面。擴充套件版本 0.1.2。
