// Metro bundler config for the Expo reporter app.
//
// 1. Extends `expo/metro-config` (required by expo-router / asset registry /
//    Bun-workspace resolution; expo-doctor warns otherwise).
// 2. Wires react-native-svg-transformer so `import Logo from "./logo.svg"`
//    works as a React component (used by ScreenHeader).
const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// SVG → React component pipeline. Remove "svg" from assetExts and add it to
// sourceExts so it goes through the babel/transformer path instead of being
// shipped as a binary asset.
const { transformer, resolver } = config;
config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve("react-native-svg-transformer/expo"),
};
config.resolver = {
  ...resolver,
  assetExts: resolver.assetExts.filter((ext) => ext !== "svg"),
  sourceExts: [...resolver.sourceExts, "svg"],
};

module.exports = config;
