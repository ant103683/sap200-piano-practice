const PITCH_CLASS_TO_LABEL = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

export const HAND_LEFT = "left"
export const HAND_RIGHT = "right"
export const BEATS_PER_MEASURE = 4
export const TICKS_PER_BEAT = 32
export const TICKS_PER_MEASURE = BEATS_PER_MEASURE * TICKS_PER_BEAT
export const DEFAULT_MEASURE_DURATION_MS = 8000

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export const midiToNoteName = (midi) => {
  const pitchClass = ((midi % 12) + 12) % 12
  const octave = Math.floor(midi / 12) - 1
  return `${PITCH_CLASS_TO_LABEL[pitchClass]}${octave}`
}

const createScoreNote = (note, index) => {
  const durationTick = note.durationTick
  const startTick = note.startTick
  const endTick = startTick + durationTick
  return {
    id: note.id || `score-note-${index + 1}`,
    pitch: note.pitch,
    pitchName: midiToNoteName(note.pitch),
    hand: note.hand,
    staff: note.staff || (note.hand === HAND_LEFT ? "bass" : "treble"),
    voice: note.voice || 1,
    startTick,
    durationTick,
    endTick,
    measureIndex: Math.floor(startTick / TICKS_PER_MEASURE),
    beatInMeasure: Math.floor((startTick % TICKS_PER_MEASURE) / TICKS_PER_BEAT),
    subTickInBeat: startTick % TICKS_PER_BEAT,
    tieGroupId: note.tieGroupId || null,
    slurGroupId: note.slurGroupId || null,
    articulation: note.articulation || null,
  }
}

export const createPhase1SampleSong = () => {
  const notes = [
    { pitch: 72, hand: HAND_RIGHT, startTick: 0, durationTick: 64 },
    { pitch: 76, hand: HAND_RIGHT, startTick: 64, durationTick: 32 },
    { pitch: 79, hand: HAND_RIGHT, startTick: 96, durationTick: 32 },
    { pitch: 77, hand: HAND_RIGHT, startTick: 128, durationTick: 64 },
    { pitch: 76, hand: HAND_RIGHT, startTick: 192, durationTick: 64 },
    { pitch: 74, hand: HAND_RIGHT, startTick: 256, durationTick: 32 },
    { pitch: 76, hand: HAND_RIGHT, startTick: 288, durationTick: 32 },
    { pitch: 79, hand: HAND_RIGHT, startTick: 320, durationTick: 64 },
    { pitch: 84, hand: HAND_RIGHT, startTick: 384, durationTick: 128, tieGroupId: "ending-c6" },

    { pitch: 48, hand: HAND_LEFT, startTick: 0, durationTick: 128 },
    { pitch: 55, hand: HAND_LEFT, startTick: 0, durationTick: 128 },
    { pitch: 43, hand: HAND_LEFT, startTick: 128, durationTick: 128 },
    { pitch: 50, hand: HAND_LEFT, startTick: 128, durationTick: 128 },
    { pitch: 45, hand: HAND_LEFT, startTick: 256, durationTick: 64 },
    { pitch: 52, hand: HAND_LEFT, startTick: 320, durationTick: 64 },
    { pitch: 41, hand: HAND_LEFT, startTick: 384, durationTick: 128 },
    { pitch: 48, hand: HAND_LEFT, startTick: 384, durationTick: 128 },
  ].map(createScoreNote)

  return {
    id: "phase-1-sample-song",
    title: "Phase 1 双手时间轴样例",
    timeSignature: "4/4",
    ticksPerBeat: TICKS_PER_BEAT,
    measureDurationMs: DEFAULT_MEASURE_DURATION_MS,
    notes: notes.sort((a, b) => a.startTick - b.startTick || b.pitch - a.pitch),
    meta: {
      description: "固定 4/4、固定速度的双手样例，用于验证时间轴、目标集合和当前按键集合。",
    },
  }
}

export const getSongTotalTicks = (song) => {
  if (!song || !Array.isArray(song.notes) || song.notes.length === 0) return 0
  return song.notes.reduce((max, note) => Math.max(max, note.endTick), 0)
}

export const getSongMeasureCount = (song) => Math.max(1, Math.ceil(getSongTotalTicks(song) / TICKS_PER_MEASURE))

