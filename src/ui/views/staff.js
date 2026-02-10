const defaultNotes = Array.from({ length: 88 }, (_, i) => 21 + i)

const staff = document.getElementById("staff")
const ctx = staff.getContext("2d")
const logInput = document.getElementById("log-input")
const countLabel = document.getElementById("count")
const viewport = document.getElementById("viewport")
const fontStatus = document.getElementById("font-status")
const loadDefaultButton = document.getElementById("load-default")
const loadLogButton = document.getElementById("load-log")
const resetViewButton = document.getElementById("reset-view")

const lineSpacing = 16
const trebleBaseY = 140
const bassBaseY = 290
const minGroupGap = 8
const noteHeadWidth = 10
const noteHeadHeight = 7
const stemLength = 34
const noteGlyphSize = 28
const clefGlyphSize = 48
const sharpGlyphSize = 22
const noteHeadGlyph = "\uE0A4"
const sharpGlyph = "\uE262"
const trebleClefGlyph = "\uE050"
const bassClefGlyph = "\uE062"
const accidentalToNoteGap = 6

const pitchClassToLetter = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
const letterIndex = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 }

const diatonicIndex = (letter, octave) => octave * 7 + letterIndex[letter]
const trebleRef = diatonicIndex("E", 4)
const bassRef = diatonicIndex("G", 2)

const midiToStaff = (midi) => {
  const letter = pitchClassToLetter[midi % 12]
  const natural = letter[0]
  const octave = Math.floor(midi / 12) - 1
  const diatonic = diatonicIndex(natural, octave)
  const useTreble = midi >= 60
  const base = useTreble ? trebleRef : bassRef
  return {
    staff: useTreble ? "treble" : "bass",
    step: diatonic - base,
    letter,
    octave,
    natural,
  }
}

const staffY = (staffName) => (staffName === "treble" ? trebleBaseY : bassBaseY)

const measureGlyph = (glyph, font) => {
  ctx.font = font
  const m = ctx.measureText(glyph)
  const ascent = m.actualBoundingBoxAscent ?? 0
  const descent = m.actualBoundingBoxDescent ?? 0
  return { width: m.width, ascent, descent, height: ascent + descent }
}

const drawGlyphCentered = (x, y, glyph, font) => {
  const m = measureGlyph(glyph, font)
  const left = x - m.width / 2
  const baseline = y + (m.ascent - m.descent) / 2
  ctx.fillText(glyph, left, baseline)
  return m
}

const drawStaffLines = (baseY) => {
  for (let i = 0; i < 5; i += 1) {
    const y = baseY - i * lineSpacing
    ctx.beginPath()
    ctx.moveTo(20, y)
    ctx.lineTo(staff.width - 20, y)
    ctx.stroke()
  }
}

const drawLedgerLines = (x, baseY, step) => {
  if (step < 0) {
    for (let s = -2; s >= step; s -= 2) {
      const y = baseY - s * (lineSpacing / 2)
      ctx.beginPath()
      ctx.moveTo(x - 10, y)
      ctx.lineTo(x + 10, y)
      ctx.stroke()
    }
  }
  if (step > 8) {
    for (let s = 10; s <= step; s += 2) {
      const y = baseY - s * (lineSpacing / 2)
      ctx.beginPath()
      ctx.moveTo(x - 10, y)
      ctx.lineTo(x + 10, y)
      ctx.stroke()
    }
  }
}

const noteGroupBounds = (midi, glyphMetrics) => {
  const mapping = midiToStaff(midi)
  const stemUp = mapping.staff === "bass" || mapping.step < 4
  const noteW = glyphMetrics.noteHead.width
  const accW = glyphMetrics.sharp.width
  const left = mapping.letter.includes("#") ? -(noteW / 2 + accidentalToNoteGap + accW) : -(noteW / 2)
  const stemX = stemUp ? noteW / 2 - 1 : -(noteW / 2) + 1
  const right = Math.max(noteW / 2, stemX + 2)
  return { left, right, mapping, stemUp }
}

