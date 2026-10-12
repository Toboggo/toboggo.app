import { useEffect, useRef, useState } from "react";

/**
 * `true` once the referenced element has come within `rootMargin` of the
 * viewport — and stays `true` afterwards (it is a "has been seen" latch, so a
 * query gated on it is never switched off again by scrolling away).
 *
 * Used to start below-the-fold dashboard queries only when their card is about
 * to be visible. Without `IntersectionObserver` (old browsers, jsdom) it
 * resolves to `true` immediately, i.e. the previous eager behaviour.
 */
export function useInView<T extends Element = HTMLDivElement>(rootMargin = "200px") {
  const ref = useRef<T | null>(null);
  const supported = typeof IntersectionObserver !== "undefined";
  const [seen, setSeen] = useState(!supported);

  useEffect(() => {
    if (seen) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [seen, rootMargin]);

  return [ref, seen] as const;
}
