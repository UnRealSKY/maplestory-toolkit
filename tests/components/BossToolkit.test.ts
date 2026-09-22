import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from '#src/router'
import BossToolkit from '#src/components/BossToolkit.vue'
import { BOSSES } from '#src/boss/bosses'
import { clearAnchor } from '#src/boss/anchor'
import { BOSS_KEY, OVERRIDES_KEY } from '#src/storageKeys'
import { bossId, overrides, dispelDuration, resetSession } from '#src/boss/session'
import { DEFAULT_DISPEL_DURATION, BOSSES as ALL_BOSSES } from '#src/boss/bosses'
import { setHpNow, clearHpNow } from '#src/hp/current'

// 元件是從網址讀「現在在看哪隻王」的，所以測試也得給它一份 router。
// 每個測試各自建一份，上一個測試留下的網址不會漏過來。
async function mountToolkit(boss = ALL_BOSSES[0].id) {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(`/boss-toolkit/${boss}`)
  await router.isReady()
  const w = mount(BossToolkit, { global: { plugins: [router] } })
  await flushPromises() // 網址不合法時元件會把它改掉，等那次導航走完
  return { w, router }
}

// 選王改的是網址，導航是非同步的——等它走完，畫面才會換成那隻王
async function pickBoss(chip: { trigger: (e: string) => Promise<unknown> }) {
  await chip.trigger('click')
  await flushPromises()
}

// 皮卡啾／粉豆 反25 間20 浮動3；杜納斯 反20 間25 浮動0；魔消預設 20（玩家技能）
const chips = (w: ReturnType<typeof mount>) => w.findAll('.boss-chip')
const numberInputs = (w: ReturnType<typeof mount>) => w.findAll('input[type="number"]')
// 0 = 反盾持續、1 = 反盾間隔、2 = 間隔浮動、3 = 魔消持續
const seconds = (w: ReturnType<typeof mount>, i: number) =>
  (numberInputs(w)[i].element as HTMLInputElement).value

describe('BossToolkit 選王', () => {
  beforeEach(() => {
    localStorage.clear()
    clearAnchor()
    bossId.value = ALL_BOSSES[0].id
    overrides.value = {}
    dispelDuration.value = DEFAULT_DISPEL_DURATION
    resetSession()
  })

  it('列出所有王，預設選第一隻', async () => {
    const { w } = await mountToolkit()
    expect(chips(w).map((c) => c.text())).toEqual(BOSSES.map((b) => b.name))
    expect(chips(w)[0].classes()).toContain('boss-on')
  })

  it('換王會套用該王的秒數並記住選擇', async () => {
    const { w } = await mountToolkit()
    await pickBoss(chips(w)[1])
    expect(chips(w)[1].classes()).toContain('boss-on')
    expect(seconds(w, 0)).toBe('20') // 反盾持續
    expect(seconds(w, 1)).toBe('25') // 反盾間隔
    expect(localStorage.getItem(BOSS_KEY)).toBe('dunas')
  })

  it('魔消持續是玩家技能，換王不變', async () => {
    const { w } = await mountToolkit()
    expect(seconds(w, 3)).toBe('20')
    await pickBoss(chips(w)[1])
    expect(seconds(w, 3)).toBe('20')
  })

  it('計時中鎖住換王，重置後解鎖', async () => {
    const { w } = await mountToolkit()
    await w.findAll('.ctrl')[0].trigger('click') // 反盾開始
    expect(chips(w).every((c) => c.attributes('disabled') !== undefined)).toBe(true)
    expect(w.find('.lock-hint').exists()).toBe(true)

    await w.findAll('.ctrl')[4].trigger('click') // 重置
    expect(chips(w).every((c) => c.attributes('disabled') === undefined)).toBe(true)
    expect(w.find('.lock-hint').exists()).toBe(false)
  })
})

