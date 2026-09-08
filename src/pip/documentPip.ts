// 子母畫面（Document Picture-in-Picture）：把頁面上的一塊 DOM 搬到一個永遠置頂的小視窗。
// 打王時遊戲佔滿整個螢幕，瀏覽器在背景就看不到倒數了，這個視窗會浮在最上面。
// 只有 Chromium 系列支援；其他瀏覽器就當作沒有這個功能。

interface PipOptions {
  width?: number
  height?: number
}

interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>
  window: Window | null
}

function api(): DocumentPictureInPicture | null {
  const w = window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }
  return w.documentPictureInPicture ?? null
}

export function pipSupported(): boolean {
  return api() != null
}

// 樣式表不會跟著節點走，得整份複製過去，否則搬過去的內容會變成裸 HTML。
// 跨網域的樣式表讀不到 cssRules，改用 link 帶過去。
export function copyStyles(from: Document, to: Document): void {
  for (const sheet of Array.from(from.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join('\n')
      const style = to.createElement('style')
      style.textContent = css
      to.head.appendChild(style)
    } catch {
      if (!sheet.href) continue
      const link = to.createElement('link')
      link.rel = 'stylesheet'
      link.href = sheet.href
      to.head.appendChild(link)
    }
  }
}

export interface PipSize {
  width: number
  height: number
}

/**
 * 先在視窗寬下排版、量內容自然高，倍率＝視窗高÷內容高（最多 1）；再把 width 用
 * 視窗寬÷倍率撐開，內容 reflow 填滿——視窗一寬按鈕變一行、內容自己變矮、就不必縮；
 * 拉高不放大，多出來的高度留在底下，各區塊維持原尺寸。
 * 「內容高」不會跟倍率互相追：面板高度用 min-height 釘在該王最高的狀態、血條區
 * 固定高、按鈕換行只看 PiP 視窗寬（media query）不看撐開後的 body 寬——量到的高
 * 在同一個視窗尺寸下永遠一樣，狀態切換、換王都不會讓字忽大忽小。
 * 用 transform 而不是 zoom：zoom 會改變佈局寬度，內容跟著重新換行。
 */
export function fitToWindow(win: Window): void {
  const b = win.document.body
  if (!win.innerWidth || !win.innerHeight) return
  b.style.transform = 'none'
  b.style.width = `${win.innerWidth}px`
  b.style.height = 'auto'
  const natural = b.scrollHeight
  const z = Math.max(0.3, Math.min(1, win.innerHeight / natural))
  b.style.width = `${win.innerWidth / z}px`
  b.style.height = `${win.innerHeight / z}px`
  b.style.transformOrigin = 'top left'
  b.style.transform = `scale(${z})`
}

/**
 * 把視窗調成「內容不用縮放剛好塞滿」的大小。resizeTo 給的是外框，標題列的高度
 * 每台機器不一樣（系統縮放、主題），拿 outer - inner 當場算才準。
 * 需要 user activation——換王是使用者點的，那個手勢還在有效期內；從網址進來
 * 或按上一頁沒有手勢，呼叫會被瀏覽器擋掉，所以要吞掉例外讓它安靜地不做事。
 */
export function resizePip(win: Window, size: PipSize): boolean {
  const chromeW = win.outerWidth - win.innerWidth
  const chromeH = win.outerHeight - win.innerHeight
  try {
    win.resizeTo(size.width + chromeW, size.height + chromeH)
    return true
  } catch {
    return false
  }
}

/** 視窗被拉大縮小時重新縮放；內容變化不會改倍率，不必盯著它 */
export function keepFitted(win: Window): void {
  const fit = () => fitToWindow(win)
  fit()
  win.addEventListener('resize', fit)
}

/** 開一個子母畫面視窗；不支援或使用者拒絕時回 null */
export async function openPipWindow(opts: PipOptions = {}): Promise<Window | null> {
  const pip = api()
  if (!pip) return null
  try {
    const win = await pip.requestWindow({
      width: opts.width ?? 420,
      height: opts.height ?? 560,
    })
    copyStyles(document, win.document)
    win.document.body.classList.add('app', 'pip-body')
    // 縮放後 body 佔的位置仍是原尺寸，捲軸交給 overflow 藏起來
    win.document.documentElement.style.overflow = 'hidden'
    return win
  } catch {
    return null
  }
}
