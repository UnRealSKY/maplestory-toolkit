import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  MSG_SOURCE,
  bindings,
  extensionReady,
  startHotkeyBridge,
  requestOpenShortcuts,
} from '#src/hotkey/bridge'
import { bossId } from '#src/boss/bossId'
import { reflectState, resetSession } from '#src/boss/session'

function send(data: unknown) {
  window.dispatchEvent(new MessageEvent('message', { data, source: window }))
}

describe('頁面這端的橋', () => {
  let stop: () => void

  beforeEach(() => {
    bossId.value = 'pink-bean'
    resetSession()
    bindings.value = {}
    extensionReady.value = false
    stop = startHotkeyBridge()
  })
  afterEach(() => stop())

  it('收到 slot 訊息就執行那一格', () => {
    send({ source: MSG_SOURCE, type: 'slot', slot: 1 })
    expect(reflectState.value.phase).toBe('reflect')
  })

  it('收到綁定就存起來，並標記擴充套件在線', () => {
    send({ source: MSG_SOURCE, type: 'bindings', bindings: { slot1: 'Alt+1', slot2: '' } })
    expect(bindings.value).toEqual({ slot1: 'Alt+1', slot2: '' })
    expect(extensionReady.value).toBe(true)
  })

  it('來源不對的訊息一律忽略——頁面上誰都能發 postMessage', () => {
    send({ source: 'somebody-else', type: 'slot', slot: 1 })
    send({ type: 'slot', slot: 1 })
    send('字串也不能炸')
    send(null)
    expect(reflectState.value.phase).toBe('idle')
  })

  it('不認得的 type 忽略，不會壞', () => {
    send({ source: MSG_SOURCE, type: '還沒發明的東西' })
    expect(reflectState.value.phase).toBe('idle')
  })

  it('解除之後不再接受訊息', () => {
    stop()
    send({ source: MSG_SOURCE, type: 'slot', slot: 1 })
    expect(reflectState.value.phase).toBe('idle')
    stop = startHotkeyBridge() // afterEach 還會再解除一次
  })

  it('請求開設定頁會往外送一則訊息', () => {
    const spy = vi.spyOn(window, 'postMessage')
    requestOpenShortcuts()
    expect(spy).toHaveBeenCalledWith({ source: MSG_SOURCE, type: 'openShortcuts' }, '*')
    spy.mockRestore()
  })
})
