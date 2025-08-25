import React, { useEffect } from 'react'
import ChatInterface from './components/ChatInterface'
import { useApp } from './context/AppContext'
import { Box } from '@mui/material'

function App() {
  const { state, dispatch } = useApp()

  useEffect(() => {
    // Load configuration from backend first
    const loadConfig = async () => {
      try {
        const configResponse = await fetch('/api/v1/config')
        if (configResponse.ok) {
          const configData = await configResponse.json()
          if (configData.success) {
            dispatch({ type: 'SET_CONFIG', payload: configData.config.app })
          }
        }
      } catch (error) {
        console.error('Failed to load config:', error)
      }
    }

    // Load examples from backend
    const loadExamples = async () => {
      try {
        const response = await fetch('/examples')
        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            dispatch({ type: 'SET_EXAMPLES', payload: data.examples })
          }
        }
      } catch (error) {
        console.error('Failed to load examples:', error)
      }
    }

    // Load config first, then examples
    loadConfig().then(() => {
      loadExamples()
    })
  }, [dispatch])

  return (
    <Box sx={{ height: '100vh', overflow: 'hidden' }}>
      <ChatInterface />
    </Box>
  )
}

export default App