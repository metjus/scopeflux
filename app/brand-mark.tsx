import { useId } from 'react';

// ScopeFlux mark: a scope ring with a signal wave flowing through it.
// Same drawing as public/favicon.svg.
export function BrandMark({ size = 24 }: { size?: number }) {
  const gradient = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="2" y1="4" x2="22" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#c2b0ff" />
          <stop offset="1" stopColor="#7ee1ce" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="8.5" stroke={`url(#${gradient})`} strokeWidth="1.8" opacity=".55" />
      <path
        d="M1.8 13.2c2.6 0 3.4-5.4 6.1-5.4s3.3 8.6 6.1 8.6 3.4-4.4 6.2-4.4h1.9"
        stroke={`url(#${gradient})`}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="14" cy="16.4" r="1.6" fill="#7ee1ce" />
    </svg>
  );
}
