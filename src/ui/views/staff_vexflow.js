const defaultNotes = Array.from({ length: 88 }, (_, i) => 21 + i)

const logInput = document.getElementById("log-input")
const countLabel = document.getElementById("count")
const loadDefaultButton = document.getElementById("load-default")
const loadLogButton = document.getElementById("load-log")
const show88Button = document.getElementById("show-88")
const showDurationsButton = document.getElementById("show-durations")
const resetViewButton = document.getElementById("reset-view")
const viewport = document.getElementById("viewport")
const scoreRoot = document.getElementById("score")
const showLabels = document.getElementById("show-labels")
const fontStatus = document.getElementById("font-status")

const VF = window.Vex?.Flow || window.VF

const pitchClassToName = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"]
const pitchClassToLabel = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

const midiToKey = (midi) => {
  const pc = midi % 12
  const octave = Math.floor(midi / 12) - 1
  return `${pitchClassToName[pc]}/${octave}`
}

const midiToLabel = (midi) => {
  const pc = midi % 12
  const octave = Math.floor(midi / 12) - 1
  return `${pitchClassToLabel[pc]}${octave}`
}

const parseNotesFromLog = (text) => {
  const matches = text.matchAll(/note=(\d+)/g)
  const result = []
  const seen = new Set()
  for (const m of matches) {
    const value = Number(m[1])
    if (!Number.isNaN(value) && !seen.has(value)) {
      seen.add(value)
      result.push(value)
    }
  }
  return result
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

const createStaveNote = (midi, clef, duration = "q", showLabel = showLabels.checked) => {
  const key = midiToKey(midi)
  const note = new VF.StaveNote({ clef, keys: [key], duration })
  if (key.includes("#")) {
    addModifier(note, new VF.Accidental("#"))
  }
  if (showLabel) {
    addModifier(note, new VF.Annotation(midiToLabel(midi)).setFont("Arial", 12))
  }
  return note
}

const createRest = (clef, duration = "qr") => new VF.StaveNote({ clef, keys: ["b/4"], duration })

const addDots = (note, count) => {
  for (let i = 0; i < count; i += 1) {
    if (note.addDotToAll) {
      note.addDotToAll()
    } else if (VF.Dot?.buildAndAttach) {
      VF.Dot.buildAndAttach([note])
    }
  }
}

const renderMeasures = (measures) => {
  const measureWidth = 220
  const rowGap = 140
  const staffGap = 90
  const leftMargin = 50
  const topMargin = 40
  const measuresPerRow = Math.max(1, Math.floor((viewport.clientWidth - leftMargin) / measureWidth))
  const measureCount = measures.length
  const rowCount = Math.max(1, Math.ceil(measureCount / measuresPerRow))
  const width = measuresPerRow * measureWidth + leftMargin + 40
  const height = rowCount * rowGap + topMargin + staffGap + 40

  scoreRoot.innerHTML = ""
  const renderer = new VF.Renderer(scoreRoot, VF.Renderer.Backends.SVG)
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

    const { trebleNotes, bassNotes, label } = measures[m]

    const trebleVoice = new VF.Voice({ num_beats: 4, beat_value: 4 }).addTickables(trebleNotes)
    const bassVoice = new VF.Voice({ num_beats: 4, beat_value: 4 }).addTickables(bassNotes)

    new VF.Formatter().joinVoices([trebleVoice]).format([trebleVoice], measureWidth - 30)
    new VF.Formatter().joinVoices([bassVoice]).format([bassVoice], measureWidth - 30)

    trebleVoice.draw(context, treble)
    bassVoice.draw(context, bass)

    if (label && trebleNotes.length) {
      addModifier(trebleNotes[0], new VF.Annotation(label).setFont("Arial", 13))
      trebleVoice.draw(context, treble)
    }
  }

  countLabel.textContent = `小节: ${measures.length}`
}

