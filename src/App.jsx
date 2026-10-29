import { useState } from 'react';
import Header from './components/Header';
import BallotMap from './components/BallotMap';
import Candidates from './components/Candidates';
import Login from './components/Login';
import Footer from './components/Footer';

function App() {
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <Header onLoginClick={() => setLoginOpen(true)} />
      <main className="flex-grow">
        <BallotMap />
        <Candidates />
      </main>
      <Footer />
      {loginOpen && <Login onClose={() => setLoginOpen(false)} />}
    </div>
  )
}

export default App; 