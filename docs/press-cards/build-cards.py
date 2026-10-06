"""
Press ID card generator - Rayalaseema News (Medha Publications Pvt Ltd)
CR80 portrait 54 x 85.6 mm + 3 mm bleed each side -> 60 x 91.6 mm page. English only.
Renders HTML via headless Chrome to PDF (vector, print) and PNG (300 dpi proof).
Run: python build-cards.py          -> out/<id>-front.pdf/.png, out/<id>-back.pdf/.png, out/all-cards-A4.pdf
"""
import json, subprocess, pathlib, base64

ROOT = pathlib.Path(__file__).parent
OUT = ROOT / "out"; OUT.mkdir(exist_ok=True)
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
RED = "#D50000"
COMPANY_PHONE = "9390375460"

def b64(p):
    data = (ROOT / p).read_bytes()
    ext = pathlib.Path(p).suffix.lstrip(".").lower().replace("jpg", "jpeg")
    return f"data:image/{ext};base64,{base64.b64encode(data).decode()}"

LOCKUP = b64("lockup.png"); MAIN = b64("main-logo.png")
VERIFY_BASE = "https://rayalaseemanews.com/verify/"

def qr_for(token: str) -> str:
    """Per-card QR -> /verify/<token>. Returns a data URI."""
    import qrcode, io
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=1, box_size=12)
    q.add_data(VERIFY_BASE + token); q.make(fit=True)
    buf = io.BytesIO(); q.make_image(fill_color="#111111", back_color="white").save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

CSS = f"""
@page {{ size: 60mm 91.6mm; margin: 0; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ width: 60mm; height: 91.6mm; }}
body {{ font-family: "Arial", sans-serif; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
.card {{ position: relative; width: 60mm; height: 91.6mm; background: #fff; overflow: hidden; }}
/* ---------- FRONT ---------- */
.front .logo-band {{ position: absolute; left: 0; top: 0; width: 60mm; height: 20.5mm; background: #fff; }}
.front .logo-band img {{ position: absolute; left: 6mm; top: 5mm; width: 48mm; }}
.front .press {{ position: absolute; left: 0; top: 20.5mm; width: 60mm; height: 11mm; background: {RED}; color: #fff; display: flex; align-items: center; justify-content: center; }}
.front .press span {{ font-weight: 900; font-size: 23pt; letter-spacing: 2.6mm; padding-left: 2.6mm; line-height: 1; }}
.front .photo {{ position: absolute; left: 17mm; top: 34mm; width: 26mm; height: 34.6mm; border: 0.5mm solid {RED}; border-radius: 1.2mm; overflow: hidden; background: #eee; }}
.front .photo img {{ width: 100%; height: 100%; object-fit: cover; display: block; }}
.front .name {{ position: absolute; left: 3mm; right: 3mm; top: 70.6mm; text-align: center; font-size: 11.5pt; font-weight: 900; line-height: 1.05; letter-spacing: .1mm; }}
.front .name.long {{ font-size: 10pt; }}
.front .desig {{ position: absolute; left: 3mm; right: 3mm; top: 75.9mm; text-align: center; color: {RED}; font-weight: 800; font-size: 8pt; letter-spacing: .2mm; text-transform: uppercase; line-height: 1; white-space: nowrap; }}
.front .meta {{ position: absolute; left: 5mm; right: 5mm; top: 80mm; display: grid; grid-template-columns: 1.15fr 1fr 1fr; column-gap: 1.5mm; font-size: 6.1pt; line-height: 1.15; }}
.front .meta div {{ white-space: nowrap; }}
.front .meta b {{ color: #666; font-weight: 700; text-transform: uppercase; font-size: 5pt; letter-spacing: .2mm; display: block; }}
.front .foot {{ position: absolute; left: 0; bottom: 0; width: 60mm; height: 3.8mm; background: {RED}; }}
.front .foot span {{ position: absolute; left: 0; right: 0; bottom: 0.9mm; text-align: center; color: #fff; font-size: 5pt; letter-spacing: .3mm; font-weight: 700; }}
/* ---------- BACK ---------- */
.back .head {{ position: absolute; left: 0; top: 0; width: 60mm; height: 16mm; background: {RED}; color: #fff; }}
.back .head img {{ position: absolute; left: 5.5mm; top: 4.6mm; width: 8mm; height: 8mm; border-radius: 1mm; border: .35mm solid #fff; }}
.back .head .co {{ position: absolute; left: 15.5mm; top: 5mm; right: 3mm; }}
.back .head .co .n {{ font-weight: 900; font-size: 7.4pt; line-height: 1.05; white-space: nowrap; }}
.back .head .co .s {{ font-size: 5pt; opacity: .92; margin-top: .8mm; line-height: 1.3; white-space: nowrap; }}
.back .block {{ position: absolute; left: 5.5mm; right: 5.5mm; }}
.back h4 {{ font-size: 5.4pt; letter-spacing: .35mm; color: {RED}; text-transform: uppercase; margin-bottom: .8mm; font-weight: 900; }}
.back p {{ font-size: 5.8pt; line-height: 1.32; color: #222; }}
.back .terms {{ top: 20mm; }}
.back .terms ol {{ padding-left: 2.8mm; font-size: 5.7pt; line-height: 1.32; color: #222; }}
.back .terms li {{ margin-bottom: .7mm; }}
.back .addr {{ top: 49mm; }}
.back .qr {{ position: absolute; right: 5.5mm; top: 64mm; width: 16mm; height: 16mm; }}
.back .qr img {{ width: 100%; height: 100%; display: block; }}
.back .qrtxt {{ position: absolute; right: 5.5mm; top: 80.3mm; width: 16mm; text-align: center; font-size: 4.3pt; color: #666; }}
.back .sign {{ position: absolute; left: 5.5mm; top: 70mm; width: 30mm; }}
.back .sign .line {{ border-top: .25mm solid #333; margin-top: 7mm; padding-top: .7mm; font-size: 5.2pt; color: #333; }}
.back .sign .line b {{ display: block; font-size: 5.6pt; color: #111; }}
.back .foot {{ position: absolute; left: 0; bottom: 0; width: 60mm; height: 5.2mm; background: #111; color: #fff; display: flex; align-items: center; justify-content: center; gap: 2.5mm; font-size: 5.2pt; letter-spacing: .25mm; }}
.back .foot b {{ color: #ff6b6b; }}
.bleed-guide {{ position: absolute; left: 3mm; top: 3mm; width: 54mm; height: 85.6mm; border: .1mm dashed rgba(0,0,0,.25); pointer-events: none; }}
"""

