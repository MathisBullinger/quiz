import { useEffect, useState } from 'react'

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

ws.onmessage = event => {
  const data = JSON.parse(event.data)
  if (!data.type) return
  ;(eventMap[data.type] ??= {}).lastData = data
  eventMap[data.type].subscribers?.forEach(cb => cb(data))
}

type EventSubscriber<T> = (data: T) => void

const eventMap: {
  [K in keyof EventMap]?: {
    lastData?: EventMap[K]
    subscribers?: EventSubscriber<EventMap[K]>[]
  }
} = {}

export const useSubscribe = <T extends keyof EventMap>(type: T) => {
  const [data, setData] = useState<EventMap[T] | undefined>(
    eventMap[type]?.lastData
  )

  useEffect(() => {
    ;((eventMap[type] ??= {} as any).subscribers ??= []).push(setData)

    return () => {
      eventMap[type].subscribers.splice(
        eventMap[type].subscribers.indexOf(setData),
        1
      )
    }
  }, [])

  return data
}

export type Player = {
  id: string
  name: string
  auth?: string
  scores: number[]
  answers: string[]
}
export type QuizInfo = {
  quizId: string
  quizKey: string
  title: string
  players: Player[]
  status: string
  question?: {
    id: string
    previewText?: string
    question?: string
    answerType?: 'free-text' | 'multiple-choice'
    options?: { id: string; text: string }[]
    closes?: number
    correctAnswer?: string
  }
}

export type QuizInfoPlayer = Omit<QuizInfo, 'players'> & {
  player: Player
  peers: Player[]
}

type EventMap = {
  peers: { peers: Player[] }
  quizInfo: QuizInfo
  quizStatus: QuizInfoPlayer
}
