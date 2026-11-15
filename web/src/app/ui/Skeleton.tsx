/** Loading placeholder; the wrapper is announced once as busy. */
export function Skeleton({ lines = 3, label = "Loading" }: { lines?: number; label?: string }) {
  return (
    <div className="hx-skeleton" aria-busy="true" aria-label={label} role="group">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="hx-skeleton__line" style={{ width: `${92 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="hx-stack" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="hx-card">
          <Skeleton lines={2} />
        </div>
      ))}
    </div>
  );
}
