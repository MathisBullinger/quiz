import type { APIGatewayEvent } from 'aws-lambda'
import { generate } from './util/key'
import * as db from './db'
import pick from 'froebel/pick'
import { respond } from './response'
import * as md from './util/markdown'

export const create = async () => {
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
      .put({
        pk: quizId,
        sk: 'status',
        key,
        status: 'pending',
        players: [],
        questions: [],
      })
      .ifNotExists(),
  ])

  return respond(200, { body: { key, quizId } })
}

const mapQuestion = ({ sk, ...rest }: any) => ({
  ...pick(
    rest,
    'question',
    'timeLimit',
    'showPreview',
    'previewDuration',
    'previewText',
    'answerType',
    'options',
    'correctAnswer'
  ),
  id: sk.replace(/^question#/, ''),
})

export const getQuizEdit = async (event: APIGatewayEvent) => {
  const results = await db.question.query(event.pathParameters!.key!)

  const mainItem: any = results.items.find(({ sk }) => sk.startsWith('id#'))
  if (!mainItem) return respond(404, { body: '' })

  const questions = results.items
    .filter(({ sk }) => sk.startsWith('question#'))
    .map(mapQuestion)

  return respond(200, {
    body: {
      quizId: mainItem.sk.replace(/^id#/, ''),
      title: mainItem.title,
      questions,
    },
  })
}

export const editMeta = async (event: APIGatewayEvent) => {
  try {
    const { key, id, meta } = JSON.parse(event.body!)
    if (!key || !id) return respond(500, { body: 'must provide key and id' })

    await Promise.all([
      db.edit.update([key, `id#${id}`], { title: meta.title }).ifExists(),
      db.quiz.update([id, 'status'], { title: meta.title }).ifExists(),
    ])

    return respond(200)
  } catch (err) {
    console.error(err)
    return respond(500)
  }
}

export const addQuestion = async (event: APIGatewayEvent) => {
  try {
    const { key, id } = JSON.parse(event.body!)
    if (!key || !id) return respond(500, { body: 'must provide key and id' })

    const questionId = generate(8)

    const question = {
      pk: key,
      sk: `question#${questionId}`,
      question: '',
      timeLimit: 60,
      showPreview: false,
      previewDuration: 30,
      previewText: '',
      answerType: 'free-text',
      options: [],
    }

    await Promise.all([
      db.edit.update([key, `id#${id}`]).push({ questions: [questionId] }),
      db.question.update([id, 'status']).push({ questions: [questionId] }),
      db.question.put(question),
    ])

    return respond(200, { body: mapQuestion(question) })
  } catch (err) {
    console.error(err)
    return respond(500)
  }
}

export const editQuestion = async (event: APIGatewayEvent) => {
  try {
    const { key, questionId, data: rawData } = JSON.parse(event.body!)
    if (!key || !questionId)
      return respond(500, { body: 'must provide key and question id' })

    const data = pick(
      rawData,
      'question',
      'timeLimit',
      'showPreview',
      'previewDuration',
      'previewText',
      'answerType',
      'correctAnswer'
    ) as any

    if (data.previewText) data.previewText = md.convert(data.previewText)
    if (data.questionText) data.questionText = md.convert(data.questionText)

    await db.question.update([key, `question#${questionId}`], data).ifExists()

    return respond(200)
  } catch (err) {
    console.error(err)
    return respond(500)
  }
}

export const addAnswer = async (event: APIGatewayEvent) => {
  try {
    const { key, questionId } = JSON.parse(event.body!)
    if (!key || !questionId)
      return respond(500, { body: 'must provide key and question id' })

    const answer = { id: generate(8), text: '' }
    await db.question
      .update([key, `question#${questionId}`])
      .push({ options: [answer] })

    return respond(200, { body: answer })
  } catch (err) {
    console.error(err)
    return respond(500)
  }
}

export const editAnswer = async (event: APIGatewayEvent) => {
  try {
    const { key, questionId, answerId, text } = JSON.parse(event.body!)
    if (!key || !questionId || !answerId || !text)
      return respond(500, { body: 'must provide key, question and asnwer id' })

    const question = await db.question.get(key, `question#${questionId}`)
    const answerIndex = question?.options.findIndex(({ id }) => id === answerId)
    if (answerIndex < 0) return respond(404, { body: '' })

    await db.question.update([key, `question#${questionId}`], {
      [`options[${answerIndex}].text`]: text,
    } as any)

    return respond(200)
  } catch (err) {
    console.error(err)
    return respond(500)
  }
}

export const deleteAnswer = async (event: APIGatewayEvent) => {
  try {
    const { key, questionId, answerId } = JSON.parse(event.body!)
    if (!key || !questionId || !answerId)
      return respond(500, { body: 'must provide key, question and asnwer id' })

    const question = await db.question.get(key, `question#${questionId}`)
    const answerIndex = question?.options.findIndex(({ id }) => id === answerId)

    if (answerIndex >= 0)
      await db.question
        .update([key, `question#${questionId}`])
        .remove(`options[${answerIndex}]`)

    return respond(200)
  } catch (err) {
    console.error(err)
    return respond(500)
  }
}
