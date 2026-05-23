// Metro bundler config for the Expo reporter app.
//
// Must extend expo/metro-config (rather than a bare @react-native/metro-config)
// so that expo-router, the asset registry, and Bun-workspace resolution all
// work the way Expo expects. `expo doctor` will warn otherwise.
const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = config;