export const createPracticeSession = (song, measureDurationMs = song.measureDurationMs || DEFAULT_MEASURE_DURATION_MS) => ({
  id: `practice-session-${Date.now()}`,
  song,
  scoreSongId: song.id,
  measureDurationMs,
  currentTick: 0,
  currentTickFloat: 0,
  startedAtMs: null,
  pausedElapsedMs: 0,
  isPlaying: false,
  sustain: false,
  activePressedNotes: new Map(),
  performedNotes: [],
  events: [],
})

export const setSessionMeasureDuration = (session, measureDurationMs) => {
  const safeDuration = clamp(Number(measureDurationMs) || DEFAULT_MEASURE_DURATION_MS, 2000, 20000)
  const elapsedMs = session.currentTickFloat * getTickDurationMs(session)
  session.measureDurationMs = safeDuration
  session.pausedElapsedMs = elapsedMs
  if (session.isPlaying) {
    session.startedAtMs = performance.now() - session.pausedElapsedMs
  }
}

export const getBeatDurationMs = (session) => session.measureDurationMs / BEATS_PER_MEASURE

export const getTickDurationMs = (session) => getBeatDurationMs(session) / TICKS_PER_BEAT

export const startPracticeSession = (session, nowMs = performance.now()) => {
  if (session.isPlaying) return
  const totalTicks = getSongTotalTicks(session.song)
  if (session.currentTickFloat >= totalTicks) {
    resetPracticeSession(session)
  }
  session.startedAtMs = nowMs - session.pausedElapsedMs
  session.isPlaying = true
}

export const pausePracticeSession = (session, nowMs = performance.now()) => {
  if (!session.isPlaying) return
  updatePracticeClock(session, nowMs)
  session.pausedElapsedMs = session.currentTickFloat * getTickDurationMs(session)
  session.startedAtMs = null
  session.isPlaying = false
}

export const resetPracticeSession = (session) => {
  session.currentTick = 0
  session.currentTickFloat = 0
  session.startedAtMs = null
  session.pausedElapsedMs = 0
  session.isPlaying = false
}

export const updatePracticeClock = (session, nowMs = performance.now()) => {
  const totalTicks = getSongTotalTicks(session.song)
  if (!session.isPlaying || session.startedAtMs == null) {
    session.currentTick = Math.floor(session.currentTickFloat)
    return session.currentTickFloat
  }

  const elapsedMs = Math.max(0, nowMs - session.startedAtMs)
  const tickFloat = clamp(elapsedMs / getTickDurationMs(session), 0, totalTicks)
  session.currentTickFloat = tickFloat
  session.currentTick = Math.floor(tickFloat)
  session.pausedElapsedMs = elapsedMs

  if (tickFloat >= totalTicks) {
    session.isPlaying = false
    session.startedAtMs = null
  }

  return tickFloat
}

export const estimateTickAtTimestamp = (session, timestampMs) => {
  if (session.isPlaying && session.startedAtMs != null) {
    return clamp((timestampMs - session.startedAtMs) / getTickDurationMs(session), 0, getSongTotalTicks(session.song))
  }
  return session.currentTickFloat
}

export const getExpectedNotesAtTick = (song, tickFloat) => {
  const activeNotes = song.notes.filter((note) => note.startTick <= tickFloat && tickFloat < note.endTick)
  return {
    all: activeNotes,
    left: activeNotes.filter((note) => note.hand === HAND_LEFT),
    right: activeNotes.filter((note) => note.hand === HAND_RIGHT),
  }
}

export const getHandPitchLanes = (song, hand) =>
  [...new Set(song.notes.filter((note) => note.hand === hand).map((note) => note.pitch))].sort((a, b) => b - a)

export const getActivePressedNotes = (session) =>
  [...session.activePressedNotes.values()].sort((a, b) => b.pitch - a.pitch || a.pressedAtMs - b.pressedAtMs)

const guessHandForPitch = (pitch) => (pitch >= 60 ? HAND_RIGHT : HAND_LEFT)

