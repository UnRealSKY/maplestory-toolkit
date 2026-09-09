/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { findBarFrame, findPortrait, scanHpBar } from '#src/hp/scan'

function frame(name: string, width: number, height: number) {
  const gz = readFileSync(resolve(process.cwd(), 'tests/hp/fixtures', `${name}.rgba.gz`))
  return { data: new Uint8ClampedArray(gunzipSync(gz)), width, height }
}

// 實測：頭像是正方形、貼在血條左邊、頂邊跟血條頂對齊，邊長是外框高的 2.6 倍。
// 1080p 是 x227~270 y9~52（44px），2K 是 x454~542 y18~106（88px）
describe('頭像方框', () => {
  it('1080p', () => {
    const f = frame('hp-20', 1280, 144)
    const fr = findBarFrame(f.data, f.width, f.height)!
    const p = findPortrait(f.data, f.width, f.height, fr)!
    expect(p).not.toBeNull()
    expect(Math.abs(p.x0 - 227)).toBeLessThanOrEqual(2)
    expect(Math.abs(p.x1 - 270)).toBeLessThanOrEqual(2)
    expect(Math.abs(p.y0 - 9)).toBeLessThanOrEqual(2)
    expect(Math.abs(p.y1 - 52)).toBeLessThanOrEqual(2)
  })

  it('2K、串流壓縮', () => {
    const f = frame('hp-80-multi-2k-jpeg', 2560, 288)
    const fr = findBarFrame(f.data, f.width, f.height)!
    const p = findPortrait(f.data, f.width, f.height, fr)!
    expect(p).not.toBeNull()
    expect(Math.abs(p.x0 - 454)).toBeLessThanOrEqual(3)
    expect(Math.abs(p.x1 - 542)).toBeLessThanOrEqual(3)
    expect(Math.abs(p.y0 - 18)).toBeLessThanOrEqual(3)
    expect(Math.abs(p.y1 - 106)).toBeLessThanOrEqual(3)
  })

  it('是正方形', () => {
    const f = frame('hp-20', 1280, 144)
    const fr = findBarFrame(f.data, f.width, f.height)!
    const p = findPortrait(f.data, f.width, f.height, fr)!
    expect(p.x1 - p.x0).toBe(p.y1 - p.y0)
  })

  it('scanHpBar 的讀數帶著頭像方框', () => {
    const f = frame('hp-20', 1280, 144)
    const r = scanHpBar(f.data, f.width, f.height)!
    expect(r.portrait).toMatchObject({ x0: 227, y0: 9 })
  })
})
