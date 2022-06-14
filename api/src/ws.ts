import type { APIGatewayEvent } from 'aws-lambda'
import * as db from './db'
import * as auth from './util/auth'
import { generate } from './util/key'
import { ApiGatewayManagementApi } from 'aws-sdk'
import pick from 'froebel/pick'
import { DBRecord } from 'ddbjs'

let gateway: ApiGatewayManagementApi

const wsPost = async (ConnectionId: string, data: Record<string, unknown>) =>
  await gateway
    .postToConnection({ ConnectionId, Data: JSON.stringify(data) })
    .promise()

export const handler = async (event: APIGatewayEvent) => {
  if (!gateway)
    gateway = new ApiGatewayManagementApi({
      endpoint:
        process.env.stage === 'dev'
          ? 'http://localhost:3001'
          : `${event.requestContext.domainName}/${event.requestContext.stage}`,
    })

  if (event.requestContext.routeKey === '$connect') {
    return { statusCode: 200 }
  }
  if (event.requestContext.routeKey === '$disconnect') {
    const conInfo = await db.connection.get(
      event.requestContext.connectionId!,
      'connectionId'
    )
    if (conInfo)
      await Promise.all([
        ...conInfo.quizzes.map(quizId =>
          db.quiz.get(quizId, 'status').then(quiz => {
            const playerIndex = quiz.players.find(
              ({ id }) => id === conInfo.userId
            )
            if (playerIndex < 0) return
            db.quiz.update([quizId, 'status']).remove(`players[${playerIndex}]`)
          })
        ),
        ...conInfo.hosts.map(key =>
          db.host
            .update([key, 'host'])
            .delete({ hosts: [event.requestContext.connectionId!] })
        ),
      ])

    return { statusCode: 200 }
  }

  try {
    const msg = JSON.parse(event.body!)
    await handlers[msg.type]?.(msg, event.requestContext.connectionId!)
    return { statusCode: 200 }
  } catch (err) {
    console.error(err)
    return { statusCode: 500 }
  }
}

const handlers: Record<
  string,
  (payload: Record<string, string>, connectionId: string) => Promise<void>
> = {
  join: async ({ quizId }, connectionId) => {
    if (!quizId || !connectionId)
      throw Error('must provide quizId and connectionId')

    const player = {
      id: generate(16),
      name: 'Unnamed Player',
      connectionId,
    }

    const [quizData] = await Promise.all([
      db.quiz
        .update([quizId, 'status'])
        .push({ players: [player] })
        .ifExists()
        .returning('NEW'),
      db.connection
        .update([connectionId, 'connection'], {
          userId: player.id,
          ttl: connectionTTL(),
        })
        .add({ quizzes: [quizId] }),
    ])

    const peers = quizData.players
      ?.filter(({ id }) => id !== player.id)
      .map(filterPlayerPublic)

    await respondInit(connectionId, player, peers ?? [])
  },
  restore: async ({ quizId, auth: token }, connectionId) => {
    const userId = auth.getUserId(token)
    if (!quizId || !userId) throw Error('must provide quizId & auth')

    const [quizData] = await Promise.all([
      db.quiz.get(quizId, 'status'),
      db.connection
        .update([connectionId, 'connection'], {
          userId: userId,
          ttl: connectionTTL(),
        })
        .add({ quizzes: [quizId] }),
    ])

    let player = quizData.players.find(({ id }) => id === userId)
    const peers = quizData.players.filter(v => v !== player)

    if (!player) {
      player = {
        id: generate(16),
        name: 'Unnamed Player',
        connectionId,
      }
      await db.quiz.update([quizId, 'status']).push({ players: [player] })
    }

    await respondInit(connectionId, player, peers)
  },
  host: async ({ quizKey, quizId }, connectionId) => {
    if (!quizKey || !quizId) throw Error('must provide quiz key & id')

    const [quizInfo] = await Promise.all([
      db.quiz.get(quizId, 'status'),
      db.host.update([quizKey, 'host']).add({ hosts: [connectionId] }),
      db.connection
        .update([connectionId, 'connection'], { ttl: connectionTTL() })
        .add({ hosts: [quizKey] }),
    ])

    await sendQuizInfo(connectionId, quizInfo)
  },
}

const respondInit = async (connectionId: string, player: any, peers: any[]) => {
  await Promise.all([
    wsPost(connectionId, {
      type: 'user',
      ...player,
      auth: auth.createAuthToken(player.id),
    }),
    (peers?.length ?? 0) > 0 &&
      wsPost(connectionId, {
        type: 'peers',
        peers,
      }),
  ])
}

const sendQuizInfo = async (
  host: string,
  { pk: id, sk, ...data }: DBRecord<typeof db['quiz']>
) => {
  await wsPost(host, { type: 'quizInfo', ...data, id })
}

const filterPlayerPublic = (data: any) => pick(data, 'id', 'name')
const connectionTTL = () =>
  Math.round(new Date(Date.now() + 1000 * 60 * 60 * 24).getTime() / 1000)