const finalizePerformedNote = (session, activeNote, releasedAtMs, releasedAtTick, releaseEventId) => {
  session.performedNotes.push({
    id: `performed-note-${session.performedNotes.length + 1}`,
    sessionId: session.id,
    pitch: activeNote.pitch,
    pitchName: midiToNoteName(activeNote.pitch),
    handGuess: activeNote.handGuess,
    startMs: activeNote.pressedAtMs,
    endMs: releasedAtMs,
    durationMs: Math.max(0, releasedAtMs - activeNote.pressedAtMs),
    startTickEstimate: activeNote.startTickEstimate,
    endTickEstimate: releasedAtTick,
    durationTickEstimate: Math.max(0, releasedAtTick - activeNote.startTickEstimate),
    velocityOn: activeNote.velocityOn,
    triggerEventId: activeNote.triggerEventId,
    releaseEventId,
    sustainedByPedal: activeNote.sustainedByPedal,
    isClosed: true,
  })
}

export const recordPerformanceEvent = (session, event) => {
  const timestampMs = Number(event.timestampMs) || performance.now()
  const tickEstimate = estimateTickAtTimestamp(session, timestampMs)
  const normalizedEvent = {
    id: `perf-event-${session.events.length + 1}`,
    sessionId: session.id,
    timestampMs,
    tickEstimate,
    eventType: event.eventType,
    pitch: typeof event.pitch === "number" ? event.pitch : null,
    velocity: typeof event.velocity === "number" ? event.velocity : null,
    channel: typeof event.channel === "number" ? event.channel : 0,
    deviceId: event.deviceId || "unknown",
    control: typeof event.control === "number" ? event.control : null,
    value: typeof event.value === "number" ? event.value : null,
  }
  session.events.push(normalizedEvent)

  if (normalizedEvent.eventType === "control_change" && normalizedEvent.control === 64) {
    session.sustain = (normalizedEvent.value || 0) >= 64
    return normalizedEvent
  }

  const key = `${normalizedEvent.channel}:${normalizedEvent.pitch}`

  if (normalizedEvent.eventType === "note_on" && (normalizedEvent.velocity || 0) > 0) {
    const previous = session.activePressedNotes.get(key)
    if (previous) {
      finalizePerformedNote(session, previous, timestampMs, tickEstimate, normalizedEvent.id)
    }
    session.activePressedNotes.set(key, {
      pitch: normalizedEvent.pitch,
      pitchName: midiToNoteName(normalizedEvent.pitch),
      pressedAtMs: timestampMs,
      velocityOn: normalizedEvent.velocity || 0,
      channel: normalizedEvent.channel,
      deviceId: normalizedEvent.deviceId,
      sustainedByPedal: session.sustain,
      handGuess: guessHandForPitch(normalizedEvent.pitch),
      startTickEstimate: tickEstimate,
      triggerEventId: normalizedEvent.id,
    })
    return normalizedEvent
  }

  const isNoteRelease =
    normalizedEvent.eventType === "note_off" ||
    (normalizedEvent.eventType === "note_on" && (normalizedEvent.velocity || 0) === 0)

  if (isNoteRelease) {
    const activeNote = session.activePressedNotes.get(key)
    if (activeNote) {
      finalizePerformedNote(session, activeNote, timestampMs, tickEstimate, normalizedEvent.id)
      session.activePressedNotes.delete(key)
    }
  }

  return normalizedEvent
}

export const buildComparisonState = (song, session) => {
  const expected = getExpectedNotesAtTick(song, session.currentTickFloat)
  const activeNotes = getActivePressedNotes(session)
  const activePitchSet = new Set(activeNotes.map((note) => note.pitch))
  const expectedPitchSet = new Set(expected.all.map((note) => note.pitch))

  return {
    expected: {
      left: expected.left.map((note) => ({ ...note, matched: activePitchSet.has(note.pitch) })),
      right: expected.right.map((note) => ({ ...note, matched: activePitchSet.has(note.pitch) })),
      all: expected.all.map((note) => ({ ...note, matched: activePitchSet.has(note.pitch) })),
    },
    activeNotes,
    extraNotes: activeNotes.filter((note) => !expectedPitchSet.has(note.pitch)),
  }
}

export const formatTickLocation = (tickFloat) => {
  const tick = Math.max(0, Math.floor(tickFloat))
  const measure = Math.floor(tick / TICKS_PER_MEASURE) + 1
  const beat = Math.floor((tick % TICKS_PER_MEASURE) / TICKS_PER_BEAT) + 1
  const subTick = tick % TICKS_PER_BEAT
  return { measure, beat, subTick }
}

export const formatTickSpan = (durationTick) => `${(durationTick / TICKS_PER_BEAT).toFixed(durationTick % TICKS_PER_BEAT === 0 ? 0 : 2)} 拍`
