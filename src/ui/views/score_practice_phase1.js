import { createMidiAdapters } from "./trainer/midiAdapters.js"
import {
  DEFAULT_MEASURE_DURATION_MS,
  HAND_LEFT,
  HAND_RIGHT,
  buildComparisonState,
  createPhase1SampleSong,
  createPracticeSession,
  formatTickLocation,
  formatTickSpan,
  getActivePressedNotes,
  getHandPitchLanes,
  getSongMeasureCount,
  getSongTotalTicks,
  getTickDurationMs,
  midiToNoteName,
  pausePracticeSession,
  recordPerformanceEvent,
  resetPracticeSession,
  setSessionMeasureDuration,
  startPracticeSession,
  updatePracticeClock,
} from "./score_practice_phase1_core.js"

const song = createPhase1SampleSong()
const session = createPracticeSession(song)

const refs = {
  playState: document.getElementById("play-state"),
  midiState: document.getElementById("midi-state"),
  activeCount: document.getElementById("active-count"),
  clockSummary: document.getElementById("clock-summary"),
  playButton: document.getElementById("play-button"),
  pauseButton: document.getElementById("pause-button"),
  resetButton: document.getElementById("reset-button"),
  durationRange: document.getElementById("measure-duration-range"),
  durationNumber: document.getElementById("measure-duration-number"),
  durationLabel: document.getElementById("measure-duration-label"),
  songTitle: document.getElementById("song-title"),
  songMeta: document.getElementById("song-meta"),
  songDescription: document.getElementById("song-description"),
  summaryMeasures: document.getElementById("summary-measures"),
  summaryTicks: document.getElementById("summary-ticks"),
  summaryTickMs: document.getElementById("summary-tick-ms"),
  measureScale: document.getElementById("measure-scale"),
  rightTimeline: document.getElementById("right-timeline"),
  leftTimeline: document.getElementById("left-timeline"),
  rightExpected: document.getElementById("expected-right"),
  leftExpected: document.getElementById("expected-left"),
  activeNotes: document.getElementById("active-notes"),
  extraNotes: document.getElementById("extra-notes"),
  performedList: document.getElementById("performed-list"),
  eventList: document.getElementById("event-list"),
  simulatorRight: document.getElementById("simulator-right"),
  simulatorLeft: document.getElementById("simulator-left"),
  liveConnectButton: document.getElementById("live-connect"),
  webMidiButton: document.getElementById("webmidi-toggle"),
  midiHint: document.getElementById("midi-hint"),
  debugBox: document.getElementById("debug-box"),
}

const timelineNodes = {
  rightRows: [],
  leftRows: [],
  noteBars: new Map(),
}

let renderSnapshot = ""
let midiAdapters = null
let sseConnected = false
const noteCoverageState = new Map()

const setDebugBox = (text, kind = "info") => {
  refs.debugBox.textContent = String(text || "")
  refs.debugBox.style.color = kind === "error" ? "#991b1b" : "#4f5d75"
  refs.debugBox.style.background = kind === "error" ? "rgba(254, 226, 226, 0.78)" : "rgba(255, 255, 255, 0.72)"
  refs.debugBox.style.borderColor = kind === "error" ? "rgba(185, 28, 28, 0.22)" : "rgba(89, 73, 54, 0.10)"
}

const resetCoverageState = () => {
  noteCoverageState.clear()
  song.notes.forEach((note) => {
    noteCoverageState.set(note.id, {
      coveredTickEstimate: 0,
      lastHoldTick: null,
    })
  })
}

const setStatusPill = (element, text, state) => {
  element.textContent = text
  element.dataset.state = state
}

const setMeasureDuration = (seconds) => {
  const clampedSeconds = Math.min(20, Math.max(2, Number(seconds) || DEFAULT_MEASURE_DURATION_MS / 1000))
  const ms = Math.round(clampedSeconds * 1000)
  setSessionMeasureDuration(session, ms)
  refs.durationRange.value = String(clampedSeconds)
  refs.durationNumber.value = String(clampedSeconds)
  refs.durationLabel.textContent = `${clampedSeconds.toFixed(clampedSeconds % 1 === 0 ? 0 : 1)} 秒 / 4 拍`
  refs.summaryTickMs.textContent = `${getTickDurationMs(session).toFixed(1)} ms`
}

