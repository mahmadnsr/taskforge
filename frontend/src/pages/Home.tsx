import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { Logo } from '../components/Logo' // Naya Logo Component Import

const Icons = {
  Layout: () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg>,
  Check: () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  Users: () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
  Bell: () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>,
  Chart: () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>,
  Briefcase: () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
}

const features = [
  { number: '01', Icon: Icons.Layout, title: 'Project Management', description: 'Organize projects, track progress, and keep your team moving in the right direction.' },
  { number: '02', Icon: Icons.Check, title: 'Task Management', description: 'Create tasks, assign responsibilities, and bring clarity to everyday work.' },
  { number: '03', Icon: Icons.Users, title: 'Team Collaboration', description: 'Bring your team together with clear roles, shared projects, and organized workflows.' },
  { number: '04', Icon: Icons.Bell, title: 'Smart Notifications', description: 'Stay informed about assignments, task updates, and important team activity.' },
  { number: '05', Icon: Icons.Chart, title: 'Progress Tracking', description: 'Understand project activity and follow your team’s progress from one workspace.' },
  { number: '06', Icon: Icons.Briefcase, title: 'Team Workspace', description: 'Keep your organization, members, and projects connected in one place.' },
]

function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <Link to="/" onClick={onClick} className="group inline-flex shrink-0 items-center gap-3 transition-transform hover:scale-105">
      {/* Naya Reusable Logo, Size Badha Kar */}
      <Logo className="size-10" />
      <span className="text-[18px] font-semibold tracking-tight text-white">Work-Bench</span>
    </Link>
  )
}