describe('網址就是「在看哪隻王」', () => {
  beforeEach(() => {
    localStorage.clear()
    clearAnchor()
    bossId.value = ALL_BOSSES[0].id
    overrides.value = {}
    dispelDuration.value = DEFAULT_DISPEL_DURATION
    resetSession()
  })

  it('照著網址開就直接是那隻王', async () => {
    const { w } = await mountToolkit('dunas')
    expect(chips(w)[1].classes()).toContain('boss-on')
    expect(seconds(w, 0)).toBe('20') // 杜納斯的反盾持續
  })

  it('選王會把網址換掉——選好的王貼給隊友就是這條', async () => {
    const { w, router } = await mountToolkit()
    await pickBoss(chips(w)[1])
    expect(router.currentRoute.value.path).toBe('/boss-toolkit/dunas')
  })

  it('網址寫了沒有的王就退回預設王，網址也一起改掉', async () => {
    const { w, router } = await mountToolkit('nobody')
    expect(router.currentRoute.value.path).toBe(`/boss-toolkit/${ALL_BOSSES[0].id}`)
    expect(chips(w)[0].classes()).toContain('boss-on')
  })

  it('計時中直接改網址換王會被擋回來，計時不會被丟掉', async () => {
    const { w, router } = await mountToolkit()
    await w.find('.ctrl-reflect').trigger('click') // 反盾開始

    await router.push('/boss-toolkit/dunas')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe(`/boss-toolkit/${ALL_BOSSES[0].id}`)
    expect(bossId.value).toBe(ALL_BOSSES[0].id)
    expect(w.find('.phase-reflect').exists()).toBe(true) // 還在反盾中
  })
})

describe('BossToolkit 參數覆寫', () => {
  beforeEach(() => {
    localStorage.clear()
    clearAnchor()
    bossId.value = ALL_BOSSES[0].id
    overrides.value = {}
    dispelDuration.value = DEFAULT_DISPEL_DURATION
    resetSession()
  })

  it('改秒數只影響當下這隻王，並存進覆寫表', async () => {
    const { w } = await mountToolkit()
    await pickBoss(chips(w)[1]) // 杜納斯
    await numberInputs(w)[0].setValue(22)
    expect(JSON.parse(localStorage.getItem(OVERRIDES_KEY)!)).toEqual({
      dunas: { reflectDuration: 22, interval: 25, intervalFloat: 0 },
    })

    await pickBoss(chips(w)[0]) // 切回皮卡啾：仍是內建預設
    expect(seconds(w, 0)).toBe('25')
  })

  it('有覆寫才出現「還原預設」，按下即回內建值', async () => {
    const { w } = await mountToolkit()
    expect(w.find('.reset-boss').exists()).toBe(false)

    await numberInputs(w)[0].setValue(26)
    expect(w.find('.reset-boss').text()).toBe('還原皮卡啾／粉豆預設')

    await w.find('.reset-boss').trigger('click')
    expect(seconds(w, 0)).toBe('25')
    expect(w.find('.reset-boss').exists()).toBe(false)
  })

  it('秒數改回內建預設會自動移除覆寫', async () => {
    const { w } = await mountToolkit()
    await numberInputs(w)[0].setValue(26)
    await numberInputs(w)[0].setValue(25)
    expect(w.find('.reset-boss').exists()).toBe(false)
    expect(JSON.parse(localStorage.getItem(OVERRIDES_KEY)!)).toEqual({})
  })
})

