---
'maplestory-toolkit': patch
---

修正快捷鍵按了沒反應：擴充套件 manifest 少了 `host_permissions`，背景找不到工具箱分頁，一封訊息都送不出去（綁定照樣會顯示，因為那條路不經 `tabs` API）。同時背景與 content script 每一步都寫 console，之後「沒反應」可以在 `chrome://extensions` 的「服務工作者」和頁面 DevTools 看到卡在哪。擴充套件版本 0.1.1，請重新下載 zip 覆蓋後在 `chrome://extensions` 按重新載入。
