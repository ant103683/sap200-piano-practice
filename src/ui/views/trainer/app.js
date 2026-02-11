import { DEFAULT_INTERVAL_SECONDS } from "./constants.js"
import {
  advanceToNextTarget,
  applyHitResult,
  disableAutoTraining,
  enableAutoTraining,
  recordHitDuration,
  setDualMode,
  setBassRange,
  setGlobalRange,
  setIntervalSeconds,
  setLiveReuseLine,
  setShowName,
  setSustain,
  setTrebleRange,
  updateConnectionFromEvent,
} from "./actions.js"
import { createTrainerRefs } from "./dom.js"
import { createMidiAdapters } from "./midiAdapters.js"
import { createScoreRenderer } from "./renderer.js"
import { CONNECTION_STATE, TrainerStateMachine } from "./stateMachine.js"
import { createTrainerStore } from "./store.js"
import { evaluateHit } from "./trainingLogic.js"
import { createTrainerUi } from "./ui.js"
import { clamp, formatSeconds } from "./utils.js"

export const bootstrapTrainerApp = () => {
  const refs = createTrainerRefs()

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

  const ui = createTrainerUi({ refs, store, machine, nameForMidi, formatSeconds })

  const renderRanges = () => {
    ui.renderRanges(
      store.range,
      { trebleMin: store.trebleRange.min, trebleMax: store.trebleRange.max },
      { bassMin: store.bassRange.min, bassMax: store.bassRange.max }
    )
  }

  const updateSustain = (on) => {
    setSustain(store, on)
    ui.renderSustain(on)
  }

  const setRangeByNames = (startName, endName) => {
    const startMidi = parseNameToMidi(startName)
    const endMidi = parseNameToMidi(endName)
    if (startMidi == null || endMidi == null) return
    const min = Math.min(startMidi, endMidi)
    const max = Math.max(startMidi, endMidi)
    setGlobalRange(store, min, max)
    renderRanges()
    nextRandomImmediately()
  }

  const setTrebleRangeByNames = (startName, endName) => {
    const s = parseNameToMidi(startName)
    const e = parseNameToMidi(endName)
    if (s == null || e == null) return
    const min = Math.min(s, e)
    const max = Math.max(s, e)
    setTrebleRange(store, min, max)
    renderRanges()
    if (store.settings.dualMode) nextRandomImmediately()
  }

  const setBassRangeByNames = (startName, endName) => {
    const s = parseNameToMidi(startName)
    const e = parseNameToMidi(endName)
    if (s == null || e == null) return
    const min = Math.min(s, e)
    const max = Math.max(s, e)
    setBassRange(store, min, max)
    renderRanges()
    if (store.settings.dualMode) nextRandomImmediately()
  }

  const setIntervalSecondsSafe = (seconds) => {
    const n = clamp(Number(seconds) || DEFAULT_INTERVAL_SECONDS, 0.2, 120)
    setIntervalSeconds(store, n)
    ui.renderInterval(n)
    if (store.training.autoTimer) {
      enableAutoTraining(store, machine, nextRandomImmediately)
      ui.renderTrainingState()
    }
  }

  const nextRandomImmediately = () => {
    advanceToNextTarget(store, machine, performance.now())
    ui.renderTrainingState()
    renderer.renderRandomScore()
    if (store.training.autoTimer) {
      enableAutoTraining(store, machine, nextRandomImmediately)
      ui.renderTrainingState()
    }
  }

  const handleIncoming = (msg) => {
    if (!msg || typeof msg !== "object") return
    if (msg.type === "control_change" && msg.control === 64) {
      updateSustain((msg.value || 0) >= 64)
    }
    if (msg.edge === "down" && typeof msg.note === "number") {
      const result = evaluateHit(store, msg.note)
      const scoreChanged = applyHitResult(store, result)
      if (scoreChanged) ui.renderScoreboard()
      if (recordHitDuration(store, result.noteForMetric)) ui.renderMetrics()
      if (result.advanced) nextRandomImmediately()
      renderer.pushLiveStep(msg.note)
    }
  }

  const midiAdapters = createMidiAdapters({
    setDebugBox,
    onEvent: handleIncoming,
    onConnectionEvent: (event) => {
      updateConnectionFromEvent(store, machine, event)
      ui.renderConnectionState()
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
    disableAutoTraining(store, machine)
    refs.toggleAutoButton.textContent = "自动"
    refs.toggleAutoButton.className = "btn"
    ui.renderTrainingState()
    nextRandomImmediately()
  })

  refs.toggleAutoButton.addEventListener("click", () => {
    if (store.training.autoTimer) {
      disableAutoTraining(store, machine)
      refs.toggleAutoButton.textContent = "自动"
      refs.toggleAutoButton.className = "btn"
      ui.renderTrainingState()
      return
    }
    enableAutoTraining(store, machine, nextRandomImmediately)
    refs.toggleAutoButton.textContent = "停止"
    refs.toggleAutoButton.className = "btn btn-danger"
    ui.renderTrainingState()
  })

  refs.intervalInput.addEventListener("input", () => setIntervalSecondsSafe(refs.intervalInput.value))
  refs.intervalNum.addEventListener("input", () => setIntervalSecondsSafe(refs.intervalNum.value))

  refs.showNameCheckbox.addEventListener("change", () => {
    setShowName(store, refs.showNameCheckbox.checked)
    renderer.renderRandomScore()
    renderer.renderLiveScore()
  })

  refs.liveReuseLineCheckbox.addEventListener("change", () => {
    setLiveReuseLine(store, refs.liveReuseLineCheckbox.checked)
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
    setDualMode(store, refs.dualModeCheckbox.checked)
    nextRandomImmediately()
  })

  const init = () => {
    refs.showNameCheckbox.checked = store.settings.showName
    refs.liveReuseLineCheckbox.checked = store.settings.liveReuseLine
    refs.dualModeCheckbox.checked = store.settings.dualMode

    setIntervalSecondsSafe(DEFAULT_INTERVAL_SECONDS)
    updateSustain(false)
    setRangeByNames(refs.rangeStartInput.value, refs.rangeEndInput.value)
    setTrebleRangeByNames(refs.trebleRangeStartInput.value, refs.trebleRangeEndInput.value)
    setBassRangeByNames(refs.bassRangeStartInput.value, refs.bassRangeEndInput.value)
    nextRandomImmediately()
    renderer.clearLiveScore()
    ui.renderScoreboard()
    ui.renderMetrics()
    ui.renderConnectionState()
    ui.renderTrainingState()
    refs.toggleAutoButton.className = store.training.autoTimer ? "btn btn-danger" : "btn"
    midiAdapters.disconnectSse()
    midiAdapters.connectSse()
  }

  init()
}
