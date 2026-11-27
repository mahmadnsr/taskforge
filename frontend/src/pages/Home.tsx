import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { Logo } from '../components/Logo'
import { ThemeToggle } from '../components/ThemeToggle'
import { readTheme, setTheme, type Theme } from '../theme'
import './Home.css'

const features = [
  ['Plan with context', 'Shape projects into clear, accountable work before the first task is assigned.', '◫'],
  ['Keep momentum visible', 'A focused board makes every hand-off, dependency, and next step easy to see.', '↗'],
  ['Collaborate deliberately', 'Bring roles, updates, and decisions together where the work is happening.', '◎'],
  ['Follow meaningful progress', 'Understand how projects are moving without turning status into another job.', '⌁'],
  ['Make ownership obvious', 'Give every task a home, an owner, and a reason it matters.', '◇'],
  ['One calm workspace', 'Keep projects and teams connected without adding noise to the day.', '⊞'],
]

function Brand({ onClick, footer = false }: { onClick?: () => void, footer?: boolean }) {
  return <Link to="/" onClick={onClick} className={`home-brand${footer ? ' home-brand--footer' : ''}`} aria-label="TaskForge home">
    <span className="home-brand-mark"><Logo className="home-brand-bee" /></span>
    <span className="home-brand-name">Task<span>Forge</span></span>
  </Link>
}

