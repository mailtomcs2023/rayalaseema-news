<!--
  RENAME-SCRIPT GUARD - strings below intentionally include the OLD domain.
  This file is in the SKIP_FILES list of scripts/rename-brand.mjs so the
  rename script does NOT rewrite it. The runbook describes an OLD -> NEW
  migration; the old name must remain present.
-->
# Infra - Rayalaseema News VM setup

Runbook for migrating production from the OLD domain (rayalaseema&#x2011;express.com) to the NEW domain (rayalaseema&#x2011;news.com).

Production: Azure VM `20.198.2.80` (per memory). The deploy uses GitHub Actions push-to-main + PM2 on the VM.

## 1. DNS (run from local repo)

```sh
# Dry-run - prints plan, hits no records
bun scripts/dns/godaddy-set-records.ts

# Apply - pushes A + CNAME records to GoDaddy for the NEW domain
bun scripts/dns/godaddy-set-records.ts --apply
```

Verify:

```sh
dig +short rayalaseemanews.com           # expect 20.198.2.80
dig +short www.rayalaseemanews.com       # expect rayalaseemanews.com.
dig +short admin.rayalaseemanews.com     # expect 20.198.2.80
```

## 2. Nginx - new server blocks (on VM)

Two new sites - web (port 3000) and admin (port 3001):

```sh
sudo cp rayalaseemanews.com.conf       /etc/nginx/sites-available/rayalaseema-news
sudo cp admin.rayalaseemanews.com.conf /etc/nginx/sites-available/rayalaseema-news-admin

sudo ln -sf /etc/nginx/sites-available/rayalaseema-news       /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/rayalaseema-news-admin /etc/nginx/sites-enabled/

sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx \
  -d rayalaseemanews.com -d www.rayalaseemanews.com \
  -d admin.rayalaseemanews.com \
  --non-interactive --agree-tos -m reddygs@medhahosting.com
```

## 3. Legacy domains - 301 redirect (on VM)

After the NEW domains serve HTTPS, swap the two OLD server blocks (`rayalaseema` + `rayalaseema-admin`) to pure-redirect blocks:

```sh
# Web (.com apex + www + .in apex + www) -> https://rayalaseemanews.com
sudo cp rayalaseemaexpress.com-redirect.conf       /etc/nginx/sites-available/rayalaseema
# Admin                                            -> https://admin.rayalaseemanews.com
sudo cp admin.rayalaseemaexpress.com-redirect.conf /etc/nginx/sites-available/rayalaseema-admin

sudo nginx -t && sudo systemctl reload nginx
```

Keep `certbot renew` running for the OLD domain certs so the HTTPS 301 stays valid. The `.in` legacy domain stays HTTP-only (no cert in original config); per-URL 301 still works for HTTP traffic.

### Decisions baked in
- `rayalaseemanews.in` is NOT purchased. Legacy `rayalaseemaexpress.in` redirects to `rayalaseemanews.com` (cross-TLD). Going forward: `.com` only.
- Admin subdomain is `admin.rayalaseemanews.com`, mirroring legacy `admin.rayalaseemaexpress.com`.

## 4. App env (managed by deploy.yml)

`deploy.yml` writes `apps/web/.env` and `apps/admin/.env` on every push to main with:

```
SITE_URL="https://rayalaseemanews.com"
NEXTAUTH_URL="https://admin.rayalaseemanews.com"
```

then runs `pm2 restart all --update-env`. No manual VM env edit needed after merging the rename PR.

## 5. Google Search Console

1. Add `https://rayalaseemanews.com` as a NEW property (Domain property preferred - verifies via DNS).
2. Submit `https://rayalaseemanews.com/sitemap-index.xml`.
3. Submit `/news-sitemap.xml` (Google News).
4. In the OLD `rayalaseemaexpress.com` property, use **Settings → Change of Address** → point to the NEW property. Keep BOTH properties verified for at least 6 months so Google can track the migration.
5. Request indexing for the homepage of the NEW domain.

## 6. Other external systems to update manually

- Google Analytics 4 - stream URL → `rayalaseemanews.com`
- Bing Webmaster - add new site, submit sitemap, set 301
- Microsoft Clarity - domain whitelist
- Google AdSense - site approval list
- Sentry - DSN allowed origins
- Cloudflare (if/when added)
- Social handles + bios (Telegram, WhatsApp, X, Instagram, FB, LinkedIn)
- Email signatures + reply-to
- Press release distribution lists
- Wikipedia disambiguation page (per `project_brand_disambiguation` memory)

## 7. Credentials still to rotate (security hygiene)

- GoDaddy API key+secret pasted in chat 2026-06-01 (the live `dKYSZJzqLvq8_*` one + GoDaddy account auth code). Scrap after rename done.
- OLD GoDaddy key cached in `.claude/settings.json` Bash allow-list (line 5-8, 58-59). Rotate.
- Azure Speech key in `.claude/settings.json:72`. Rotate.
- Postgres password in `.claude/settings.local.json:93`. Rotate.

A separate commit should scrub `.claude/settings*.json` of these cached cred strings.