const uniqueNotesByHand = (hand) =>
  [...new Set(song.notes.filter((note) => note.hand === hand).map((note) => note.pitch))].sort((a, b) => a - b)

const createSimulatorButton = (pitch, hand) => {
  const button = document.createElement("button")
  button.type = "button"
  button.className = `sim-key sim-key-${hand}`
  button.textContent = midiToNoteName(pitch)
  button.dataset.pitch = String(pitch)

  let pressed = false
  const release = () => {
    if (!pressed) return
    pressed = false
    button.classList.remove("is-down")
    recordPerformanceEvent(session, {
      eventType: "note_off",
      pitch,
      velocity: 0,
      channel: 0,
      deviceId: "simulator",
      timestampMs: performance.now(),
    })
    renderDynamicState()
  }

  button.addEventListener("pointerdown", (event) => {
    event.preventDefault()
    if (pressed) return
    pressed = true
    button.classList.add("is-down")
    button.setPointerCapture(event.pointerId)
    recordPerformanceEvent(session, {
      eventType: "note_on",
      pitch,
      velocity: 92,
      channel: 0,
      deviceId: "simulator",
      timestampMs: performance.now(),
    })
    renderDynamicState()
  })
  button.addEventListener("pointerup", release)
  button.addEventListener("pointercancel", release)
  button.addEventListener("lostpointercapture", release)
  button.addEventListener("pointerleave", (event) => {
    if ((event.buttons & 1) === 0) release()
  })

  return button
}

const fillSimulator = () => {
  uniqueNotesByHand(HAND_RIGHT).forEach((pitch) => refs.simulatorRight.appendChild(createSimulatorButton(pitch, HAND_RIGHT)))
  uniqueNotesByHand(HAND_LEFT).forEach((pitch) => refs.simulatorLeft.appendChild(createSimulatorButton(pitch, HAND_LEFT)))
}

const createMeasureScale = () => {
  refs.measureScale.innerHTML = ""
  const measureCount = getSongMeasureCount(song)
  for (let index = 0; index < measureCount; index += 1) {
    const chip = document.createElement("div")
    chip.className = "measure-chip"
    chip.textContent = `M${index + 1}`
    refs.measureScale.appendChild(chip)
  }
}

const createTimelineRows = (root, hand) => {
  root.innerHTML = ""
  const lanes = getHandPitchLanes(song, hand)
  const totalTicks = getSongTotalTicks(song)
  const notes = song.notes.filter((note) => note.hand === hand)

  return lanes.map((pitch) => {
    const row = document.createElement("div")
    row.className = "pitch-row"

    const label = document.createElement("div")
    label.className = "pitch-label"
    label.textContent = midiToNoteName(pitch)

    const track = document.createElement("div")
    track.className = "pitch-track"
    track.style.setProperty("--measure-count", String(getSongMeasureCount(song)))

    const playhead = document.createElement("div")
    playhead.className = "playhead-line"
    track.appendChild(playhead)

    notes
      .filter((note) => note.pitch === pitch)
      .forEach((note) => {
        const bar = document.createElement("div")
        bar.className = `note-bar note-bar-${hand}`
        bar.style.left = `${(note.startTick / totalTicks) * 100}%`
        bar.style.width = `${(note.durationTick / totalTicks) * 100}%`
        bar.innerHTML = `
          <span class="note-bar-name">${note.pitchName}</span>
          <span class="note-bar-span">${formatTickSpan(note.durationTick)}</span>
        `
        track.appendChild(bar)
        timelineNodes.noteBars.set(note.id, bar)
      })

    row.append(label, track)
    root.appendChild(row)
    return { playhead }
  })
}

