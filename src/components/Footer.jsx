function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:px-6">
        <p>© {new Date().getFullYear()} Elections Tracker. Nonpartisan voter information.</p>
        <nav className="flex gap-6">
          <a href="#" className="hover:text-blue-700">About</a>
          <a href="#" className="hover:text-blue-700">Data sources</a>
          <a href="#" className="hover:text-blue-700">Privacy</a>
          <a href="#" className="hover:text-blue-700">Contact</a>
        </nav>
      </div>
    </footer>
  )
}

export default Footer