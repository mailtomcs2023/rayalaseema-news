// @rayalaseema/nlp — Spec #4 G0 (#230).
//
// Shared NLP utilities for the news pipeline. Shipping with location NER
// (G1 #231). English-summary generation + Telugu→IAST transliteration
// (K7 / K8) hook in here later.

export * from "./types";
export { detectLocations } from "./location-ner";
