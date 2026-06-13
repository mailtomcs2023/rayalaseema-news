import { useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";

// Fire `onFocus` each time this screen's tab becomes focused - i.e. when the
// user taps into it from another tab - but NOT on the very first mount (the
// screen already loads its own data then).
//
// Why focus and not a tab "press" event: expo-router's native tab bar (the
// liquid-glass one) only dispatches JUMP_TO on focus change via
// onNativeFocusChange - it never emits React Navigation's 'tabPress'. So there
// is no JS signal for re-tapping the *already-active* tab; focus change is the
// only reliable hook, and it covers tapping into the tab from elsewhere.
export function useTabPress(onFocus: () => void) {
  const firstRun = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstRun.current) {
        firstRun.current = false;
        return;
      }
      onFocus();
    }, [onFocus]),
  );
}
