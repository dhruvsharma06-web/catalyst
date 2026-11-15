import { useId } from "react";

interface MarkProps {
  size?: number;
}

/** The Hearth ember flame, matching the favicon. Decorative. */
export function Mark({ size = 28 }: MarkProps) {
  const gradientId = `hearth-flame-${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={gradientId} cx="50%" cy="35%" r="65%">
          <stop offset="0" stopColor="#ffcf8a" />
          <stop offset=".55" stopColor="#e8873a" />
          <stop offset="1" stopColor="#9a3f12" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="#2b1d14" />
      <path
        d="M32 12c6 9 14 15 14 26a14 14 0 0 1-28 0c0-7 4-11 7-15 1 5 3 7 5 7-1-7 0-12 2-18z"
        fill={`url(#${gradientId})`}
      />
    </svg>
  );
}
