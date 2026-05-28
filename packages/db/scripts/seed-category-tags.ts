// Static category → tag suggestion seed.
//
// Editors writing articles see these as clickable chips under the Tags input
// in the content editor (apps/admin /content/[id]). The /api/categories/[id]/
// suggested-tags endpoint merges these CURATED rows with the
// top-N most-used tags from the actual ContentTag history, so the chip row
// evolves over time as the newsroom uses tags on real articles.
//
// Idempotent — re-running upserts Tag rows and creates the link only if it
// doesn't exist. Safe in the deploy hot path.
//
// To add tags for a new category created via the admin UI: add a key here
// matching the category slug, re-deploy, or re-run manually:
//   cd packages/db && bunx tsx scripts/seed-category-tags.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Map of category slug → list of { Telugu name, lowercase Latin slug }.
// The Telugu name is what readers see on the article; the slug becomes the
// URL fragment for /tag/<slug> pages. Keep tags specific to the category —
// generic words like "వార్తలు" (news) belong everywhere so they help nowhere.
const CATEGORY_TAG_SEED: Record<string, Array<{ name: string; slug: string }>> = {
  // ─── Top-level beats ───────────────────────────────────────────────────
  politics: [
    { name: "ఎన్నికలు", slug: "elections" },
    { name: "వైసీపీ", slug: "ycp" },
    { name: "టీడీపీ", slug: "tdp" },
    { name: "జనసేన", slug: "janasena" },
    { name: "బీజేపీ", slug: "bjp" },
    { name: "కాంగ్రెస్", slug: "congress" },
    { name: "ముఖ్యమంత్రి", slug: "chief-minister" },
    { name: "అసెంబ్లీ", slug: "assembly" },
    { name: "పార్లమెంట్", slug: "parliament" },
    { name: "ప్రభుత్వ పథకాలు", slug: "government-schemes" },
  ],
  crime: [
    { name: "హత్య", slug: "murder" },
    { name: "దొంగతనం", slug: "theft" },
    { name: "మోసం", slug: "fraud" },
    { name: "పోలీసులు", slug: "police" },
    { name: "సీబీఐ", slug: "cbi" },
    { name: "ఈడీ", slug: "ed" },
    { name: "కోర్టు", slug: "court" },
    { name: "అరెస్ట్", slug: "arrest" },
    { name: "సైబర్ క్రైమ్", slug: "cybercrime" },
    { name: "డ్రగ్స్", slug: "drugs" },
  ],
  sports: [
    { name: "క్రికెట్", slug: "cricket" },
    { name: "ఫుట్‌బాల్", slug: "football" },
    { name: "టెన్నిస్", slug: "tennis" },
    { name: "హాకీ", slug: "hockey" },
    { name: "బ్యాడ్మింటన్", slug: "badminton" },
    { name: "ఒలంపిక్స్", slug: "olympics" },
    { name: "ఆసియా క్రీడలు", slug: "asian-games" },
    { name: "కబడ్డీ", slug: "kabaddi" },
  ],
  business: [
    { name: "మార్కెట్", slug: "market" },
    { name: "షేర్ మార్కెట్", slug: "stock-market" },
    { name: "ఆర్థిక వ్యవస్థ", slug: "economy" },
    { name: "బడ్జెట్", slug: "budget" },
    { name: "జీఎస్టీ", slug: "gst" },
    { name: "ఆర్‌బీఐ", slug: "rbi" },
    { name: "స్టార్టప్", slug: "startup" },
    { name: "పెట్టుబడులు", slug: "investment" },
    { name: "బ్యాంకింగ్", slug: "banking" },
  ],
  entertainment: [
    { name: "సినిమా", slug: "cinema" },
    { name: "సెలబ్రిటీ", slug: "celebrity" },
    { name: "బాక్స్ ఆఫీస్", slug: "box-office" },
    { name: "టీవీ షోలు", slug: "tv-shows" },
    { name: "మ్యూజిక్", slug: "music" },
    { name: "ట్రైలర్", slug: "trailer" },
    { name: "ఇంటర్వ్యూ", slug: "interview" },
    { name: "అవార్డులు", slug: "awards" },
  ],
  education: [
    { name: "పరీక్షలు", slug: "exams" },
    { name: "విద్యార్థులు", slug: "students" },
    { name: "ఉపాధ్యాయులు", slug: "teachers" },
    { name: "ఎన్‌ఈఈటీ", slug: "neet" },
    { name: "ఈఏపీసెట్", slug: "eapcet" },
    { name: "జేఈఈ", slug: "jee" },
    { name: "ఉన్నత విద్య", slug: "higher-education" },
    { name: "పాఠశాల", slug: "school" },
    { name: "విశ్వవిద్యాలయం", slug: "university" },
  ],
  agriculture: [
    { name: "రైతులు", slug: "farmers" },
    { name: "పంట", slug: "crops" },
    { name: "మద్దతు ధర", slug: "msp" },
    { name: "ఎరువులు", slug: "fertilizer" },
    { name: "వ్యవసాయ రుణాలు", slug: "farm-loans" },
    { name: "నీటి పారుదల", slug: "irrigation" },
    { name: "వరి", slug: "paddy" },
    { name: "మిర్చి", slug: "chilli" },
    { name: "పత్తి", slug: "cotton" },
    { name: "మామిడి", slug: "mango" },
  ],
  "district-news": [
    { name: "స్థానిక వార్తలు", slug: "local-news" },
    { name: "జిల్లా కలెక్టర్", slug: "collector" },
    { name: "మండల పరిషత్", slug: "mandal-parishad" },
    { name: "గ్రామ పంచాయతీ", slug: "panchayat" },
    { name: "మునిసిపాలిటీ", slug: "municipality" },
    { name: "పౌర సమస్యలు", slug: "civic-issues" },
    { name: "రహదారులు", slug: "roads" },
    { name: "విద్యుత్", slug: "electricity" },
  ],
  national: [
    { name: "మోదీ", slug: "modi" },
    { name: "ప్రధాన మంత్రి", slug: "prime-minister" },
    { name: "కేంద్ర ప్రభుత్వం", slug: "central-government" },
    { name: "సుప్రీం కోర్టు", slug: "supreme-court" },
    { name: "హై కోర్టు", slug: "high-court" },
    { name: "ఢిల్లీ", slug: "delhi" },
    { name: "లోక్‌సభ", slug: "lok-sabha" },
    { name: "రాజ్యసభ", slug: "rajya-sabha" },
  ],
  international: [
    { name: "అమెరికా", slug: "usa" },
    { name: "చైనా", slug: "china" },
    { name: "రష్యా", slug: "russia" },
    { name: "ఉక్రెయిన్", slug: "ukraine" },
    { name: "పాకిస్తాన్", slug: "pakistan" },
    { name: "ఐరాస", slug: "united-nations" },
    { name: "విదేశీ సంబంధాలు", slug: "foreign-relations" },
    { name: "ప్రపంచ వార్తలు", slug: "world-news" },
  ],
  technology: [
    { name: "ఏఐ", slug: "ai" },
    { name: "స్మార్ట్‌ఫోన్", slug: "smartphone" },
    { name: "యాపిల్", slug: "apple" },
    { name: "గూగుల్", slug: "google" },
    { name: "మైక్రోసాఫ్ట్", slug: "microsoft" },
    { name: "సైబర్ సెక్యూరిటీ", slug: "cybersecurity" },
    { name: "5జీ", slug: "5g" },
    { name: "గాడ్జెట్స్", slug: "gadgets" },
    { name: "యాప్‌లు", slug: "apps" },
  ],
  health: [
    { name: "ఆరోగ్యం", slug: "health" },
    { name: "ఆస్పత్రి", slug: "hospital" },
    { name: "డాక్టర్", slug: "doctor" },
    { name: "మందులు", slug: "medicine" },
    { name: "కరోనా", slug: "covid" },
    { name: "డయాబెటిస్", slug: "diabetes" },
    { name: "గుండె", slug: "heart" },
    { name: "మానసిక ఆరోగ్యం", slug: "mental-health" },
    { name: "పోషకాహారం", slug: "nutrition" },
  ],
  devotional: [
    { name: "ఆలయం", slug: "temple" },
    { name: "తిరుమల", slug: "tirumala" },
    { name: "శ్రీశైలం", slug: "srisailam" },
    { name: "శ్రీవారి సేవలు", slug: "srivari-seva" },
    { name: "పూజలు", slug: "pooja" },
    { name: "ఉత్సవాలు", slug: "festivals" },
    { name: "ఆధ్యాత్మికం", slug: "spirituality" },
    { name: "మంత్రాలు", slug: "mantras" },
  ],
  "rasi-phalalu": [
    { name: "మేషం", slug: "aries" },
    { name: "వృషభం", slug: "taurus" },
    { name: "మిథునం", slug: "gemini" },
    { name: "కర్కాటకం", slug: "cancer" },
    { name: "సింహం", slug: "leo" },
    { name: "కన్య", slug: "virgo" },
    { name: "తులా", slug: "libra" },
    { name: "వృశ్చికం", slug: "scorpio" },
    { name: "ధనుస్సు", slug: "sagittarius" },
    { name: "మకరం", slug: "capricorn" },
    { name: "కుంభం", slug: "aquarius" },
    { name: "మీనం", slug: "pisces" },
  ],
  jobs: [
    { name: "ఉద్యోగాలు", slug: "jobs" },
    { name: "నోటిఫికేషన్", slug: "notification" },
    { name: "ప్రభుత్వ ఉద్యోగాలు", slug: "government-jobs" },
    { name: "ఏపీపీఎస్‌సీ", slug: "appsc" },
    { name: "యూపీఎస్‌సీ", slug: "upsc" },
    { name: "బ్యాంక్ ఉద్యోగాలు", slug: "bank-jobs" },
    { name: "రైల్వే", slug: "railway-jobs" },
    { name: "ప్రైవేట్ ఉద్యోగాలు", slug: "private-jobs" },
  ],
  "movie-reviews": [
    { name: "రివ్యూ", slug: "review" },
    { name: "రేటింగ్", slug: "rating" },
    { name: "హీరో", slug: "hero" },
    { name: "హీరోయిన్", slug: "heroine" },
    { name: "డైరెక్టర్", slug: "director" },
    { name: "నిర్మాత", slug: "producer" },
    { name: "సంగీత దర్శకుడు", slug: "music-director" },
    { name: "విడుదల", slug: "release" },
  ],
  "exam-results": [
    { name: "ఫలితాలు", slug: "results" },
    { name: "మెరిట్ లిస్ట్", slug: "merit-list" },
    { name: "కౌన్సెలింగ్", slug: "counselling" },
    { name: "ర్యాంక్ కార్డ్", slug: "rank-card" },
    { name: "పదవ తరగతి", slug: "ssc" },
    { name: "ఇంటర్", slug: "intermediate" },
    { name: "డిగ్రీ", slug: "degree" },
    { name: "పీజీ", slug: "pg" },
  ],
  weather: [
    { name: "వర్షపాతం", slug: "rainfall" },
    { name: "తుఫాను", slug: "cyclone" },
    { name: "వడగాలులు", slug: "heatwave" },
    { name: "ఉష్ణోగ్రత", slug: "temperature" },
    { name: "ఐఎండీ", slug: "imd" },
    { name: "హెచ్చరిక", slug: "weather-alert" },
    { name: "వరదలు", slug: "floods" },
    { name: "వాతావరణ మార్పు", slug: "climate-change" },
  ],
  nri: [
    { name: "ఎన్‌ఆర్‌ఐ", slug: "nri" },
    { name: "విదేశీ తెలుగువారు", slug: "telugu-diaspora" },
    { name: "హెచ్1బీ వీసా", slug: "h1b-visa" },
    { name: "గ్రీన్ కార్డ్", slug: "green-card" },
    { name: "విదేశీ ఉద్యోగాలు", slug: "overseas-jobs" },
    { name: "విదేశీ విద్య", slug: "study-abroad" },
    { name: "అమెరికా తెలుగువారు", slug: "telugu-in-usa" },
  ],
  navyaseema: [
    { name: "రాయలసీమ", slug: "rayalaseema" },
    { name: "నవ్యసీమ", slug: "navyaseema" },
    { name: "సీమ ప్రత్యేకం", slug: "seema-special" },
    { name: "సంస్కృతి", slug: "culture" },
    { name: "ప్రముఖులు", slug: "personalities" },
  ],
  "real-estate": [
    { name: "రియల్ ఎస్టేట్", slug: "real-estate" },
    { name: "ధరలు", slug: "prices" },
    { name: "నిర్మాణం", slug: "construction" },
    { name: "ఇల్లు", slug: "house" },
    { name: "ప్లాట్", slug: "plot" },
    { name: "హైడ్రా", slug: "hydra" },
    { name: "రెరా", slug: "rera" },
    { name: "హౌసింగ్ లోన్", slug: "housing-loan" },
  ],
  editorial: [
    { name: "సంపాదకీయం", slug: "editorial" },
    { name: "అభిప్రాయం", slug: "opinion" },
    { name: "విశ్లేషణ", slug: "analysis" },
    { name: "వ్యాఖ్యానం", slug: "commentary" },
  ],
  "andhra-pradesh": [
    { name: "ఆంధ్రప్రదేశ్", slug: "andhra-pradesh" },
    { name: "అమరావతి", slug: "amaravati" },
    { name: "చంద్రబాబు", slug: "chandrababu" },
    { name: "జగన్", slug: "jagan" },
    { name: "పవన్ కల్యాణ్", slug: "pawan-kalyan" },
    { name: "విశాఖపట్నం", slug: "visakhapatnam" },
    { name: "విజయవాడ", slug: "vijayawada" },
    { name: "గుంటూరు", slug: "guntur" },
    { name: "ఏపీ ప్రభుత్వం", slug: "ap-government" },
  ],
  telangana: [
    { name: "తెలంగాణ", slug: "telangana" },
    { name: "హైదరాబాద్", slug: "hyderabad" },
    { name: "రేవంత్ రెడ్డి", slug: "revanth-reddy" },
    { name: "కేసీఆర్", slug: "kcr" },
    { name: "కేటీఆర్", slug: "ktr" },
    { name: "బీఆర్‌ఎస్", slug: "brs" },
    { name: "తెలంగాణ ప్రభుత్వం", slug: "telangana-government" },
  ],
  features: [
    { name: "ఫీచర్ స్టోరీ", slug: "feature-story" },
    { name: "ప్రత్యేక కథనం", slug: "special-story" },
    { name: "వ్యక్తి పరిచయం", slug: "profile" },
    { name: "ట్రెండ్‌లు", slug: "trends" },
  ],
  "reader-letters": [
    { name: "పాఠకుల అభిప్రాయం", slug: "reader-opinion" },
    { name: "లేఖ", slug: "letter" },
    { name: "ఎడిటర్‌కు లేఖ", slug: "letter-to-editor" },
  ],
  "rayalaseema-ruchulu": [
    { name: "రాయలసీమ వంటకాలు", slug: "rayalaseema-cuisine" },
    { name: "నాటూ కోడి", slug: "natu-kodi" },
    { name: "రాగి సంగటి", slug: "ragi-sangati" },
    { name: "ఉగ్గాని", slug: "uggani" },
    { name: "కారం", slug: "spicy" },
    { name: "సంప్రదాయ వంటకాలు", slug: "traditional-recipes" },
  ],
  yetteta: [
    { name: "హాస్యం", slug: "humor" },
    { name: "వ్యంగ్యం", slug: "satire" },
    { name: "జోక్‌లు", slug: "jokes" },
    { name: "వినోదం", slug: "entertainment-light" },
  ],
  puzzles: [
    { name: "క్రాస్‌వర్డ్", slug: "crossword" },
    { name: "సుడోకు", slug: "sudoku" },
    { name: "పజిల్", slug: "puzzle" },
    { name: "వర్డ్ గేమ్", slug: "word-game" },
  ],
  vasundhara: [
    { name: "మహిళలు", slug: "women" },
    { name: "ఫ్యాషన్", slug: "fashion" },
    { name: "సౌందర్యం", slug: "beauty" },
    { name: "మహిళా సాధికారత", slug: "women-empowerment" },
    { name: "మహిళా ఆరోగ్యం", slug: "womens-health" },
  ],
  "hai-bujji": [
    { name: "పిల్లల కథలు", slug: "kids-stories" },
    { name: "నీతి కథలు", slug: "moral-stories" },
    { name: "బొమ్మలు", slug: "drawings" },
    { name: "పజిల్స్ ఫర్ కిడ్స్", slug: "kids-puzzles" },
  ],
  "sunday-magazine": [
    { name: "ఆదివారం ప్రత్యేకం", slug: "sunday-special" },
    { name: "మాగజైన్", slug: "magazine" },
    { name: "కవర్ స్టోరీ", slug: "cover-story" },
  ],
  obituaries: [
    { name: "శ్రద్ధాంజలి", slug: "tribute" },
    { name: "మరణ వార్తలు", slug: "death-news" },
    { name: "పుట్టినరోజు", slug: "birthday" },
    { name: "నివాళి", slug: "homage" },
  ],
  "fact-check": [
    { name: "ఫ్యాక్ట్ చెక్", slug: "fact-check" },
    { name: "ఫేక్ న్యూస్", slug: "fake-news" },
    { name: "వాస్తవం", slug: "truth" },
    { name: "నిర్ధారణ", slug: "verification" },
    { name: "వదంతులు", slug: "rumors" },
  ],
  "good-news": [
    { name: "శుభ వార్త", slug: "good-news" },
    { name: "విజయగాథ", slug: "success-story" },
    { name: "స్ఫూర్తి", slug: "inspiration" },
    { name: "మానవత్వం", slug: "humanity" },
  ],
  recipes: [
    { name: "వంటలు", slug: "recipes" },
    { name: "శాకాహారం", slug: "vegetarian" },
    { name: "మాంసాహారం", slug: "non-vegetarian" },
    { name: "స్వీట్స్", slug: "sweets" },
    { name: "స్నాక్స్", slug: "snacks" },
    { name: "బ్రేక్‌ఫాస్ట్", slug: "breakfast" },
  ],
  lifestyle: [
    { name: "ఫ్యాషన్", slug: "fashion" },
    { name: "ట్రెండ్‌లు", slug: "lifestyle-trends" },
    { name: "ట్రావెల్", slug: "travel" },
    { name: "హాబీలు", slug: "hobbies" },
    { name: "డేటింగ్", slug: "dating" },
    { name: "రిలేషన్‌షిప్", slug: "relationships" },
  ],
  cartoon: [
    { name: "కార్టూన్", slug: "cartoon" },
    { name: "వ్యంగ్య చిత్రం", slug: "satire-cartoon" },
    { name: "రాజకీయ కార్టూన్", slug: "political-cartoon" },
  ],
  youth: [
    { name: "యువత", slug: "youth" },
    { name: "విద్యార్థి జీవితం", slug: "student-life" },
    { name: "కెరీర్", slug: "career" },
    { name: "స్టార్టప్", slug: "youth-startup" },
    { name: "సోషల్ మీడియా", slug: "youth-social-media" },
  ],
  explained: [
    { name: "వివరణ", slug: "explained" },
    { name: "ఎక్స్‌ప్లైనర్", slug: "explainer" },
    { name: "విశ్లేషణ", slug: "explained-analysis" },
    { name: "నేపథ్యం", slug: "background" },
  ],
  "calendar-panchangam": [
    { name: "పంచాంగం", slug: "panchangam" },
    { name: "ముహూర్తం", slug: "muhurtham" },
    { name: "తిథి", slug: "tithi" },
    { name: "నక్షత్రం", slug: "nakshatra" },
    { name: "పండుగలు", slug: "festivals-calendar" },
  ],
  "guest-columns": [
    { name: "అతిథి వ్యాసం", slug: "guest-article" },
    { name: "నిపుణుల అభిప్రాయం", slug: "expert-opinion" },
    { name: "విశ్లేషకుల వ్యాసం", slug: "analyst-article" },
  ],
  "social-media": [
    { name: "ట్రెండింగ్", slug: "trending" },
    { name: "వైరల్", slug: "viral" },
    { name: "ట్విట్టర్", slug: "twitter" },
    { name: "ఇన్‌స్టాగ్రామ్", slug: "instagram" },
    { name: "ఫేస్‌బుక్", slug: "facebook" },
    { name: "మీమ్స్", slug: "memes" },
    { name: "యూట్యూబ్", slug: "youtube" },
  ],
  karnataka: [
    { name: "కర్ణాటక", slug: "karnataka" },
    { name: "బెంగళూరు", slug: "bengaluru" },
    { name: "సిద్దరామయ్య", slug: "siddaramaiah" },
    { name: "కర్ణాటక ప్రభుత్వం", slug: "karnataka-government" },
  ],
  "tamil-nadu": [
    { name: "తమిళనాడు", slug: "tamil-nadu" },
    { name: "చెన్నై", slug: "chennai" },
    { name: "స్టాలిన్", slug: "stalin" },
    { name: "డీఎంకే", slug: "dmk" },
    { name: "ఏఐఏడీఎంకే", slug: "aiadmk" },
  ],
  funday: [
    { name: "ఫన్", slug: "fun" },
    { name: "వినోదం", slug: "funday-entertainment" },
    { name: "క్విజ్", slug: "quiz" },
    { name: "గేమ్స్", slug: "games" },
  ],
  "vintalu-visheshalu": [
    { name: "విచిత్రాలు", slug: "curiosities" },
    { name: "ఆశ్చర్యకర వార్తలు", slug: "amazing-news" },
    { name: "విభిన్నం", slug: "unique" },
    { name: "నమ్మశక్యం కాని", slug: "unbelievable" },
  ],
  podcasts: [
    { name: "పాడ్‌కాస్ట్", slug: "podcast" },
    { name: "ఆడియో", slug: "audio" },
    { name: "ఇంటర్వ్యూ ఆడియో", slug: "audio-interview" },
  ],

  // ─── Entertainment children ───────────────────────────────────────────
  tollywood: [
    { name: "టాలీవుడ్", slug: "tollywood" },
    { name: "మహేష్ బాబు", slug: "mahesh-babu" },
    { name: "ప్రభాస్", slug: "prabhas" },
    { name: "అల్లు అర్జున్", slug: "allu-arjun" },
    { name: "రామ్ చరణ్", slug: "ram-charan" },
    { name: "ఎన్‌టీఆర్", slug: "ntr" },
    { name: "విజయ్ దేవరకొండ", slug: "vijay-deverakonda" },
    { name: "తెలుగు సినిమా", slug: "telugu-cinema" },
  ],
  bollywood: [
    { name: "బాలీవుడ్", slug: "bollywood" },
    { name: "షారుఖ్ ఖాన్", slug: "shahrukh-khan" },
    { name: "సల్మాన్ ఖాన్", slug: "salman-khan" },
    { name: "ఆమిర్ ఖాన్", slug: "aamir-khan" },
    { name: "హిందీ సినిమా", slug: "hindi-cinema" },
  ],
  hollywood: [
    { name: "హాలీవుడ్", slug: "hollywood" },
    { name: "ఆస్కార్", slug: "oscars" },
    { name: "మార్వెల్", slug: "marvel" },
    { name: "డీసీ", slug: "dc" },
    { name: "ఆంగ్ల సినిమా", slug: "english-cinema" },
  ],
  "south-cinema": [
    { name: "సౌత్ ఇండియన్ సినిమా", slug: "south-indian-cinema" },
    { name: "తమిళ సినిమా", slug: "tamil-cinema" },
    { name: "మలయాళ సినిమా", slug: "malayalam-cinema" },
    { name: "కన్నడ సినిమా", slug: "kannada-cinema" },
    { name: "రజినీకాంత్", slug: "rajinikanth" },
    { name: "విజయ్", slug: "vijay" },
  ],
  ott: [
    { name: "నెట్‌ఫ్లిక్స్", slug: "netflix" },
    { name: "అమెజాన్ ప్రైమ్", slug: "amazon-prime" },
    { name: "హాట్‌స్టార్", slug: "hotstar" },
    { name: "ఆహా", slug: "aha-ott" },
    { name: "వెబ్ సిరీస్", slug: "web-series" },
    { name: "ఓటీటీ విడుదల", slug: "ott-release" },
  ],

  // ─── Business children ────────────────────────────────────────────────
  market: [
    { name: "సెన్సెక్స్", slug: "sensex" },
    { name: "నిఫ్టీ", slug: "nifty" },
    { name: "షేర్ ధరలు", slug: "share-prices" },
    { name: "ఐపీఓ", slug: "ipo" },
    { name: "మ్యూచువల్ ఫండ్", slug: "mutual-fund" },
  ],
  corporate: [
    { name: "రిలయన్స్", slug: "reliance" },
    { name: "టీసీఎస్", slug: "tcs" },
    { name: "ఇన్ఫోసిస్", slug: "infosys" },
    { name: "అదానీ", slug: "adani" },
    { name: "టాటా", slug: "tata" },
    { name: "కంపెనీ వార్తలు", slug: "company-news" },
  ],
  "personal-finance": [
    { name: "పొదుపు", slug: "savings" },
    { name: "ఎఫ్‌డీ", slug: "fd" },
    { name: "మ్యూచువల్ ఫండ్", slug: "personal-mf" },
    { name: "ఇన్సూరెన్స్", slug: "insurance" },
    { name: "ట్యాక్స్", slug: "tax" },
    { name: "క్రెడిట్ కార్డ్", slug: "credit-card" },
  ],
  automobile: [
    { name: "కార్లు", slug: "cars" },
    { name: "బైక్‌లు", slug: "bikes" },
    { name: "ఎలక్ట్రిక్ వాహనాలు", slug: "ev" },
    { name: "మారుతి సుజుకి", slug: "maruti" },
    { name: "హ్యూందాయ్", slug: "hyundai" },
    { name: "టాటా మోటార్స్", slug: "tata-motors" },
    { name: "లాంచ్", slug: "auto-launch" },
  ],
  economy: [
    { name: "జీడీపీ", slug: "gdp" },
    { name: "ద్రవ్యోల్బణం", slug: "inflation" },
    { name: "ఆర్థిక వృద్ధి", slug: "economic-growth" },
    { name: "ఎగుమతులు", slug: "exports" },
    { name: "దిగుమతులు", slug: "imports" },
    { name: "రూపాయి", slug: "rupee" },
  ],

  // ─── Sports children ──────────────────────────────────────────────────
  cricket: [
    { name: "ఐపీఎల్", slug: "ipl" },
    { name: "టీమ్ ఇండియా", slug: "team-india" },
    { name: "విరాట్ కోహ్లీ", slug: "virat-kohli" },
    { name: "రోహిత్ శర్మ", slug: "rohit-sharma" },
    { name: "ఎంఎస్ ధోనీ", slug: "ms-dhoni" },
    { name: "టెస్ట్ క్రికెట్", slug: "test-cricket" },
    { name: "వన్‌డే", slug: "odi" },
    { name: "టీ20", slug: "t20" },
    { name: "ప్రపంచ కప్", slug: "world-cup" },
  ],

  // NOTE: Rayalaseema districts (kurnool, nandyal, ananthapuramu, sri-sathya-sai,
  // ysr-kadapa, annamayya, tirupati, chittoor) live in the District table,
  // not Category. Tags scoped to a specific district aren't surfaced via
  // this chip-row today — they belong on articles via Constituency, not
  // Category. When/if district hub pages get their own Category rows, add
  // their tag seeds here.
};

