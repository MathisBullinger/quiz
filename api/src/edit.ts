import type { APIGatewayProxyResult, APIGatewayEvent } from 'aws-lambda'
import { generate } from './util/key'
import * as db from './db'
import pick from 'froebel/pick'

export const create = async (): Promise<APIGatewayProxyResult> => {
  const key = generate(8)
  const quizId = generate(4)

  await Promise.all([
    db.edit
      .put({
        pk: key,
        sk: `id#${quizId}`,
        title: 'Untitled Quiz',
        questions: [],
      })
      .ifNotExists(),
    db.quiz
      .put({ pk: quizId, sk: 'status', key, status: 'pending', players: [] })
      .ifNotExists(),
  ])

  return { statusCode: 200, body: JSON.stringify({ key, quizId }) }
}

const mapQuestion = ({ sk, ...rest }: any) => ({
  ...pick(
    rest,
    'question',
    'showPreview',
    'previewDuration',
    'previewText',
    'answerType',
    'options'
  ),
  id: sk.replace(/^question#/, ''),
})

export const getQuizEdit = async (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  const results = await db.question.query(event.pathParameters!.key!)

  const mainItem: any = results.items.find(({ sk }) => sk.startsWith('id#'))
  if (!mainItem) return { statusCode: 404, body: '' }

  const questions = results.items
    .filter(({ sk }) => sk.startsWith('question#'))
    .map(mapQuestion)

  return {
    statusCode: 200,
    body: JSON.stringify({
      quizId: mainItem.sk.replace(/^id#/, ''),
      title: mainItem.title,
      questions,
    }),
  }
}

export const editMeta = async (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const { key, id, meta } = JSON.parse(event.body!)
    if (!key || !id) return { statusCode: 500, body: 'must provide key and id' }

    await Promise.all([
      db.edit.update([key, `id#${id}`], { title: meta.title }).ifExists(),
      db.quiz.update([id, 'status'], { title: meta.title }).ifExists(),
    ])

    return { statusCode: 200, body: '' }
  } catch (err) {
    console.error(err)
    return { statusCode: 500, body: '' }
  }
}

export const addQuestion = async (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const { key, id } = JSON.parse(event.body!)
    if (!key || !id) return { statusCode: 500, body: 'must provide key and id' }

    const questionId = generate(8)

    const question = {
      pk: key,
      sk: `question#${questionId}`,
      question: '',
      showPreview: false,
      previewDuration: 30,
      previewText: '',
      answerType: 'free-text',
      options: [],
    }

    await Promise.all([
      db.edit.update([key, `id#${id}`]).push({ questions: [questionId] }),
      db.question.put(question),
    ])

    return { statusCode: 200, body: JSON.stringify(mapQuestion(question)) }
  } catch (err) {
    console.error(err)
    return { statusCode: 500, body: '' }
  }
}

export const editQuestion = async (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const { key, questionId, data } = JSON.parse(event.body!)
    if (!key || !questionId)
      return { statusCode: 500, body: 'must provide key and question id' }

    await db.question
      .update(
        [key, `question#${questionId}`],
        pick(
          data,
          'question',
          'showPreview',
          'previewDuration',
          'previewText',
          'answerType'
        ) as any
      )
      .ifExists()

    return { statusCode: 200, body: '' }
  } catch (err) {
    console.error(err)
    return { statusCode: 500, body: '' }
  }
}

export const addAnswer = async (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const { key, questionId } = JSON.parse(event.body!)
    if (!key || !questionId)
      return { statusCode: 500, body: 'must provide key and question id' }

    const answer = { id: generate(8), text: '' }
    await db.question
      .update([key, `question#${questionId}`])
      .push({ options: [answer] })

    return { statusCode: 200, body: JSON.stringify(answer) }
  } catch (err) {
    console.error(err)
    return { statusCode: 500, body: '' }
  }
}

export const editAnswer = async (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const { key, questionId, answerId, text } = JSON.parse(event.body!)
    if (!key || !questionId || !answerId || !text)
      return {
        statusCode: 500,
        body: 'must provide key, question and asnwer id',
      }

    const question = await db.question.get(key, `question#${questionId}`)
    const answerIndex = question?.options.findIndex(({ id }) => id === answerId)
    if (answerIndex < 0) return { statusCode: 404, body: '' }

    await db.question.update([key, `question#${questionId}`], {
      [`options[${answerIndex}].text`]: text,
    } as any)

    return { statusCode: 200, body: '' }
  } catch (err) {
    console.error(err)
    return { statusCode: 500, body: '' }
  }
}

export const deleteAnswer = async (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const { key, questionId, answerId } = JSON.parse(event.body!)
    if (!key || !questionId || !answerId)
      return {
        statusCode: 500,
        body: 'must provide key, question and asnwer id',
      }

    const question = await db.question.get(key, `question#${questionId}`)
    const answerIndex = question?.options.findIndex(({ id }) => id === answerId)

    if (answerIndex >= 0)
      await db.question
        .update([key, `question#${questionId}`])
        .remove(`options[${answerIndex}]`)

    return { statusCode: 200, body: '' }
  } catch (err) {
    console.error(err)
    return { statusCode: 500, body: '' }
  }
}
