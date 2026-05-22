// AUTO-GENERATED from packages/db/prisma/location-data.json — do not edit by hand.
// Assembly constituencies grouped by district slug. Bundled into the reporter
// app because the Register screen is pre-login and cannot call the
// authenticated /api/locations endpoint.

export interface LocationOption {
  label: string;
  value: string;
}

export const constituenciesByDistrict: Record<string, LocationOption[]> = {
  "kurnool": [
    { label: "కర్నూలు (Kurnool)", value: "Kurnool" },
    { label: "పట్టికొండ (Pattikonda)", value: "Pattikonda" },
    { label: "కోడుమూరు (Kodumur)", value: "Kodumur" },
    { label: "యెమ్మిగనూరు (Yemmiganur)", value: "Yemmiganur" },
    { label: "మంత్రాలయం (Mantralayam)", value: "Mantralayam" },
    { label: "ఆదోని (Adoni)", value: "Adoni" },
    { label: "అలూరు (Alur)", value: "Alur" },
  ],
  "nandyal": [
    { label: "ఆళ్లగడ్డ (Allagadda)", value: "Allagadda" },
    { label: "శ్రీశైలం (Srisailam)", value: "Srisailam" },
    { label: "నందికొట్కూరు (Nandikotkur)", value: "Nandikotkur" },
    { label: "పాణ్యం (Panyam)", value: "Panyam" },
    { label: "నంద్యాల (Nandyal)", value: "Nandyal" },
    { label: "బనగానపల్లె (Banaganapalle)", value: "Banaganapalle" },
    { label: "ధోని (Dhone)", value: "Dhone" },
  ],
  "ananthapuramu": [
    { label: "రాయదుర్గం (Rayadurg)", value: "Rayadurg" },
    { label: "ఉరవకొండ (Uravakonda)", value: "Uravakonda" },
    { label: "గుంతకల్ (Guntakal)", value: "Guntakal" },
    { label: "తాడిపత్రి (Tadpatri)", value: "Tadpatri" },
    { label: "సింగనమల (Singanamala)", value: "Singanamala" },
    { label: "అనంతపురం అర్బన్ (Anantapur Urban)", value: "Anantapur Urban" },
    { label: "కళ్యాణదుర్గం (Kalyandurg)", value: "Kalyandurg" },
    { label: "రాప్తాడు (Raptadu)", value: "Raptadu" },
  ],
  "sri-sathya-sai": [
    { label: "మదకశిర (Madakasira)", value: "Madakasira" },
    { label: "హిందూపురం (Hindupur)", value: "Hindupur" },
    { label: "పెనుకొండ (Penukonda)", value: "Penukonda" },
    { label: "పుట్టపర్తి (Puttaparthi)", value: "Puttaparthi" },
    { label: "ధర్మవరం (Dharmavaram)", value: "Dharmavaram" },
    { label: "కదిరి (Kadiri)", value: "Kadiri" },
  ],
  "ysr-kadapa": [
    { label: "బద్వేలు (Badvel)", value: "Badvel" },
    { label: "కడప (Kadapa)", value: "Kadapa" },
    { label: "పులివెందుల (Pulivendla)", value: "Pulivendla" },
    { label: "కమలాపురం (Kamalapuram)", value: "Kamalapuram" },
    { label: "జమ్మలమడుగు (Jammalamadugu)", value: "Jammalamadugu" },
    { label: "ప్రొద్దుటూరు (Proddatur)", value: "Proddatur" },
    { label: "మైదుకూరు (Mydukur)", value: "Mydukur" },
  ],
  "annamayya": [
    { label: "రాజంపేట (Rajampet)", value: "Rajampet" },
    { label: "కోడూరు (Kodur)", value: "Kodur" },
    { label: "రాయచోటి (Rayachoti)", value: "Rayachoti" },
    { label: "తంబళ్ళపల్లె (Thamballapalle)", value: "Thamballapalle" },
    { label: "పీలేరు (Pileru)", value: "Pileru" },
    { label: "మదనపల్లె (Madanapalle)", value: "Madanapalle" },
    { label: "పుంగనూరు (Punganur)", value: "Punganur" },
  ],
  "tirupati": [
    { label: "గూడూరు (Gudur)", value: "Gudur" },
    { label: "సూళ్ళూరుపేట (Sullurpeta)", value: "Sullurpeta" },
    { label: "వెంకటగిరి (Venkatagiri)", value: "Venkatagiri" },
    { label: "చంద్రగిరి (Chandragiri)", value: "Chandragiri" },
    { label: "తిరుపతి (Tirupati)", value: "Tirupati" },
    { label: "శ్రీకాళహస్తి (Srikalahasti)", value: "Srikalahasti" },
    { label: "సత్యవేడు (Satyavedu)", value: "Satyavedu" },
  ],
  "chittoor": [
    { label: "నగరి (Nagari)", value: "Nagari" },
    { label: "గంగాధర నెల్లూరు (Gangadhara Nellore)", value: "Gangadhara Nellore" },
    { label: "చిత్తూరు (Chittoor)", value: "Chittoor" },
    { label: "పుతలపట్టు (Puthalapattu)", value: "Puthalapattu" },
    { label: "పాలమనేరు (Palamaner)", value: "Palamaner" },
    { label: "కుప్పం (Kuppam)", value: "Kuppam" },
  ],
};

// Maps a government district name (e.g. returned by a pincode lookup) to our
// district slug. The name is normalised to lowercase letters only first.
const DISTRICT_ALIASES: Record<string, string> = {
  kurnool: "kurnool",
  nandyal: "nandyal",
  anantapur: "ananthapuramu",
  ananthapuram: "ananthapuramu",
  ananthapuramu: "ananthapuramu",
  anantapuramu: "ananthapuramu",
  srisathyasai: "sri-sathya-sai",
  sathyasai: "sri-sathya-sai",
  srisatyasai: "sri-sathya-sai",
  ysr: "ysr-kadapa",
  ysrkadapa: "ysr-kadapa",
  kadapa: "ysr-kadapa",
  cuddapah: "ysr-kadapa",
  annamayya: "annamayya",
  tirupati: "tirupati",
  chittoor: "chittoor",
  chittor: "chittoor",
};

export function matchApDistrict(name: string): string | null {
  const key = (name || "").toLowerCase().replace(/[^a-z]/g, "");
  return DISTRICT_ALIASES[key] ?? null;
}