function MenuIcon({ open }: { open: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="home-menu-icon"><path d={open ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'} /></svg>
}

export default function Home() {
  const { isAuthenticated, isInitializing, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [theme, updateTheme] = useState<Theme>(readTheme)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const logoutInFlight = useRef(false)
  const destination = isAuthenticated ? '/dashboard' : '/register'
  const closeMenu = () => setMenuOpen(false)
  const toggleTheme = () => { const next = theme === 'light' ? 'dark' : 'light'; setTheme(next); updateTheme(next) }
  const handleLogout = async () => {
    if (logoutInFlight.current) return
    logoutInFlight.current = true
    setLogoutError('')
    setIsLoggingOut(true)
    try { await logout(); navigate('/', { replace: true }) }
    catch { setLogoutError('Unable to sign out. Please try again.') }
    finally { logoutInFlight.current = false; setIsLoggingOut(false) }
  }

  return <div className="home-page">
    <header className="home-navbar">
      <nav aria-label="Main navigation" className="home-nav-shell">
        <Brand onClick={closeMenu} />
        <div className="home-nav-links">
          <Link to="/" className="home-nav-link is-current">Home</Link>
          <a href="#features" className="home-nav-link">Product</a>
          <a href="#about" className="home-nav-link">Why TaskForge</a>
        </div>
        <div className="home-nav-actions">
          <ThemeToggle theme={theme} onToggle={toggleTheme} className="home-theme-toggle" />
          {isInitializing ? <span className="home-auth-loading" aria-live="polite">Loading account…</span> : isAuthenticated ? <><Link to="/dashboard" className="home-login">Dashboard</Link><button type="button" onClick={handleLogout} disabled={isLoggingOut} className="home-logout">{isLoggingOut ? 'Signing out…' : 'Log out'}</button></> : <><Link to="/login" className="home-login">Log in</Link><Link to="/register" className="home-nav-cta">Create account <span>→</span></Link></>}
        </div>
        <button type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} className="home-menu-button"><MenuIcon open={menuOpen} /></button>
      </nav>
      {menuOpen && <div className="home-mobile-menu">
        <Link to="/" onClick={closeMenu} className="home-nav-link is-current">Home</Link>
        <a href="#features" onClick={closeMenu} className="home-nav-link">Product</a>
        <a href="#about" onClick={closeMenu} className="home-nav-link">Why TaskForge</a>
        <div className="home-mobile-actions">{isInitializing ? <span className="home-auth-loading">Loading account…</span> : isAuthenticated ? <><Link to="/dashboard" onClick={closeMenu} className="home-nav-cta">Dashboard</Link><button type="button" onClick={handleLogout} disabled={isLoggingOut} className="home-logout">{isLoggingOut ? 'Signing out…' : 'Log out'}</button></> : <><Link to="/login" onClick={closeMenu} className="home-login">Log in</Link><Link to="/register" onClick={closeMenu} className="home-nav-cta">Create account <span>→</span></Link></>}</div>
      </div>}
    </header>
    {logoutError && <p className="home-logout-error" role="alert">{logoutError}</p>}

    <main>
      <section className="home-hero" aria-labelledby="hero-title">
        <div className="home-hero-grid">
          <div className="home-hero-copy">
            <p className="home-eyebrow"><span />Project work, beautifully ordered</p>
            <div className="home-hero-title-row"><h1 id="hero-title">Make space for<br /><em>the work</em> that matters.</h1><Logo className="home-hero-bee" /></div>
            <p className="home-hero-description">TaskForge brings projects, tasks, and people into one considered workspace—so your team can spend less time chasing updates and more time moving forward.</p>
            <div className="home-hero-actions"><Link to={destination} className="home-primary-cta">{isAuthenticated ? 'Go to dashboard' : 'Start your workspace'} <span>→</span></Link><a href="#features" className="home-secondary-cta">Explore the product <span>↓</span></a></div>
            <div className="home-proof"><span><b>✓</b> Clear ownership</span><span><b>✓</b> Built for teams</span><span><b>✓</b> Progress in context</span></div>
          </div>
          <ProductPreview />
        </div>
      </section>

      <section id="features" className="home-features" aria-labelledby="features-title">
        <div className="home-section-heading"><p className="home-eyebrow"><span />The TaskForge way</p><h2 id="features-title">A clearer system for<br /><em>ambitious teams.</em></h2><p>Thoughtful tools for planning, doing, and seeing work through—without piling more process onto your people.</p></div>
        <div className="home-feature-grid">{features.map(([title, description, symbol], index) => <button key={title} type="button" onClick={() => navigate(isAuthenticated ? '/dashboard' : '/login')} className="home-feature-card"><span className="home-feature-number">0{index + 1}</span><span className="home-feature-symbol">{symbol}</span><h3>{title}</h3><p>{description}</p><span className="home-feature-arrow">Explore <b>→</b></span></button>)}</div>
      </section>

      <section id="about" className="home-statement" aria-labelledby="statement-title"><div className="home-statement-inner"><p className="home-eyebrow"><span />Made for meaningful momentum</p><h2 id="statement-title">Your work has a rhythm.<br /><em>Give it a place to flow.</em></h2><div><p>TaskForge is a home for the practical details that make great work possible: a shared plan, an obvious next step, and a team that knows where it is headed.</p><Link to={destination} className="home-primary-cta">{isAuthenticated ? 'Open dashboard' : 'Create your account'} <span>→</span></Link></div></div></section>
    </main>
    <footer className="home-footer"><div className="home-footer-top"><div><Brand footer /><p>A considered workspace for focused projects and the people who move them forward.</p></div><nav aria-label="Footer navigation"><a href="#features">Product</a><a href="#about">Why TaskForge</a>{isAuthenticated ? <Link to="/dashboard">Dashboard</Link> : <><Link to="/login">Log in</Link><Link to="/register">Create account</Link></>}</nav></div><div className="home-footer-bottom"><span>© {new Date().getFullYear()} TaskForge</span><span>Work, brought into focus.</span></div></footer>
  </div>
}

function ProductPreview() {
  return <div className="home-preview" aria-label="Illustrative TaskForge workspace preview">
    <div className="home-preview-top"><div><span className="home-preview-kicker">TaskForge · Product preview</span><strong>Website refresh</strong></div><span className="home-preview-live">In progress</span></div>
    <div className="home-preview-meta"><span>Marketing site</span><span>12 tasks</span><span className="home-avatar-stack"><i>AM</i><i>JR</i><i>+3</i></span></div>
    <div className="home-board">
      <div className="home-board-column"><p><span className="home-dot home-dot--gold" />To refine <b>3</b></p><article><small>DESIGN</small><strong>Refine hero composition</strong><footer><span className="home-assignee">AM</span><span>Today</span></footer></article><article><small>CONTENT</small><strong>Review launch notes</strong><footer><span className="home-assignee home-assignee--green">JR</span><span>Fri</span></footer></article></div>
      <div className="home-board-column"><p><span className="home-dot home-dot--teal" />In motion <b>2</b></p><article className="home-task-active"><small>BUILD</small><strong>Responsive page polish</strong><footer><span className="home-assignee home-assignee--purple">NK</span><span className="home-dependency">↗ 2 linked</span></footer></article><article><small>RESEARCH</small><strong>Collect feedback themes</strong><footer><span className="home-assignee">AM</span><span>Mon</span></footer></article></div>
    </div>
    <div className="home-preview-foot"><div><span>Project health</span><strong>On track</strong></div><div className="home-health"><i /><i /><i /><i /><i /></div><span>72% complete</span></div>
  </div>
}