const build88Measures = (notes) => {
  const notesPerMeasure = 4
  const measureCount = Math.ceil(notes.length / notesPerMeasure)
  const measures = []
  for (let m = 0; m < measureCount; m += 1) {
    const trebleNotes = []
    const bassNotes = []
    for (let i = 0; i < notesPerMeasure; i += 1) {
      const idx = m * notesPerMeasure + i
      if (idx >= notes.length) {
        trebleNotes.push(createRest("treble"))
        bassNotes.push(createRest("bass"))
        continue
      }
      const midi = notes[idx]
      if (midi >= 60) {
        trebleNotes.push(createStaveNote(midi, "treble"))
        bassNotes.push(createRest("bass"))
      } else {
        trebleNotes.push(createRest("treble"))
        bassNotes.push(createStaveNote(midi, "bass"))
      }
    }
    measures.push({ trebleNotes, bassNotes })
  }
  return measures
}

const durationRows = [
  { label: "全音符", duration: "w", count: 1, beats: 4, beatValue: 4 },
  { label: "二分音符", duration: "h", count: 2, beats: 4, beatValue: 4 },
  { label: "四分音符", duration: "q", count: 4, beats: 4, beatValue: 4 },
  { label: "八分音符", duration: "8", count: 8, beats: 4, beatValue: 4 },
  { label: "十六分音符", duration: "16", count: 16, beats: 4, beatValue: 4 },
  { label: "三十二分音符", duration: "32", count: 32, beats: 4, beatValue: 4 },
  { label: "六十四分音符", duration: "64", count: 64, beats: 4, beatValue: 4 },
]

const dottedRows = [
  { label: "全音符(附点)", duration: "w", beats: 3, beatValue: 2, timeSig: "3/2" },
  { label: "二分音符(附点)", duration: "h", beats: 3, beatValue: 4, timeSig: "3/4" },
  { label: "四分音符(附点)", duration: "q", beats: 3, beatValue: 8, timeSig: "3/8" },
  { label: "八分音符(附点)", duration: "8", beats: 3, beatValue: 16, timeSig: "3/16" },
  { label: "十六分音符(附点)", duration: "16", beats: 3, beatValue: 32, timeSig: "3/32" },
  { label: "三十二分音符(附点)", duration: "32", beats: 3, beatValue: 64, timeSig: "3/64" },
  { label: "六十四分音符(附点)", duration: "64", beats: 3, beatValue: 128, timeSig: "3/128" },
]

const accidentalRows = [
  {
    label: "升降记号",
    items: [
      { text: "♯", acc: "#" },
      { text: "♭", acc: "b" },
      { text: "♮", acc: "n" },
      { text: "𝄪", acc: "##" },
      { text: "𝄫", acc: "bb" },
    ],
  },
]

const octaveRows = [
  { label: "八度标记", items: ["8va", "8vb", "15ma", "15mb"] },
]

const renderRow = (label, notes, beats = 4, beatValue = 4, timeSig = "4/4", showBeam = true) => {
  const rowEl = document.createElement("div")
  rowEl.className = "duration-row"
  const labelEl = document.createElement("div")
  labelEl.className = "duration-label"
  labelEl.textContent = `${label}:`
  const canvasEl = document.createElement("div")
  canvasEl.className = "duration-canvas"
  rowEl.appendChild(labelEl)
  rowEl.appendChild(canvasEl)
  scoreRoot.appendChild(rowEl)

  const width = Math.max(360, notes.length * 14 + 160)
  const height = 120
  const renderer = new VF.Renderer(canvasEl, VF.Renderer.Backends.SVG)
  renderer.resize(width, height)
  const context = renderer.getContext()
  const stave = new VF.Stave(20, 20, width - 40)
  stave.addClef("treble").addTimeSignature(timeSig)
  stave.setContext(context).draw()

  const voice = new VF.Voice({ num_beats: beats, beat_value: beatValue }).addTickables(notes)
  new VF.Formatter().joinVoices([voice]).format([voice], width - 80)
  voice.draw(context, stave)

  if (showBeam) {
    VF.Beam.generateBeams(notes).forEach((beam) => beam.setContext(context).draw())
  }
}

