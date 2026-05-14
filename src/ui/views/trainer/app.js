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

  const METRONOME_TIMBRES = {
    click: { label: "电子", type: "square", base: 1200, accent: 1800 },
    soft: { label: "柔和", type: "sine", base: 880, accent: 1320 },
    clear: { label: "清晰", type: "triangle", base: 1000, accent: 1500 },
    bright: { label: "明亮", type: "sawtooth", base: 1100, accent: 1650 },
  }
  const metronome = {
    bpm: 96,
    beats: 4,
    volume: 0.6,
    timbre: "click",
    running: false,
    timerId: null,
    audio: null,
    master: null,
    nextTime: 0,
    beatIndex: 0,
  }

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

  const clampNumber = (value, min, max, fallback) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return fallback
    return clamp(n, min, max)
  }

  const updateMetronomeStatus = () => {
    refs.metronomeStatus.textContent = metronome.running ? "运行中" : "停止"
    refs.metronomeStatus.dataset.state = metronome.running ? "running" : "disconnected"
    refs.metronomeToggle.textContent = metronome.running ? "停止" : "开始"
    refs.metronomeToggle.className = metronome.running ? "btn btn-danger" : "btn btn-primary"
  }

  const updateMetronomeUi = () => {
    const profile = METRONOME_TIMBRES[metronome.timbre] || METRONOME_TIMBRES.click
    refs.metronomeBpm.value = String(metronome.bpm)
    refs.metronomeBpmNum.value = String(metronome.bpm)
    refs.metronomeBpmValue.textContent = `${metronome.bpm} BPM`
    refs.metronomeBeats.value = String(metronome.beats)
    refs.metronomeBeatsValue.textContent = `${metronome.beats}/4`
    refs.metronomeTimbre.value = metronome.timbre
    refs.metronomeTimbreValue.textContent = profile.label
    refs.metronomeVolume.value = String(metronome.volume)
    refs.metronomeVolumeNum.value = String(metronome.volume.toFixed(2))
    refs.metronomeVolumeValue.textContent = `${Math.round(metronome.volume * 100)}%`
    updateMetronomeStatus()
  }

  const persistMetronome = () => {
    try {
      localStorage.setItem("trainer.metroBpm", String(metronome.bpm))
      localStorage.setItem("trainer.metroBeats", String(metronome.beats))
      localStorage.setItem("trainer.metroVolume", String(metronome.volume))
      localStorage.setItem("trainer.metroTimbre", metronome.timbre)
    } catch {}
  }

  const ensureAudio = async () => {
    if (!metronome.audio) {
      const audio = new AudioContext()
      const master = audio.createGain()
      master.gain.value = metronome.volume
      master.connect(audio.destination)
      metronome.audio = audio
      metronome.master = master
    }
    if (metronome.audio.state === "suspended") {
      await metronome.audio.resume()
    }
  }

  const playClick = (time, accent) => {
    if (!metronome.audio || !metronome.master) return
    const profile = METRONOME_TIMBRES[metronome.timbre] || METRONOME_TIMBRES.click
    const osc = metronome.audio.createOscillator()
    const gain = metronome.audio.createGain()
    osc.type = profile.type
    osc.frequency.value = accent ? profile.accent : profile.base
    gain.gain.setValueAtTime(0.0001, time)
    gain.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.6, time + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.08)
    osc.connect(gain)
    gain.connect(metronome.master)
    osc.start(time)
    osc.stop(time + 0.1)
  }

  const scheduleMetronome = () => {
    if (!metronome.audio) return
    const lookahead = 0.12
    const now = metronome.audio.currentTime
    while (metronome.nextTime < now + lookahead) {
      const accent = metronome.beatIndex % metronome.beats === 0
      playClick(metronome.nextTime, accent)
      metronome.nextTime += 60 / metronome.bpm
      metronome.beatIndex += 1
    }
  }

  const startMetronome = async () => {
    if (metronome.running) return
    await ensureAudio()
    metronome.running = true
    metronome.nextTime = metronome.audio.currentTime + 0.05
    metronome.beatIndex = 0
    metronome.timerId = setInterval(scheduleMetronome, 25)
    updateMetronomeStatus()
  }

  const stopMetronome = () => {
    if (!metronome.running) return
    metronome.running = false
    if (metronome.timerId) {
      clearInterval(metronome.timerId)
      metronome.timerId = null
    }
    updateMetronomeStatus()
  }

  const setBpm = (value) => {
    const bpm = Math.round(clampNumber(value, 40, 220, metronome.bpm))
    metronome.bpm = bpm
    if (metronome.running && metronome.audio) {
      metronome.nextTime = metronome.audio.currentTime + 0.05
    }
    updateMetronomeUi()
    persistMetronome()
  }

  const setBeats = (value) => {
    const beats = Math.round(clampNumber(value, 2, 8, metronome.beats))
    metronome.beats = beats
    metronome.beatIndex = 0
    updateMetronomeUi()
    persistMetronome()
  }

  const setTimbre = (value) => {
    metronome.timbre = METRONOME_TIMBRES[value] ? value : "click"
    updateMetronomeUi()
    persistMetronome()
  }

  const setVolume = (value) => {
    const volume = clampNumber(value, 0, 1, metronome.volume)
    metronome.volume = volume
    if (metronome.master && metronome.audio) {
      metronome.master.gain.setTargetAtTime(volume, metronome.audio.currentTime, 0.02)
    }
    updateMetronomeUi()
    persistMetronome()
  }

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

  refs.metronomeToggle.addEventListener("click", async () => {
    if (metronome.running) {
      stopMetronome()
    } else {
      await startMetronome()
    }
  })

  refs.metronomeBpm.addEventListener("input", () => setBpm(refs.metronomeBpm.value))
  refs.metronomeBpmNum.addEventListener("input", () => setBpm(refs.metronomeBpmNum.value))
  refs.metronomeBeats.addEventListener("change", () => setBeats(refs.metronomeBeats.value))
  refs.metronomeTimbre.addEventListener("change", () => setTimbre(refs.metronomeTimbre.value))
  refs.metronomeVolume.addEventListener("input", () => setVolume(refs.metronomeVolume.value))
  refs.metronomeVolumeNum.addEventListener("input", () => setVolume(refs.metronomeVolumeNum.value))

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
    try {
      metronome.bpm = clampNumber(localStorage.getItem("trainer.metroBpm"), 40, 220, metronome.bpm)
      metronome.beats = clampNumber(localStorage.getItem("trainer.metroBeats"), 2, 8, metronome.beats)
      metronome.volume = clampNumber(localStorage.getItem("trainer.metroVolume"), 0, 1, metronome.volume)
      const savedTimbre = localStorage.getItem("trainer.metroTimbre")
      metronome.timbre = METRONOME_TIMBRES[savedTimbre] ? savedTimbre : metronome.timbre
    } catch {}
    updateMetronomeUi()
  }

  init()
}
