// markdown → HTML，更新內容與說明兩個對話框共用。
//
// snarkdown 不處理區塊之間的空行（段落會黏在一起），也不認得表格。
// 所以先依空行切段、各自渲染；長得像 pipe table 的段落自己轉成 <table>。

import snarkdown from 'snarkdown'

const TABLE_ROW = /^\s*\|.*\|\s*$/
const TABLE_SEP = /^\s*\|(\s*:?-+:?\s*\|)+\s*$/

export function isPipeTable(block: string): boolean {
  const lines = block.split('\n')
  return lines.length >= 2 && TABLE_ROW.test(lines[0]) && TABLE_SEP.test(lines[1])
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
}

// 表頭一列、分隔線一列、其餘是資料。儲存格內容仍交給 snarkdown（粗體、程式碼、連結）
export function renderTable(block: string): string {
  const [head, , ...rows] = block.split('\n')
  const inline = (s: string) => snarkdown(s)
  const th = cells(head).map((c) => `<th>${inline(c)}</th>`).join('')
  const trs = rows
    .filter((r) => TABLE_ROW.test(r))
    .map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
    .join('')
  return `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`
}

// 清單項目底下縮排 1~3 格的續行（例如安裝步驟裡的截圖）：markdown 允許，snarkdown 卻當成程式碼
function dedent(block: string): string {
  return block.replace(/^ {1,3}(?=\S)/gm, '')
}

// 用空行隔開的編號清單會被切成好幾段，每段都從 1 數；段落開頭是「N. 」就把 N 接回去
const ORDERED_START = /^(\d+)\.\s/
function renderBlock(block: string): string {
  if (isPipeTable(block)) return renderTable(block)
  const html = snarkdown(dedent(block))
  const start = Number(block.match(ORDERED_START)?.[1] ?? 1)
  return start > 1 ? html.replace(/^<ol>/, `<ol start="${start}">`) : html
}

export function renderMarkdown(md: string): string {
  return md.split(/\n{2,}/).map(renderBlock).join('\n')
}
