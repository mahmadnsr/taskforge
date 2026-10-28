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
    color: 'from-cyan-400/20 to-blue-500/5',
  },
  {
    number: '02',
    icon: '✓',
    title: 'Task Management',
    description:
      'Create tasks, assign responsibilities, and bring clarity to everyday work.',
    color: 'from-violet-400/20 to-indigo-500/5',
  },
  {
    number: '03',
    icon: '♧',
    title: 'Team Collaboration',
    description:
      'Bring your team together with clear roles, shared projects, and organized workflows.',
    color: 'from-emerald-400/20 to-teal-500/5',
  },
  {
    number: '04',
    icon: '◉',
    title: 'Smart Notifications',
    description:
      'Stay informed about assignments, task updates, and important team activity.',
    color: 'from-amber-400/20 to-orange-500/5',
  },
  {
    number: '05',
    icon: '▥',
    title: 'Progress Tracking',
    description:
      'Understand project activity and follow your team’s progress from one workspace.',
    color: 'from-pink-400/20 to-rose-500/5',
  },
  {
    number: '06',
    icon: '⌘',
    title: 'Team Workspace',
    description:
      'Keep your organization, members, and projects connected in one place.',
    color: 'from-sky-400/20 to-cyan-500/5',
  },
]

function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      to="/"
      onClick={onClick}
      aria-label="Work-Bench home"
      className="group inline-flex shrink-0 items-center gap-3"
    >
      <span className="relative grid size-10 place-items-center overflow-hidden rounded-xl border border-cyan-300/30 bg-gradient-to-br from-cyan-300 to-blue-500 text-lg font-black text-slate-950 shadow-lg shadow-cyan-500/20 transition-transform group-hover:scale-105">
        W
      </span>

      <span className="text-lg font-bold tracking-tight text-white sm:text-xl">
        Work<span className="text-cyan-400">-</span>Bench
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
    <div className="min-h-screen overflow-hidden bg-[#080d18] text-slate-200">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#080d18]/85 backdrop-blur-xl">
        <nav
          aria-label="Main navigation"
          className="mx-auto flex min-h-[76px] max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-10"
        >
          <Brand onClick={closeMenu} />

          <div className="hidden items-center gap-8 md:flex">
            <Link
              to="/"
              className="text-sm font-medium text-white transition hover:text-cyan-300"
            >
              Home
            </Link>
            <a
              href="#features"
              className="text-sm font-medium text-slate-400 transition hover:text-cyan-300"
            >
              Features
            </a>
            <a
              href="#about"
              className="text-sm font-medium text-slate-400 transition hover:text-cyan-300"
            >
              About
            </a>
          </div>

          <div className="hidden items-center gap-3 sm:flex">
            {isAuthenticated ? (
              <Link
                to="/dashboard"
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-cyan-300/40 hover:bg-white/5"
              >
                Open Dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:text-white"
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  className="rounded-xl bg-cyan-300 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/10 transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080d18]"
                >
                  Create account <span aria-hidden="true">↗</span>
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="grid size-10 place-items-center rounded-xl border border-white/10 text-xl text-white transition hover:bg-white/5 sm:hidden"
          >
            {menuOpen ? '×' : '☰'}
          </button>
        </nav>

        {menuOpen && (
          <div className="border-t border-white/[0.07] bg-[#0b1220] px-5 py-5 sm:hidden">
            <div className="mx-auto flex max-w-7xl flex-col gap-4">
              <Link to="/" onClick={closeMenu} className="text-sm text-white">
                Home
              </Link>
              <a href="#features" onClick={closeMenu} className="text-sm text-slate-300">
                Features
              </a>
              <a href="#about" onClick={closeMenu} className="text-sm text-slate-300">
                About
              </a>

              <div className="mt-2 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
                {isAuthenticated ? (
                  <Link
                    to="/dashboard"
                    onClick={closeMenu}
                    className="col-span-2 rounded-xl bg-cyan-300 px-4 py-3 text-center text-sm font-bold text-slate-950"
                  >
                    Open Dashboard
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/login"
                      onClick={closeMenu}
                      className="rounded-xl border border-white/10 px-4 py-3 text-center text-sm font-semibold text-white"
                    >
                      Log in
                    </Link>
                    <Link
                      to="/register"
                      onClick={closeMenu}
                      className="rounded-xl bg-cyan-300 px-4 py-3 text-center text-sm font-bold text-slate-950"
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
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
          >
            <div className="absolute -top-48 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-cyan-500/[0.12] blur-[120px]" />
            <div className="absolute right-[-180px] top-48 h-80 w-80 rounded-full bg-blue-600/[0.12] blur-[100px]" />
            <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.035)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
          </div>

          <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 pb-24 pt-20 sm:px-8 sm:pb-28 sm:pt-28 lg:grid-cols-[1.08fr_0.92fr] lg:gap-10 lg:px-10 lg:pb-32 lg:pt-32">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-3.5 py-2 text-xs font-semibold tracking-wide text-cyan-200 sm:text-sm">
                <span className="size-2 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.8)]" />
                YOUR TEAM. YOUR WORKSPACE.
              </div>

              <h1 className="mt-7 max-w-3xl text-4xl font-bold leading-[1.12] tracking-tight text-white sm:text-5xl lg:text-6xl xl:text-7xl">
                Great work starts with{' '}
                <span className="bg-gradient-to-r from-cyan-300 via-sky-300 to-blue-400 bg-clip-text text-transparent">
                  better teamwork.
                </span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-8 text-slate-400 sm:text-lg">
                Plan projects, manage tasks, and bring your team together.
                Work-Bench gives your work a clear place to move forward.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  to={isAuthenticated ? '/dashboard' : '/register'}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-6 py-3 font-bold text-slate-950 shadow-xl shadow-cyan-500/10 transition hover:-translate-y-0.5 hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080d18]"
                >
                  {isAuthenticated ? 'Go to Dashboard' : 'Get started for free'}
                  <span aria-hidden="true">→</span>
                </Link>

                <a
                  href="#features"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-6 py-3 font-semibold text-white transition hover:border-cyan-300/30 hover:bg-white/[0.06]"
                >
                  Explore features <span aria-hidden="true">↓</span>
                </a>
              </div>

              <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-slate-500">
                <span className="inline-flex items-center gap-2">
                  <span className="text-cyan-300">✓</span> Organized workflows
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="text-cyan-300">✓</span> Team-focused workspace
                </span>
              </div>
            </div>

            {/* Decorative workspace preview */}
            <div className="relative mx-auto w-full max-w-lg">
              <div
                aria-hidden="true"
                className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-cyan-400/10 via-blue-500/5 to-violet-500/10 blur-2xl"
              />

              <div className="relative rounded-3xl border border-white/10 bg-[#0d1525]/95 p-4 shadow-2xl shadow-black/40 sm:p-6">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-5">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-xl bg-cyan-300/10 text-lg text-cyan-300">
                      ◫
                    </div>
                    <div>
                      <p className="font-semibold text-white">Workspace overview</p>
                      <p className="mt-1 text-xs text-slate-500">A clearer way to work</p>
                    </div>
                  </div>
                  <span className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.08] px-2.5 py-1.5 text-xs font-medium text-emerald-300">
                    Organized
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 py-5">
                  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                    <p className="text-sm text-slate-400">Projects</p>
                    <p className="mt-3 text-2xl font-bold text-white">Plan</p>
                    <p className="mt-1 text-xs text-slate-500">Keep work structured</p>
                  </div>
                  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                    <p className="text-sm text-slate-400">Tasks</p>
                    <p className="mt-3 text-2xl font-bold text-white">Focus</p>
                    <p className="mt-1 text-xs text-slate-500">Know what comes next</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-white">A connected team</p>
                    <span className="text-xs text-cyan-300">One workspace</span>
                  </div>

                  <div className="mt-5 space-y-4">
                    {[
                      { label: 'Projects & planning', width: 'w-[88%]', color: 'bg-cyan-300' },
                      { label: 'Team collaboration', width: 'w-[72%]', color: 'bg-blue-400' },
                      { label: 'Progress & updates', width: 'w-[80%]', color: 'bg-violet-400' },
                    ].map((item) => (
                      <div key={item.label}>
                        <div className="mb-2 flex justify-between gap-3 text-xs">
                          <span className="text-slate-300">{item.label}</span>
                          <span className="text-slate-500">Organized</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                          <div className={`h-full rounded-full ${item.width} ${item.color}`} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="mt-4 text-center text-xs text-slate-500">
                  A preview of the Work-Bench experience
                </p>
              </div>

              <div
                aria-hidden="true"
                className="absolute -right-3 top-16 hidden rounded-2xl border border-white/10 bg-[#111c2e] p-3 shadow-xl sm:block lg:-right-7"
              >
                <span className="text-xl text-cyan-300">✓</span>
                <span className="ml-2 text-sm font-medium text-white">Work, in sync</span>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-24 border-y border-white/[0.06] bg-white/[0.015]">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24 lg:px-10">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-cyan-300">
                Everything in one place
              </p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                All your work, working together.
              </h2>
              <p className="mt-4 leading-7 text-slate-400">
                From the first project plan to the final task, bring your everyday
                work into one connected workspace.
              </p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3">
              {features.map((feature) => (
                <button
                  key={feature.number}
                  type="button"
                  onClick={openFeature}
                  className="group relative min-h-60 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c1422] p-6 text-left transition duration-300 hover:-translate-y-1 hover:border-cyan-300/30 hover:shadow-xl hover:shadow-cyan-950/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 sm:p-7"
                >
                  <div
                    aria-hidden="true"
                    className={`absolute inset-x-0 top-0 h-32 bg-gradient-to-b ${feature.color} opacity-60 transition group-hover:opacity-100`}
                  />

                  <div className="relative flex items-start justify-between">
                    <span className="grid size-12 place-items-center rounded-xl border border-white/10 bg-[#101c2c] text-2xl text-cyan-200 transition group-hover:border-cyan-300/30">
                      {feature.icon}
                    </span>
                    <span className="text-xs font-semibold tracking-widest text-slate-600">
                      {feature.number}
                    </span>
                  </div>

                  <div className="relative mt-7">
                    <h3 className="text-lg font-bold text-white">{feature.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-400">
                      {feature.description}
                    </p>
                  </div>

                  <div className="relative mt-5 inline-flex items-center gap-2 text-sm font-semibold text-cyan-300">
                    {isAuthenticated ? 'Open workspace' : 'Explore with an account'}
                    <span
                      aria-hidden="true"
                      className="transition-transform group-hover:translate-x-1"
                    >
                      →
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* About / CTA */}
        <section id="about" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-24 lg:px-10">
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-cyan-400/[0.10] via-[#0d1728] to-blue-500/[0.10] px-6 py-12 sm:px-12 sm:py-16 lg:px-16">
            <div
              aria-hidden="true"
              className="absolute -right-16 -top-24 size-72 rounded-full bg-cyan-300/[0.08] blur-3xl"
            />

            <div className="relative flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
              <div className="max-w-2xl">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-300">
                  Make room for great work
                </p>
                <h2 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-4xl">
                  Ready to bring your team’s work together?
                </h2>
                <p className="mt-4 leading-7 text-slate-400">
                  Create your workspace and start organizing the way your team works.
                </p>
              </div>

              <Link
                to={isAuthenticated ? '/dashboard' : '/register'}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-6 py-3.5 font-bold text-slate-950 transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080d18]"
              >
                {isAuthenticated ? 'Open Dashboard' : 'Create your account'}
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.08] bg-[#060a12]">
        <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Brand />
              <p className="mt-3 max-w-sm text-sm leading-6 text-slate-500">
                A clearer workspace for better projects, focused tasks, and stronger teams.
              </p>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-400">
              <Link to="/" className="transition hover:text-cyan-300">Home</Link>
              <a href="#features" className="transition hover:text-cyan-300">Features</a>
              <a href="#about" className="transition hover:text-cyan-300">About</a>
              {!isAuthenticated && (
                <>
                  <Link to="/login" className="transition hover:text-cyan-300">Log in</Link>
                  <Link to="/register" className="transition hover:text-cyan-300">Create account</Link>
                </>
              )}
              {isAuthenticated && (
                <Link to="/dashboard" className="transition hover:text-cyan-300">
                  Dashboard
                </Link>
              )}
            </div>
          </div>

          <div className="mt-8 border-t border-white/[0.07] pt-6 text-xs text-slate-600 sm:flex sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Work-Bench. All rights reserved.</p>
            <p className="mt-2 sm:mt-0">Built for teams that move work forward.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}