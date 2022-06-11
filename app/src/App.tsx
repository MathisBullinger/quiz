import React from 'react'
import { Switch, Route, Redirect } from 'itinero'
import Home from './pages/Home'
import Edit from './pages/Edit'
import * as Context from './context'
import MessageStack from 'components/MessageStack'

const App = () => (
  <Context.Provider>
    <MessageStack />
    <Switch>
      <Route path="/">{Home}</Route>
      <Route path="/edit/:key">{Edit}</Route>
      <Redirect to="/" />
    </Switch>
  </Context.Provider>
)

export default App
