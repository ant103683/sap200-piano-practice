const liveConnectButton = document.getElementById("live-connect")
const liveStatusLabel = document.getElementById("live-status")
const pedalDot = document.getElementById("pedal-dot")
const randomButton = document.getElementById("random-note")
const toggleAutoButton = document.getElementById("toggle-auto")
const liveClearButton = document.getElementById("live-clear")
const liveReuseLineCheckbox = document.getElementById("live-reuse-line")
const intervalInput = document.getElementById("interval")
const intervalNum = document.getElementById("interval-num")
const intervalValue = document.getElementById("interval-value")
const scoreRandomRoot = document.getElementById("score-random")
const scoreLiveRoot = document.getElementById("score-live")
const showNameCheckbox = document.getElementById("show-name")
const scoreTotalEl = document.getElementById("score-total")
const scoreGoodEl = document.getElementById("score-good")
const scoreBadEl = document.getElementById("score-bad")
const dualModeCheckbox = document.getElementById("dual-mode")
const rangeStartInput = document.getElementById("range-start")
const rangeEndInput = document.getElementById("range-end")
const rangeCurrentLabel = document.getElementById("range-current")
const trebleRangeStartInput = document.getElementById("treble-range-start")
const trebleRangeEndInput = document.getElementById("treble-range-end")
const rangeCurrentTrebleLabel = document.getElementById("range-current-treble")
const bassRangeStartInput = document.getElementById("bass-range-start")
const bassRangeEndInput = document.getElementById("bass-range-end")
const rangeCurrentBassLabel = document.getElementById("range-current-bass")
const avgTimeEl = document.getElementById("avg-time")
const fastestTimeEl = document.getElementById("fastest-time")
const fastestNameEl = document.getElementById("fastest-name")
const slowestTimeEl = document.getElementById("slowest-time")
const slowestNameEl = document.getElementById("slowest-name")

const VF = window.Vex?.Flow || window.VF

const pitchClassToName = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"]
const pitchClassToLabel = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

const range = { min: 36, max: 95 }

const midiToKey = (midi) => {
  const pc = midi % 12
  const octave = Math.floor(midi / 12) - 1
  return `${pitchClassToName[pc]}/${octave}`
}

const nameForMidi = (midi) => {
  const letter = pitchClassToLabel[midi % 12]
  const octave = Math.floor(midi / 12) - 1
  return `${letter}${octave}`
}

const randomMidi = () => range.min + Math.floor(Math.random() * (range.max - range.min + 1))
const randomMidiWithin = (min, max) => min + Math.floor(Math.random() * Math.max(1, (max - min + 1)))

let autoTimer = null
let liveSource = null
let liveConnected = false
let liveUserDisconnected = true
let sustainOn = false
let randomMidiValue = randomMidi()
let randomPositionIndex = 2
let scoreTotal = 0
let scoreGood = 0
let scoreBad = 0
let lastValidRange = { min: range.min, max: range.max }
let trebleRange = { min: 60, max: 83 }
let bassRange = { min: 36, max: 59 }
let dualMode = true
let randomTargetTreble = null
let randomTargetBass = null
let hitTreble = false
let hitBass = false
let randomStartAt = null
let durations = []
let fastest = null
let fastestNote = null
let slowest = null
let slowestNote = null

const updateScoreboard = () => {
  if (scoreTotalEl) scoreTotalEl.textContent = String(scoreTotal)
  if (scoreGoodEl) scoreGoodEl.textContent = String(scoreGood)
  if (scoreBadEl) scoreBadEl.textContent = String(scoreBad)
}

const formatSeconds = (ms) => {
  if (ms == null) return "—"
  const s = ms / 1000
  return `${s.toFixed(2)}s`
}

