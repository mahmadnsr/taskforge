// src/components/Logo.tsx
import logo from '../assets/logo.png'

export function Logo({ className = "size-16" }: { className?: string }) {
  return (
    <img
      src={logo}
      alt="Work-Bench Logo"
      className={`object-contain ${className}`}
    />
  )
}
