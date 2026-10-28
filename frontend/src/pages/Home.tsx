import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const features = [
  {
    number: '01',
    icon: '◫',
    title: 'Project Management',
    description:
      'Organize projects, track progress, and keep your team moving in the right direction.',
    color: 'from-zinc-800/40 to-transparent',
  },
  {
    number: '02',
    icon: '✓',
    title: 'Task Management',
    description:
      'Create tasks, assign responsibilities, and bring clarity to everyday work.',
    color: 'from-zinc-800/40 to-transparent',
  },
  {
    number: '03',
    icon: '♧',
    title: 'Team Collaboration',
    description:
      'Bring your team together with clear roles, shared projects, and organized workflows.',
    color: 'from-zinc-800/40 to-transparent',
  },
  {
    number: '04',
    icon: '◉',
    title: 'Smart Notifications',
    description:
      'Stay informed about assignments, task updates, and important team activity.',
    color: 'from-zinc-800/40 to-transparent',
  },
  {
    number: '05',
    icon: '▥',
    title: 'Progress Tracking',
    description:
      'Understand project activity and follow your team’s progress from one workspace.',
    color: 'from-zinc-800/40 to-transparent',
  },
  {
    number: '06',
    icon: '⌘',
    title: 'Team Workspace',
    description:
      'Keep your organization, members, and projects connected in one place.',
    color: 'from-zinc-800/40 to-transparent',
  },
]

function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      to="/"
      onClick={onClick}
      aria-label="Work-Bench home"
      className="group inline-flex shrink-0 items-center gap-2.5"
    >
      <span className="grid size-8 place-items-center rounded-md border border-zinc-800 bg-zinc-900 text-[13px] font-medium text-zinc-200 transition-transform group-hover:scale-105">
        W
      </span>

      <span className="text-[14px] font-medium tracking-wide text-zinc-200">
        Work<span className="text-zinc-500">-</span>Bench
      </span>
    </Link>
  )
}

