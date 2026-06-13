export type Lang = "te" | "en";

export const LANGUAGE_NAMES: Record<Lang, string> = {
  te: "తెలుగు",
  en: "English",
};

// Flat-ish dictionaries for the reader UI. Telugu is the primary audience
// language; English is the fallback / toggle.
export const translations: Record<Lang, Record<string, any>> = {
  te: {
    appName: "రాయలసీమ ఎక్స్‌ప్రెస్",
    tabs: {
      feed: "వార్తలు",
      categories: "విభాగాలు",
      saved: "సేవ్‌లు",
      settings: "సెట్టింగ్‌లు",
    },
    feed: {
      all: "అన్నీ",
      loading: "వార్తలు లోడ్ అవుతున్నాయి…",
      empty: "ఇక్కడ వార్తలు లేవు",
      error: "వార్తలు తీసుకురాలేకపోయాం",
      retry: "మళ్ళీ ప్రయత్నించండి",
      end: "మీరు చివరికి చేరుకున్నారు",
    },
    reader: {
      readFull: "పూర్తి కథనం చదవండి",
      swipeHint: "పైకి స్వైప్ చేయండి",
    },
    saved: {
      empty: "మీరు ఇంకా ఏ కథనాన్ని సేవ్ చేయలేదు",
      hint: "ఏదైనా వార్తపై బుక్‌మార్క్ నొక్కి తరువాత చదవండి",
      filterTitle: "విభాగం వారీగా వడపోత",
      allSections: "అన్ని విభాగాలు",
      noneInSection: "ఈ విభాగంలో సేవ్ చేసిన వార్తలు లేవు",
    },
    settings: {
      language: "భాష",
      about: "గురించి",
      version: "వెర్షన్",
    },
    actions: {
      share: "షేర్",
      save: "సేవ్",
      saved: "సేవ్ చేయబడింది",
    },
    toggle: {
      title: "భాష మార్చండి",
      message: "యాప్‌ను {lang}లో చూపించాలా?",
      cancel: "రద్దు",
      confirm: "మార్చండి",
    },
  },
  en: {
    appName: "Rayalaseema Express",
    tabs: {
      feed: "News",
      categories: "Sections",
      saved: "Saved",
      settings: "Settings",
    },
    feed: {
      all: "All",
      loading: "Loading news…",
      empty: "No news here yet",
      error: "Couldn't load news",
      retry: "Try again",
      end: "You're all caught up",
    },
    reader: {
      readFull: "Read full story",
      swipeHint: "Swipe up for next",
    },
    saved: {
      empty: "You haven't saved any stories yet",
      hint: "Tap the bookmark on any story to read it later",
      filterTitle: "Filter by section",
      allSections: "All sections",
      noneInSection: "No saved stories in this section",
    },
    settings: {
      language: "Language",
      about: "About",
      version: "Version",
    },
    actions: {
      share: "Share",
      save: "Save",
      saved: "Saved",
    },
    toggle: {
      title: "Change language",
      message: "Show the app in {lang}?",
      cancel: "Cancel",
      confirm: "Switch",
    },
  },
};