describe('BossToolkit 切到循環模板的王（女皇）', () => {
  beforeEach(() => {
    localStorage.clear()
    clearAnchor()
    bossId.value = ALL_BOSSES[0].id
    overrides.value = {}
    dispelDuration.value = DEFAULT_DISPEL_DURATION
    resetSession()
  })

  const queenChip = (w: ReturnType<typeof mount>) =>
    chips(w)[BOSSES.findIndex((b) => b.id === 'cygnus')]
  const items = (w: ReturnType<typeof mount>) => w.findAll('.cycle-item')

  it('換到女皇時反盾面板收起，改列出全部機制', async () => {
    const { w } = await mountToolkit()
    await pickBoss(queenChip(w))
    expect(w.find('.controls').exists()).toBe(false) // 反盾的操作區
    expect(items(w).map((li) => li.find('.phase-title').text())).toEqual([
      '反盾80s', '變豬60s', '小黑屋90s', '鎖潛能90s', '活屍60s',
    ])
  })

  it('每個機制各自觸發，沒按過的維持未開始', async () => {
    const { w } = await mountToolkit()
    await pickBoss(queenChip(w))
    await items(w)[0].find('.trigger').trigger('click')
    expect(items(w)[0].find('.seg-remaining').text()).toBe('80s')
    expect(items(w)[1].find('.not-started').exists()).toBe(true)
  })

  it('微調只影響按下去的那個機制', async () => {
    const { w } = await mountToolkit()
    await pickBoss(queenChip(w))
    await items(w)[0].find('.trigger').trigger('click')
    await items(w)[0].findAll('.nudge')[1].trigger('click') // ＋1s
    expect(items(w)[0].find('.seg-remaining').text()).toBe('81s')
    expect(items(w)[1].find('.not-started').exists()).toBe(true)
  })

  it('沒開始的機制不給微調（欄位仍在，一按觸發卡片才不會突然撐高）', async () => {
    const { w } = await mountToolkit()
    await pickBoss(queenChip(w))
    const nudges = items(w)[0].findAll('.nudge')
    expect(nudges).toHaveLength(2)
    expect(nudges.every((b) => b.attributes('disabled') != null)).toBe(true)
  })

  it('倒數到剩 5 秒內轉成警戒色，過了那一輪就恢復', async () => {
    vi.useFakeTimers()
    try {
      const { w } = await mountToolkit()
      await pickBoss(queenChip(w))
      await items(w)[0].find('.trigger').trigger('click') // 反盾 80s
      vi.advanceTimersByTime(76_000)
      await nextTick()
      expect(items(w)[0].find('.seg-remaining').text()).toBe('4s')
      expect(items(w)[0].classes()).toContain('phase-reflect') // 跟反盾面板同一組配色語意
      // 到點後自動接下一輪，回到 80 秒
      vi.advanceTimersByTime(4_000)
      await nextTick()
      expect(items(w)[0].find('.seg-remaining').text()).toBe('80s')
      expect(items(w)[0].classes()).toContain('phase-attack')
    } finally {
      vi.useRealTimers()
    }
  })

  it('一波：三個時鐘按齊之前說缺誰，齊了才判斷可不可以', async () => {
    vi.useFakeTimers()
    try {
      const { w } = await mountToolkit()
      await pickBoss(queenChip(w))
      const bar = () => w.find('.finisher')
      expect(bar().classes()).toContain('finisher-unknown')
      expect(bar().find('.finisher-verdict').text()).toBe('先觸發 變豬、小黑屋、鎖潛能')
      // 反盾與活屍不在判斷裡，按了也還是沒依據
      await items(w)[0].find('.trigger').trigger('click') // 反盾
      await items(w)[4].find('.trigger').trigger('click') // 活屍
      expect(bar().classes()).toContain('finisher-unknown')
      // 只按變豬：還缺黑屋與鎖潛能，缺誰就只說誰
      await items(w)[1].find('.trigger').trigger('click')
      expect(bar().find('.finisher-verdict').text()).toBe('先觸發 小黑屋、鎖潛能')
      // 三個按齊：接下來 25 秒乾淨，窗口長到變豬 60 秒後觸發為止
      await items(w)[2].find('.trigger').trigger('click')
      await items(w)[3].find('.trigger').trigger('click')
      expect(bar().classes()).toContain('finisher-go')
      expect(bar().find('.finisher-verdict').text()).toBe('可以一波（35 秒）')
      expect(bar().find('.finisher-note').exists()).toBe(false)
      // 40 秒後變豬剩 20 秒，落在魔消 20＋寬容 5 之內 → 等到變豬觸發
      vi.advanceTimersByTime(40_000)
      await nextTick()
      expect(bar().classes()).toContain('finisher-wait')
      expect(bar().find('.finisher-verdict').text()).toBe('等 20 秒後可以一波')
      expect(bar().find('.finisher-note').text()).toBe('（等 變豬 觸發）')
    } finally {
      vi.useRealTimers()
    }
  })

  it('有循環在跑就鎖住換王，重置後才放開', async () => {
    const { w } = await mountToolkit()
    await pickBoss(queenChip(w))
    await items(w)[0].find('.trigger').trigger('click')
    expect(chips(w)[0].attributes('disabled')).toBeDefined()
    await w.find('.cycle-head .btn').trigger('click') // 重置
    expect(chips(w)[0].attributes('disabled')).toBeUndefined()
  })
})