export default function Home() {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  function openFeature() { navigate(isAuthenticated ? '/dashboard' : '/login') }
  function closeMenu() { setMenuOpen(false) }

  return (
    <div className="relative min-h-screen bg-[#050505] text-zinc-300 selection:bg-teal-500/30 overflow-hidden">
      <div className="bg-grid-pattern absolute inset-0 -z-10" />
      <div className="absolute left-1/2 top-0 -z-10 h-[600px] w-[1000px] -translate-x-1/2 bg-teal-500/10 blur-[150px] animate-float rounded-[100%]" />
      <div className="absolute inset-0 bg-noise -z-10 mix-blend-overlay" />

      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#050505]/80 backdrop-blur-2xl">
        <nav className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-6 sm:px-8">
          <Brand onClick={closeMenu} />
          <div className="hidden items-center gap-8 md:flex">
            <Link to="/" className="text-[13.5px] font-medium text-white transition hover:text-teal-400">Home</Link>
            <a href="#features" className="text-[13.5px] font-medium text-zinc-400 transition hover:text-teal-400">Features</a>
            <a href="#about" className="text-[13.5px] font-medium text-zinc-400 transition hover:text-teal-400">About</a>
          </div>
          <div className="hidden items-center gap-4 sm:flex">
            {isAuthenticated ? (
              <Link to="/dashboard" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-white/10 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]">Dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="px-4 py-2 text-[13px] font-medium text-zinc-400 transition hover:text-white">Log in</Link>
                <Link to="/register" className="relative rounded-xl bg-white px-5 py-2 text-[13px] font-semibold text-zinc-950 shadow-[0_0_20px_rgba(255,255,255,0.2)] transition hover:-translate-y-0.5 hover:shadow-[0_0_30px_rgba(255,255,255,0.4)]">Create account</Link>
              </>
            )}
          </div>
          <button type="button" onClick={() => setMenuOpen(!menuOpen)} className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-xl text-white sm:hidden">{menuOpen ? '×' : '☰'}</button>
        </nav>
        {menuOpen && (
          <div className="border-t border-white/[0.06] bg-[#050505] px-6 py-6 sm:hidden">
            <div className="flex flex-col gap-5">
              <Link to="/" onClick={closeMenu} className="text-[14px] font-medium text-white">Home</Link>
              <a href="#features" onClick={closeMenu} className="text-[14px] font-medium text-zinc-400">Features</a>
              <a href="#about" onClick={closeMenu} className="text-[14px] font-medium text-zinc-400">About</a>
              <div className="mt-2 grid grid-cols-2 gap-3 border-t border-white/10 pt-5">
                {isAuthenticated ? (
                  <Link to="/dashboard" onClick={closeMenu} className="col-span-2 rounded-xl bg-white px-4 py-3 text-center text-[14px] font-semibold text-zinc-950">Dashboard</Link>
                ) : (
                  <>
                    <Link to="/login" onClick={closeMenu} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-[14px] font-medium text-white">Log in</Link>
                    <Link to="/register" onClick={closeMenu} className="rounded-xl bg-white px-4 py-3 text-center text-[14px] font-semibold text-zinc-950">Create account</Link>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      <main>
        <section className="relative isolate pt-28 pb-32">
          <div className="mx-auto grid max-w-7xl items-center gap-16 px-6 lg:grid-cols-[1.1fr_0.9fr] sm:px-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-teal-400 shadow-[0_0_20px_rgba(20,184,166,0.15)] backdrop-blur-md">
                <span className="size-2 rounded-full bg-teal-400 animate-pulse shadow-[0_0_10px_rgba(20,184,166,0.8)]" />
                Your team. Your workspace.
              </div>
              <h1 className="mt-8 max-w-3xl text-[48px] font-semibold leading-[1.05] tracking-tighter text-white sm:text-[64px] lg:text-[76px]">
                Great work starts <br className="hidden sm:block" />
                with <span className="bg-gradient-to-r from-teal-300 via-emerald-400 to-teal-500 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(20,184,166,0.3)]">better teamwork.</span>
              </h1>
              <p className="mt-8 max-w-xl text-[16px] leading-relaxed text-zinc-400">
                Plan projects, manage tasks, and bring your team together.
                Work-Bench gives your work a clear place to move forward.
              </p>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <Link to={isAuthenticated ? '/dashboard' : '/register'} className="group relative inline-flex h-12 items-center justify-center gap-2 overflow-hidden rounded-xl bg-white px-8 text-[14px] font-semibold text-zinc-950 shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_30px_rgba(255,255,255,0.3)]">
                  <span className="relative z-10 flex items-center gap-2">
                    {isAuthenticated ? 'Go to Dashboard' : 'Get started for free'}
                    <span className="transition-transform group-hover:translate-x-1">→</span>
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                </Link>
                <a href="#features" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-8 text-[14px] font-medium text-white backdrop-blur-md transition hover:bg-white/10 hover:border-white/20">
                  Explore features <span>↓</span>
                </a>
              </div>
              <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-[13px] font-medium text-zinc-500">
                <span className="inline-flex items-center gap-2"><span className="text-teal-500">✓</span> Organized workflows</span>
                <span className="inline-flex items-center gap-2"><span className="text-teal-500">✓</span> Team-focused workspace</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-lg">
              <div className="absolute -inset-1 rounded-[2.5rem] bg-gradient-to-br from-teal-500/30 via-emerald-500/10 to-transparent blur-2xl animate-pulse" />

              <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0a0a]/90 p-1 shadow-[0_0_50px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
                <div className="emerald-bg absolute inset-0" />
                <div className="camo-grid absolute inset-0" />

                <div className="relative rounded-[14px] bg-gradient-to-b from-white/[0.02] to-transparent p-5 sm:p-7">
                  <div className="flex items-center justify-between border-b border-white/[0.06] pb-5">
                    <div className="flex items-center gap-3">
                      <div className="grid size-10 place-items-center rounded-xl bg-teal-500/10 text-lg text-teal-400 ring-1 ring-teal-500/20 shadow-[0_0_15px_rgba(20,184,166,0.2)]">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg>
                      </div>
                      <div>
                        <p className="text-[14px] font-medium text-white">Workspace overview</p>
                        <p className="mt-0.5 text-[11px] text-zinc-500">A clearer way to work</p>
                      </div>
                    </div>
                    <span className="rounded-full border border-teal-500/20 bg-teal-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-teal-400 shadow-[0_0_10px_rgba(20,184,166,0.1)]">Organized</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 py-5">
                    <div className="rounded-xl border border-white/[0.06] bg-[#0a0a0a]/50 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md transition-colors hover:bg-white/[0.04]">
                      <p className="text-[12px] font-medium text-zinc-500">Projects</p>
                      <p className="mt-2 text-xl font-light text-white">Plan</p>
                      <p className="mt-1 text-[11px] text-zinc-600">Keep work structured</p>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-[#0a0a0a]/50 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md transition-colors hover:bg-white/[0.04]">
                      <p className="text-[12px] font-medium text-zinc-500">Tasks</p>
                      <p className="mt-2 text-xl font-light text-white">Focus</p>
                      <p className="mt-1 text-[11px] text-zinc-600">Know what comes next</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-[#0a0a0a]/50 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md">
                    <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-4">
                      <p className="text-[13px] font-medium text-white">A connected team</p>
                      <span className="text-[11px] text-teal-400">One workspace</span>
                    </div>
                    <div className="mt-5 space-y-5">
                      {[
                        { label: 'Projects & planning', width: 'w-[88%]', color: 'bg-teal-500', shadow: 'shadow-[0_0_10px_rgba(20,184,166,0.5)]' },
                        { label: 'Team collaboration', width: 'w-[72%]', color: 'bg-emerald-500', shadow: 'shadow-[0_0_10px_rgba(16,185,129,0.3)]' },
                        { label: 'Progress & updates', width: 'w-[80%]', color: 'bg-zinc-500', shadow: '' },
                      ].map((item) => (
                        <div key={item.label}>
                          <div className="mb-2 flex justify-between gap-3 text-[12px]">
                            <span className="text-zinc-400">{item.label}</span>
                            <span className="text-zinc-600">Organized</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                            <div className={`h-full rounded-full ${item.width} ${item.color} ${item.shadow}`} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="mt-5 text-center text-[11px] text-zinc-600">A preview of the Work-Bench experience</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="relative border-y border-white/[0.06] bg-[#050505]/50 py-28 backdrop-blur-sm">
          <div className="mx-auto max-w-7xl px-6 sm:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-500">Everything in one place</p>
              <h2 className="mt-4 text-[32px] font-semibold tracking-tight text-white sm:text-[40px]">All your work, working together.</h2>
              <p className="mt-4 text-[15px] leading-relaxed text-zinc-400">From the first project plan to the final task, bring your everyday work into one connected workspace.</p>
            </div>
            <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <button key={feature.number} type="button" onClick={openFeature} className="group relative overflow-hidden rounded-2xl p-[1px] text-left transition-all duration-300 hover:-translate-y-1">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <div className="relative h-full rounded-[15px] bg-[#0a0a0a] p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors group-hover:bg-[#0c0c0c]">
                    <div className="relative flex items-start justify-between">
                      <span className="grid size-12 place-items-center rounded-2xl border border-white/10 bg-white/5 text-teal-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all duration-300 group-hover:scale-110 group-hover:border-teal-500/30 group-hover:bg-teal-500/10 group-hover:shadow-[0_0_20px_rgba(20,184,166,0.2)]">
                        <feature.Icon />
                      </span>
                      <span className="text-[11px] font-semibold tracking-widest text-zinc-600 group-hover:text-zinc-500">{feature.number}</span>
                    </div>
                    <div className="relative mt-6">
                      <h3 className="text-[16px] font-semibold text-white transition-colors group-hover:text-teal-50">{feature.title}</h3>
                      <p className="mt-2.5 text-[13.5px] leading-relaxed text-zinc-500 group-hover:text-zinc-400">{feature.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section id="about" className="relative px-6 py-28 sm:px-8">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-br from-teal-500/[0.08] via-transparent to-transparent px-8 py-16 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl sm:px-16">
            <div className="absolute -right-20 -top-20 size-96 rounded-full bg-teal-500/10 blur-[100px] animate-pulse" />
            <div className="relative flex flex-col items-start justify-between gap-10 md:flex-row md:items-center">
              <div className="max-w-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-400">Make room for great work</p>
                <h2 className="mt-4 text-[32px] font-semibold leading-tight tracking-tight text-white sm:text-[40px]">Ready to bring your team&apos;s work together?</h2>
                <p className="mt-4 text-[15px] leading-relaxed text-zinc-400">Create your workspace and start organizing the way your team works.</p>
              </div>
              <Link to={isAuthenticated ? '/dashboard' : '/register'} className="group inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-8 text-[14px] font-semibold text-zinc-950 shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all hover:bg-zinc-100 hover:shadow-[0_0_30px_rgba(255,255,255,0.3)]">
                {isAuthenticated ? 'Open Dashboard' : 'Create your account'}
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06] bg-[#050505]">
        <div className="mx-auto max-w-7xl px-6 py-12 sm:px-8">
          <div className="flex flex-col gap-10 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Brand />
              <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-zinc-500">A clearer workspace for better projects, focused tasks, and stronger teams.</p>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-4 text-[13px] font-medium text-zinc-400">
              <Link to="/" className="transition hover:text-white">Home</Link>
              <a href="#features" className="transition hover:text-white">Features</a>
              <a href="#about" className="transition hover:text-white">About</a>
              {!isAuthenticated && (
                <><Link to="/login" className="transition hover:text-white">Log in</Link><Link to="/register" className="transition hover:text-white">Create account</Link></>
              )}
              {isAuthenticated && <Link to="/dashboard" className="transition hover:text-white">Dashboard</Link>}
            </div>
          </div>
          <div className="mt-10 border-t border-white/[0.06] pt-8 text-[12px] text-zinc-600 sm:flex sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Work-Bench. All rights reserved.</p>
            <p className="mt-2 sm:mt-0">Built for teams that move work forward.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}