const renderTimelineSkeleton = () => {
  timelineNodes.rightRows = createTimelineRows(refs.rightTimeline, HAND_RIGHT)
  timelineNodes.leftRows = createTimelineRows(refs.leftTimeline, HAND_LEFT)
}

const renderSongSummary = () => {
  refs.songTitle.textContent = song.title
  refs.songMeta.textContent = `${song.timeSignature} · ${song.ticksPerBeat} tick / 拍 · 左右手显式分轨`
  refs.songDescription.textContent = song.meta.description
  refs.summaryMeasures.textContent = String(getSongMeasureCount(song))
  refs.summaryTicks.textContent = String(getSongTotalTicks(song))
  refs.summaryTickMs.textContent = `${getTickDurationMs(session).toFixed(1)} ms`
}

const formatStatusChips = (container, items, emptyText, mode = "expected") => {
  container.innerHTML = ""
  if (!items.length) {
    const empty = document.createElement("span")
    empty.className = "mono-empty"
    empty.textContent = emptyText
    container.appendChild(empty)
    return
  }

  items.forEach((item) => {
    const chip = document.createElement("span")
    chip.className = `mini-chip mini-chip-${mode}`
    if ("matched" in item) {
      chip.dataset.state = item.matched ? "matched" : "missing"
      chip.textContent = `${item.pitchName} · ${item.matched ? "已覆盖" : "待按"}`
    } else {
      chip.dataset.state = mode === "extra" ? "extra" : "active"
      const velocity = typeof item.velocityOn === "number" ? ` · vel ${item.velocityOn}` : ""
      chip.textContent = `${item.pitchName}${velocity}`
    }
    container.appendChild(chip)
  })
}

const renderPerformedList = () => {
  refs.performedList.innerHTML = ""
  const items = session.performedNotes.slice(-8).reverse()
  if (!items.length) {
    refs.performedList.innerHTML = `<div class="mono-empty">还没有形成完整的实际演奏区间</div>`
    return
  }

  items.forEach((note) => {
    const row = document.createElement("div")
    row.className = "list-row"
    row.innerHTML = `
      <span class="list-row-title">${note.pitchName}</span>
      <span class="list-row-meta">${note.startTickEstimate.toFixed(1)} → ${note.endTickEstimate.toFixed(1)} tick</span>
      <span class="list-row-side">${note.durationMs.toFixed(0)} ms</span>
    `
    refs.performedList.appendChild(row)
  })
}

const renderEventList = () => {
  refs.eventList.innerHTML = ""
  const items = session.events.slice(-10).reverse()
  if (!items.length) {
    refs.eventList.innerHTML = `<div class="mono-empty">等待模拟按键或 MIDI 输入</div>`
    return
  }

  items.forEach((event) => {
    const row = document.createElement("div")
    row.className = "list-row"
    const detail =
      event.eventType === "control_change"
        ? `cc ${event.control} = ${event.value}`
        : `${midiToNoteName(event.pitch)} · ${event.eventType} · tick ${event.tickEstimate.toFixed(1)}`
    row.innerHTML = `
      <span class="list-row-title">${event.deviceId}</span>
      <span class="list-row-meta">${detail}</span>
      <span class="list-row-side">${event.timestampMs.toFixed(0)}</span>
    `
    refs.eventList.appendChild(row)
  })
}

