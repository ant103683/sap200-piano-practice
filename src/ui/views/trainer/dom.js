export const queryRequired = (id) => {
  const el = document.getElementById(id)
  if (!el) {
    throw new Error(`缺少元素: #${id}`)
  }
  return el
}

export const createTrainerRefs = () => ({
  appConnectionState: document.getElementById("app-connection-state"),
  appTrainingState: document.getElementById("app-training-state"),
  liveConnectButton: queryRequired("live-connect"),
  liveStatusLabel: queryRequired("live-status"),
  pedalDot: queryRequired("pedal-dot"),
  randomButton: queryRequired("random-note"),
  toggleAutoButton: queryRequired("toggle-auto"),
  liveClearButton: queryRequired("live-clear"),
  webMidiToggleButton: queryRequired("webmidi-toggle"),
  liveReuseLineCheckbox: queryRequired("live-reuse-line"),
  intervalInput: queryRequired("interval"),
  intervalNum: queryRequired("interval-num"),
  intervalValue: queryRequired("interval-value"),
  scoreRandomRoot: queryRequired("score-random"),
  scoreLiveRoot: queryRequired("score-live"),
  showNameCheckbox: queryRequired("show-name"),
  scoreTotalEl: queryRequired("score-total"),
  scoreGoodEl: queryRequired("score-good"),
  scoreBadEl: queryRequired("score-bad"),
  dualModeCheckbox: queryRequired("dual-mode"),
  rangeStartInput: queryRequired("range-start"),
  rangeEndInput: queryRequired("range-end"),
  rangeCurrentLabel: queryRequired("range-current"),
  trebleRangeStartInput: queryRequired("treble-range-start"),
  trebleRangeEndInput: queryRequired("treble-range-end"),
  rangeCurrentTrebleLabel: queryRequired("range-current-treble"),
  bassRangeStartInput: queryRequired("bass-range-start"),
  bassRangeEndInput: queryRequired("bass-range-end"),
  rangeCurrentBassLabel: queryRequired("range-current-bass"),
  avgTimeEl: queryRequired("avg-time"),
  fastestTimeEl: queryRequired("fastest-time"),
  fastestNameEl: queryRequired("fastest-name"),
  slowestTimeEl: queryRequired("slowest-time"),
  slowestNameEl: queryRequired("slowest-name"),
  debugBox: queryRequired("debug-box"),
})

