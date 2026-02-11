import { DEFAULT_INTERVAL_SECONDS } from "./constants.js"
import { createMidiAdapters } from "./midiAdapters.js"
import { createScoreRenderer } from "./renderer.js"
import { CONNECTION_STATE, TRAINING_STATE, TrainerStateMachine } from "./stateMachine.js"
import { createTrainerStore } from "./store.js"

const formatSeconds = (ms) => {
  if (ms == null) return "—"
  return `${(ms / 1000).toFixed(2)}s`
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const queryRequired = (id) => {
  const el = document.getElementById(id)
  if (!el) {
    throw new Error(`缺少元素: #${id}`)
  }
  return el
}

export const bootstrapTrainerApp = () => {
  const refs = {
    appConnectionState: document.getElementById("app-connection-state"),
    appTrainingState: document.getElementById("app-training-state"),
    liveConnectButton: queryRequired("live-connect"),
    liveStatusLabel: queryRequired("live-status"),
    pedalDot: queryRequired("pedal-dot"),
    randomButton: queryRequired("random-note"),
    toggleAutoButton: queryRequired("toggle-auto"),
    liveClearButton: queryRequired("live-clear"),
    webMidiToggleButton: queryRequired("webmidi-toggle"),
    liveReuseLineCheckbox: queryRequired("live-reuse-line"),
    intervalInput: queryRequired("interval"),
    intervalNum: queryRequired("interval-num"),
    intervalValue: queryRequired("interval-value"),
    scoreRandomRoot: queryRequired("score-random"),
    scoreLiveRoot: queryRequired("score-live"),
    showNameCheckbox: queryRequired("show-name"),
    scoreTotalEl: queryRequired("score-total"),
    scoreGoodEl: queryRequired("score-good"),
    scoreBadEl: queryRequired("score-bad"),
    dualModeCheckbox: queryRequired("dual-mode"),
    rangeStartInput: queryRequired("range-start"),
    rangeEndInput: queryRequired("range-end"),
    rangeCurrentLabel: queryRequired("range-current"),
    trebleRangeStartInput: queryRequired("treble-range-start"),
    trebleRangeEndInput: queryRequired("treble-range-end"),
    rangeCurrentTrebleLabel: queryRequired("range-current-treble"),
    bassRangeStartInput: queryRequired("bass-range-start"),
    bassRangeEndInput: queryRequired("bass-range-end"),
    rangeCurrentBassLabel: queryRequired("range-current-bass"),
    avgTimeEl: queryRequired("avg-time"),
    fastestTimeEl: queryRequired("fastest-time"),
    fastestNameEl: queryRequired("fastest-name"),
    slowestTimeEl: queryRequired("slowest-time"),
    slowestNameEl: queryRequired("slowest-name"),
    debugBox: queryRequired("debug-box"),
  }

  const store = createTrainerStore()
  const machine = new TrainerStateMachine()

  const setDebugBox = (text, kind = "info") => {
    refs.debugBox.textContent = String(text ?? "")
    refs.debugBox.style.color = kind === "error" ? "#9f1239" : "#4b5563"
    refs.debugBox.style.background = kind === "error" ? "#fff1f2" : "#f8fafc"
    refs.debugBox.style.borderColor = kind === "error" ? "#fecdd3" : "#e2e8f0"
  }

  window.addEventListener("error", (e) => {
    const msg = (e && e.error && e.error.stack) || (e && e.message) || "未知错误"
    setDebugBox(msg, "error")
  })

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e && e.reason
    const msg = (reason && reason.stack) || (reason && reason.message) || String(reason || "未知 Promise 错误")
    setDebugBox(msg, "error")
  })

  const VF = (window.Vex && window.Vex.Flow) || window.VF
  if (!VF) {
    setDebugBox("VexFlow 未加载：请确认 vexflow.js 路径可访问", "error")
  }

  const renderer = createScoreRenderer({
    VF,
    scoreRandomRoot: refs.scoreRandomRoot,
    scoreLiveRoot: refs.scoreLiveRoot,
    getState: () => store,
    showNameEnabled: () => store.settings.showName,
    liveReuseLineEnabled: () => store.settings.liveReuseLine,
    setDebugBox,
  })

  const nameForMidi = renderer.nameForMidi
  const parseNameToMidi = renderer.parseNameToMidi

  const randomMidi = () => {
    const { min, max } = store.range
    return min + Math.floor(Math.random() * (max - min + 1))
  }

  const randomMidiWithin = (min, max) => min + Math.floor(Math.random() * Math.max(1, max - min + 1))

  const updateScoreboard = () => {
    refs.scoreTotalEl.textContent = String(store.score.total)
    refs.scoreGoodEl.textContent = String(store.score.good)
    refs.scoreBadEl.textContent = String(store.score.bad)
  }

  const updateMetricsUI = () => {
    if (store.score.durations.length >= 3) {
      let min = Infinity
      let max = -Infinity
      for (const d of store.score.durations) {
        if (d < min) min = d
        if (d > max) max = d
      }
      const sum = store.score.durations.reduce((a, b) => a + b, 0) - min - max
      const avg = sum / (store.score.durations.length - 2)
      refs.avgTimeEl.textContent = formatSeconds(avg)
    } else {
      refs.avgTimeEl.textContent = "—"
    }
    refs.fastestTimeEl.textContent = formatSeconds(store.score.fastest)
    refs.slowestTimeEl.textContent = formatSeconds(store.score.slowest)
    refs.fastestNameEl.textContent = store.score.fastestNote == null ? "—" : nameForMidi(store.score.fastestNote)
    refs.slowestNameEl.textContent = store.score.slowestNote == null ? "—" : nameForMidi(store.score.slowestNote)
  }

  const updateTrainingUI = () => {
    const byState = {
      [TRAINING_STATE.READY]: "就绪",
      [TRAINING_STATE.RUNNING]: "训练中",
      [TRAINING_STATE.AUTO_RUNNING]: "自动训练",
    }
    const label = byState[machine.training] || "就绪"
    if (refs.appTrainingState) refs.appTrainingState.textContent = `训练状态：${label}`
  }

  const updateConnectionUI = () => {
    if (machine.connection === CONNECTION_STATE.CONNECTED) {
      store.connection.liveConnected = true
      refs.liveStatusLabel.textContent = "已连接"
      refs.liveConnectButton.textContent = "断开"
      if (refs.appConnectionState) refs.appConnectionState.textContent = "连接状态：已连接"
      return
    }
    store.connection.liveConnected = false
    if (machine.connection === CONNECTION_STATE.CONNECTING) {
      refs.liveStatusLabel.textContent = "连接中..."
      refs.liveConnectButton.textContent = "断开"
      if (refs.appConnectionState) refs.appConnectionState.textContent = "连接状态：连接中"
      return
    }
    if (machine.connection === CONNECTION_STATE.RECONNECTING) {
      refs.liveStatusLabel.textContent = "重连中..."
      refs.liveConnectButton.textContent = "断开"
      if (refs.appConnectionState) refs.appConnectionState.textContent = "连接状态：重连中"
      return
    }
    refs.liveStatusLabel.textContent = "未连接"
    refs.liveConnectButton.textContent = "连接"
    if (refs.appConnectionState) refs.appConnectionState.textContent = "连接状态：未连接"
  }

  const setSustain = (on) => {
    store.live.sustainOn = !!on
    refs.pedalDot.className = on ? "dot on" : "dot"
  }

  const setRangeByNames = (startName, endName) => {
    const startMidi = parseNameToMidi(startName)
    const endMidi = parseNameToMidi(endName)
    if (startMidi == null || endMidi == null) return
    const min = Math.min(startMidi, endMidi)
    const max = Math.max(startMidi, endMidi)
    store.range = { min, max }
    store.lastValidRange = { min, max }
    refs.rangeCurrentLabel.textContent = `当前范围：${nameForMidi(min)} 至 ${nameForMidi(max)}`
    nextRandomImmediately()
  }

  const setTrebleRangeByNames = (startName, endName) => {
    const s = parseNameToMidi(startName)
    const e = parseNameToMidi(endName)
    if (s == null || e == null) return
    const min = Math.min(s, e)
    const max = Math.max(s, e)
    store.trebleRange = { min, max }
    refs.rangeCurrentTrebleLabel.textContent = `右：${nameForMidi(min)} 至 ${nameForMidi(max)}`
    if (store.settings.dualMode) nextRandomImmediately()
  }

  const setBassRangeByNames = (startName, endName) => {
    const s = parseNameToMidi(startName)
    const e = parseNameToMidi(endName)
    if (s == null || e == null) return
    const min = Math.min(s, e)
    const max = Math.max(s, e)
    store.bassRange = { min, max }
    refs.rangeCurrentBassLabel.textContent = `左：${nameForMidi(min)} 至 ${nameForMidi(max)}`
    if (store.settings.dualMode) nextRandomImmediately()
  }

  const scheduleAuto = () => {
    if (store.training.autoTimer) {
      clearInterval(store.training.autoTimer)
    }
    const intervalMs = store.settings.intervalSeconds * 1000
    store.training.autoTimer = setInterval(() => {
      nextRandomImmediately()
    }, intervalMs)
  }

  const stopAuto = () => {
    if (store.training.autoTimer) {
      clearInterval(store.training.autoTimer)
      store.training.autoTimer = null
    }
  }

  const setIntervalSeconds = (seconds) => {
    const n = clamp(Number(seconds) || DEFAULT_INTERVAL_SECONDS, 0.2, 120)
    store.settings.intervalSeconds = n
    refs.intervalInput.value = String(Math.min(12, n))
    refs.intervalNum.value = String(n.toFixed(1))
    refs.intervalValue.textContent = `${n.toFixed(1)}s`
    if (store.training.autoTimer) {
      scheduleAuto()
    }
  }

  const nextRandomImmediately = () => {
    if (store.settings.dualMode) {
      store.training.randomTargetTreble = randomMidiWithin(store.trebleRange.min, store.trebleRange.max)
      store.training.randomTargetBass = randomMidiWithin(store.bassRange.min, store.bassRange.max)
      store.training.hitTreble = false
      store.training.hitBass = false
    } else {
      store.training.randomMidiValue = randomMidi()
      store.training.randomTargetTreble = null
      store.training.randomTargetBass = null
      store.training.hitTreble = false
      store.training.hitBass = false
    }
    store.training.randomPositionIndex = 1 + Math.floor(Math.random() * 3)
    store.training.randomStartAt = performance.now()
    machine.transitionTraining("NEXT_TARGET")
    updateTrainingUI()
    renderer.renderRandomScore()
    if (store.training.autoTimer) {
      scheduleAuto()
    }
  }

  const recordHitDuration = (noteForMetric) => {
    const now = performance.now()
    if (store.training.randomStartAt == null) return
    const dt = Math.max(0, now - store.training.randomStartAt)
    store.score.durations.push(dt)
    if (store.score.fastest == null || dt < store.score.fastest) {
      store.score.fastest = dt
      store.score.fastestNote = noteForMetric
    }
    if (store.score.slowest == null || dt > store.score.slowest) {
      store.score.slowest = dt
      store.score.slowestNote = noteForMetric
    }
    updateMetricsUI()
  }

  const handleIncoming = (msg) => {
    if (!msg || typeof msg !== "object") return
    if (msg.type === "control_change" && msg.control === 64) {
      setSustain((msg.value || 0) >= 64)
    }
    if (msg.edge === "down" && typeof msg.note === "number") {
      if (store.settings.dualMode) {
        let advanced = false
        if (!store.training.hitTreble && msg.note === store.training.randomTargetTreble) {
          store.training.hitTreble = true
          store.score.good += 1
          store.score.total += 1
          updateScoreboard()
        } else if (!store.training.hitBass && msg.note === store.training.randomTargetBass) {
          store.training.hitBass = true
          store.score.good += 1
          store.score.total += 1
          updateScoreboard()
        } else if (msg.note !== store.training.randomTargetTreble && msg.note !== store.training.randomTargetBass) {
          store.score.bad += 1
          store.score.total -= 1
          updateScoreboard()
        }
        if (store.training.hitTreble && store.training.hitBass) {
          recordHitDuration(store.training.randomTargetTreble)
          advanced = true
        }
        if (advanced) nextRandomImmediately()
      } else if (typeof store.training.randomMidiValue === "number") {
        if (msg.note === store.training.randomMidiValue) {
          store.score.good += 1
          store.score.total += 1
          updateScoreboard()
          recordHitDuration(store.training.randomMidiValue)
          nextRandomImmediately()
        } else {
          store.score.bad += 1
          store.score.total -= 1
          updateScoreboard()
        }
      }
      renderer.pushLiveStep(msg.note)
    }
  }

  const midiAdapters = createMidiAdapters({
    setDebugBox,
    onEvent: handleIncoming,
    onConnectionEvent: (event) => {
      machine.transitionConnection(event)
      updateConnectionUI()
    },
  })

  refs.liveConnectButton.addEventListener("click", () => {
    const isConnectedLike =
      machine.connection === CONNECTION_STATE.CONNECTED ||
      machine.connection === CONNECTION_STATE.CONNECTING ||
      machine.connection === CONNECTION_STATE.RECONNECTING
    if (isConnectedLike) {
      store.connection.liveUserDisconnected = true
      midiAdapters.disconnectSse()
    } else {
      store.connection.liveUserDisconnected = false
      midiAdapters.connectSse()
    }
  })

  refs.liveClearButton.addEventListener("click", () => {
    renderer.clearLiveScore()
  })

  refs.webMidiToggleButton.addEventListener("click", async () => {
    if (midiAdapters.isWebMidiEnabled()) {
      midiAdapters.stopWebMidi()
      refs.webMidiToggleButton.textContent = "浏览器MIDI"
      return
    }
    const ok = await midiAdapters.startWebMidi()
    if (ok) {
      refs.webMidiToggleButton.textContent = "断开MIDI"
    }
  })

  refs.randomButton.addEventListener("click", () => {
    stopAuto()
    machine.transitionTraining("AUTO_STOP")
    refs.toggleAutoButton.textContent = "自动"
    updateTrainingUI()
    nextRandomImmediately()
  })

  refs.toggleAutoButton.addEventListener("click", () => {
    if (store.training.autoTimer) {
      stopAuto()
      machine.transitionTraining("AUTO_STOP")
      refs.toggleAutoButton.textContent = "自动"
      updateTrainingUI()
      return
    }
    scheduleAuto()
    machine.transitionTraining("AUTO_START")
    refs.toggleAutoButton.textContent = "停止"
    updateTrainingUI()
  })

  refs.intervalInput.addEventListener("input", () => setIntervalSeconds(refs.intervalInput.value))
  refs.intervalNum.addEventListener("input", () => setIntervalSeconds(refs.intervalNum.value))

  refs.showNameCheckbox.addEventListener("change", () => {
    store.settings.showName = !!refs.showNameCheckbox.checked
    renderer.renderRandomScore()
    renderer.renderLiveScore()
  })

  refs.liveReuseLineCheckbox.addEventListener("change", () => {
    store.settings.liveReuseLine = !!refs.liveReuseLineCheckbox.checked
    renderer.renderLiveScore()
  })

  refs.rangeStartInput.addEventListener("change", () =>
    setRangeByNames(refs.rangeStartInput.value, refs.rangeEndInput.value)
  )
  refs.rangeEndInput.addEventListener("change", () =>
    setRangeByNames(refs.rangeStartInput.value, refs.rangeEndInput.value)
  )

  refs.trebleRangeStartInput.addEventListener("change", () =>
    setTrebleRangeByNames(refs.trebleRangeStartInput.value, refs.trebleRangeEndInput.value)
  )
  refs.trebleRangeEndInput.addEventListener("change", () =>
    setTrebleRangeByNames(refs.trebleRangeStartInput.value, refs.trebleRangeEndInput.value)
  )

  refs.bassRangeStartInput.addEventListener("change", () =>
    setBassRangeByNames(refs.bassRangeStartInput.value, refs.bassRangeEndInput.value)
  )
  refs.bassRangeEndInput.addEventListener("change", () =>
    setBassRangeByNames(refs.bassRangeStartInput.value, refs.bassRangeEndInput.value)
  )

  refs.dualModeCheckbox.addEventListener("change", () => {
    store.settings.dualMode = !!refs.dualModeCheckbox.checked
    nextRandomImmediately()
  })

  const init = () => {
    refs.showNameCheckbox.checked = store.settings.showName
    refs.liveReuseLineCheckbox.checked = store.settings.liveReuseLine
    refs.dualModeCheckbox.checked = store.settings.dualMode

    setIntervalSeconds(DEFAULT_INTERVAL_SECONDS)
    setSustain(false)
    setRangeByNames(refs.rangeStartInput.value, refs.rangeEndInput.value)
    setTrebleRangeByNames(refs.trebleRangeStartInput.value, refs.trebleRangeEndInput.value)
    setBassRangeByNames(refs.bassRangeStartInput.value, refs.bassRangeEndInput.value)
    nextRandomImmediately()
    renderer.clearLiveScore()
    updateScoreboard()
    updateMetricsUI()
    updateConnectionUI()
    updateTrainingUI()
    midiAdapters.disconnectSse()
    midiAdapters.connectSse()
  }

  init()
}