const renderDynamicState = () => {
  const comparison = buildComparisonState(song, session)
  const currentLocation = formatTickLocation(session.currentTickFloat)
  const playheadPercent = (session.currentTickFloat / Math.max(1, getSongTotalTicks(song))) * 100
  const activePressedNotes = getActivePressedNotes(session)
  const snapshot = JSON.stringify({
    tick: session.currentTick,
    active: activePressedNotes.map((note) => note.pitch),
    performed: session.performedNotes.length,
    events: session.events.length,
  })

  setStatusPill(refs.playState, session.isPlaying ? "播放中" : "已暂停", session.isPlaying ? "running" : "ready")
  setStatusPill(refs.activeCount, `按下 ${activePressedNotes.length} 个键`, activePressedNotes.length ? "connected" : "disconnected")
  refs.clockSummary.textContent = `M${currentLocation.measure} · 第 ${currentLocation.beat} 拍 · ${currentLocation.subTick}/32 · 当前 tick ${session.currentTickFloat.toFixed(1)}`

  timelineNodes.rightRows.forEach((row) => {
    row.playhead.style.left = `${playheadPercent}%`
  })
  timelineNodes.leftRows.forEach((row) => {
    row.playhead.style.left = `${playheadPercent}%`
  })

  const activePitchSet = new Set(activePressedNotes.map((note) => note.pitch))
  song.notes.forEach((note) => {
    const bar = timelineNodes.noteBars.get(note.id)
    if (!bar) return
    const isCurrent = note.startTick <= session.currentTickFloat && session.currentTickFloat < note.endTick
    const isHit = isCurrent && activePitchSet.has(note.pitch)
    const coverage = noteCoverageState.get(note.id) || {
      coveredTickEstimate: 0,
      lastHoldTick: null,
    }

    if (isHit) {
      if (coverage.lastHoldTick != null) {
        const delta = Math.max(0, session.currentTickFloat - coverage.lastHoldTick)
        coverage.coveredTickEstimate = Math.min(note.durationTick, coverage.coveredTickEstimate + delta)
      }
      coverage.lastHoldTick = session.currentTickFloat
    } else {
      coverage.lastHoldTick = null
    }

    noteCoverageState.set(note.id, coverage)
    const progress = Math.max(0, Math.min(1, coverage.coveredTickEstimate / Math.max(1, note.durationTick)))
    bar.dataset.current = isCurrent ? "true" : "false"
    bar.dataset.hit = isHit ? "true" : "false"
    bar.dataset.covered = progress > 0.001 ? "true" : "false"
    bar.style.setProperty("--hold-progress-pct", `${(progress * 100).toFixed(2)}%`)
  })

  if (snapshot === renderSnapshot) return
  renderSnapshot = snapshot

  formatStatusChips(refs.rightExpected, comparison.expected.right, "当前右手没有目标音", "expected")
  formatStatusChips(refs.leftExpected, comparison.expected.left, "当前左手没有目标音", "expected")
  formatStatusChips(refs.activeNotes, comparison.activeNotes, "当前没有按下任何键", "active")
  formatStatusChips(refs.extraNotes, comparison.extraNotes, "当前没有多余按键", "extra")
  renderPerformedList()
  renderEventList()
}

const handleIncomingMidi = (msg) => {
  if (!msg) return
  if (msg.type === "control_change" && typeof msg.control === "number") {
    recordPerformanceEvent(session, {
      eventType: "control_change",
      control: msg.control,
      value: msg.value ?? 0,
      channel: msg.channel ?? 0,
      deviceId: msg.source || "midi",
      timestampMs: performance.now(),
    })
    renderDynamicState()
    return
  }

  if (typeof msg.note !== "number") return
  recordPerformanceEvent(session, {
    eventType: msg.type,
    pitch: msg.note,
    velocity: msg.velocity ?? 0,
    channel: msg.channel ?? 0,
    deviceId: msg.source || "midi",
    timestampMs: performance.now(),
  })
  renderDynamicState()
}

const syncMidiStatus = () => {
  const webMidiOn = midiAdapters?.isWebMidiEnabled?.() || false
  if (sseConnected && webMidiOn) {
    setStatusPill(refs.midiState, "SSE + WebMIDI 已连接", "connected")
    return
  }
  if (sseConnected) {
    setStatusPill(refs.midiState, "SSE 已连接", "connected")
    return
  }
  if (webMidiOn) {
    setStatusPill(refs.midiState, "WebMIDI 已连接", "connected")
    return
  }
  setStatusPill(refs.midiState, "MIDI 未连接", "disconnected")
}

