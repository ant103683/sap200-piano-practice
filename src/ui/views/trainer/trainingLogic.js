const randomIntInclusive = (min, max) => min + Math.floor(Math.random() * (max - min + 1))

export const chooseNextTarget = ({ settings, range, trebleRange, bassRange }, now = performance.now()) => {
  const randomPositionIndex = randomIntInclusive(1, 3)
  if (settings.dualMode) {
    return {
      randomMidiValue: null,
      randomTargetTreble: randomIntInclusive(trebleRange.min, trebleRange.max),
      randomTargetBass: randomIntInclusive(bassRange.min, bassRange.max),
      hitTreble: false,
      hitBass: false,
      randomPositionIndex,
      randomStartAt: now,
    }
  }

  return {
    randomMidiValue: randomIntInclusive(range.min, range.max),
    randomTargetTreble: null,
    randomTargetBass: null,
    hitTreble: false,
    hitBass: false,
    randomPositionIndex,
    randomStartAt: now,
  }
}

export const evaluateHit = ({ settings, training }, note) => {
  if (!settings.dualMode) {
    if (typeof training.randomMidiValue !== "number") {
      return { scoreDelta: null, nextHit: null, advanced: false, noteForMetric: null }
    }
    if (note === training.randomMidiValue) {
      return {
        scoreDelta: { good: 1, bad: 0, total: 1 },
        nextHit: { hitTreble: false, hitBass: false },
        advanced: true,
        noteForMetric: training.randomMidiValue,
      }
    }
    return {
      scoreDelta: { good: 0, bad: 1, total: -1 },
      nextHit: null,
      advanced: false,
      noteForMetric: null,
    }
  }

  const trebleTarget = training.randomTargetTreble
  const bassTarget = training.randomTargetBass
  const hitTreble = !!training.hitTreble
  const hitBass = !!training.hitBass

  if (!hitTreble && typeof trebleTarget === "number" && note === trebleTarget) {
    return {
      scoreDelta: { good: 1, bad: 0, total: 1 },
      nextHit: { hitTreble: true, hitBass },
      advanced: hitBass,
      noteForMetric: hitBass ? trebleTarget : null,
    }
  }

  if (!hitBass && typeof bassTarget === "number" && note === bassTarget) {
    return {
      scoreDelta: { good: 1, bad: 0, total: 1 },
      nextHit: { hitTreble, hitBass: true },
      advanced: hitTreble,
      noteForMetric: hitTreble ? trebleTarget : null,
    }
  }

  if (note !== trebleTarget && note !== bassTarget) {
    return {
      scoreDelta: { good: 0, bad: 1, total: -1 },
      nextHit: null,
      advanced: false,
      noteForMetric: null,
    }
  }

  return { scoreDelta: null, nextHit: null, advanced: false, noteForMetric: null }
}

