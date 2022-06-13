export const ws = new WebSocket(process.env.WS_ENDPOINT!)

ws.onerror = console.error

type Msg = Record<string, string>
let sendQueue: Msg[] = []

ws.onopen = () => {
  sendQueue.forEach(msg => ws.send(JSON.stringify(msg)))
  sendQueue = []
}

export const send = (msg: Msg) => {
  if (ws.readyState !== 1) sendQueue.push(msg)
  else ws.send(JSON.stringify(msg))
}
