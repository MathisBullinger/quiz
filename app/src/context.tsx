import React, { createContext, useContext, useState, useRef, FC } from 'react'

type Error = { type: 'warning' | 'error'; message: string; id: number }

type Context = {
  errors: Error[]
  pushError(error: Omit<Error, 'id'>): void
}

export const AppContext = createContext<Context>({ errors: [], pushError() {} })

export const useAppContext = () => useContext(AppContext)

export const Provider: FC<{ children: React.ReactNode }> = ({ children }) => {
  const [errors, setErrors] = useState<Error[]>([])
  const errorCount = useRef(0)
  const errorRef = useRef(errors)
  errorRef.current = errors

  const pushError = (error: Omit<Error, 'id'>) => {
    const item = { ...error, id: errorCount.current++ }
    setErrors([...errors, item])

    setTimeout(() => {
      setErrors(errorRef.current.filter(({ id }) => id !== item.id))
    }, 5000)
  }

  return (
    <AppContext.Provider value={{ errors, pushError }}>
      {children}
    </AppContext.Provider>
  )
}