const tickLoop = () => {
  updatePracticeClock(session, performance.now())
  renderDynamicState()
  requestAnimationFrame(tickLoop)
}

const bindControls = () => {
  refs.playButton.addEventListener("click", () => {
    if (session.currentTickFloat >= getSongTotalTicks(song)) {
      resetCoverageState()
    }
    startPracticeSession(session, performance.now())
    renderDynamicState()
  })

  refs.pauseButton.addEventListener("click", () => {
    pausePracticeSession(session, performance.now())
    renderDynamicState()
  })

  refs.resetButton.addEventListener("click", () => {
    pausePracticeSession(session, performance.now())
    resetPracticeSession(session)
    resetCoverageState()
    renderDynamicState()
  })

  refs.durationRange.addEventListener("input", (event) => {
    setMeasureDuration(event.target.value)
    renderDynamicState()
  })

  refs.durationNumber.addEventListener("change", (event) => {
    setMeasureDuration(event.target.value)
    renderDynamicState()
  })

  refs.liveConnectButton.addEventListener("click", () => {
    if (!midiAdapters) return
    if (sseConnected) {
      midiAdapters.disconnectSse()
      return
    }
    midiAdapters.connectSse()
  })

  refs.webMidiButton.addEventListener("click", async () => {
    if (!midiAdapters) return
    try {
      if (midiAdapters.isWebMidiEnabled()) {
        midiAdapters.stopWebMidi()
        refs.webMidiButton.textContent = "浏览器 MIDI"
        refs.midiHint.textContent = sseConnected
          ? "SSE 仍然连接中，浏览器 WebMIDI 已断开。"
          : "WebMIDI 已断开，仍可使用 SSE 或模拟按键。"
        syncMidiStatus()
        return
      }
      const ok = await midiAdapters.startWebMidi()
      if (ok) {
        refs.webMidiButton.textContent = "断开 MIDI"
        refs.midiHint.textContent = sseConnected
          ? "SSE 和浏览器 WebMIDI 都已可用。"
          : "浏览器 WebMIDI 已连接。"
      }
      syncMidiStatus()
    } catch (error) {
      refs.midiHint.textContent = error?.message || String(error)
      syncMidiStatus()
    }
  })
}

const initMidiAdapters = () => {
  midiAdapters = createMidiAdapters({
    setDebugBox,
    onEvent: (normalized) => {
      handleIncomingMidi(normalized)
    },
    onConnectionEvent: (event) => {
      if (event === "CONNECT_OPEN") {
        sseConnected = true
        refs.liveConnectButton.textContent = "断开 SSE"
        refs.midiHint.textContent = "SSE 已连接，事件来源与 staff_fall 页面一致。"
      } else if (event === "CONNECT_REQUEST") {
        refs.midiHint.textContent = "正在连接 SSE 服务..."
      } else if (event === "CONNECT_ERROR") {
        sseConnected = false
        refs.liveConnectButton.textContent = "连接 SSE"
        refs.midiHint.textContent = "SSE 连接失败，请确认 `python src/app/midi_sse_server.py` 正在运行。"
      } else if (event === "DISCONNECT") {
        sseConnected = false
        refs.liveConnectButton.textContent = "连接 SSE"
        refs.midiHint.textContent = "SSE 已断开，仍可使用浏览器 WebMIDI 或模拟按键。"
      }
      syncMidiStatus()
    },
  })
}

const bootstrap = () => {
  renderSongSummary()
  createMeasureScale()
  renderTimelineSkeleton()
  resetCoverageState()
  fillSimulator()
  initMidiAdapters()
  bindControls()
  setMeasureDuration(DEFAULT_MEASURE_DURATION_MS / 1000)
  setStatusPill(refs.midiState, "MIDI 未连接", "disconnected")
  setDebugBox(`优先使用 SSE：启动方式为 python src/app/midi_sse_server.py，然后点击“连接 SSE”。`)
  renderDynamicState()
  tickLoop()
}

bootstrap()
