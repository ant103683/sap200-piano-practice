import { createMidiAdapters } from "./trainer/midiAdapters.js"
import { CONNECTION_STATE, TrainerStateMachine } from "./trainer/stateMachine.js"

const queryRequired = (id) => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`缺少元素: #${id}`)
  return el
}

const normalizeHexColor = (value, fallback = "#2563eb") => {
  if (typeof value !== "string") return fallback
  const v = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  return fallback
}

const hexToRgb = (hex) => {
  const h = normalizeHexColor(hex)
  const r = Number.parseInt(h.slice(1, 3), 16)
  const g = Number.parseInt(h.slice(3, 5), 16)
  const b = Number.parseInt(h.slice(5, 7), 16)
  return { r, g, b }
}

const rgba = ({ r, g, b }, a) => `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a))})`

const PITCH_CLASS_TO_LABEL = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
const BLACK_PCS = new Set([1, 3, 6, 8, 10])

const midiToName = (midi) => {
  const pc = midi % 12
  const octave = Math.floor(midi / 12) - 1
  return `${PITCH_CLASS_TO_LABEL[pc]}${octave}`
}

const isBlack = (midi) => BLACK_PCS.has(midi % 12)

const createKeyEl = ({ midi, kind, leftPx, widthPx }) => {
  const key = document.createElement("button")
  key.type = "button"
  key.className = `piano-key ${kind}`
  key.dataset.midi = String(midi)
  key.style.left = `${leftPx}px`
  key.style.width = `${widthPx}px`
  key.setAttribute("aria-label", midiToName(midi))

  const label = document.createElement("span")
  label.className = "piano-key-label"
  label.textContent = midiToName(midi)
  key.appendChild(label)

  if (!isBlack(midi) && midi % 12 === 0) {
    const mark = document.createElement("span")
    mark.className = "piano-c-mark"
    key.appendChild(mark)
  }

  return key
}

const buildKeyboard = ({ pianoRoot, reversed }) => {
  const whiteW = Number.parseFloat(getComputedStyle(pianoRoot).getPropertyValue("--white-w")) || 24
  const blackW = Number.parseFloat(getComputedStyle(pianoRoot).getPropertyValue("--black-w")) || whiteW * 0.62

  const MIDI_MIN = 21
  const MIDI_MAX = 108

  const whiteIndexByMidi = new Map()
  let whiteCount = 0
  for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi += 1) {
    if (!isBlack(midi)) {
      whiteIndexByMidi.set(midi, whiteCount)
      whiteCount += 1
    }
  }

  pianoRoot.style.setProperty("--white-count", String(whiteCount))
  pianoRoot.innerHTML = ""

  const fragment = document.createDocumentFragment()
  const keyByMidi = new Map()
  const totalWhiteWidth = whiteCount * whiteW
  const mirrorLeft = (left, width) => totalWhiteWidth - (left + width)

  for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi += 1) {
    if (isBlack(midi)) continue
    const idx = whiteIndexByMidi.get(midi)
    const baseLeft = idx * whiteW
    const left = reversed ? mirrorLeft(baseLeft, whiteW) : baseLeft
    const key = createKeyEl({ midi, kind: "white", leftPx: left, widthPx: whiteW })
    fragment.appendChild(key)
    keyByMidi.set(midi, key)
  }

  for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi += 1) {
    if (!isBlack(midi)) continue
    const prevWhite = whiteIndexByMidi.get(midi - 1)
    if (prevWhite == null) continue
    const baseLeft = prevWhite * whiteW + whiteW * 0.68
    const left = reversed ? mirrorLeft(baseLeft, blackW) : baseLeft
    const key = createKeyEl({ midi, kind: "black", leftPx: left, widthPx: blackW })
    fragment.appendChild(key)
    keyByMidi.set(midi, key)
  }

  pianoRoot.appendChild(fragment)
  return { keyByMidi, MIDI_MIN, MIDI_MAX }
}

const setKeyVisual = (keyEl, { down, held, showNote, showC }) => {
  if (!keyEl) return
  keyEl.classList.toggle("is-down", down)
  keyEl.classList.toggle("is-held", held && !down)
  keyEl.classList.toggle("show-note", showNote)
  keyEl.classList.toggle("show-c", showC)
}

