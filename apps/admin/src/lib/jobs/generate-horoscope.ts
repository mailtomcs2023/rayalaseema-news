// Daily + weekly rashi phalalu generator.
//
// Source: freehoroscopeapi.com (free, no key, daily + weekly, all 12 signs) ->
// translated to Telugu via Azure OpenAI in an Eenadu/Sakshi rashi-phalalu
// style. Writes one row per (rashi, period, date) into the Horoscope table;
// the public /horoscope page reads from there (no live third-party fetch on
// the request path).
//
// Replaces the old Prokerala flow, which ran out of API credits and has no
// weekly endpoint. Azure creds come from env (no hardcoded keys).
//
// Used by apps/admin/src/app/api/cron/horoscope/route.ts (daily cron).
import { prisma } from "@rayalaseema/db";

const FREE = "https://freehoroscopeapi.com/api/v1/get-horoscope";
const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_KEY = process.env.AZURE_OPENAI_KEY;
const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt51";
const AZURE_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";

const RASHIS = [
  { slug: "mesha", sign: "aries", en: "Aries" },
  { slug: "vrushabha", sign: "taurus", en: "Taurus" },
  { slug: "mithuna", sign: "gemini", en: "Gemini" },
  { slug: "karkataka", sign: "cancer", en: "Cancer" },
  { slug: "simha", sign: "leo", en: "Leo" },
  { slug: "kanya", sign: "virgo", en: "Virgo" },
  { slug: "tula", sign: "libra", en: "Libra" },
  { slug: "vrushchika", sign: "scorpio", en: "Scorpio" },
  { slug: "dhanu", sign: "sagittarius", en: "Sagittarius" },
  { slug: "makara", sign: "capricorn", en: "Capricorn" },
  { slug: "kumbha", sign: "aquarius", en: "Aquarius" },
  { slug: "meena", sign: "pisces", en: "Pisces" },
];

const EENADU_PROMPT = `నీవు ఈనాడు, సాక్షి వార్తాపత్రికల్లో రాశి ఫలాలు రాసే జ్యోతిష్య నిపుణుడివి. ఈ క్రింది ఆంగ్ల రాశి ఫలాలను తెలుగులో అనువదించు.

నియమాలు:
1. ఈనాడు/సాక్షి శైలిలో, సహజమైన తెలుగులో రాయాలి
2. ప్రతి రాశికి 3-4 వాక్యాలు - సంక్షిప్తంగా, స్పష్టంగా
3. ఆంగ్ల పదాలు వాడకూడదు (Sun/Moon/Mars కాకుండా సూర్యుడు, చంద్రుడు, కుజుడు)
4. ఆరోగ్యం, ఆర్థికం, సంబంధాలపై ఆచరణాత్మక సలహాలు
5. [1], [2] నంబరింగ్ ఉంచు - ప్రతి రాశికి ఒకటి, అదే వరుసలో
6. తెలుగు మాత్రమే`;

async function fetchFree(sign: string, period: "daily" | "weekly"): Promise<string> {
  try {
    const res = await fetch(`${FREE}/${period}?sign=${sign}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return "";
    const j = await res.json();
    return String(j?.data?.horoscope || "");
  } catch {
    return "";
  }
}

async function translateBatch(items: { en: string; text: string }[]): Promise<string[]> {
  if (!AZURE_ENDPOINT || !AZURE_KEY) return [];
  const numbered = items.map((p, i) => `[${i + 1}] ${p.en}: ${p.text}`).join("\n\n");
  try {
    const res = await fetch(
      `${AZURE_ENDPOINT}openai/deployments/${AZURE_DEPLOYMENT}/chat/completions?api-version=${AZURE_VERSION}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": AZURE_KEY },
        body: JSON.stringify({
          messages: [
            { role: "system", content: EENADU_PROMPT },
            { role: "user", content: numbered },
          ],
          max_completion_tokens: 3000,
          temperature: 0.6,
        }),
        signal: AbortSignal.timeout(40000),
      },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const out = String(data.choices?.[0]?.message?.content || "");
    return out
      .split(/\[\d+\]\s*/)
      .filter(Boolean)
      .map((t: string) => t.replace(/^[^:]*:\s*/, "").trim());
  } catch {
    return [];
  }
}

async function generatePeriod(period: "daily" | "weekly", date: Date): Promise<number> {
  const en = await Promise.all(RASHIS.map((r) => fetchFree(r.sign, period)));
  const te = await translateBatch(RASHIS.map((r, i) => ({ en: r.en, text: en[i] })));

  let written = 0;
  for (let i = 0; i < RASHIS.length; i++) {
    const predictionEn = en[i] || "";
    const predictionTe = te[i] || predictionEn; // fall back to English if translate failed
    if (!predictionTe) continue;
    await prisma.horoscope.upsert({
      where: { rashi_period_date: { rashi: RASHIS[i].slug, period: period === "daily" ? "DAILY" : "WEEKLY", date } },
      update: { predictionTe, predictionEn, source: "freehoroscopeapi+azure" },
      create: {
        rashi: RASHIS[i].slug,
        period: period === "daily" ? "DAILY" : "WEEKLY",
        date,
        predictionTe,
        predictionEn,
        source: "freehoroscopeapi+azure",
      },
    });
    written++;
  }
  return written;
}

export interface HoroscopeGenResult {
  ok: boolean;
  daily: number;
  weekly: number;
  date: string;
  error?: string;
}

export async function generateHoroscopes(): Promise<HoroscopeGenResult> {
  if (!AZURE_ENDPOINT || !AZURE_KEY) {
    return { ok: false, daily: 0, weekly: 0, date: "", error: "AZURE_OPENAI_ENDPOINT/KEY not configured" };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daily = await generatePeriod("daily", today);
  const weekly = await generatePeriod("weekly", today);
  return { ok: daily > 0 || weekly > 0, daily, weekly, date: today.toISOString() };
}
