import { NOTE_LETTER_TO_PC, NOTES_PER_MEASURE, PITCH_CLASS_TO_LABEL, PITCH_CLASS_TO_NAME } from "./constants.js"

export const createScoreRenderer = ({
  VF,
  scoreRandomRoot,
  scoreLiveRoot,
  getState,
  showNameEnabled,
  liveReuseLineEnabled,
  setDebugBox,
}) => {
  let liveMeasures = []
  let liveCurrentMeasure = { trebleNotes: [], bassNotes: [] }

  const midiToKey = (midi) => {
    const pc = midi % 12
    const octave = Math.floor(midi / 12) - 1
    return `${PITCH_CLASS_TO_NAME[pc]}/${octave}`
  }

  const nameForMidi = (midi) => {
    const letter = PITCH_CLASS_TO_LABEL[midi % 12]
    const octave = Math.floor(midi / 12) - 1
    return `${letter}${octave}`
  }

  const parseNameToMidi = (name) => {
    if (typeof name !== "string") return null
    const n = name.trim()
    const m = n.match(/^([A-Ga-g])([#b]?)(-?\d+)$/)
    if (!m) return null
    const letter = m[1].toUpperCase()
    const acc = m[2] || ""
    const octave = Number(m[3])
    let pc = NOTE_LETTER_TO_PC[letter]
    if (acc === "#") pc += 1
    if (acc === "b") pc -= 1
    pc = (pc + 12) % 12
    const midi = (octave + 1) * 12 + pc
    if (midi < 0 || midi > 127) return null
    return midi
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
    if (showNameEnabled()) {
      const annotation = new VF.Annotation(nameForMidi(midi)).setFont("Arial", 14)
      if (annotation.setVerticalJustification && VF.Annotation && VF.Annotation.VerticalJustify) {
        annotation.setVerticalJustification(VF.Annotation.VerticalJustify.TOP)
      }
      addModifier(note, annotation)
    }
    return note
  }

  const getLiveMeasuresPerRow = () => {
    const measureWidth = 240
    const leftMargin = 60
    const availableWidth = Math.max(420, Math.floor(scoreLiveRoot.clientWidth || 980))
    return Math.max(1, Math.floor((availableWidth - leftMargin) / measureWidth))
  }

  const buildLiveRenderableMeasures = () => {
    const result = [...liveMeasures]
    if (liveCurrentMeasure.trebleNotes.length) {
      const pad = NOTES_PER_MEASURE - liveCurrentMeasure.trebleNotes.length
      const trebleNotes = [...liveCurrentMeasure.trebleNotes]
      const bassNotes = [...liveCurrentMeasure.bassNotes]
      for (let i = 0; i < pad; i += 1) {
        trebleNotes.push(createRest("treble"))
        bassNotes.push(createRest("bass"))
      }
      result.push({ trebleNotes, bassNotes })
    }
    if (!result.length) {
      result.push({
        trebleNotes: Array.from({ length: NOTES_PER_MEASURE }, () => createRest("treble")),
        bassNotes: Array.from({ length: NOTES_PER_MEASURE }, () => createRest("bass")),
      })
    }
    return result
  }

  const renderLiveScore = () => {
    if (!VF) return
    try {
      const renderable = buildLiveRenderableMeasures()
      const measureWidth = 240
      const rowGap = 180
      const staffGap = 110
      const leftMargin = 60
      const topMargin = 40
      const availableWidth = Math.max(420, Math.floor(scoreLiveRoot.clientWidth || 980))
      const measuresPerRow = liveReuseLineEnabled()
        ? getLiveMeasuresPerRow()
        : Math.max(1, Math.floor((availableWidth - leftMargin) / measureWidth))
      const measureCount = renderable.length
      const rowCount = liveReuseLineEnabled() ? 1 : Math.max(1, Math.ceil(measureCount / measuresPerRow))
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
    } catch (e) {
      setDebugBox((e && e.stack) || (e && e.message) || String(e), "error")
    }
  }

  const renderRandomScore = () => {
    if (!VF) return
    const state = getState()
    try {
      scoreRandomRoot.innerHTML = ""
      const width = Math.max(420, Math.floor(scoreRandomRoot.clientWidth || 980))
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

      const slot = Math.max(0, Math.min(3, state.training.randomPositionIndex))
      const trebleNotes = []
      const bassNotes = []
      if (state.settings.dualMode) {
        const trebleNote = createNote(state.training.randomTargetTreble, "treble")
        const bassNote = createNote(state.training.randomTargetBass, "bass")
        for (let i = 0; i < NOTES_PER_MEASURE; i += 1) {
          trebleNotes.push(i === slot ? trebleNote : createRest("treble"))
          bassNotes.push(i === slot ? bassNote : createRest("bass"))
        }
      } else {
        const isTreble = state.training.randomMidiValue >= 60
        const note = createNote(state.training.randomMidiValue, isTreble ? "treble" : "bass")
        for (let i = 0; i < NOTES_PER_MEASURE; i += 1) {
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
    } catch (e) {
      setDebugBox((e && e.stack) || (e && e.message) || String(e), "error")
    }
  }

  const clearLiveScore = () => {
    liveMeasures = []
    liveCurrentMeasure = { trebleNotes: [], bassNotes: [] }
    renderLiveScore()
  }

  const pushLiveStep = (midi) => {
    if (liveReuseLineEnabled()) {
      const limit = getLiveMeasuresPerRow()
      if (liveMeasures.length >= limit && liveCurrentMeasure.trebleNotes.length === 0) {
        liveMeasures = []
      }
    }
    const isTreble = midi >= 60
    const note = createNote(midi, isTreble ? "treble" : "bass")
    liveCurrentMeasure.trebleNotes.push(isTreble ? note : createRest("treble"))
    liveCurrentMeasure.bassNotes.push(isTreble ? createRest("bass") : note)
    if (liveCurrentMeasure.trebleNotes.length >= NOTES_PER_MEASURE) {
      liveMeasures.push(liveCurrentMeasure)
      liveCurrentMeasure = { trebleNotes: [], bassNotes: [] }
    }
    renderLiveScore()
  }

  return {
    nameForMidi,
    parseNameToMidi,
    renderRandomScore,
    renderLiveScore,
    clearLiveScore,
    pushLiveStep,
  }
}
