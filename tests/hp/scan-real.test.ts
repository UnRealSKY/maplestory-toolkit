/// <reference types="node" />
// 讀 fixture 要用 node 的 fs / zlib；只在這支引用，tsconfig 不開 node 型別，src 那邊維持純瀏覽器
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { scanHpBar } from '#src/hp/scan'

// 真實遊戲畫面（1280x720 的上方 20%，跟 capture.ts 抓的範圍一樣）。
// 合成畫面測得出邏輯對不對，測不出真實畫面長什麼樣——
// 這幾張都是實戰截下來、判讀出過錯的。正確答案是拿血條的實際範圍
// （x281..1049、y14..22）直接算 readRatioIn 得到的。
function frame(name: string) {
  // vitest 跑在 jsdom 裡，import.meta.url 拿不到專案路徑；cwd 就是專案根
  const gz = readFileSync(resolve(process.cwd(), 'tests/hp/fixtures', `${name}.rgba.gz`))
  return { data: new Uint8ClampedArray(gunzipSync(gz)), width: 1280, height: 144 }
}
const hp = (name: string) => {
  const f = frame(name)
  const r = scanHpBar(f.data, f.width, f.height, { topFrac: 1 })
  return r ? Math.round(r.ratio * 1000) / 10 : null
}

describe('真實畫面', () => {
  it('血量低、最後一條血、背景天空的彩度比血條高：不能被背景騙走', () => {
    expect(hp('hp-18')).toBeCloseTo(17.8, 0)
  })

  it('血量低：右端要走到血條盡頭，不是走到血色結束就停', () => {
    expect(hp('hp-20')).toBeCloseTo(19.8, 0)
  })

  it('多條血：右邊露出下一條血的顏色，照樣只算最左那段', () => {
    expect(hp('hp-26-multi')).toBeCloseTo(26.4, 0)
  })

  it('血量高：右端同樣要走到盡頭', () => {
    expect(hp('hp-85')).toBeCloseTo(84.5, 0)
  })
})
