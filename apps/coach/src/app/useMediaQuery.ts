import { useEffect, useState } from 'react';

/** true quando viewport <= maxWidth (default 960px, igual ao breakpoint do shell). */
export function useMediaQuery(query = '(max-width: 960px)') {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);
  return matches;
}
