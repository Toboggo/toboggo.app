import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import styles from "./Dialog.module.css";

/** A snap height: px (`> 1`), a fraction of the viewport (`<= 1`), or `"fit"` to hug the content. */
export type Snap = number | "fit";

export interface BottomSheetProps {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  /** Snap heights, smallest first. */
  snapPoints?: Snap[];
  /** Controlled snap index. Omit for an uncontrolled sheet. */
  snapIndex?: number;
  initialSnap?: number;
  onSnapChange?: (index: number) => void;
  /** Fires with the live sheet height (px) — for anchoring floating UI to the sheet. */
  onHeightChange?: (height: number) => void;
  bottomInset?: number;
  /** Minimum gap (px) the sheet's top edge keeps from the top of the viewport. */
  topInset?: number;
  showBackdrop?: boolean;
  /** Dragging below the smallest snap dismisses the sheet (calls `onClose`). Default `true`. */
  dismissible?: boolean;
  /**
   * Fires on a firm upward gesture (fling or clear over-drag) once the sheet is
   * already at its tallest snap — e.g. "swipe the preview up to open the page".
   * When set, the sheet rubber-bands slightly past the top instead of a hard stop.
   */
  onOverswipeUp?: () => void;
}

const GRAB_H = 26; // handle strip — added on top of a `"fit"` content height
const TAP_SLOP = 6; // px of travel before a press becomes a drag
const FLING = 0.5; // px/ms — above this, snap in the fling direction
const OVERSWIPE_RUBBER = 72; // px the sheet can be pulled past its max
const OVERSWIPE_TRIGGER = 44; // px past max that commits the over-swipe action
const MIN_H = 76;
const MAX_VH = 0.94;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function scrollableAncestor(from: HTMLElement, stop: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = from;
  while (el && el !== stop) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) return el;
    el = el.parentElement;
  }
  return null;
}

/**
 * A single, real draggable bottom sheet.
 *
 * - Drag from the handle (either direction) or from any non-scrolling part of the
 *   sheet; a plain tap is never treated as a drag (`TAP_SLOP`), so a mis-tap in
 *   the content can't snap the sheet.
 * - Release picks the nearest snap, or the next/previous one on a fast fling.
 * - When the content is a scroll area, a downward drag only collapses the sheet
 *   once that list is scrolled to the top — otherwise the list scrolls normally.
 * - `"fit"` snaps size the sheet to its content (measured), so there is never a
 *   large empty panel below the content.
 *
 * The portal target is `document.body`; the sheet is width-constrained to the
 * app shell (`--app-shell-width`) and centred.
 */
