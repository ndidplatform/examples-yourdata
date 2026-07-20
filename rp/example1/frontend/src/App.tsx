import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConsentRequestWizard } from '@/features/consent-request/ConsentRequestWizard'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/consent/request" element={<ConsentRequestWizard />} />
        <Route path="*" element={<Navigate to="/consent/request" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
