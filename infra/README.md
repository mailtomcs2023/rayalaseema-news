<!--
  RENAME-SCRIPT GUARD — strings below intentionally include the OLD domain
  "rayalaseemaexpress.com". Do NOT pass this file through scripts/rename-brand.mjs
  again. The runbook explains the OLD -> NEW migration, so the old name must stay.
-->
# Infra — Rayalaseema News VM setup

Runbook for migrating production from the OLD domain (rayalaseema&#x2011;express.com) to the NEW domain (rayalaseema&#x2011;news.com).

Production: Azure VM `20.198.2.80` (per memory). No SSH for AI agents; commands below are for the human operator to run on the VM.

## 1. DNS (run from local repo)

```sh
# Dry-run — prints plan, hits no records
bun scripts/dns/godaddy-set-records.ts

# Apply — pushes A + CNAME records to GoDaddy for the NEW domain
bun scripts/dns/godaddy-set-records.ts --apply
```

Verify (allow 5-30 min for propagation):

```sh
dig +short rayalaseemanews.com           # expect 20.198.2.80
dig +short www.rayalaseemanews.com       # expect rayalaseemanews.com.
```

## 2. Nginx — new server block (on VM)

Copy `infra/nginx/rayalaseemanews.com.conf` to `/etc/nginx/sites-available/` on the VM.

```sh
# On the VM
sudo cp rayalaseemanews.com.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/rayalaseemanews.com.conf /etc/nginx/sites-enabled/rayalaseemanews.com.conf
sudo nginx -t
sudo systemctl reload nginx

# Issue cert + auto-edit nginx config for SSL
sudo certbot --nginx -d rayalaseemanews.com -d www.rayalaseemanews.com
```

## 3. Old domain — 301 redirect (on VM)

After the NEW domain serves traffic on HTTPS, swap the OLD `rayalaseema-express.com` server block to a pure-redirect block:

```sh
# On the VM — use the file infra/nginx/rayalaseemaexpress.com-redirect.conf
sudo cp rayalaseemaexpress.com-redirect.conf /etc/nginx/sites-available/rayalaseemaexpress.com.conf
sudo nginx -t
sudo systemctl reload nginx
```

Keep `certbot renew` running for the OLD domain so the HTTPS redirect stays valid. Drop the old cert only after >12 months of no traffic via the OLD domain (Google has long memory).

## 4. App env (on VM, in PM2 ecosystem)

Update the PM2 env so the Next.js app emits the NEW canonical URL in OG tags, sitemaps, etc.

```sh
# On the VM, edit the PM2 env file used by the deploy workflow
SITE_URL=https://rayalaseemanews.com
NEXTAUTH_URL=https://admin.rayalaseemanews.com   # if admin subdomain in use

pm2 restart all --update-env
```

## 5. Google Search Console

1. Add `https://rayalaseemanews.com` as a NEW property (Domain property preferred — verifies via DNS).
2. Submit `https://rayalaseemanews.com/sitemap-index.xml`.
3. Submit `/news-sitemap.xml` (Google News).
4. In the OLD property (the rayalaseema-express.com one), use **Settings → Change of Address** → point to the NEW property. Keep BOTH properties verified for at least 6 months so Google can track the migration.
5. Request indexing for the homepage of the NEW domain.

## 6. Other external systems to update manually

- Google Analytics 4 — stream URL → `rayalaseemanews.com`
- Bing Webmaster — add new site, submit sitemap, set 301
- Microsoft Clarity — domain whitelist
- Google AdSense — site approval list
- Sentry — DSN allowed origins
- Cloudflare (if/when added)
- Social handles + bios (Telegram, WhatsApp, X, Instagram, FB, LinkedIn)
- Email signatures + reply-to
- Press release distribution lists
- Wikipedia disambiguation page (per `project_brand_disambiguation` memory)

## 7. Credentials still to rotate (security hygiene)

- GoDaddy API key+secret pasted in chat 2026-06-01 (`dKYSZJzqLvq8_K9cKvHMijGaFnp3Ws6tV6z`). Scrap after rename done.
- OLD GoDaddy key cached in `.claude/settings.json` Bash allow-list. Rotate.
- Azure Speech key in `.claude/settings.json:72`. Rotate.
- Postgres password in `.claude/settings.local.json:93`. Rotate.

A separate commit should scrub `.claude/settings*.json` of these cached cred strings.
