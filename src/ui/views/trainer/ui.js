import { averageWithoutExtremes } from "./actions.js"
import { CONNECTION_STATE, TRAINING_STATE } from "./stateMachine.js"

export const createTrainerUi = ({ refs, store, machine, nameForMidi, formatSeconds }) => {
  const renderScoreboard = () => {
    refs.scoreTotalEl.textContent = String(store.score.total)
    refs.scoreGoodEl.textContent = String(store.score.good)
    refs.scoreBadEl.textContent = String(store.score.bad)
  }

  const renderMetrics = () => {
    const avg = averageWithoutExtremes(store.score.durations)
    refs.avgTimeEl.textContent = avg == null ? "—" : formatSeconds(avg)
    refs.fastestTimeEl.textContent = formatSeconds(store.score.fastest)
    refs.slowestTimeEl.textContent = formatSeconds(store.score.slowest)
    refs.fastestNameEl.textContent = store.score.fastestNote == null ? "—" : nameForMidi(store.score.fastestNote)
    refs.slowestNameEl.textContent = store.score.slowestNote == null ? "—" : nameForMidi(store.score.slowestNote)
  }

  const renderTrainingState = () => {
    const byState = {
      [TRAINING_STATE.READY]: "就绪",
      [TRAINING_STATE.RUNNING]: "训练中",
      [TRAINING_STATE.AUTO_RUNNING]: "自动训练",
    }
    const label = byState[machine.training] || "就绪"
    if (refs.appTrainingState) {
      refs.appTrainingState.textContent = `训练状态：${label}`
      refs.appTrainingState.dataset.state = machine.training
    }
  }

  const renderConnectionState = () => {
    if (machine.connection === CONNECTION_STATE.CONNECTED) {
      refs.liveStatusLabel.textContent = "已连接"
      refs.liveConnectButton.textContent = "断开"
      refs.liveConnectButton.className = "btn btn-danger"
      refs.liveStatusLabel.dataset.state = machine.connection
      if (refs.appConnectionState) {
        refs.appConnectionState.textContent = "连接状态：已连接"
        refs.appConnectionState.dataset.state = machine.connection
      }
      return
    }
    if (machine.connection === CONNECTION_STATE.CONNECTING) {
      refs.liveStatusLabel.textContent = "连接中..."
      refs.liveConnectButton.textContent = "断开"
      refs.liveConnectButton.className = "btn btn-danger"
      refs.liveStatusLabel.dataset.state = machine.connection
      if (refs.appConnectionState) {
        refs.appConnectionState.textContent = "连接状态：连接中"
        refs.appConnectionState.dataset.state = machine.connection
      }
      return
    }
    if (machine.connection === CONNECTION_STATE.RECONNECTING) {
      refs.liveStatusLabel.textContent = "重连中..."
      refs.liveConnectButton.textContent = "断开"
      refs.liveConnectButton.className = "btn btn-danger"
      refs.liveStatusLabel.dataset.state = machine.connection
      if (refs.appConnectionState) {
        refs.appConnectionState.textContent = "连接状态：重连中"
        refs.appConnectionState.dataset.state = machine.connection
      }
      return
    }
    refs.liveStatusLabel.textContent = "未连接"
    refs.liveConnectButton.textContent = "连接"
    refs.liveConnectButton.className = "btn btn-primary"
    refs.liveStatusLabel.dataset.state = machine.connection
    if (refs.appConnectionState) {
      refs.appConnectionState.textContent = "连接状态：未连接"
      refs.appConnectionState.dataset.state = machine.connection
    }
  }

  const renderSustain = (on) => {
    refs.pedalDot.className = on ? "dot on" : "dot"
  }

  const renderInterval = (seconds) => {
    refs.intervalInput.value = String(Math.min(12, seconds))
    refs.intervalNum.value = String(seconds.toFixed(1))
    refs.intervalValue.textContent = `${seconds.toFixed(1)}s`
  }

  const renderRanges = ({ min, max }, { trebleMin, trebleMax }, { bassMin, bassMax }) => {
    refs.rangeCurrentLabel.textContent = `当前范围：${nameForMidi(min)} 至 ${nameForMidi(max)}`
    refs.rangeCurrentTrebleLabel.textContent = `右：${nameForMidi(trebleMin)} 至 ${nameForMidi(trebleMax)}`
    refs.rangeCurrentBassLabel.textContent = `左：${nameForMidi(bassMin)} 至 ${nameForMidi(bassMax)}`
  }

  return {
    renderScoreboard,
    renderMetrics,
    renderTrainingState,
    renderConnectionState,
    renderSustain,
    renderInterval,
    renderRanges,
  }
}
