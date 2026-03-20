import { useEffect, useState, useRef } from 'react';
import { Spinner } from "@/shadcn-bridge/heroui/spinner";

export function GlobalPullToRefresh() {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const startY = useRef(0);
  const isPulling = useRef(false);
  const currentDistance = useRef(0);

  useEffect(() => {
    const MAX_PULL = 80;
    const THRESHOLD = 60;

    const getScrollTop = (target: EventTarget | null) => {
      let node = target as HTMLElement | null;
      while (node && node !== document.body && node !== document.documentElement) {
        if (node.scrollHeight > node.clientHeight) {
          const overflowY = window.getComputedStyle(node).overflowY;
          if (overflowY === 'auto' || overflowY === 'scroll') {
            return node.scrollTop;
          }
        }
        node = node.parentElement;
      }
      return window.scrollY || document.documentElement.scrollTop;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (getScrollTop(e.target) <= 0) {
        startY.current = e.touches[0].clientY;
        isPulling.current = true;
        currentDistance.current = 0;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isPulling.current) return;
      const y = e.touches[0].clientY;
      const distance = y - startY.current;

      if (distance > 0) {
         if (getScrollTop(e.target) <= 0) {
           if (e.cancelable) e.preventDefault();
           currentDistance.current = Math.min(distance * 0.4, MAX_PULL);
           setPullDistance(currentDistance.current);
         } else {
           isPulling.current = false;
           setPullDistance(0);
         }
      } else {
         isPulling.current = false;
         setPullDistance(0);
      }
    };

    const onTouchEnd = () => {
      if (!isPulling.current) return;
      isPulling.current = false;
      
      if (currentDistance.current >= THRESHOLD) {
        setRefreshing(true);
        setPullDistance(THRESHOLD - 20);
        window.location.reload();
      } else {
        setPullDistance(0);
        currentDistance.current = 0;
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  if (pullDistance === 0 && !refreshing) return null;

  return (
    <div
      className="fixed top-0 left-0 w-full flex justify-center items-start pt-6 z-[9999] pointer-events-none transition-transform duration-200"
      style={{
         transform: `translateY(${refreshing ? 40 : pullDistance}px)`,
         opacity: pullDistance / 80 || (refreshing ? 1 : 0),
         marginTop: '-40px'
      }}
    >
      <div className="bg-content1 shadow-lg rounded-full px-4 py-2 flex items-center gap-2 border border-divider">
        {refreshing ? (
          <>
            <Spinner size="sm" />
            <span className="text-sm font-medium text-foreground">刷新中...</span>
          </>
        ) : (
          <>
            <svg
              className={`w-4 h-4 text-default-500 transition-transform duration-200 ${pullDistance >= 60 ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            <span className="text-sm font-medium text-default-500">{pullDistance >= 60 ? "松开刷新" : "下拉刷新"}</span>
          </>
        )}
      </div>
    </div>
  );
}