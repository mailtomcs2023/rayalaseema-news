// Thumbnail HTML template, inlined so the renderer never reads from src/ at
// runtime. Placeholders: {{FRAME}} {{LOGO}} {{FONT}} {{BADGE}} {{HEADLINE}}.
export const THUMBNAIL_TEMPLATE = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  @font-face { font-family: "AnekTe"; src: url("{{FONT}}") format("truetype"); font-weight: 700; }
  html, body { margin: 0; width: 1280px; height: 720px; overflow: hidden; background: #000; }
  .bg { position: absolute; inset: 0; background: url("{{FRAME}}") center / cover no-repeat; }
  .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.05) 0%, rgba(0,0,0,.15) 45%, rgba(0,0,0,.88) 100%); }
  .logo { position: absolute; top: 28px; left: 32px; width: 96px; height: 96px; border-radius: 50%; background: #fff url("{{LOGO}}") center / cover no-repeat; box-shadow: 0 2px 12px rgba(0,0,0,.6); }
  .badge { position: absolute; top: 40px; right: 40px; background: #d81f26; color: #fff; font: 700 34px/1 "AnekTe", sans-serif; padding: 12px 22px; border-radius: 8px; display: {{BADGE}}; box-shadow: 0 2px 12px rgba(0,0,0,.6); }
  .h { position: absolute; left: 48px; right: 48px; bottom: 56px; color: #fff; font: 700 var(--fs, 118px) / 1.15 "AnekTe", sans-serif; text-shadow: 0 4px 18px rgba(0,0,0,.9); word-break: break-word; }
</style>
</head>
<body>
<div class="bg"></div>
<div class="shade"></div>
<div class="logo"></div>
<div class="badge">బ్రేకింగ్</div>
<div class="h" id="h">{{HEADLINE}}</div>
<script>
  // Shrink the headline until it fits in two lines.
  (function () {
    var h = document.getElementById("h");
    var fs = 118;
    h.style.setProperty("--fs", fs + "px");
    while (h.scrollHeight > fs * 2.5 && fs > 56) {
      fs -= 4;
      h.style.setProperty("--fs", fs + "px");
    }
  })();
</script>
</body>
</html>
`;