const layoutNotes = (notes, glyphMetrics, startX) => {
  const positioned = []
  let cursor = startX
  for (const midi of notes) {
    const bounds = noteGroupBounds(midi, glyphMetrics)
    const noteX = cursor - bounds.left
    positioned.push({ midi, noteX, mapping: bounds.mapping, stemUp: bounds.stemUp })
    cursor = noteX + bounds.right + minGroupGap
  }
  return { positioned, endX: cursor }
}

const drawNote = (noteX, midi, labelMode, mapping, stemUp, glyphMetrics) => {
  const baseY = staffY(mapping.staff)
  const y = baseY - mapping.step * (lineSpacing / 2)
  drawLedgerLines(noteX, baseY, mapping.step)
  if (mapping.letter.includes("#")) {
    const accX = noteX - glyphMetrics.noteHead.width / 2 - accidentalToNoteGap - glyphMetrics.sharp.width / 2
    drawGlyphCentered(accX, y, sharpGlyph, `${sharpGlyphSize}px Bravura`)
  }
  const noteMetrics = drawGlyphCentered(noteX, y, noteHeadGlyph, `${noteGlyphSize}px Bravura`)
  ctx.beginPath()
  if (stemUp) {
    ctx.moveTo(noteX + noteMetrics.width / 2 - 1, y)
    ctx.lineTo(noteX + noteMetrics.width / 2 - 1, y - stemLength)
  } else {
    ctx.moveTo(noteX - noteMetrics.width / 2 + 1, y)
    ctx.lineTo(noteX - noteMetrics.width / 2 + 1, y + stemLength)
  }
  ctx.stroke()
  const label =
    labelMode === "midi" ? `${midi}` : `${mapping.letter}${mapping.octave}`
  ctx.font = "12px Arial"
  ctx.fillText(label, noteX - 12, y + 24)
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

const labelModeSelect = document.getElementById("label-mode")

const render = (notes) => {
  const glyphMetrics = {
    noteHead: measureGlyph(noteHeadGlyph, `${noteGlyphSize}px Bravura`),
    sharp: measureGlyph(sharpGlyph, `${sharpGlyphSize}px Bravura`),
  }
  const { positioned, endX } = layoutNotes(notes, glyphMetrics, 80)
  const width = Math.max(900, endX + 40)
  staff.width = width
  ctx.clearRect(0, 0, staff.width, staff.height)
  ctx.strokeStyle = "#111"
  ctx.fillStyle = "#111"
  ctx.lineWidth = 1.2
  ctx.font = "14px Arial"
  drawStaffLines(trebleBaseY)
  drawStaffLines(bassBaseY)
  drawGlyphCentered(40, trebleBaseY - 2 * (lineSpacing / 2), trebleClefGlyph, `${clefGlyphSize}px Bravura`)
  drawGlyphCentered(40, bassBaseY - 2 * (lineSpacing / 2), bassClefGlyph, `${clefGlyphSize}px Bravura`)
  positioned.forEach((item) => {
    drawNote(item.noteX, item.midi, labelModeSelect.value, item.mapping, item.stemUp, glyphMetrics)
  })
  countLabel.textContent = `数量: ${notes.length}`
}

loadDefaultButton.addEventListener("click", () => render(defaultNotes))
loadLogButton.addEventListener("click", () => {
  const notes = parseNotesFromLog(logInput.value)
  render(notes.length ? notes : defaultNotes)
})
labelModeSelect.addEventListener("change", () => {
  const notes = parseNotesFromLog(logInput.value)
  render(notes.length ? notes : defaultNotes)
})

resetViewButton.addEventListener("click", () => {
  viewport.scrollLeft = 0
  viewport.scrollTop = 0
})

const updateFontStatus = async () => {
  if (!document.fonts || !document.fonts.load) {
    fontStatus.textContent = "字体: 不支持检测"
    return
  }
  try {
    await document.fonts.load(`24px Bravura`, noteHeadGlyph)
    await document.fonts.load(`36px Bravura`, trebleClefGlyph)
    fontStatus.textContent = "字体: Bravura 已加载"
  } catch {
    fontStatus.textContent = "字体: Bravura 加载失败"
  }
}

const init = async () => {
  await updateFontStatus()
  const notes = parseNotesFromLog(logInput.value)
  render(notes.length ? notes : defaultNotes)
}

init()
