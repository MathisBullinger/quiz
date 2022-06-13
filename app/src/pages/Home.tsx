import React from 'react'
import Button from 'components/Button'
import * as styles from './Home.module.css'
import { useAPI } from '../api'
import { history } from 'itinero'

const Home = () => {
  const api = useAPI()

  const onCreateQuiz = async () => {
    const result = await api.createQuiz()
    history.push(`/edit/${result.key}`)
  }

  return (
    <div className={styles.home}>
      <Button onClick={onCreateQuiz}>Create new Quiz</Button>
    </div>
  )
}

export default Home
