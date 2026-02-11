import { MIDI_KEYWORDS, SSE_URL } from "./constants.js"
import { decodeWebMidiMessage, EVENT_SOURCE, normalizeIncomingEvent } from "./eventModel.js"

export const createMidiAdapters = ({
  setDebugBox,
  onEvent,
  onConnectionEvent,
  sseUrl = SSE_URL,
}) => {
  let liveSource = null
  let liveUserDisconnected = true
  let webMidiAccess = null
  let webMidiInput = null
  let webMidiEnabled = false

  const disconnectSse = () => {
    liveUserDisconnected = true
    if (liveSource) {
      liveSource.close()
      liveSource = null
    }
    onConnectionEvent("DISCONNECT")
  }

  const connectSse = () => {
    if (!window.EventSource) {
      setDebugBox("浏览器不支持 EventSource（SSE）", "error")
      return
    }
    liveUserDisconnected = false
    if (liveSource) {
      liveSource.close()
      liveSource = null
    }

    onConnectionEvent("CONNECT_REQUEST")
    try {
      liveSource = new EventSource(sseUrl)
      liveSource.onopen = () => onConnectionEvent("CONNECT_OPEN")
      liveSource.onerror = () => {
        if (liveUserDisconnected) {
          onConnectionEvent("DISCONNECT")
        } else {
          onConnectionEvent("CONNECT_ERROR")
        }
      }
      liveSource.onmessage = (evt) => {
        let raw
        try {
          raw = JSON.parse(evt.data)
        } catch {
          return
        }
        const normalized = normalizeIncomingEvent(raw, EVENT_SOURCE.SSE)
        if (!normalized) return
        setDebugBox(`SSE 收包：${evt.data}`)
        onEvent(normalized)
      }
    } catch {
      onConnectionEvent("DISCONNECT")
    }
  }

  const stopWebMidi = () => {
    if (webMidiInput) {
      webMidiInput.onmidimessage = null
    }
    webMidiAccess = null
    webMidiInput = null
    webMidiEnabled = false
    setDebugBox("WebMIDI 已断开")
  }

  const pickInput = (access) => {
    const inputs = Array.from(access.inputs.values())
    if (!inputs.length) return null
    for (const kw of MIDI_KEYWORDS) {
      const found = inputs.find((input) => (input.name || "").toUpperCase().includes(kw))
      if (found) return found
    }
    return inputs[0]
  }

  const startWebMidi = async () => {
    if (!navigator || !navigator.requestMIDIAccess) {
      setDebugBox("浏览器不支持 WebMIDI（建议使用 Chrome / Edge）", "error")
      return false
    }
    try {
      webMidiAccess = await navigator.requestMIDIAccess({ sysex: false })
      webMidiInput = pickInput(webMidiAccess)
      if (!webMidiInput) {
        setDebugBox("未发现浏览器可用的 MIDI 输入设备", "error")
        return false
      }
      webMidiEnabled = true
      setDebugBox(`WebMIDI 已连接：${webMidiInput.name || webMidiInput.id}`)
      webMidiInput.onmidimessage = (evt) => {
        const decoded = decodeWebMidiMessage(evt.data)
        if (!decoded) return
        const normalized = normalizeIncomingEvent(decoded, EVENT_SOURCE.WEB_MIDI)
        if (!normalized) return
        onEvent(normalized)
        if (normalized.type === "control_change") {
          setDebugBox(
            `WebMIDI 收包：cc ch=${normalized.channel} cc=${normalized.control} value=${normalized.value}`
          )
          return
        }
        setDebugBox(
          `WebMIDI 收包：${normalized.type} ch=${normalized.channel} note=${normalized.note} vel=${normalized.velocity ?? 0} edge=${normalized.edge || "n/a"}`
        )
      }
      return true
    } catch (e) {
      setDebugBox((e && e.stack) || (e && e.message) || String(e), "error")
      return false
    }
  }

  return {
    connectSse,
    disconnectSse,
    startWebMidi,
    stopWebMidi,
    isWebMidiEnabled: () => webMidiEnabled,
    isLiveUserDisconnected: () => liveUserDisconnected,
  }
}