describe('對齊遊戲計時後顯示的是時間，而且不會一直跳', () => {
  beforeEach(() => {
    localStorage.clear()
    clearAnchor()
    bossId.value = ALL_BOSSES[0].id
    overrides.value = {}
    dispelDuration.value = DEFAULT_DISPEL_DURATION
    resetSession()
  })

  async function align(w: ReturnType<typeof mount>, mmss: string) {
    await w.find('.anchor-input').setValue(mmss)
    await w.findAll('.anchor-row .btn')[0].trigger('click')
  }

  it('對齊後有一個持續走的遊戲計時可以核對', async () => {
    vi.useFakeTimers()
    try {
      const { w } = await mountToolkit()
      expect(w.find('.game-clock').exists()).toBe(false) // 沒對齊就沒有
      await align(w, '12:00')
      expect(w.find('.game-clock').text()).toBe('12:00')
      vi.advanceTimersByTime(5_000)
      await nextTick()
      expect(w.find('.game-clock').text()).toBe('11:55') // 跟著遊戲一起倒數
      // 校準 −1 秒後也要跟著改
      await w.find('.anchor-row .btn[title="校準 -1 秒"]').trigger('click')
      await nextTick()
      expect(w.find('.game-clock').text()).toBe('11:54')
    } finally {
      vi.useRealTimers()
    }
  })

  it('反盾：可輸出到顯示遊戲時間，倒數走動時那個時刻不動', async () => {
    vi.useFakeTimers()
    try {
      const { w } = await mountToolkit()
      await align(w, '12:00')
      await w.findAll('.ctrl')[2].trigger('click') // 反盾阻止成功
      await nextTick()
      const at = w.find('.until-time').text()
      expect(at).toMatch(/^\d{2}:\d{2}$/)
      // 阻止成功 25s + 間隔 20s＝可以打到 11:15
      expect(at).toBe('11:15')
      vi.advanceTimersByTime(3_000)
      await nextTick()
      expect(w.find('.until-time').text()).toBe(at) // 秒數在走，時刻不該跟著漂
      expect(w.find('.seg-remaining').text()).toBe('本段 22s')
    } finally {
      vi.useRealTimers()
    }
  })

  it('選女皇時遊戲計時照樣走——反盾狀態機停了，時鐘不能跟著停', async () => {
    vi.useFakeTimers()
    try {
      const { w } = await mountToolkit()
      await pickBoss(chips(w)[BOSSES.findIndex((b) => b.id === 'cygnus')])
      // 切到女皇之後過了一段時間才對齊，對齊當下就該顯示輸入的時間
      vi.advanceTimersByTime(23_000)
      await nextTick()
      await align(w, '44:00')
      await nextTick()
      expect(w.find('.game-clock').text()).toBe('44:00')
      vi.advanceTimersByTime(5_000)
      await nextTick()
      expect(w.find('.game-clock').text()).toBe('43:55')
    } finally {
      vi.useRealTimers()
    }
  })

  it('女皇：每個機制顯示下次觸發的遊戲時間，並列出接下來的時間表', async () => {
    vi.useFakeTimers()
    try {
      const { w } = await mountToolkit()
      await pickBoss(chips(w)[BOSSES.findIndex((b) => b.id === 'cygnus')])
      await align(w, '12:00')
      await w.findAll('.cycle-item')[0].find('.trigger').trigger('click') // 反盾 80s
      await nextTick()
      expect(w.findAll('.cycle-item')[0].find('.until-time').text()).toBe('10:40')
      vi.advanceTimersByTime(3_000)
      await nextTick()
      expect(w.findAll('.cycle-item')[0].find('.until-time').text()).toBe('10:40')
      // 時間表列出同一個機制接下來的每一輪
      const rows = w.findAll('.events-card .event')
      expect(rows.length).toBeGreaterThan(0)
      expect(rows[0].find('.ev-time').text()).toBe('10:40')
      expect(rows[0].find('.ev-label').text()).toBe('反盾')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('阿卡伊農：血量掉到門檻就提醒', () => {
  const akaironChip = (w: ReturnType<typeof mount>) =>
    chips(w)[BOSSES.findIndex((b) => b.id === 'arkarium')]

  beforeEach(() => {
    localStorage.clear()
    clearAnchor()
    clearHpNow()
    bossId.value = ALL_BOSSES[0].id
    overrides.value = {}
    dispelDuration.value = DEFAULT_DISPEL_DURATION
    resetSession()
  })

  it('沒有血量讀數時說明要先開擷取', async () => {
    const { w } = await mountToolkit()
    await pickBoss(akaironChip(w))
    expect(w.find('.need-capture').exists()).toBe(true)
    expect(w.findAll('.mark').map((e) => e.text())).toEqual(['80%', '60%', '40%', '20%'])
  })

  it('報出距離下一個門檻還有多少', async () => {
    const { w } = await mountToolkit()
    await pickBoss(akaironChip(w))
    setHpNow(93.5, 0.5, Date.now())
    await nextTick()
    expect(w.find('.phase-title').text()).toBe('下一個 80%')
    expect(w.find('.gap-value').text()).toContain('13.5')
    expect(w.find('.chip-hp').text()).toBe('目前 93.5%')
  })

  it('進到提前量之內就轉成警戒色', async () => {
    const { w } = await mountToolkit()
    await pickBoss(akaironChip(w))
    setHpNow(84, 0.5, Date.now())
    await nextTick()
    expect(w.find('.phase-panel').classes()).toContain('phase-warn')
  })

  it('跨過門檻時標記已過並顯示機制來了', async () => {
    const { w } = await mountToolkit()
    await pickBoss(akaironChip(w))
    setHpNow(81, 0.5, Date.now())
    await nextTick()
    setHpNow(79, 0.5, Date.now())
    await nextTick()
    expect(w.find('.phase-title').text()).toContain('80%')
    expect(w.findAll('.mark')[0].classes()).toContain('done')
  })

  it('跨過門檻後開始算已過多久——隊友技能冷卻靠這個反推', async () => {
    vi.useFakeTimers()
    try {
      const { w } = await mountToolkit()
      await pickBoss(akaironChip(w))
      setHpNow(81, 0.5, Date.now())
      await nextTick()
      setHpNow(79, 0.5, Date.now())
      await nextTick()
      expect(w.find('.chip-since').text()).toBe('離 80% 已過 0:00')
      vi.advanceTimersByTime(95_000)
      await nextTick()
      expect(w.find('.chip-since').text()).toBe('離 80% 已過 1:35')
    } finally {
      vi.useRealTimers()
    }
  })

  it('還沒跨過任何門檻時不顯示已過多久', async () => {
    const { w } = await mountToolkit()
    await pickBoss(akaironChip(w))
    setHpNow(93, 0.5, Date.now())
    await nextTick()
    expect(w.find('.chip-since').exists()).toBe(false)
  })

  it('跨過 20% 後開始 70 秒循環，到點自動接下一輪', async () => {
    vi.useFakeTimers()
    try {
      const { w } = await mountToolkit()
      await pickBoss(akaironChip(w))
      setHpNow(21, 0.5, Date.now())
      await nextTick()
      setHpNow(19, 0.5, Date.now())
      await nextTick()
      expect(w.find('.phase-title').text()).toBe('下一次機制')
      expect(w.find('.gap-value').text()).toBe('70s')
      vi.advanceTimersByTime(65_000)
      await nextTick()
      expect(w.find('.gap-value').text()).toBe('5s')
      // 到點之後自己接下一輪
      vi.advanceTimersByTime(6_000)
      await nextTick()
      expect(w.find('.gap-value').text()).toBe('69s')
    } finally {
      vi.useRealTimers()
    }
  })

  it('沒到 20% 之前不會出現循環倒數', async () => {
    const { w } = await mountToolkit()
    await pickBoss(akaironChip(w))
    setHpNow(45, 0.5, Date.now())
    await nextTick()
    expect(w.find('.phase-title').text()).toBe('下一個 40%')
    expect(w.find('.cycle-row').exists()).toBe(false)
  })

  it('一口氣掉很多時，中間的門檻也算過了', async () => {
    const { w } = await mountToolkit()
    await pickBoss(akaironChip(w))
    setHpNow(85, 1, Date.now())
    await nextTick()
    setHpNow(35, 1, Date.now())
    await nextTick()
    const marks = w.findAll('.mark')
    expect(marks[0].classes()).toContain('done') // 80
    expect(marks[1].classes()).toContain('done') // 60
    expect(marks[2].classes()).toContain('done') // 40
    expect(marks[3].classes()).not.toContain('done') // 20 還沒
  })
})

describe('效率推估：只有血條，沒有機制面板', () => {
  beforeEach(() => {
    localStorage.clear()
    clearAnchor()
    clearHpNow()
    bossId.value = ALL_BOSSES[0].id
    overrides.value = {}
    dispelDuration.value = DEFAULT_DISPEL_DURATION
    resetSession()
  })

  it('選了之後沒有任何機制面板，只留王血量那張卡', async () => {
    const { w } = await mountToolkit()
    await pickBoss(chips(w)[BOSSES.findIndex((b) => b.id === 'dps')])
    expect(w.find('.hp-card').exists()).toBe(true)
    expect(w.find('.hp-threshold').exists()).toBe(false)
    expect(w.find('.cycle-board').exists()).toBe(false)
    expect(w.find('.controls').exists()).toBe(false) // 反盾的操作區
    expect(w.find('.events-card').exists()).toBe(false)
  })
})