const renderKeySignatureRow = (label, key) => {
  const rowEl = document.createElement("div")
  rowEl.className = "duration-row"
  const labelEl = document.createElement("div")
  labelEl.className = "duration-label"
  labelEl.textContent = `${label}:`
  const canvasEl = document.createElement("div")
  canvasEl.className = "duration-canvas"
  rowEl.appendChild(labelEl)
  rowEl.appendChild(canvasEl)
  scoreRoot.appendChild(rowEl)

  const width = 360
  const height = 120
  const renderer = new VF.Renderer(canvasEl, VF.Renderer.Backends.SVG)
  renderer.resize(width, height)
  const context = renderer.getContext()
  const stave = new VF.Stave(20, 20, width - 40)
  stave.addClef("treble").addKeySignature(key).addTimeSignature("4/4")
  stave.setContext(context).draw()
  const note = createRest("treble", "wr")
  const voice = new VF.Voice({ num_beats: 4, beat_value: 4 }).addTickables([note])
  new VF.Formatter().joinVoices([voice]).format([voice], width - 80)
  voice.draw(context, stave)
}

const renderDurationView = () => {
  scoreRoot.innerHTML = ""
  if (VF.setMusicFont) {
    VF.setMusicFont("Bravura")
  }
  const sectionTitle = (text) => {
    const el = document.createElement("div")
    el.className = "section-title"
    el.textContent = text
    scoreRoot.appendChild(el)
  }

  sectionTitle("基本时值")
  durationRows.forEach((row) => {
    const notes = Array.from({ length: row.count }, () => createStaveNote(60, "treble", row.duration, false))
    renderRow(row.label, notes, row.beats, row.beatValue, "4/4", ["8", "16", "32", "64"].includes(row.duration))
  })

  sectionTitle("附点时值")
  dottedRows.forEach((row) => {
    const note = createStaveNote(60, "treble", row.duration, false)
    addDots(note, 1)
    renderRow(row.label, [note], row.beats, row.beatValue, row.timeSig, false)
  })

  sectionTitle("升降记号")
  accidentalRows.forEach((row) => {
    const notes = row.items.map((item) => {
      const note = createStaveNote(60, "treble", "q", false)
      addModifier(note, new VF.Accidental(item.acc))
      return note
    })
    renderRow(row.label, notes, 5, 4, "5/4", false)
  })

  sectionTitle("八度标记")
  octaveRows.forEach((row) => {
    const notes = row.items.map((text) => {
      const note = createStaveNote(60, "treble", "q", false)
      const annotation = new VF.Annotation(text).setFont("Arial", 12)
      if (annotation.setVerticalJustification && VF.Annotation?.VerticalJustify) {
        const isDown = text.endsWith("b")
        annotation.setVerticalJustification(isDown ? VF.Annotation.VerticalJustify.BOTTOM : VF.Annotation.VerticalJustify.TOP)
      }
      addModifier(note, annotation)
      return note
    })
    renderRow(row.label, notes, 4, 4, "4/4", false)
  })

  sectionTitle("调号")
  const sharpKeys = ["G", "D", "A", "E", "B", "F#", "C#"]
  const flatKeys = ["F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"]
  sharpKeys.forEach((key, index) => renderKeySignatureRow(`升调 ${index + 1}#`, key))
  flatKeys.forEach((key, index) => renderKeySignatureRow(`降调 ${index + 1}b`, key))

  countLabel.textContent = `时值类型: ${durationRows.length + dottedRows.length}，其他类型: ${accidentalRows.length + octaveRows.length + sharpKeys.length + flatKeys.length}`
}

const updateFontStatus = async () => {
  if (!document.fonts || !document.fonts.load) {
    fontStatus.textContent = "字体: 不支持检测"
    return
  }
  try {
    await document.fonts.load(`24px Bravura`, "A")
    fontStatus.textContent = "字体: Bravura 已加载"
  } catch {
    fontStatus.textContent = "字体: Bravura 加载失败"
  }
}

const render = () => {
  const notes = parseNotesFromLog(logInput.value)
  renderMeasures(build88Measures(notes.length ? notes : defaultNotes))
}

loadDefaultButton.addEventListener("click", () => renderMeasures(build88Measures(defaultNotes)))
loadLogButton.addEventListener("click", render)
show88Button.addEventListener("click", () => renderMeasures(build88Measures(defaultNotes)))
showDurationsButton.addEventListener("click", () => renderDurationView())
showLabels.addEventListener("change", render)
resetViewButton.addEventListener("click", () => {
  viewport.scrollLeft = 0
  viewport.scrollTop = 0
})

const init = async () => {
  await updateFontStatus()
  renderMeasures(build88Measures(defaultNotes))
}

init()
