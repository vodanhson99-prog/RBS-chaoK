import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Booth from './pages/Booth'
import Download from './pages/Download'
import Home from './pages/Home'
import Result from './pages/Result'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/booth/:templateId" element={<Booth />} />
        <Route path="/result/:token" element={<Result />} />
        <Route path="/p/:token" element={<Download />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
