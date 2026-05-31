import { cn } from '../lib/utils';

interface LogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

/**
 * Dinner Table Cards brand logo — a stylized plate/ring with a conversation
 * speech bubble containing a question mark. SVG, uses brand colors.
 */
export default function Logo({ size = 40, className, showText = false }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Dinner Table Cards logo"
      >
        {/* Plate ring */}
        <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="2" opacity="0.2" />
        <circle cx="32" cy="32" r="23" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />

        {/* Speech bubble */}
        <path
          d="M22 24C22 20.686 24.686 18 28 18H36C39.314 18 42 20.686 42 24V30C42 33.314 39.314 36 36 36H34L30 40V36H28C24.686 36 22 33.314 22 30V24Z"
          fill="currentColor"
          opacity="0.9"
        />

        {/* Question mark inside bubble */}
        <text
          x="32"
          y="32"
          fontFamily="Georgia, serif"
          fontSize="14"
          fontStyle="italic"
          fill="#F5F2ED"
          textAnchor="middle"
          dominantBaseline="central"
        >
          ?
        </text>

        {/* Decorative dots (dinner setting flair) */}
        <circle cx="16" cy="48" r="1.5" fill="currentColor" opacity="0.15" />
        <circle cx="48" cy="48" r="1.5" fill="currentColor" opacity="0.15" />
        <circle cx="32" cy="54" r="1" fill="currentColor" opacity="0.1" />
      </svg>
      {showText && (
        <span className="font-serif italic text-lg tracking-tight">
          Dinner Table Cards
        </span>
      )}
    </span>
  );
}
