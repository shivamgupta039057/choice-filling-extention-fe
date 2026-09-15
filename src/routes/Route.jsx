import React from 'react'
import { Routes } from 'react-router-dom'
import Protected from './ProtectedRoutes'

const Route = () => {
  return (
     <>
       <Routes>
        <Route
              key={item?.path}
              path={item?.path}
              element={<Protected Component={item?.component} />}
            />

       </Routes>
    </>
  )
}

export default Route
