import { CONNECTION_STATE } from "./stateMachine.js"
import { chooseNextTarget } from "./trainingLogic.js"

export const setSustain = (store, on) => {
  store.live.sustainOn = !!on
}

export const updateConnectionFromEvent = (store, machine, event) => {
  machine.transitionConnection(event)
  store.connection.liveConnected = machine.connection === CONNECTION_STATE.CONNECTED
  return machine.connection
}

export const setGlobalRange = (store, min, max) => {
  store.range = { min, max }
  store.lastValidRange = { min, max }
}

export const setTrebleRange = (store, min, max) => {
  store.trebleRange = { min, max }
}

export const setBassRange = (store, min, max) => {
  store.bassRange = { min, max }
}

export const setDualMode = (store, enabled) => {
  store.settings.dualMode = !!enabled
}

export const setShowName = (store, enabled) => {
  store.settings.showName = !!enabled
}

export const setLiveReuseLine = (store, enabled) => {
  store.settings.liveReuseLine = !!enabled
}

export const setIntervalSeconds = (store, seconds) => {
  store.settings.intervalSeconds = seconds
}

export const advanceToNextTarget = (store, machine, now = performance.now()) => {
  const next = chooseNextTarget(store, now)
  store.training.randomMidiValue = next.randomMidiValue
  store.training.randomTargetTreble = next.randomTargetTreble
  store.training.randomTargetBass = next.randomTargetBass
  store.training.hitTreble = next.hitTreble
  store.training.hitBass = next.hitBass
  store.training.randomPositionIndex = next.randomPositionIndex
  store.training.randomStartAt = next.randomStartAt
  machine.transitionTraining("NEXT_TARGET")
}

export const enableAutoTraining = (store, machine, onTick) => {
  if (store.training.autoTimer) {
    clearInterval(store.training.autoTimer)
  }
  const intervalMs = store.settings.intervalSeconds * 1000
  store.training.autoTimer = setInterval(() => {
    onTick()
  }, intervalMs)
  machine.transitionTraining("AUTO_START")
}

export const disableAutoTraining = (store, machine) => {
  if (store.training.autoTimer) {
    clearInterval(store.training.autoTimer)
    store.training.autoTimer = null
  }
  machine.transitionTraining("AUTO_STOP")
}

export const applyHitResult = (store, result) => {
  if (!result) return false
  if (result.nextHit) {
    store.training.hitTreble = !!result.nextHit.hitTreble
    store.training.hitBass = !!result.nextHit.hitBass
  }
  if (result.scoreDelta) {
    store.score.good += result.scoreDelta.good
    store.score.bad += result.scoreDelta.bad
    store.score.total += result.scoreDelta.total
    return true
  }
  return false
}

export const recordHitDuration = (store, noteForMetric, now = performance.now()) => {
  if (noteForMetric == null) return false
  if (store.training.randomStartAt == null) return false
  const dt = Math.max(0, now - store.training.randomStartAt)
  store.score.durations.push(dt)
  if (store.score.fastest == null || dt < store.score.fastest) {
    store.score.fastest = dt
    store.score.fastestNote = noteForMetric
  }
  if (store.score.slowest == null || dt > store.score.slowest) {
    store.score.slowest = dt
    store.score.slowestNote = noteForMetric
  }
  return true
}

export const averageWithoutExtremes = (durations) => {
  if (!Array.isArray(durations) || durations.length < 3) return null
  let min = Infinity
  let max = -Infinity
  let sum = 0
  for (const d of durations) {
    if (d < min) min = d
    if (d > max) max = d
    sum += d
  }
  return (sum - min - max) / (durations.length - 2)
}
