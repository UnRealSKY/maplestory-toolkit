// 說明：執行期直讀 repo 上的 README.md，跟更新內容同一個模式——
// 改了 push 上去就看得到，不必為了改文案發一次版。連結改寫也共用同一套。

import { expandAutolinks, rebaseLinks } from './changelog'

const REPO = 'UnRealSKY/maplestory-toolkit'
export const README_RAW_URL = `https://raw.githubusercontent.com/${REPO}/main/README.md`
export const README_PAGE_URL = `https://github.com/${REPO}#readme`

// 檔案開頭的大標題是專案名，對話框本身已經叫「說明」，拿掉
export function stripTitle(md: string): string {
  return md.replace(/^#\s+\S[^\n]*\n+/, '')
}

export async function fetchReadme(url: string = README_RAW_URL): Promise<string> {
  const res = await fetch(url, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`抓取失敗（HTTP ${res.status}）`)
  return rebaseLinks(expandAutolinks(stripTitle(await res.text())))
}
