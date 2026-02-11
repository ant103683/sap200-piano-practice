export const EVENT_SOURCE = {
  SSE: "sse",
  WEB_MIDI: "web_midi",
}

const asNumberOrNull = (value) => {
  if (value == null || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const asBooleanOrNull = (value) => {
  if (value === true || value === false) return value
  return null
}

const deriveEdge = (type, velocity, edge) => {
  if (edge === "down" || edge === "up") return edge
  if (type === "note_off") return "up"
  if (type !== "note_on") return null
  if ((velocity ?? 0) > 0) return "down"
  return "up"
}

export const normalizeIncomingEvent = (raw, source = EVENT_SOURCE.SSE) => {
  if (!raw || typeof raw !== "object") return null

  const type = typeof raw.type === "string" ? raw.type : null
  if (!type) return null

  const velocity = asNumberOrNull(raw.velocity)
  const normalized = {
    source,
    t: typeof raw.t === "string" ? raw.t : null,
    type,
    channel: asNumberOrNull(raw.channel),
    note: asNumberOrNull(raw.note),
    velocity,
    control: asNumberOrNull(raw.control),
    value: asNumberOrNull(raw.value),
    edge: deriveEdge(type, velocity, raw.edge),
    hold_ms: asNumberOrNull(raw.hold_ms),
    sustain: asBooleanOrNull(raw.sustain),
    pitch: asNumberOrNull(raw.pitch),
    program: asNumberOrNull(raw.program),
    pressure: asNumberOrNull(raw.pressure),
    data: raw.data && typeof raw.data === "object" ? raw.data : null,
  }

  if (normalized.type === "control_change" && normalized.control === 64 && normalized.sustain == null) {
    normalized.sustain = (normalized.value ?? 0) >= 64
  }

  return normalized
}

export const decodeWebMidiMessage = (data) => {
  if (!data || data.length < 2) return null
  const status = data[0]
  const type = status & 0xf0
  const channel = status & 0x0f

  if (type === 0x90) {
    const note = data[1]
    const velocity = data[2] ?? 0
    return {
      type: "note_on",
      channel,
      note,
      velocity,
      edge: velocity > 0 ? "down" : "up",
    }
  }

  if (type === 0x80) {
    return {
      type: "note_off",
      channel,
      note: data[1],
      velocity: data[2] ?? 0,
      edge: "up",
    }
  }

  if (type === 0xb0) {
    return {
      type: "control_change",
      channel,
      control: data[1],
      value: data[2] ?? 0,
    }
  }

  return null
}
