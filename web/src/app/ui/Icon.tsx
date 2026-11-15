const PATHS = {
  check: "M5 12.5l4.5 4.5L19 7.5",
  skip: "M5 5l14 14M19 5L5 19",
  pill: "M10.5 3.5a4.95 4.95 0 017 7l-7 7a4.95 4.95 0 01-7-7zM8 8l8 8",
  calendar: "M4 7a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2zM4 10h16M8 3v4M16 3v4",
  people: "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16.5 4.5a3.5 3.5 0 010 6.5M18 14.5a6.5 6.5 0 013.5 5.5",
  chart: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  sun: "M12 17a5 5 0 100-10 5 5 0 000 10zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  speaker: "M4 9.5v5h4l5 4v-13l-5 4zM16.5 9a4 4 0 010 6M19 6.5a8 8 0 010 11",
  stop: "M7 7h10v10H7z",
  plus: "M12 5v14M5 12h14",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 100-7 3.5 3.5 0 000 7z",
  copy: "M9 9h10v11H9zM5 15V4h10",
  logout: "M10 4H5v16h5M15 8l4 4-4 4M19 12H9",
  close: "M6 6l12 12M18 6L6 18",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  warning: "M12 3l10 18H2zM12 10v5M12 18v.5",
  mail: "M3 6h18v12H3zM3 7l9 7 9-7",
  pin: "M12 21s7-6.2 7-11.5a7 7 0 10-14 0C5 14.800 12 21 12 21zM12 12a2.500 2.500 0 100-5 2.500 2.500 0 000 5z",
  download: "M12 4v11M7 11l5 5 5-5M5 20h14",
  pause: "M8 5v14M16 5v14",
  play: "M7 4.500l12 7.500-12 7.500z",
  home: "M4 11l8-7 8 7v9H4zM10 20v-6h4v6",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  sparkle: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z",
  chevron: "M9 5l7 7-7 7",
  swap: "M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="hx-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
