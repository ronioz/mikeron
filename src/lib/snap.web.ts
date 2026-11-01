import { type RefObject, useEffect } from "react";
import type { ScrollViewInstance } from "react-native";

// A trackpad keeps sending the rest of a swipe after the fingers lift. Until the
// wheel has been quiet this long, it all counts as the swipe already answered.
const QUIET_MS = 200;

/**
 * Used only when the app is previewed in a browser, for the mouse and trackpad.
 * Nothing runs this on a phone: there, snap.ts is used instead.
 *
 * The browser ignores `snapToOffsets`, and its own snapping goes by how far a
 * scroll travelled, so a small one would spring back. This goes by direction,
 * as a phone does: down from the first page glides to the start of the second,
 * and up from there glides back. Below that the page scrolls as usual.
 */
export function useBrowserSnap(
  view: RefObject<ScrollViewInstance | null>,
  firstPage: number | undefined,
) {
  useEffect(() => {
    // In a browser the ScrollView's ref is the scrolling element itself.
    const element = view.current as unknown as HTMLElement | null;
    if (!element || firstPage === undefined) return;

    let quietUntil = 0;
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;
      const now = Date.now();
      const swiping = now < quietUntil;
      const down = event.deltaY > 0;
      const from = element.scrollTop;
      // Leaving the first page, or going back into it. The browser rounds where it
      // stops at some zoom levels, so "still on the first page" allows for that.
      const crossing = down ? from + 2 < firstPage : from + event.deltaY < firstPage;
      if (!swiping && !crossing) return;

      event.preventDefault();
      quietUntil = now + QUIET_MS;
      if (!swiping) view.current?.scrollTo({ y: down ? firstPage : 0, animated: true });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [view, firstPage]);
}
