export const formatSeconds = (ms) => {
  if (ms == null) return "—"
  return `${(ms / 1000).toFixed(2)}s`
}

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

