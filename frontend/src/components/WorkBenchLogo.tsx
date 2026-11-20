export function WorkBenchLogo({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="w-left" x1="15" y1="30" x2="50" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00E5FF" />
          <stop offset="100%" stopColor="#0044FF" />
        </linearGradient>
        <linearGradient id="w-right" x1="85" y1="30" x2="50" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#0044FF" />
        </linearGradient>
        <linearGradient id="w-center" x1="50" y1="60" x2="50" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E3A8A" />
          <stop offset="100%" stopColor="#0F172A" />
        </linearGradient>
        <linearGradient id="bench" x1="50" y1="20" x2="50" y2="55" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E3A8A" />
          <stop offset="100%" stopColor="#0F172A" />
        </linearGradient>
      </defs>
      <path d="M20 35 L33 78 C34 80 36 80 38 78 L48 80 L30 35 Z" fill="url(#w-left)" />
      <path d="M80 35 L67 78 C66 80 64 80 62 78 L52 80 L70 35 Z" fill="url(#w-right)" />
      <path d="M48 80 L50 65 L52 80 Z" fill="url(#w-center)" />
      <path d="M42 25 H58 C60 25 61 26 61 28 L59 40 H41 L39 28 C39 26 40 25 42 25 Z" fill="url(#bench)" />
      <path d="M35 42 H65 V46 H35 Z" fill="url(#bench)" />
      <path d="M40 46 V56" stroke="url(#bench)" strokeWidth="4" strokeLinecap="round" />
      <path d="M60 46 V56" stroke="url(#bench)" strokeWidth="4" strokeLinecap="round" />
      <rect x="47" y="30" width="6" height="2.5" rx="1.25" fill="white" />
    </svg>
  )
}