export default function Home() {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  function openFeature() {
    navigate(isAuthenticated ? '/dashboard' : '/login')
  }

  function closeMenu() {
    setMenuOpen(false)
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#09090b] text-zinc-300 selection:bg-teal-500/30">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-[#09090b]/85 backdrop-blur-xl">
        <nav
          aria-label="Main navigation"
          className="mx-auto flex min-h-[64px] max-w-6xl items-center justify-between gap-4 px-5 sm:px-8"
        >
          <Brand onClick={closeMenu} />

          <div className="hidden items-center gap-6 md:flex">
            <Link
              to="/"
              className="text-[13px] font-medium text-zinc-100 transition hover:text-white"
            >
              Home
            </Link>
            <a
              href="#features"
              className="text-[13px] text-zinc-400 transition hover:text-zinc-200"
            >
              Features
            </a>
            <a
              href="#about"
              className="text-[13px] text-zinc-400 transition hover:text-zinc-200"
            >
              About
            </a>
          </div>

          <div className="hidden items-center gap-3 sm:flex">
            {isAuthenticated ? (
              <Link
                to="/dashboard"
                className="rounded-lg border border-zinc-800 px-3.5 py-2 text-[13px] font-medium text-zinc-200 transition hover:bg-zinc-800"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-zinc-400 transition hover:text-zinc-200"
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  className="rounded-lg bg-zinc-100 px-4 py-2 text-[13px] font-medium text-zinc-900 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
                >
                  Create account
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="grid size-9 place-items-center rounded-lg border border-zinc-800 text-lg text-zinc-300 transition hover:bg-zinc-800 sm:hidden"
          >
            {menuOpen ? '×' : '☰'}
          </button>
        </nav>

        {menuOpen && (
          <div className="border-t border-zinc-800 bg-[#09090b] px-5 py-5 sm:hidden">
            <div className="mx-auto flex max-w-6xl flex-col gap-4">
              <Link to="/" onClick={closeMenu} className="text-[13px] text-zinc-100">
                Home
              </Link>
              <a href="#features" onClick={closeMenu} className="text-[13px] text-zinc-400">
                Features
              </a>
              <a href="#about" onClick={closeMenu} className="text-[13px] text-zinc-400">
                About
              </a>

              <div className="mt-2 grid grid-cols-2 gap-3 border-t border-zinc-800 pt-4">
                {isAuthenticated ? (
                  <Link
                    to="/dashboard"
                    onClick={closeMenu}
                    className="col-span-2 rounded-lg bg-zinc-100 px-4 py-2.5 text-center text-[13px] font-medium text-zinc-900"
                  >
                    Dashboard
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/login"
                      onClick={closeMenu}
                      className="rounded-lg border border-zinc-800 px-4 py-2.5 text-center text-[13px] font-medium text-zinc-200"
                    >
                      Log in
                    </Link>
                    <Link
                      to="/register"
                      onClick={closeMenu}
                      className="rounded-lg bg-zinc-100 px-4 py-2.5 text-center text-[13px] font-medium text-zinc-900"
                    >
                      Create account
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      <main>
        {/* Hero */}
        <section className="relative isolate">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-24 pt-20 sm:px-8 sm:pb-28 sm:pt-28 lg:grid-cols-[1.08fr_0.92fr] lg:gap-10">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">
                <span className="size-1.5 rounded-full bg-teal-400" />
                Your team. Your workspace.
              </div>

              <h1 className="mt-6 max-w-2xl text-[32px] font-light leading-[1.1] tracking-tight text-zinc-100 sm:text-4xl lg:text-[42px]">
                Great work starts with <br className="hidden sm:block" />
                <span className="text-teal-400">better teamwork.</span>
              </h1>

              <p className="mt-6 max-w-md text-[13.5px] leading-relaxed text-zinc-400">
                Plan projects, manage tasks, and bring your team together.
                Work-Bench gives your work a clear place to move forward.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to={isAuthenticated ? '/dashboard' : '/register'}
                  className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-zinc-100 px-5 text-[13px] font-medium text-zinc-900 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
                >
                  {isAuthenticated ? 'Go to Dashboard' : 'Get started for free'}
                  <span aria-hidden="true">→</span>
                </Link>

                <a
                  href="#features"
                  className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/30 px-5 text-[13px] font-medium text-zinc-300 transition hover:bg-zinc-800"
                >
                  Explore features <span aria-hidden="true">↓</span>
                </a>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px] text-zinc-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-teal-500/70">✓</span> Organized workflows
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-teal-500/70">✓</span> Team-focused workspace
                </span>
              </div>
            </div>

            {/* Decorative workspace preview */}
            <div className="relative mx-auto w-full max-w-lg">
              <div className="relative rounded-2xl border border-zinc-800 bg-[#121214] p-4 shadow-2xl sm:p-5">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="grid size-8 place-items-center rounded-lg bg-zinc-800/50 text-sm text-zinc-400">
                      ◫
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-zinc-200">Workspace overview</p>
                      <p className="mt-0.5 text-[10.5px] text-zinc-500">A clearer way to work</p>
                    </div>
                  </div>
                  <span className="rounded-full border border-teal-500/20 bg-teal-500/10 px-2.5 py-1 text-[10px] font-medium text-teal-400">
                    Organized
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 py-4">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
                    <p className="text-[11px] font-medium text-zinc-500">Projects</p>
                    <p className="mt-1 text-lg font-light text-zinc-200">Plan</p>
                    <p className="mt-0.5 text-[10.5px] text-zinc-600">Keep work structured</p>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
                    <p className="text-[11px] font-medium text-zinc-500">Tasks</p>
                    <p className="mt-1 text-lg font-light text-zinc-200">Focus</p>
                    <p className="mt-0.5 text-[10.5px] text-zinc-600">Know what comes next</p>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12px] font-medium text-zinc-300">A connected team</p>
                    <span className="text-[10px] text-zinc-500">One workspace</span>
                  </div>

                  <div className="mt-4 space-y-3.5">
                    {[
                      { label: 'Projects & planning', width: 'w-[88%]', color: 'bg-teal-500/70' },
                      { label: 'Team collaboration', width: 'w-[72%]', color: 'bg-zinc-500/70' },
                      { label: 'Progress & updates', width: 'w-[80%]', color: 'bg-zinc-500/50' },
                    ].map((item) => (
                      <div key={item.label}>
                        <div className="mb-1.5 flex justify-between gap-3 text-[11px]">
                          <span className="text-zinc-400">{item.label}</span>
                          <span className="text-zinc-600">Organized</span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
                          <div className={`h-full rounded-full ${item.width} ${item.color}`} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="mt-4 text-center text-[10.5px] text-zinc-600">
                  A preview of the Work-Bench experience
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-24 border-y border-zinc-800/80 bg-[#09090b]">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-teal-500/80">
                Everything in one place
              </p>
              <h2 className="mt-3 text-2xl font-light tracking-tight text-zinc-100 sm:text-3xl">
                All your work, working together.
              </h2>
              <p className="mt-3 text-[13.5px] leading-relaxed text-zinc-400">
                From the first project plan to the final task, bring your everyday
                work into one connected workspace.
              </p>
            </div>

            <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <button
                  key={feature.number}
                  type="button"
                  onClick={openFeature}
                  className="group relative min-h-[180px] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 text-left transition-colors hover:border-zinc-700"
                >
                  <div className="relative flex items-start justify-between">
                    <span className="grid size-9 place-items-center rounded-lg border border-zinc-800 bg-zinc-900 text-sm text-zinc-400 transition-colors group-hover:text-zinc-200">
                      {feature.icon}
                    </span>
                    <span className="text-[10px] font-medium tracking-widest text-zinc-600">
                      {feature.number}
                    </span>
                  </div>

                  <div className="relative mt-4">
                    <h3 className="text-[14px] font-medium text-zinc-200">{feature.title}</h3>
                    <p className="mt-2 text-[12px] leading-5 text-zinc-500">
                      {feature.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* About / CTA */}
        <section id="about" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-24">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/30 px-6 py-12 sm:px-12">
            <div className="relative flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
              <div className="max-w-2xl">
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-teal-500/80">
                  Make room for great work
                </p>
                <h2 className="mt-3 text-2xl font-light leading-tight text-zinc-100 sm:text-3xl">
                  Ready to bring your team&apos;s work together?
                </h2>
                <p className="mt-3 text-[13px] leading-relaxed text-zinc-400">
                  Create your workspace and start organizing the way your team works.
                </p>
              </div>

              <Link
                to={isAuthenticated ? '/dashboard' : '/register'}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-zinc-100 px-5 py-2.5 text-[13px] font-medium text-zinc-900 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
              >
                {isAuthenticated ? 'Open Dashboard' : 'Create your account'}
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/80 bg-[#09090b]">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Brand />
              <p className="mt-3 max-w-sm text-[11.5px] leading-relaxed text-zinc-500">
                A clearer workspace for better projects, focused tasks, and stronger teams.
              </p>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-3 text-[12px] text-zinc-400">
              <Link to="/" className="transition hover:text-zinc-200">Home</Link>
              <a href="#features" className="transition hover:text-zinc-200">Features</a>
              <a href="#about" className="transition hover:text-zinc-200">About</a>
              {!isAuthenticated && (
                <>
                  <Link to="/login" className="transition hover:text-zinc-200">Log in</Link>
                  <Link to="/register" className="transition hover:text-zinc-200">Create account</Link>
                </>
              )}
              {isAuthenticated && (
                <Link to="/dashboard" className="transition hover:text-zinc-200">
                  Dashboard
                </Link>
              )}
            </div>
          </div>

          <div className="mt-8 border-t border-zinc-800/80 pt-6 text-[11px] text-zinc-600 sm:flex sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Work-Bench. All rights reserved.</p>
            <p className="mt-2 sm:mt-0">Built for teams that move work forward.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}