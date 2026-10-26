import { ref } from 'vue'

// 表格列拖拉排序：只有把手能拖（整列可拖的話，輸入框裡沒辦法用滑鼠選字），放在哪一列上都行。
// 拖的是第幾列記在這裡，不靠 dataTransfer（jsdom 沒有）
export function useRowDrag(onMove: (from: number, to: number) => void) {
  const from = ref<number | null>(null)
  const over = ref<number | null>(null) // 目前懸在哪一列上，畫個框

  function start(i: number, e: DragEvent) {
    from.value = i
    e.dataTransfer?.setData('text/plain', String(i))
    // 拖的時候跟著游標的是整列，不是只有把手
    const row = (e.target as HTMLElement | null)?.closest('tr')
    if (row) e.dataTransfer?.setDragImage(row, 0, 0)
  }
  // 只接自己這個表的列；從別處拖進來的字不處理
  function enter(i: number, e: DragEvent) {
    if (from.value == null) return
    e.preventDefault()
    over.value = i
  }
  function end() {
    from.value = null
    over.value = null
  }
  function drop(i: number) {
    const f = from.value
    end()
    if (f == null || f === i) return
    onMove(f, i)
  }
  return { over, start, enter, end, drop }
}