export function BottomSheet({
  open,
  onClose,
  children,
  snapPoints = [0.3, 0.6, 0.92],
  snapIndex,
  initialSnap,
  onSnapChange,
  onHeightChange,
  bottomInset = 0,
  topInset = 0,
  showBackdrop = false,
  dismissible = true,
  onOverswipeUp,
}: BottomSheetProps) {
  const controlled = snapIndex != null;
  const lastIdx = snapPoints.length - 1;
  const clampIdx = useCallback((i: number) => clamp(i, 0, lastIdx), [lastIdx]);

  const [internalIndex, setInternalIndex] = useState(() =>
    clamp(initialSnap ?? Math.min(1, lastIdx), 0, lastIdx),
  );
  const index = clampIdx(controlled ? (snapIndex as number) : internalIndex);

  const setIndex = useCallback(
    (i: number) => {
      const ci = clampIdx(i);
      if (!controlled) setInternalIndex(ci);
      onSnapChange?.(ci);
    },
    [clampIdx, controlled, onSnapChange],
  );

  // ── viewport ──
  const [vpH, setVpH] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 800));
  useEffect(() => {
    const f = () => setVpH(window.innerHeight);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  const maxH = clamp(
    vpH - topInset - bottomInset,
    MIN_H + 40,
    Math.round(vpH * MAX_VH) - bottomInset,
  );

  // ── content measurement (drives `"fit"`) ──
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentH, setContentH] = useState(0);
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setContentH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  const resolve = useCallback(
    (s: Snap): number => {
      const raw = s === "fit" ? contentH + GRAB_H : s <= 1 ? s * vpH : s;
      return clamp(Math.round(raw), MIN_H, maxH);
    },
    [contentH, vpH, maxH],
  );

  // A `"fit"` snap we're not currently on can't be measured — remember it from
  // the last time the sheet settled there, and estimate before the first visit.
  const cache = useRef<number[]>([]);
  const heightForIndex = useCallback(
    (i: number) => {
      const s = snapPoints[i];
      if (s !== "fit") return resolve(s);
      if (cache.current[i] != null) return cache.current[i];
      return clamp(Math.round(i === lastIdx ? maxH * 0.72 : (maxH * i) / lastIdx), MIN_H, maxH);
    },
    [resolve, snapPoints, maxH, lastIdx],
  );

  const settledHeight = resolve(snapPoints[index]);
  useEffect(() => {
    cache.current[index] = settledHeight;
  });

  // ── drag ──
  const drag = useRef<{
    id: number;
    startY: number;
    startH: number;
    fromHandle: boolean;
    scrollEl: HTMLElement | null;
    active: boolean;
    samples: Array<{ y: number; t: number }>;
  } | null>(null);
  const [liveH, setLiveH] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const height = liveH ?? settledHeight;

  useEffect(() => {
    if (open) onHeightChange?.(height);
  }, [open, height, onHeightChange]);

  // Once a committed index / new content lands, drop the transient drag height
  // and animate onto the real settled height.
  useEffect(() => {
    if (dragging || liveH == null) return;
    const id = requestAnimationFrame(() => setLiveH(null));
    return () => cancelAnimationFrame(id);
  }, [index, contentH, dragging]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (drag.current || e.button != null && e.button !== 0) return;
      const target = e.target as HTMLElement;
      const sheet = sheetRef.current;
      if (!sheet) return;
      const fromHandle = !!target.closest("[data-sheet-handle]");
      drag.current = {
        id: e.pointerId,
        startY: e.clientY,
        startH: height,
        fromHandle,
        scrollEl: fromHandle ? null : scrollableAncestor(target, sheet),
        active: false,
        samples: [{ y: e.clientY, t: performance.now() }],
      };
    },
    [height],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      const dy = d.startY - e.clientY; // + = up = grow
      d.samples.push({ y: e.clientY, t: performance.now() });
      if (d.samples.length > 6) d.samples.shift();

      if (!d.active) {
        if (Math.abs(dy) < TAP_SLOP) return;
        if (d.scrollEl) {
          const atTop = d.scrollEl.scrollTop <= 0;
          const canHandOff = !!onOverswipeUp && index >= lastIdx;
          const collapsing = dy < 0 && atTop;
          // Own an upward drag whenever there's a taller snap OR a hand-off
          // target (swipe the preview up to open the page).
          const growing = dy > 0 && (canHandOff || (atTop && index < lastIdx));
          if (!collapsing && !growing) {
            drag.current = null; // hand the gesture back to the list
            return;
          }
        }
        d.active = true;
        setDragging(true);
        try {
          sheetRef.current?.setPointerCapture(d.id);
        } catch {
          /* capture unavailable — drag still tracked via move/up */
        }
      }
      e.preventDefault();
      const raw = d.startH + dy;
      const overswipe = !!onOverswipeUp && index >= lastIdx;
      let next = clamp(raw, MIN_H, maxH);
      if (overswipe && raw > maxH) {
        next = Math.min(maxH + (raw - maxH) * 0.35, maxH + OVERSWIPE_RUBBER);
      }
      setLiveH(next);
    },
    [index, lastIdx, maxH, onOverswipeUp],
  );

  const endDrag = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    try {
      sheetRef.current?.releasePointerCapture(d.id);
    } catch {
      /* noop */
    }

    if (!d.active) {
      // a tap: on the handle, advance one snap for discoverability
      if (d.fromHandle) setIndex(Math.min(index + 1, lastIdx));
      setLiveH(null);
      return;
    }

    const cur = liveH ?? d.startH;
    const s = d.samples;
    // Velocity (px/ms, + = growing) over the tail of the gesture. Needs a real
    // time span, so a burst of same-tick move events can't fake a fling.
    let v = 0;
    const last = s[s.length - 1];
    let ref = s[0];
    for (let i = s.length - 2; i >= 0; i--) {
      ref = s[i];
      if (last.t - ref.t >= 30) break;
    }
    const dt = last.t - ref.t;
    if (dt >= 8) v = clamp((ref.y - last.y) / dt, -4, 4);
    const netTravel = d.startY - last.y; // + = net upward
    const heights = snapPoints.map((_, i) => heightForIndex(i));

    // Firm upward gesture at the tallest snap → hand off (e.g. open the page):
    // a real fling with meaningful travel, or a clear over-drag past the top.
    if (
      onOverswipeUp &&
      index >= lastIdx &&
      ((v > FLING && netTravel > 40) || cur - heights[lastIdx] > OVERSWIPE_TRIGGER)
    ) {
      onOverswipeUp();
      setLiveH(null);
      return;
    }

    let target = index;
    if (v > FLING) target = Math.min(index + 1, lastIdx);
    else if (v < -FLING) target = Math.max(index - 1, 0);
    else {
      const grew = cur > d.startH + TAP_SLOP;
      const shrank = cur < d.startH - TAP_SLOP;
      let best = Infinity;
      heights.forEach((h, i) => {
        let dist = Math.abs(h - cur);
        if (grew && i > index) dist *= 0.78;
        if (shrank && i < index) dist *= 0.78;
        if (dist < best) {
          best = dist;
          target = i;
        }
      });
    }

    if (dismissible && target === 0 && cur < heights[0] * 0.6 && onClose) {
      onClose();
      setLiveH(null);
      return;
    }

    setLiveH(heights[target]); // smooth into place; cleared once content settles
    setIndex(target);
  }, [liveH, snapPoints, index, lastIdx, heightForIndex, dismissible, onClose, onOverswipeUp, setIndex]);

  if (!open) return null;

  // A single-snap sheet that hands off on an up-swipe (a park preview) never
  // scrolls its own content — every drag on it is a sheet gesture, so the
  // swipe-up can't be stolen by an internal scroll.
  const lockScroll = !!onOverswipeUp && snapPoints.length === 1;
  const canScroll = !lockScroll && contentH > height - GRAB_H + 4;

  return createPortal(
    <>
      {showBackdrop && <div className={styles.sheetBackdrop} onClick={onClose} />}
      <div
        ref={sheetRef}
        className={styles.sheet}
        data-dragging={dragging ? "1" : undefined}
        style={{
          height,
          bottom: bottomInset || undefined,
          borderRadius: bottomInset ? "26px 26px 0 0" : undefined,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className={styles.grabZone} data-sheet-handle>
          <div className={styles.grabber} />
        </div>
        <div
          className={styles.sheetBody}
          style={{
            overflowY: canScroll ? "auto" : "hidden",
            touchAction: lockScroll ? "none" : undefined,
          }}
        >
          <div ref={contentRef}>{children}</div>
        </div>
      </div>
    </>,
    document.body,
  );
}