const bootstrapPiano88 = () => {
  const refs = {
    piano: queryRequired("piano"),
    pianoShell: queryRequired("piano-shell"),
    connectionState: queryRequired("piano-connection-state"),
    source: queryRequired("piano-source"),
    sustain: queryRequired("piano-sustain"),
    liveStatus: queryRequired("piano-live-status"),
    connectBtn: queryRequired("piano-live-connect"),
    webMidiBtn: queryRequired("piano-webmidi-toggle"),
    clearBtn: queryRequired("piano-clear"),
    debugBox: queryRequired("piano-debug-box"),
    showC: queryRequired("piano-show-c-labels"),
    showNote: queryRequired("piano-show-note"),
    colorDown: queryRequired("piano-color-down"),
    colorHeld: queryRequired("piano-color-held"),
    colorDownValue: queryRequired("piano-color-down-value"),
    colorHeldValue: queryRequired("piano-color-held-value"),
    colorReset: queryRequired("piano-color-reset"),
    metronomeStatus: queryRequired("metronome-status"),
    metronomeToggle: queryRequired("metronome-toggle"),
    metronomeBpm: queryRequired("metronome-bpm"),
    metronomeBpmNum: queryRequired("metronome-bpm-num"),
    metronomeBpmValue: queryRequired("metronome-bpm-value"),
    metronomeBeats: queryRequired("metronome-beats"),
    metronomeBeatsValue: queryRequired("metronome-beats-value"),
    metronomeVolume: queryRequired("metronome-volume"),
    metronomeVolumeNum: queryRequired("metronome-volume-num"),
    metronomeVolumeValue: queryRequired("metronome-volume-value"),
  }

  const machine = new TrainerStateMachine()
  const state = {
    sustain: false,
    down: new Set(),
    held: new Set(),
    showC: true,
    showNote: true,
    reversed: false,
    downColor: "#2563eb",
    heldColor: "#10b981",
  }
  const metronome = {
    bpm: 96,
    beats: 4,
    volume: 0.6,
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
    refs.debugBox.style.background = kind === "error" ? "#fff1f2" : ""
  }

  const applyPalette = () => {
    const down = hexToRgb(state.downColor)
    const held = hexToRgb(state.heldColor)
    refs.piano.style.setProperty("--down-fill", rgba(down, 0.22))
    refs.piano.style.setProperty("--down-stroke", rgba(down, 0.24))
    refs.piano.style.setProperty("--down-halo", rgba(down, 0.11))
    refs.piano.style.setProperty("--down-shadow", rgba(down, 0.14))
    refs.piano.style.setProperty("--held-fill", rgba(held, 0.20))
    refs.piano.style.setProperty("--held-stroke", rgba(held, 0.22))
    refs.piano.style.setProperty("--held-halo", rgba(held, 0.11))
    refs.piano.style.setProperty("--held-shadow", rgba(held, 0.14))

    refs.colorDown.value = state.downColor
    refs.colorHeld.value = state.heldColor
    refs.colorDownValue.textContent = state.downColor
    refs.colorHeldValue.textContent = state.heldColor

    try {
      localStorage.setItem("piano88.downColor", state.downColor)
      localStorage.setItem("piano88.heldColor", state.heldColor)
    } catch {}
  }

  const clampNumber = (value, min, max, fallback) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return fallback
    return Math.min(max, Math.max(min, n))
  }

  const updateMetronomeStatus = () => {
    refs.metronomeStatus.textContent = metronome.running ? "运行中" : "停止"
    refs.metronomeStatus.dataset.state = metronome.running ? "running" : "disconnected"
    refs.metronomeToggle.textContent = metronome.running ? "停止" : "开始"
    refs.metronomeToggle.className = metronome.running ? "btn btn-danger" : "btn btn-primary"
  }

  const updateMetronomeUi = () => {
    refs.metronomeBpm.value = String(metronome.bpm)
    refs.metronomeBpmNum.value = String(metronome.bpm)
    refs.metronomeBpmValue.textContent = `${metronome.bpm} BPM`
    refs.metronomeBeats.value = String(metronome.beats)
    refs.metronomeBeatsValue.textContent = `${metronome.beats}/4`
    refs.metronomeVolume.value = String(metronome.volume)
    refs.metronomeVolumeNum.value = String(metronome.volume.toFixed(2))
    refs.metronomeVolumeValue.textContent = `${Math.round(metronome.volume * 100)}%`
    updateMetronomeStatus()
  }

  const persistMetronome = () => {
    try {
      localStorage.setItem("piano88.metroBpm", String(metronome.bpm))
      localStorage.setItem("piano88.metroBeats", String(metronome.beats))
      localStorage.setItem("piano88.metroVolume", String(metronome.volume))
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
    const osc = metronome.audio.createOscillator()
    const gain = metronome.audio.createGain()
    osc.type = "square"
    osc.frequency.value = accent ? 1200 : 900
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

  const setVolume = (value) => {
    const volume = clampNumber(value, 0, 1, metronome.volume)
    metronome.volume = volume
    if (metronome.master && metronome.audio) {
      metronome.master.gain.setTargetAtTime(volume, metronome.audio.currentTime, 0.02)
    }
    updateMetronomeUi()
    persistMetronome()
  }

  let keyByMidi = new Map()

  const renderAllKeys = () => {
    for (const [midi, keyEl] of keyByMidi) {
      setKeyVisual(keyEl, {
        down: state.down.has(midi),
        held: state.held.has(midi),
        showNote: state.showNote,
        showC: state.showC,
      })
    }
  }

  const updateKey = (midi) => {
    const keyEl = keyByMidi.get(midi)
    setKeyVisual(keyEl, {
      down: state.down.has(midi),
      held: state.held.has(midi),
      showNote: state.showNote,
      showC: state.showC,
    })
  }

  const fitKeyboardToWidth = () => {
    const whiteCount = 52
    const shellWidth = Math.max(360, Math.floor(refs.pianoShell.clientWidth || 0))
    const usable = Math.max(320, shellWidth - 28)
    const whiteW = usable / whiteCount
    const blackW = whiteW * 0.62
    refs.piano.style.setProperty("--white-w", `${whiteW.toFixed(3)}px`)
    refs.piano.style.setProperty("--black-w", `${blackW.toFixed(3)}px`)
  }

  const rebuildKeyboard = () => {
    fitKeyboardToWidth()
    const built = buildKeyboard({ pianoRoot: refs.piano, reversed: state.reversed })
    keyByMidi = built.keyByMidi
    renderAllKeys()
  }

  const clearAll = () => {
    state.down.clear()
    state.held.clear()
    renderAllKeys()
  }

  const setSustain = (on) => {
    state.sustain = !!on
    refs.sustain.textContent = `踏板：${state.sustain ? "开" : "关"}`
    refs.sustain.dataset.state = state.sustain ? "connected" : "disconnected"
    if (!state.sustain) {
      for (const midi of Array.from(state.held)) {
        if (!state.down.has(midi)) {
          state.held.delete(midi)
          updateKey(midi)
        }
      }
    }
  }

  const updateConnectionUi = () => {
    const by = {
      [CONNECTION_STATE.CONNECTED]: { label: "已连接", pill: "connected", btn: "断开", btnClass: "btn btn-danger" },
      [CONNECTION_STATE.CONNECTING]: { label: "连接中...", pill: "connecting", btn: "断开", btnClass: "btn btn-danger" },
      [CONNECTION_STATE.RECONNECTING]: { label: "重连中...", pill: "reconnecting", btn: "断开", btnClass: "btn btn-danger" },
      [CONNECTION_STATE.DISCONNECTED]: { label: "未连接", pill: "disconnected", btn: "连接", btnClass: "btn btn-primary" },
    }
    const v = by[machine.connection] || by[CONNECTION_STATE.DISCONNECTED]
    refs.connectionState.textContent = `连接状态：${v.label}`
    refs.connectionState.dataset.state = v.pill
    refs.liveStatus.textContent = v.label
    refs.liveStatus.dataset.state = v.pill
    refs.connectBtn.textContent = v.btn
    refs.connectBtn.className = v.btnClass
  }

  const setSource = (text) => {
    refs.source.textContent = `输入源：${text}`
  }

  const midiAdapters = createMidiAdapters({
    setDebugBox: (t, kind) => {
      if (kind === "error") setDebugBox(t, "error")
    },
    onEvent: (msg) => {
      if (msg.type === "control_change" && msg.control === 64) {
        setSustain(msg.sustain === true)
        return
      }
      if (msg.edge === "down" && typeof msg.note === "number") {
        state.down.add(msg.note)
        state.held.delete(msg.note)
        updateKey(msg.note)
        return
      }
      if (msg.edge === "up" && typeof msg.note === "number") {
        state.down.delete(msg.note)
        if (state.sustain) {
          state.held.add(msg.note)
        } else {
          state.held.delete(msg.note)
        }
        updateKey(msg.note)
      }
    },
    onConnectionEvent: (event) => {
      machine.transitionConnection(event)
      updateConnectionUi()
    },
  })

  refs.connectBtn.addEventListener("click", () => {
    const connectedLike =
      machine.connection === CONNECTION_STATE.CONNECTED ||
      machine.connection === CONNECTION_STATE.CONNECTING ||
      machine.connection === CONNECTION_STATE.RECONNECTING
    if (connectedLike) {
      midiAdapters.disconnectSse()
      setSource("—")
      return
    }
    setSource("SSE")
    midiAdapters.connectSse()
  })

  refs.webMidiBtn.addEventListener("click", async () => {
    if (midiAdapters.isWebMidiEnabled()) {
      midiAdapters.stopWebMidi()
      refs.webMidiBtn.textContent = "浏览器MIDI"
      setSource("—")
      return
    }
    const ok = await midiAdapters.startWebMidi()
    if (ok) {
      refs.webMidiBtn.textContent = "断开MIDI"
      setSource("WebMIDI")
    }
  })

  refs.clearBtn.addEventListener("click", () => {
    clearAll()
    setDebugBox("")
  })

  refs.showC.addEventListener("change", () => {
    state.showC = !!refs.showC.checked
    renderAllKeys()
  })

  refs.showNote.addEventListener("change", () => {
    state.showNote = !!refs.showNote.checked
    renderAllKeys()
  })

  refs.colorDown.addEventListener("input", () => {
    state.downColor = normalizeHexColor(refs.colorDown.value, "#2563eb")
    applyPalette()
  })

  refs.colorHeld.addEventListener("input", () => {
    state.heldColor = normalizeHexColor(refs.colorHeld.value, "#10b981")
    applyPalette()
  })

  refs.colorReset.addEventListener("click", () => {
    state.downColor = "#2563eb"
    state.heldColor = "#10b981"
    applyPalette()
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
  refs.metronomeVolume.addEventListener("input", () => setVolume(refs.metronomeVolume.value))
  refs.metronomeVolumeNum.addEventListener("input", () => setVolume(refs.metronomeVolumeNum.value))

  const setDownByPointer = (midi, down) => {
    if (down) {
      state.down.add(midi)
      state.held.delete(midi)
    } else {
      state.down.delete(midi)
      if (state.sustain) {
        state.held.add(midi)
      } else {
        state.held.delete(midi)
      }
    }
    updateKey(midi)
  }

  refs.piano.addEventListener("pointerdown", (e) => {
    const target = e.target && e.target.closest ? e.target.closest(".piano-key") : null
    if (!target) return
    const midi = Number(target.dataset.midi)
    if (!Number.isFinite(midi)) return
    target.setPointerCapture(e.pointerId)
    setDownByPointer(midi, true)
  })

  refs.piano.addEventListener("pointerup", (e) => {
    const target = e.target && e.target.closest ? e.target.closest(".piano-key") : null
    if (!target) return
    const midi = Number(target.dataset.midi)
    if (!Number.isFinite(midi)) return
    setDownByPointer(midi, false)
  })

  refs.piano.addEventListener("pointercancel", (e) => {
    const target = e.target && e.target.closest ? e.target.closest(".piano-key") : null
    if (!target) return
    const midi = Number(target.dataset.midi)
    if (!Number.isFinite(midi)) return
    setDownByPointer(midi, false)
  })

  window.addEventListener("resize", () => {
    rebuildKeyboard()
  })

  refs.showC.checked = state.showC
  refs.showNote.checked = state.showNote
  try {
    state.downColor = normalizeHexColor(localStorage.getItem("piano88.downColor"), state.downColor)
    state.heldColor = normalizeHexColor(localStorage.getItem("piano88.heldColor"), state.heldColor)
    metronome.bpm = clampNumber(localStorage.getItem("piano88.metroBpm"), 40, 220, metronome.bpm)
    metronome.beats = clampNumber(localStorage.getItem("piano88.metroBeats"), 2, 8, metronome.beats)
    metronome.volume = clampNumber(localStorage.getItem("piano88.metroVolume"), 0, 1, metronome.volume)
  } catch {}
  applyPalette()
  updateMetronomeUi()
  rebuildKeyboard()
  setSustain(false)
  updateConnectionUi()
}

bootstrapPiano88()
