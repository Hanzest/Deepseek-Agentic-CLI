import { useEffect, useRef } from 'react';

interface SwipeConfig {
  threshold?: number;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

/**
 * Hook for swipe gesture navigation on a container element.
 * Returns a ref to attach to the container.
 */
export function useSwipeNavigation({ threshold = 30, onSwipeLeft, onSwipeRight }: SwipeConfig) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let isSwiping = false;

    function onTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      isSwiping = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!isSwiping) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
        e.preventDefault();
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (!isSwiping) return;
      isSwiping = false;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) < Math.abs(dy) * 0.5) return;
      if (dx > threshold) {
        onSwipeRight?.();
      } else if (dx < -threshold) {
        onSwipeLeft?.();
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [threshold, onSwipeLeft, onSwipeRight]);

  return ref;
}