const updateMetricsUI = () => {
  if (durations.length >= 3) {
    let min = Infinity
    let max = -Infinity
    for (const d of durations) {
      if (d < min) min = d
      if (d > max) max = d
    }
    const sum = durations.reduce((a, b) => a + b, 0) - min - max
    const avg = sum / (durations.length - 2)
    if (avgTimeEl) avgTimeEl.textContent = formatSeconds(avg)
  } else {
    if (avgTimeEl) avgTimeEl.textContent = "—"
  }
  if (fastestTimeEl) fastestTimeEl.textContent = formatSeconds(fastest)
  if (slowestTimeEl) slowestTimeEl.textContent = formatSeconds(slowest)
  if (fastestNameEl) fastestNameEl.textContent = fastestNote == null ? "—" : nameForMidi(fastestNote)
  if (slowestNameEl) slowestNameEl.textContent = slowestNote == null ? "—" : nameForMidi(slowestNote)
}

const noteLetterToPc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const parseNameToMidi = (name) => {
  if (typeof name !== "string") return null
  const n = name.trim()
  const m = n.match(/^([A-Ga-g])([#b]?)(-?\d+)$/)
  if (!m) return null
  const letter = m[1].toUpperCase()
  const acc = m[2] || ""
  const octave = Number(m[3])
  let pc = noteLetterToPc[letter]
  if (acc === "#") pc += 1
  if (acc === "b") pc -= 1
  pc = (pc + 12) % 12
  const midi = (octave + 1) * 12 + pc
  if (midi < 0 || midi > 127) return null
  return midi
}

const setRangeByNames = (startName, endName) => {
  const startMidi = parseNameToMidi(startName)
  const endMidi = parseNameToMidi(endName)
  if (startMidi == null || endMidi == null) return
  const min = Math.min(startMidi, endMidi)
  const max = Math.max(startMidi, endMidi)
  range.min = min
  range.max = max
  lastValidRange = { min, max }
  nextRandomImmediately()
  if (rangeCurrentLabel) {
    rangeCurrentLabel.textContent = `当前范围：${nameForMidi(range.min)} 至 ${nameForMidi(range.max)}`
  }
}

const setTrebleRangeByNames = (startName, endName) => {
  const s = parseNameToMidi(startName)
  const e = parseNameToMidi(endName)
  if (s == null || e == null) return
  const min = Math.min(s, e)
  const max = Math.max(s, e)
  trebleRange = { min, max }
  if (rangeCurrentTrebleLabel) {
    rangeCurrentTrebleLabel.textContent = `右：${nameForMidi(min)} 至 ${nameForMidi(max)}`
  }
  if (dualMode) nextRandomImmediately()
}

const setBassRangeByNames = (startName, endName) => {
  const s = parseNameToMidi(startName)
  const e = parseNameToMidi(endName)
  if (s == null || e == null) return
  const min = Math.min(s, e)
  const max = Math.max(s, e)
  bassRange = { min, max }
  if (rangeCurrentBassLabel) {
    rangeCurrentBassLabel.textContent = `左：${nameForMidi(min)} 至 ${nameForMidi(max)}`
  }
  if (dualMode) nextRandomImmediately()
}

const addModifier = (note, modifier) => {
  if (note.addAccidental && modifier instanceof VF.Accidental) {
    note.addAccidental(0, modifier)
    return
  }
  if (note.addAnnotation && modifier instanceof VF.Annotation) {
    note.addAnnotation(0, modifier)
    return
  }
  if (note.addModifier) {
    note.addModifier(modifier, 0)
    return
  }
  if (note.addModifierAt) {
    note.addModifierAt(0, modifier)
  }
}

const createRest = (clef, duration = "qr") => new VF.StaveNote({ clef, keys: ["b/4"], duration })

const createNote = (midi, clef) => {
  const key = midiToKey(midi)
  const note = new VF.StaveNote({ clef, keys: [key], duration: "q" })
  if (key.includes("#")) {
    addModifier(note, new VF.Accidental("#"))
  }
  if (showNameCheckbox.checked) {
    const annotation = new VF.Annotation(nameForMidi(midi)).setFont("Arial", 14)
    if (annotation.setVerticalJustification && VF.Annotation?.VerticalJustify) {
      annotation.setVerticalJustification(VF.Annotation.VerticalJustify.TOP)
    }
    addModifier(note, annotation)
  }
  return note
}

const notesPerMeasure = 4
let liveMeasures = []
let liveCurrentMeasure = { trebleNotes: [], bassNotes: [] }

const getLiveMeasuresPerRow = () => {
  const measureWidth = 240
  const leftMargin = 60
  const availableWidth = Math.max(400, Math.floor(scoreLiveRoot.clientWidth || 980))
  return Math.max(1, Math.floor((availableWidth - leftMargin) / measureWidth))
}

const clearLiveScore = () => {
  liveMeasures = []
  liveCurrentMeasure = { trebleNotes: [], bassNotes: [] }
  renderLiveScore()
}

const pushLiveStep = (midi) => {
  if (liveReuseLineCheckbox.checked) {
    const limit = getLiveMeasuresPerRow()
    if (liveMeasures.length >= limit && liveCurrentMeasure.trebleNotes.length === 0) {
      liveMeasures = []
    }
  }
  const isTreble = midi >= 60
  const note = createNote(midi, isTreble ? "treble" : "bass")
  liveCurrentMeasure.trebleNotes.push(isTreble ? note : createRest("treble"))
  liveCurrentMeasure.bassNotes.push(isTreble ? createRest("bass") : note)
  if (liveCurrentMeasure.trebleNotes.length >= notesPerMeasure) {
    const completed = liveCurrentMeasure
    liveCurrentMeasure = { trebleNotes: [], bassNotes: [] }
    liveMeasures.push(completed)
  }
  renderLiveScore()
}

const buildLiveRenderableMeasures = () => {
  const result = [...liveMeasures]
  if (liveCurrentMeasure.trebleNotes.length) {
    const pad = notesPerMeasure - liveCurrentMeasure.trebleNotes.length
    const trebleNotes = [...liveCurrentMeasure.trebleNotes]
    const bassNotes = [...liveCurrentMeasure.bassNotes]
    for (let i = 0; i < pad; i += 1) {
      trebleNotes.push(createRest("treble"))
      bassNotes.push(createRest("bass"))
    }
    result.push({ trebleNotes, bassNotes })
  }
  if (!result.length) {
    const trebleNotes = Array.from({ length: 4 }, () => createRest("treble"))
    const bassNotes = Array.from({ length: 4 }, () => createRest("bass"))
    result.push({ trebleNotes, bassNotes })
  }
  return result
}

const renderLiveScore = () => {
  const renderable = buildLiveRenderableMeasures()
  const measureWidth = 240
  const rowGap = 180
  const staffGap = 110
  const leftMargin = 60
  const topMargin = 40
  const availableWidth = Math.max(400, Math.floor(scoreLiveRoot.clientWidth || 980))
  const measuresPerRow = liveReuseLineCheckbox.checked
    ? getLiveMeasuresPerRow()
    : Math.max(1, Math.floor((availableWidth - leftMargin) / measureWidth))
  const measureCount = renderable.length
  const rowCount = liveReuseLineCheckbox.checked ? 1 : Math.max(1, Math.ceil(measureCount / measuresPerRow))
  const width = measuresPerRow * measureWidth + leftMargin + 40
  const height = rowCount * rowGap + topMargin + staffGap + 60

  scoreLiveRoot.innerHTML = ""
  const renderer = new VF.Renderer(scoreLiveRoot, VF.Renderer.Backends.SVG)
  renderer.resize(width, height)
  const context = renderer.getContext()
  if (VF.setMusicFont) {
    VF.setMusicFont("Bravura")
  }

  for (let m = 0; m < measureCount; m += 1) {
    const row = Math.floor(m / measuresPerRow)
    const col = m % measuresPerRow
    const x = leftMargin + col * measureWidth
    const y = topMargin + row * rowGap

    const treble = new VF.Stave(x, y, measureWidth)
    const bass = new VF.Stave(x, y + staffGap, measureWidth)

    if (col === 0) {
      treble.addClef("treble").addTimeSignature("4/4")
      bass.addClef("bass").addTimeSignature("4/4")
      const brace = new VF.StaveConnector(treble, bass)
      brace.setType(VF.StaveConnector.type.BRACE)
      brace.setContext(context).draw()
      const line = new VF.StaveConnector(treble, bass)
      line.setType(VF.StaveConnector.type.SINGLE_LEFT)
      line.setContext(context).draw()
    }

    treble.setContext(context).draw()
    bass.setContext(context).draw()

    const { trebleNotes, bassNotes } = renderable[m]
    const trebleVoice = new VF.Voice({ num_beats: 4, beat_value: 4 }).addTickables(trebleNotes)
    const bassVoice = new VF.Voice({ num_beats: 4, beat_value: 4 }).addTickables(bassNotes)
    new VF.Formatter().joinVoices([trebleVoice]).format([trebleVoice], measureWidth - 36)
    new VF.Formatter().joinVoices([bassVoice]).format([bassVoice], measureWidth - 36)
    trebleVoice.draw(context, treble)
    bassVoice.draw(context, bass)
  }
}

const renderRandomScore = () => {
  scoreRandomRoot.innerHTML = ""
  const width = Math.max(400, Math.floor(scoreRandomRoot.clientWidth || 980))
  const height = 420
  const renderer = new VF.Renderer(scoreRandomRoot, VF.Renderer.Backends.SVG)
  renderer.resize(width, height)
  const context = renderer.getContext()
  if (VF.setMusicFont) {
    VF.setMusicFont("Bravura")
  }

  const x = 70
  const y = 60
  const staveWidth = width - 140
  const staffGap = 190

  const treble = new VF.Stave(x, y, staveWidth)
  const bass = new VF.Stave(x, y + staffGap, staveWidth)
  treble.addClef("treble").addTimeSignature("4/4")
  bass.addClef("bass").addTimeSignature("4/4")

  const brace = new VF.StaveConnector(treble, bass)
  brace.setType(VF.StaveConnector.type.BRACE)
  brace.setContext(context).draw()
  const line = new VF.StaveConnector(treble, bass)
  line.setType(VF.StaveConnector.type.SINGLE_LEFT)
  line.setContext(context).draw()

  treble.setContext(context).draw()
  bass.setContext(context).draw()

  const slot = Math.max(0, Math.min(3, randomPositionIndex))
  const trebleNotes = []
  const bassNotes = []
  if (dualMode) {
    const trebleNote = createNote(randomTargetTreble, "treble")
    const bassNote = createNote(randomTargetBass, "bass")
    for (let i = 0; i < 4; i += 1) {
      trebleNotes.push(i === slot ? trebleNote : createRest("treble"))
      bassNotes.push(i === slot ? bassNote : createRest("bass"))
    }
  } else {
    const isTreble = randomMidiValue >= 60
    const note = createNote(randomMidiValue, isTreble ? "treble" : "bass")
    for (let i = 0; i < 4; i += 1) {
      if (isTreble) {
        trebleNotes.push(i === slot ? note : createRest("treble"))
        bassNotes.push(createRest("bass"))
      } else {
        trebleNotes.push(createRest("treble"))
        bassNotes.push(i === slot ? note : createRest("bass"))
      }
    }
  }
  const trebleVoice = new VF.Voice({ num_beats: 4, beat_value: 4 }).addTickables(trebleNotes)
  const bassVoice = new VF.Voice({ num_beats: 4, beat_value: 4 }).addTickables(bassNotes)
  new VF.Formatter().joinVoices([trebleVoice]).format([trebleVoice], staveWidth - 120)
  new VF.Formatter().joinVoices([bassVoice]).format([bassVoice], staveWidth - 120)
  trebleVoice.draw(context, treble)
  bassVoice.draw(context, bass)
}

const setSustain = (on) => {
  sustainOn = on
  pedalDot.className = on ? "dot on" : "dot"
}

const setIntervalSeconds = (seconds) => {
  const s = Math.max(0.2, Math.min(120, Number(seconds) || 1.6))
  intervalInput.value = String(Math.min(12, s))
  intervalNum.value = String(s.toFixed(1))
  intervalValue.textContent = `${s.toFixed(1)}s`
  if (autoTimer) {
    scheduleAuto()
  }
}

const scheduleAuto = () => {
  if (autoTimer) {
    clearInterval(autoTimer)
  }
  const intervalMs = Number(intervalNum.value || intervalInput.value) * 1000
  autoTimer = setInterval(() => {
    nextRandomImmediately()
  }, intervalMs)
}

const stopAuto = () => {
  if (autoTimer) {
    clearInterval(autoTimer)
    autoTimer = null
  }
}

const nextRandomImmediately = () => {
  if (dualMode) {
    randomTargetTreble = randomMidiWithin(trebleRange.min, trebleRange.max)
    randomTargetBass = randomMidiWithin(bassRange.min, bassRange.max)
    hitTreble = false
    hitBass = false
  } else {
    randomMidiValue = randomMidi()
    randomTargetTreble = null
    randomTargetBass = null
    hitTreble = false
    hitBass = false
  }
  randomPositionIndex = 1 + Math.floor(Math.random() * 3)
  renderRandomScore()
  randomStartAt = performance.now()
  if (autoTimer) {
    scheduleAuto()
  }
}

const setLiveUI = (state) => {
  if (state === "connected") {
    liveConnected = true
    liveStatusLabel.textContent = "已连接"
    liveConnectButton.textContent = "断开"
    return
  }
  liveConnected = false
  if (state === "connecting") {
    liveStatusLabel.textContent = "连接中..."
    liveConnectButton.textContent = "断开"
    return
  }
  if (state === "reconnecting") {
    liveStatusLabel.textContent = "重连中..."
    liveConnectButton.textContent = "断开"
    return
  }
  liveStatusLabel.textContent = "未连接"
  liveConnectButton.textContent = "连接"
}

const disconnectLive = () => {
  liveUserDisconnected = true
  if (liveSource) {
    liveSource.close()
    liveSource = null
  }
  setLiveUI("disconnected")
}

const connectLive = () => {
  liveUserDisconnected = false
  if (liveSource) {
    liveSource.close()
    liveSource = null
  }
  const url = "http://localhost:8766/events"
  setLiveUI("connecting")
  try {
    liveSource = new EventSource(url)
    liveSource.onopen = () => {
      setLiveUI("connected")
    }
    liveSource.onerror = () => {
      if (liveUserDisconnected) {
        setLiveUI("disconnected")
      } else {
        setLiveUI("reconnecting")
      }
    }
    liveSource.onmessage = (evt) => {
      let msg
      try {
        msg = JSON.parse(evt.data)
      } catch {
        return
      }
      if (msg.type === "control_change" && msg.control === 64) {
        setSustain((msg.value || 0) >= 64)
      }
      if (msg.edge === "down" && typeof msg.note === "number") {
        if (dualMode) {
          let advanced = false
          if (!hitTreble && msg.note === randomTargetTreble) {
            hitTreble = true
            scoreGood += 1
            scoreTotal += 1
            updateScoreboard()
          } else if (!hitBass && msg.note === randomTargetBass) {
            hitBass = true
            scoreGood += 1
            scoreTotal += 1
            updateScoreboard()
          } else if (msg.note !== randomTargetTreble && msg.note !== randomTargetBass) {
            scoreBad += 1
            scoreTotal -= 1
            updateScoreboard()
          }
          if (hitTreble && hitBass) {
            const now = performance.now()
            if (randomStartAt != null) {
              const dt = Math.max(0, now - randomStartAt)
              durations.push(dt)
              if (fastest == null || dt < fastest) {
                fastest = dt
                fastestNote = randomTargetTreble
              }
              if (slowest == null || dt > slowest) {
                slowest = dt
                slowestNote = randomTargetTreble
              }
              updateMetricsUI()
            }
            advanced = true
          }
          if (advanced) nextRandomImmediately()
        } else {
          if (typeof randomMidiValue === "number") {
            if (msg.note === randomMidiValue) {
              scoreGood += 1
              scoreTotal += 1
              updateScoreboard()
              const now = performance.now()
              if (randomStartAt != null) {
                const dt = Math.max(0, now - randomStartAt)
                durations.push(dt)
                if (fastest == null || dt < fastest) {
                  fastest = dt
                  fastestNote = randomMidiValue
                }
                if (slowest == null || dt > slowest) {
                  slowest = dt
                  slowestNote = randomMidiValue
                }
                updateMetricsUI()
              }
              nextRandomImmediately()
            } else {
              scoreBad += 1
              scoreTotal -= 1
              updateScoreboard()
            }
          }
        }
        pushLiveStep(msg.note)
      }
    }
  } catch {
    setLiveUI("disconnected")
  }
}

liveConnectButton.addEventListener("click", () => {
  if (liveSource && !liveUserDisconnected) {
    disconnectLive()
  } else {
    connectLive()
  }
})
liveClearButton.addEventListener("click", () => clearLiveScore())

randomButton.addEventListener("click", () => {
  stopAuto()
  toggleAutoButton.textContent = "自动"
  nextRandomImmediately()
})

toggleAutoButton.addEventListener("click", () => {
  if (autoTimer) {
    stopAuto()
    toggleAutoButton.textContent = "自动"
  } else {
    scheduleAuto()
    toggleAutoButton.textContent = "停止"
  }
})

intervalInput.addEventListener("input", () => setIntervalSeconds(intervalInput.value))
intervalNum.addEventListener("input", () => setIntervalSeconds(intervalNum.value))
showNameCheckbox.addEventListener("change", () => {
  renderRandomScore()
  renderLiveScore()
})
liveReuseLineCheckbox.addEventListener("change", () => renderLiveScore())
if (rangeStartInput && rangeEndInput) {
  rangeStartInput.addEventListener("change", () => setRangeByNames(rangeStartInput.value, rangeEndInput.value))
  rangeEndInput.addEventListener("change", () => setRangeByNames(rangeStartInput.value, rangeEndInput.value))
}

if (trebleRangeStartInput && trebleRangeEndInput) {
  trebleRangeStartInput.addEventListener("change", () => setTrebleRangeByNames(trebleRangeStartInput.value, trebleRangeEndInput.value))
  trebleRangeEndInput.addEventListener("change", () => setTrebleRangeByNames(trebleRangeStartInput.value, trebleRangeEndInput.value))
}
if (bassRangeStartInput && bassRangeEndInput) {
  bassRangeStartInput.addEventListener("change", () => setBassRangeByNames(bassRangeStartInput.value, bassRangeEndInput.value))
  bassRangeEndInput.addEventListener("change", () => setBassRangeByNames(bassRangeStartInput.value, bassRangeEndInput.value))
}
if (trebleRangeStartInput && trebleRangeEndInput) {
  setTrebleRangeByNames(trebleRangeStartInput.value, trebleRangeEndInput.value)
}
if (bassRangeStartInput && bassRangeEndInput) {
  setBassRangeByNames(bassRangeStartInput.value, bassRangeEndInput.value)
}

if (dualModeCheckbox) {
  dualModeCheckbox.checked = true
  dualModeCheckbox.addEventListener("change", () => {
    dualMode = !!dualModeCheckbox.checked
    nextRandomImmediately()
  })
}

setIntervalSeconds(intervalNum.value)
setSustain(false)
renderRandomScore()
clearLiveScore()
updateScoreboard()
updateMetricsUI()
disconnectLive()
connectLive()
