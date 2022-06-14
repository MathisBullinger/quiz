import React from 'react'
import { Switch, Route, Redirect } from 'itinero'
import Home from './pages/Home'
import Edit from './pages/Edit'
import Quiz from './pages/Quiz'
import Host from './pages/Host'
import * as Context from './context'
import MessageStack from 'components/MessageStack'

const App = () => (
  <Context.Provider>
    <MessageStack />
    <Switch>
      <Route path="/">{Home}</Route>
      <Route path="/edit/:key">{Edit}</Route>
      <Route path="/:id">{Quiz}</Route>
      <Route path="/host/:key/:id">{Host}</Route>
      <Redirect to="/" />
    </Switch>
  </Context.Provider>
)

export default App
