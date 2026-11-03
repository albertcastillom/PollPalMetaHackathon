import T from '../context/T'

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:px-6">
        <p>© {new Date().getFullYear()} PollPal. <T>Nonpartisan voter information.</T></p>
        <nav className="flex gap-6">
          <a href="#" className="hover:text-blue-700"><T>About</T></a>
          <a href="#" className="hover:text-blue-700"><T>Data sources</T></a>
          <a href="#" className="hover:text-blue-700"><T>Privacy</T></a>
          <a href="#" className="hover:text-blue-700"><T>Contact</T></a>
        </nav>
      </div>
    </footer>
  )
}

export default Footer