async function main() {
  console.log("=== Seed category tag suggestions ===");

  // Build slug → category id map up front so we can resolve in one pass.
  const allCats = await prisma.category.findMany({
    where: { active: true },
    select: { id: true, slug: true, nameEn: true },
  });
  const catBySlug = new Map(allCats.map((c) => [c.slug, c]));

  let totalLinksCreated = 0;
  let totalTagsCreated = 0;
  let skippedCategories = 0;

  for (const [catSlug, tags] of Object.entries(CATEGORY_TAG_SEED)) {
    const cat = catBySlug.get(catSlug);
    if (!cat) {
      console.log(`  ⏭  ${catSlug} — category not in DB, skipping`);
      skippedCategories++;
      continue;
    }

    let linksThisCat = 0;
    let tagsThisCat = 0;
    for (const t of tags) {
      // Tag has BOTH `name` and `slug` as unique, so we have to try both
      // before creating. This lets a Telugu name reused across two seed
      // entries (e.g. "మ్యూచువల్ ఫండ్" in both Market and Personal Finance)
      // resolve to a single shared Tag row — the first slug seen wins.
      let tag =
        (await prisma.tag.findUnique({ where: { slug: t.slug } })) ??
        (await prisma.tag.findUnique({ where: { name: t.name } }));
      if (!tag) {
        tag = await prisma.tag.create({ data: { name: t.name, slug: t.slug } });
        tagsThisCat++;
      }

      // Link Tag → Category (skip if already linked).
      const existingLink = await prisma.categoryTagSuggestion.findUnique({
        where: { categoryId_tagId: { categoryId: cat.id, tagId: tag.id } },
      });
      if (!existingLink) {
        await prisma.categoryTagSuggestion.create({
          data: { categoryId: cat.id, tagId: tag.id, source: "CURATED" },
        });
        linksThisCat++;
      }
    }
    totalLinksCreated += linksThisCat;
    totalTagsCreated += tagsThisCat;
    const label = cat.nameEn ?? cat.slug;
    if (linksThisCat > 0 || tagsThisCat > 0) {
      console.log(`  ✓ ${label} — ${linksThisCat} new links, ${tagsThisCat} new tag rows`);
    } else {
      console.log(`  · ${label} — already seeded`);
    }
  }

  // Flag any active categories that have no entry in the seed map yet — the
  // newsroom can fill those in later via PRs to this file.
  const seededSlugs = new Set(Object.keys(CATEGORY_TAG_SEED));
  const unseeded = allCats.filter((c) => !seededSlugs.has(c.slug)).map((c) => c.nameEn ?? c.slug);
  if (unseeded.length > 0) {
    console.log("");
    console.log(`Note: ${unseeded.length} active categor${unseeded.length === 1 ? "y has" : "ies have"} no seed entry yet:`);
    for (const u of unseeded) console.log(`  · ${u}`);
    console.log("Add them to CATEGORY_TAG_SEED in this file when ready.");
  }

  console.log("");
  console.log(
    `Done. ${totalLinksCreated} suggestion links · ${totalTagsCreated} new tag rows · ${skippedCategories} categories in seed but not in DB`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
