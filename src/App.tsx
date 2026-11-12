import { CommonDashboard } from './app/CommonDashboard'
import { CommonStateProvider } from './state/commonState'

function App() {
  return (
    <CommonStateProvider>
      <CommonDashboard />
    </CommonStateProvider>
  )
}

export default App
