import { useEffect, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header';
import BallotMap from './pages/BallotMap';
import Candidates from './pages/Candidates';
import Login from './components/Login';
import Footer from './components/Footer';
import Home from './pages/Home';

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  
  return null;
}


function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <ScrollToTop />
      <Header onLoginClick ={() => setIsLoggedIn(true)} />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/map" element={<BallotMap />} />
            <Route path="/candidates" element={<Candidates />} />
            <Route path="/login" element={<Login onLogin={() => setIsLoggedIn(true)} />} />
          </Routes>
        </main>
      <Footer />
    </div>
  )
}

export default App; 