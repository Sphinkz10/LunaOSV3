export function Skeleton({ width = '100%', height = 16, circle = false }: { width?: number | string; height?: number; circle?: boolean }) {
  return <span aria-hidden style={{ display: 'inline-block', width, height: circle ? width : height,
    borderRadius: circle ? '50%' : 'var(--r-sm)', background: 'var(--glass)',
    animation: 'luna-pulse 1.4s ease-in-out infinite' }} />;
}
