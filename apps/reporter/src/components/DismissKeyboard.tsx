import React from "react";
import { Keyboard, TouchableWithoutFeedback } from "react-native";

// Tap-anywhere-to-dismiss-keyboard wrapper. Use on screens whose outer
// container is a plain <View> (e.g. Login). For screens whose outer
// container is a <ScrollView> or <FlatList>, do NOT wrap with this -
// instead set `keyboardShouldPersistTaps="handled"` and optionally
// `keyboardDismissMode="on-drag"` on the scrollable itself. Wrapping a
// scroll view with TouchableWithoutFeedback breaks the scroll because the
// scroll-view's responder is shadowed.
export function DismissKeyboard({ children }: { children: React.ReactNode }) {
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      {children}
    </TouchableWithoutFeedback>
  );
}