def front(s, guides=False):
    extra = ""
    if s.get("phone"): extra += f'<div><b>Mobile</b>+91 {s["phone"]}</div>'
    if s.get("blood_group"): extra += f'<div><b>Blood Group</b>{s["blood_group"]}</div>'
    cols = "1.15fr 1fr 1fr" if not extra else "1.15fr 1fr 1fr 1fr"
    long = " long" if len(s["name"]) > 20 else ""
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<div class="card front">
  <div class="logo-band"><img src="{LOCKUP}" alt=""></div>
  <div class="press"><span>PRESS</span></div>
  <div class="photo"><img src="{b64(s['photo'])}" alt=""></div>
  <div class="name{long}">{s['name']}</div>
  <div class="desig">{s['designation']}</div>
  <div class="meta" style="grid-template-columns:{cols}">
    <div><b>ID No</b>{s['id']}</div>
    <div><b>Valid From</b>{s['valid_from']}</div>
    <div><b>Valid Till</b>{s['valid_till']}</div>
    {extra}
  </div>
  <div class="foot"><span>RAYALASEEMANEWS.COM</span></div>
  {'<div class="bleed-guide"></div>' if guides else ''}
</div></body></html>"""

def back(s, guides=False):
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<div class="card back">
  <div class="head"><img src="{MAIN}" alt="">
    <div class="co"><div class="n">Medha Publications Pvt Ltd</div><div class="s">Publisher of Rayalaseema News<br>CIN U58130AP2026PTC127049</div></div>
  </div>
  <div class="block terms"><h4>Terms of use</h4>
    <ol>
      <li>The holder is an accredited representative of <b>Rayalaseema News</b> and is authorised to gather news on its behalf.</li>
      <li>This card is the property of Medha Publications Pvt Ltd. It is non-transferable and must be surrendered on cessation of service.</li>
      <li>Misuse of this card for any purpose other than journalism will attract legal action.</li>
    </ol>
  </div>
  <div class="block addr"><h4>If found, please return to</h4>
    <p>Medha Publications Pvt Ltd<br>27, Adityaram Complex, Korrapadu Road, Proddatur,<br>YSR Kadapa District, Andhra Pradesh - 516360<br>Ph: {COMPANY_PHONE} · social@rayalaseemanews.com</p>
  </div>
  <div class="sign"><div class="line"><b>Authorised Signatory</b>Medha Publications Pvt Ltd</div></div>
  <div class="qr"><img src="{qr_for(s["token"])}" alt=""></div>
  <div class="qrtxt">Scan to verify</div>
  <div class="foot"><span>Emergency</span><b>+91 {COMPANY_PHONE}</b><span>·</span><span>{s['id']}</span></div>
  {'<div class="bleed-guide"></div>' if guides else ''}
</div></body></html>"""

def sheet(staff):
    """A4 print sheet: all fronts and backs at true size with crop marks (for local print shops)."""
    cards = []
    for s in staff:
        for fn in (front, back):
            inner = fn(s).split('<body>')[1].rsplit('</body>')[0]
            cards.append(f'<div class="slot">{inner}</div>')
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}
@page {{ size: A4; margin: 10mm; }}
html, body {{ width: auto; height: auto; }}
body {{ display: flex; flex-wrap: wrap; gap: 6mm; align-content: flex-start; }}
.slot {{ width: 60mm; height: 91.6mm; position: relative; outline: .1mm solid #bbb; page-break-inside: avoid; }}
</style></head><body>{''.join(cards)}</body></html>"""

def chrome(html_path, pdf=None, png=None):
    base = [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--allow-file-access-from-files"]
    if pdf:
        subprocess.run(base + ["--no-pdf-header-footer", f"--print-to-pdf={pdf}", html_path.as_uri()], check=True, capture_output=True)
    if png:
        subprocess.run(base + ["--force-device-scale-factor=3.125", "--window-size=227,347", f"--screenshot={png}", html_path.as_uri()], check=True, capture_output=True)

staff = json.loads((ROOT / "staff.json").read_text(encoding="utf-8"))
for s in staff:
    slug = s["id"].replace("/", "-")
    for side, fn in (("front", front), ("back", back)):
        h = OUT / f"{slug}-{side}.html"; h.write_text(fn(s), encoding="utf-8")
        chrome(h, pdf=OUT / f"{slug}-{side}.pdf", png=OUT / f"{slug}-{side}.png")
        g = OUT / f"{slug}-{side}-guides.html"; g.write_text(fn(s, guides=True), encoding="utf-8")
        chrome(g, png=OUT / f"{slug}-{side}-proof.png")
    print("built", slug, s["name"])
a4 = OUT / "all-cards-A4.html"; a4.write_text(sheet(staff), encoding="utf-8")
chrome(a4, pdf=OUT / "all-cards-A4.pdf")
print("ok ->", OUT)
