import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import type { Article } from "../api/client";

interface Props {
  articles: Article[];
  initialIndex: number;
  width: number;
  height: number;
  renderPage: (article: Article) => React.ReactNode;
  onIndexChange?: (index: number) => void;
}

// A book-style page-flip pager with NO blinking on commit.
//
// The trick is two-fold:
//  1. Each visible page is mounted KEYED BY article id and positioned by its
//     own absolute index, so when a flip finishes a page is never remounted -
//     it just changes role (next → current). Its <Image> keeps the same source
//     and never reloads, which is what was flashing before.
//  2. A single continuous `pos` shared value (the fractional page index) drives
//     every page's rotation. Committing a flip only shifts which 3-page window
//     is mounted; `pos` already equals the target, so nothing is reset and there
//     is no one-frame snap.
//
// Each page rotates on its left spine: pages behind `pos` (r < 0) are turning
// away/​in and sit on top; pages ahead (r ≥ 0) lie flat beneath.
export default function FlipPager({
  articles,
  initialIndex,
  width,
  height,
  renderPage,
  onIndexChange,
}: Props) {
  const [index, setIndex] = useState(initialIndex);
  const pos = useSharedValue(initialIndex);
  const total = articles.length;

  // Mirror the active page up to the parent (counter / hint).
  useEffect(() => {
    onIndexChange?.(index);
  }, [index, onIndexChange]);

  const commit = useCallback((target: number) => {
    setIndex(target);
  }, []);

  const pan = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      "worklet";
      // Drag left → pos moves toward index+1 (forward); right → index-1.
      let p = index - e.translationX / width;
      const lo = Math.max(0, index - 1);
      const hi = Math.min(total - 1, index + 1);
      if (p < lo) p = lo;
      if (p > hi) p = hi;
      pos.value = p;
    })
    .onEnd((e) => {
      "worklet";
      const frac = pos.value - index; // >0 forward, <0 backward
      const fast = Math.abs(e.velocityX) > 700;
      let target = index;
      if ((frac > 0.25 || (fast && e.velocityX < 0)) && index < total - 1) {
        target = index + 1;
      } else if ((frac < -0.25 || (fast && e.velocityX > 0)) && index > 0) {
        target = index - 1;
      }
      // pos lands exactly on an integer page; only then shift the window.
      pos.value = withTiming(target, { duration: 300 }, (fin) => {
        if (fin && target !== index) runOnJS(commit)(target);
      });
    });

  // Mount only a 3-page window around the current index.
  const start = Math.max(0, index - 1);
  const stop = Math.min(total - 1, index + 1);
  const windowIndices: number[] = [];
  for (let i = start; i <= stop; i++) windowIndices.push(i);

  return (
    <GestureDetector gesture={pan}>
      <View style={{ width, height }}>
        {windowIndices.map((pi) => (
          <FlipPage
            key={articles[pi].id}
            pi={pi}
            pos={pos}
            width={width}
            height={height}
            // Only the current page takes touches. Without this, Android hit-
            // tests by view order (last child = next page = topmost) and ignores
            // zIndex, so taps on "Read full story" hit the NEXT article.
            active={pi === index}
          >
            {renderPage(articles[pi])}
          </FlipPage>
        ))}
      </View>
    </GestureDetector>
  );
}

// One mounted page. `pi` is its fixed absolute index; `pos` is the shared
// fractional position. r = pi - pos: 0 = flat front, <0 = turning (on top),
// >0 = flat beneath/ahead, |r| ≥ 1 = off-screen.
function FlipPage({
  pi,
  pos,
  width,
  height,
  active,
  children,
}: {
  pi: number;
  pos: SharedValue<number>;
  width: number;
  height: number;
  active: boolean;
  children: React.ReactNode;
}) {
  const pageStyle = useAnimatedStyle(() => {
    const r = pi - pos.value;
    const angle = r < 0 ? interpolate(r, [-1, 0], [-90, 0], Extrapolation.CLAMP) : 0;
    return {
      opacity: r > -1 && r < 1 ? 1 : 0,
      zIndex: r < 0 ? 2 : 1, // turning page sits above the flat page beneath
      transform: [
        { perspective: 1200 },
        { translateX: -width / 2 },
        { rotateY: `${angle}deg` },
        { translateX: width / 2 },
      ],
    };
  });

  // Fold shadow: deepens as this page tilts off-flat.
  const shadeStyle = useAnimatedStyle(() => {
    const r = pi - pos.value;
    const angle = r < 0 ? interpolate(r, [-1, 0], [-90, 0], Extrapolation.CLAMP) : 0;
    return { opacity: interpolate(angle, [0, -90], [0, 0.55], Extrapolation.CLAMP) };
  });

  return (
    <Animated.View
      style={[styles.page, { width, height }, pageStyle]}
      pointerEvents={active ? "auto" : "none"}
    >
      {children}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, shadeStyle]}>
        <FoldShade max={0.6} darkEdge="right" />
      </Animated.View>
    </Animated.View>
  );
}

// Dependency-free horizontal gradient: a row of strips with linearly ramping
// black opacity, approximating the soft fold shading of a paper page turn.
function FoldShade({ max, darkEdge }: { max: number; darkEdge: "left" | "right" }) {
  const N = 14;
  return (
    <View style={styles.shadeRow} pointerEvents="none">
      {Array.from({ length: N }).map((_, i) => {
        const t = i / (N - 1);
        const o = (darkEdge === "right" ? t : 1 - t) * max;
        return <View key={i} style={{ flex: 1, backgroundColor: `rgba(0,0,0,${o.toFixed(3)})` }} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    position: "absolute",
    top: 0,
    left: 0,
    backfaceVisibility: "hidden",
    overflow: "hidden",
  },
  shadeRow: { ...StyleSheet.absoluteFillObject, flexDirection: "row" },
});
