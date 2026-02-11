export const PITCH_CLASS_TO_NAME = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"]
export const PITCH_CLASS_TO_LABEL = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
export const NOTE_LETTER_TO_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

export const DEFAULT_GLOBAL_RANGE = { min: 36, max: 95 } // C2 - B6
export const DEFAULT_TREBLE_RANGE = { min: 60, max: 83 } // C4 - B5
export const DEFAULT_BASS_RANGE = { min: 36, max: 59 } // C2 - B3

export const NOTES_PER_MEASURE = 4
export const DEFAULT_INTERVAL_SECONDS = 1.6

export const SSE_URL = "http://localhost:8766/events"
export const MIDI_KEYWORDS = ["SAP200", "MEDELI", "MIDI"]
