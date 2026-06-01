// Drop-in TextInput wrapper that forces our canonical placeholder colour
// on every input across the reporter app.
//
// Background: React 19 + RN 0.81 (New Architecture) silently ignores
// `TextInput.defaultProps`. Without this wrapper, every TextInput falls
// back to the OS "secondary text" colour for placeholders - which on
// Android (Material You) renders as white / very-light-grey and is
// invisible against our white inputs.
//
// Usage: change `import { TextInput } from "react-native"` to
//        `import { TextInput } from "../components/Input"`.
// Per-input override still works - any `placeholderTextColor` passed by
// the caller wins because the spread runs AFTER our default.
import React from "react";
import { TextInput as RNTextInput, type TextInputProps } from "react-native";

// Matches `datePlaceholder` in RegisterScreen.tsx (DOB / City / Experience
// buttons) so every input across the app shows the same shade.
export const PLACEHOLDER_COLOR = "#9ca3af";

export const TextInput = React.forwardRef<RNTextInput, TextInputProps>(
  function TextInput(props, ref) {
    return <RNTextInput placeholderTextColor={PLACEHOLDER_COLOR} {...props} ref={ref} />;
  },
);
