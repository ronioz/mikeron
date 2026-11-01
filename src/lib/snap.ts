import type { RefObject } from "react";
import type { ScrollViewInstance } from "react-native";

/** Nothing to do on a phone, where the ScrollView snaps by itself. See snap.web.ts. */
export function useBrowserSnap(
  _view: RefObject<ScrollViewInstance | null>,
  _firstPage: number | undefined,
) {}
