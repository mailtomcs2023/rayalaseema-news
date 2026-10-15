// Press ID card HTML - single source of truth for the printed card.
// Ported from docs/press-cards/build-cards.py (keep both in sync until the
// Python generator is retired). CR80 portrait 54 x 85.6 mm + 3 mm bleed
// = 60 x 91.6 mm page. English only. Rendered to PDF by render.ts.

export type CardData = {
  cardNo: string; token: string; name: string; designation: string; photoUrl: string;
  validFrom: Date; validTill: Date;
};
export type CardAssets = { lockupDataUri: string; mainLogoDataUri: string; qrDataUri: string };

const RED = "#D50000";
const COMPANY_PHONE = "9390375460";
const CIN = "U58130AP2026PTC127049";
export const VERIFY_BASE = "https://rayalaseemanews.com/verify/";
export const verifyUrlFor = (token: string) => `${VERIFY_BASE}${token}`;

export function fmtDay(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CSS = `
@page { size: 60mm 91.6mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 60mm; height: 91.6mm; }
body { font-family: "Arial", sans-serif; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.card { position: relative; width: 60mm; height: 91.6mm; background: #fff; overflow: hidden; }
.front .logo-band { position: absolute; left: 0; top: 0; width: 60mm; height: 20.5mm; background: #fff; }
.front .logo-band img { position: absolute; left: 6mm; top: 5mm; width: 48mm; }
.front .press { position: absolute; left: 0; top: 20.5mm; width: 60mm; height: 11mm; background: ${RED}; color: #fff; display: flex; align-items: center; justify-content: center; }
.front .press span { font-weight: 900; font-size: 23pt; letter-spacing: 2.6mm; padding-left: 2.6mm; line-height: 1; }
.front .photo { position: absolute; left: 17mm; top: 34mm; width: 26mm; height: 34.6mm; border: 0.5mm solid ${RED}; border-radius: 1.2mm; overflow: hidden; background: #eee; }
.front .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.front .name { position: absolute; left: 3mm; right: 3mm; top: 70.6mm; text-align: center; font-size: 11.5pt; font-weight: 900; line-height: 1.05; letter-spacing: .1mm; }
.front .name.long { font-size: 10pt; }
.front .desig { position: absolute; left: 3mm; right: 3mm; top: 75.9mm; text-align: center; color: ${RED}; font-weight: 800; font-size: 8pt; letter-spacing: .2mm; text-transform: uppercase; line-height: 1; white-space: nowrap; }
.front .meta { position: absolute; left: 5mm; right: 5mm; top: 80mm; display: grid; grid-template-columns: 1.15fr 1fr 1fr; column-gap: 1.5mm; font-size: 6.1pt; line-height: 1.15; }
.front .meta div { white-space: nowrap; }
.front .meta b { color: #666; font-weight: 700; text-transform: uppercase; font-size: 5pt; letter-spacing: .2mm; display: block; }
.front .foot { position: absolute; left: 0; bottom: 0; width: 60mm; height: 3.8mm; background: ${RED}; }
.front .foot span { position: absolute; left: 0; right: 0; bottom: 0.9mm; text-align: center; color: #fff; font-size: 5pt; letter-spacing: .3mm; font-weight: 700; }
.back .head { position: absolute; left: 0; top: 0; width: 60mm; height: 16mm; background: ${RED}; color: #fff; }
.back .head img { position: absolute; left: 5.5mm; top: 4.6mm; width: 8mm; height: 8mm; border-radius: 1mm; border: .35mm solid #fff; }
.back .head .co { position: absolute; left: 15.5mm; top: 5mm; right: 3mm; }
.back .head .co .n { font-weight: 900; font-size: 7.4pt; line-height: 1.05; white-space: nowrap; }
.back .head .co .s { font-size: 5pt; opacity: .92; margin-top: .8mm; line-height: 1.3; white-space: nowrap; }
.back .block { position: absolute; left: 5.5mm; right: 5.5mm; }
.back h4 { font-size: 5.4pt; letter-spacing: .35mm; color: ${RED}; text-transform: uppercase; margin-bottom: .8mm; font-weight: 900; }
.back p { font-size: 5.8pt; line-height: 1.32; color: #222; }
.back .terms { top: 20mm; }
.back .terms ol { padding-left: 2.8mm; font-size: 5.7pt; line-height: 1.32; color: #222; }
.back .terms li { margin-bottom: .7mm; }
.back .addr { top: 49mm; }
.back .qr { position: absolute; right: 5.5mm; top: 64mm; width: 16mm; height: 16mm; }
.back .qr img { width: 100%; height: 100%; display: block; }
.back .qrtxt { position: absolute; right: 5.5mm; top: 80.3mm; width: 16mm; text-align: center; font-size: 4.3pt; color: #666; }
.back .sign { position: absolute; left: 5.5mm; top: 70mm; width: 30mm; }
.back .sign .line { border-top: .25mm solid #333; margin-top: 7mm; padding-top: .7mm; font-size: 5.2pt; color: #333; }
.back .sign .line b { display: block; font-size: 5.6pt; color: #111; }
.back .foot { position: absolute; left: 0; bottom: 0; width: 60mm; height: 5.2mm; background: #111; color: #fff; display: flex; align-items: center; justify-content: center; gap: 2.5mm; font-size: 5.2pt; letter-spacing: .25mm; }
.back .foot b { color: #ff6b6b; }
`;

function front(c: CardData, a: CardAssets): string {
  const long = c.name.length > 20 ? " long" : "";
  return `<div class="card front">
  <div class="logo-band"><img src="${a.lockupDataUri}" alt=""></div>
  <div class="press"><span>PRESS</span></div>
  <div class="photo"><img src="${esc(c.photoUrl)}" alt=""></div>
  <div class="name${long}">${esc(c.name)}</div>
  <div class="desig">${esc(c.designation)}</div>
  <div class="meta">
    <div><b>ID No</b>${esc(c.cardNo)}</div>
    <div><b>Valid From</b>${fmtDay(c.validFrom)}</div>
    <div><b>Valid Till</b>${fmtDay(c.validTill)}</div>
  </div>
  <div class="foot"><span>RAYALASEEMANEWS.COM</span></div>
</div>`;
}

function back(c: CardData, a: CardAssets): string {
  return `<div class="card back">
  <div class="head"><img src="${a.mainLogoDataUri}" alt="">
    <div class="co"><div class="n">Medha Publications Pvt Ltd</div><div class="s">Publisher of Rayalaseema News<br>CIN ${CIN}</div></div>
  </div>
  <div class="block terms"><h4>Terms of use</h4>
    <ol>
      <li>The holder is an accredited representative of <b>Rayalaseema News</b> and is authorised to gather news on its behalf.</li>
      <li>This card is the property of Medha Publications Pvt Ltd. It is non-transferable and must be surrendered on cessation of service.</li>
      <li>Misuse of this card for any purpose other than journalism will attract legal action.</li>
    </ol>
  </div>
  <div class="block addr"><h4>If found, please return to</h4>
    <p>Medha Publications Pvt Ltd<br>27, Adityaram Complex, Korrapadu Road, Proddatur,<br>YSR Kadapa District, Andhra Pradesh - 516360<br>Ph: ${COMPANY_PHONE} · social@rayalaseemanews.com</p>
  </div>
  <div class="sign"><div class="line"><b>Authorised Signatory</b>Medha Publications Pvt Ltd</div></div>
  <div class="qr"><img src="${a.qrDataUri}" alt=""></div>
  <div class="qrtxt">Scan to verify</div>
  <div class="foot"><span>Emergency</span><b>+91 ${COMPANY_PHONE}</b><span>·</span><span>${esc(c.cardNo)}</span></div>
</div>`;
}

export function renderCardHtml(side: "front" | "back", card: CardData, assets: CardAssets): string {
  const body = side === "front" ? front(card, assets) : back(card, assets);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`;
}
