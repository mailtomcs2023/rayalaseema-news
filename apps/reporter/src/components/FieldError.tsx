import React from "react";
import { Text, StyleSheet } from "react-native";

// Small red message shown directly under an invalid form input.
// Renders nothing when there's no message.
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <Text style={styles.text}>{message}</Text>;
}

const styles = StyleSheet.create({
  text: {
    color: "#dc2626",
    fontSize: 12,
    lineHeight: 16,
    marginTop: -4,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
});
