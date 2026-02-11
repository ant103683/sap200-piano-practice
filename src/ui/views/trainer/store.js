import {
  DEFAULT_BASS_RANGE,
  DEFAULT_GLOBAL_RANGE,
  DEFAULT_INTERVAL_SECONDS,
  DEFAULT_TREBLE_RANGE,
} from "./constants.js"

const cloneRange = (range) => ({ min: range.min, max: range.max })

export const createTrainerStore = () => ({
  settings: {
    intervalSeconds: DEFAULT_INTERVAL_SECONDS,
    dualMode: true,
    showName: true,
    liveReuseLine: true,
  },
  range: cloneRange(DEFAULT_GLOBAL_RANGE),
  lastValidRange: cloneRange(DEFAULT_GLOBAL_RANGE),
  trebleRange: cloneRange(DEFAULT_TREBLE_RANGE),
  bassRange: cloneRange(DEFAULT_BASS_RANGE),
  connection: {
    liveConnected: false,
  },
  training: {
    randomMidiValue: null,
    randomTargetTreble: null,
    randomTargetBass: null,
    randomPositionIndex: 2,
    hitTreble: false,
    hitBass: false,
    randomStartAt: null,
    autoTimer: null,
  },
  score: {
    total: 0,
    good: 0,
    bad: 0,
    durations: [],
    fastest: null,
    fastestNote: null,
    slowest: null,
    slowestNote: null,
  },
  live: {
    sustainOn: false,
  },
})
