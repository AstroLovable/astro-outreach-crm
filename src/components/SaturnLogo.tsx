export function SaturnLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="saturn-g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2E3A59" />
          <stop offset="1" stopColor="#4A6FA5" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="7" fill="url(#saturn-g)" />
      <ellipse
        cx="16"
        cy="16"
        rx="13"
        ry="3.5"
        stroke="#4A6FA5"
        strokeWidth="1.5"
        fill="none"
        transform="rotate(-20 16 16)"
      />
      <circle cx="13" cy="13.5" r="1" fill="#fff" opacity="0.6" />
    </svg>
  );
}
