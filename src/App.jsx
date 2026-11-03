import { useEffect, useState } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import Header from './components/Header'
import BallotMap from './pages/BallotMap'
import Candidates from './pages/Candidates'
import Login from './components/Login'
import Footer from './components/Footer'
import Home from './pages/Home'
import Profile from './pages/Profile'
import AuthProvider from './context/AuthProvider'

function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}

function App() {
  // The address a person searched for. It lives only in memory (not in the page URL or
  // browser storage), so it is shared between pages but cleared when the page is refreshed.
  // `attempt` goes up on every search, so searching the same address again re-runs the lookup
  // (useful after fixing a backend error).
  const [search, setSearch] = useState({ address: '', attempt: 0 })
  const onSearch = (address) => setSearch((previous) => ({ address, attempt: previous.attempt + 1 }))

  return (
    <AuthProvider>
      <div className="min-h-screen flex flex-col">
        <ScrollToTop />
        <Header />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home search={search} onSearch={onSearch} />} />
            <Route path="/map" element={<BallotMap search={search} onSearch={onSearch} />} />
            <Route path="/candidates" element={<Candidates search={search} onSearch={onSearch} />} />
            <Route path="/login" element={<Login />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </AuthProvider>
  )
}

export default App