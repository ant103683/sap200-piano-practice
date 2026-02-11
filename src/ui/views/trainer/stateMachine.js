export const CONNECTION_STATE = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  RECONNECTING: "reconnecting",
}

export const TRAINING_STATE = {
  READY: "ready",
  RUNNING: "running",
  AUTO_RUNNING: "auto_running",
}

export class TrainerStateMachine {
  constructor() {
    this.connection = CONNECTION_STATE.DISCONNECTED
    this.training = TRAINING_STATE.READY
  }

  transitionConnection(event) {
    switch (event) {
      case "CONNECT_REQUEST":
        this.connection = CONNECTION_STATE.CONNECTING
        break
      case "CONNECT_OPEN":
        this.connection = CONNECTION_STATE.CONNECTED
        break
      case "CONNECT_ERROR":
        this.connection = CONNECTION_STATE.RECONNECTING
        break
      case "DISCONNECT":
        this.connection = CONNECTION_STATE.DISCONNECTED
        break
      default:
        break
    }
    return this.connection
  }

  transitionTraining(event) {
    switch (event) {
      case "NEXT_TARGET":
        if (this.training !== TRAINING_STATE.AUTO_RUNNING) {
          this.training = TRAINING_STATE.RUNNING
        }
        break
      case "AUTO_START":
        this.training = TRAINING_STATE.AUTO_RUNNING
        break
      case "AUTO_STOP":
        this.training = TRAINING_STATE.RUNNING
        break
      case "RESET":
        this.training = TRAINING_STATE.READY
        break
      default:
        break
    }
    return this.training
  }
}
