// src/components/Logo.tsx
import logo from '../assets/taskforge-bee.webp'

export function Logo({ className = "size-20" }: { className?: string }) {
  return (
    <img
      src={logo}
      alt="TaskForge bee logo"
      className={`object-contain ${className}`}
    />
  )
}
