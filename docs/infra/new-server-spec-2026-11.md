# Rayalaseema News: New Production Server Spec (Nov 2026)

**For:** the infra agent/engineer who will provision the new production server.
**From:** the app-side team (Rayalaseema News codebase: `mailtomcs2023/rayalaseema-news`).
**Date:** 2026-11-06

---

## 0. Context: why this server exists

- Production ran on a single Azure VM (`vm-rayalaseema-prod`, Standard_B2s, 2 vCPU / 4 GB RAM, 30 GB disk, Ubuntu 24.04, Central India).
- On ~2026-11-04 the Azure Sponsorship subscription that held it was **disabled (read-only)**. The VM is stopped, and rayalaseemanews.com and admin.rayalaseemanews.com are **down**.
- The database has been **recovered and verified**. It is saved off-Azure, and the app team will restore it onto your server.
- We are moving **off Azure for hosting**. The AI engine (Azure OpenAI / Speech / Images) stays on Azure for now, but it is reached over HTTPS only and is not your concern beyond outbound network access.
- The old box was undersized: builds ran out of memory and hung deploys twice. It also kept its only backups **on the same disk as the database**. Do not repeat either mistake.

---

## 1. What runs on the server

Everything below runs on one VM. That is fine at the current scale (DB 122 MB, 16 staff users, ~8k content rows).

| Component | Detail |
|---|---|
| **web** | Next.js 16 public site, `bun run start` on **port 3000** (PM2 process `web`) |
| **admin** | Next.js 16 CMS, **port 3001** (PM2 process `admin`) |
| **cron** | `bun scripts/cron-runner.ts` (PM2 process `cron`). It calls admin cron routes on 127.0.0.1:3001 every 60 s / 120 s / 15 min, plus daily IST jobs |
| **PostgreSQL 16** | Local only. DB `rayalaseema_express`, app role `reapp` |
| **nginx** | Reverse proxy with TLS for `rayalaseemanews.com`, `www.`, `admin.`, `epaper.` (all proxy to 3000/3001), plus 301 redirects for the legacy `rayalaseemaexpress.com` / `.in` domains. `client_max_body_size 50m` |
| **Playwright Chromium** | Headless. Renders e-paper pages and press ID card PDFs. Needs **Telugu fonts** installed system-wide |
| **ffmpeg** | Video IQ audio/frame extraction (CPU-heavy in bursts) |
| **Builds happen on the server** | `bun install` and `next build` for two apps on every deploy. This is the peak RAM consumer |

Deploys: GitHub Actions on push to `main` SSHes in (`appleboy/ssh-action`), runs `git reset --hard origin/main`, `pg_dump`, `prisma db push`, seed scripts, builds both apps and restarts PM2. Two more scheduled workflows (`mandi-daily`, `seo-daily-check`) also SSH in daily. The app team will update host, user and paths in these workflows once you return the details in section 9.

---

## 2. Server size

| Resource | **Recommended** | Minimum (do not go below) | Why |
|---|---|---|---|
| vCPU | **4 dedicated** (not burstable/shared credit) | 2 dedicated | Two Next.js builds, Chromium renders and ffmpeg. The B-series burst credits starved the old box |
| RAM | **16 GB** | 8 GB + 4 GB swap | `next build` alone needs ~2.5–3 GB heap per app. Running apps, Postgres and Chromium need the rest. The old 4 GB box hung deploys |
| Disk | **100 GB NVMe SSD** | 60 GB SSD | OS + app + node_modules + 2× `.next` builds ≈ 10–15 GB. Postgres grows. ffmpeg temp files. 14 local rolling pg_dumps. Logs |
| Swap | 4 GB swapfile | 4 GB | Safety net during builds |
| Network | Public static IPv4, ≥1 Gbps port, ≥2 TB/month egress | | Media is served from object storage (see section 6), so origin egress is mostly HTML/JSON |
| Region | **India**: Mumbai, Chennai or Hyderabad | Singapore as fallback | Readers are in Andhra Pradesh. The AI endpoints are in Azure South/Central India |

Any reputable provider is fine (e.g. Hetzner, OVH, DigitalOcean, Vultr, Linode, AWS Lightsail, or our own Medha infra). It **must** offer:
1. **Provider-level automated snapshots/backups** of the VM disk.
2. A **cloud firewall** in front of the VM (in addition to ufw on the host).
3. A static IP.

---

## 3. Operating system and base software

- **OS: Ubuntu Server 24.04 LTS (x86_64)**, minimal install. It is the same as the old server, so packages and paths behave identically.
- Timezone: **UTC** at OS level. The app handles IST itself; do not change this.
- Locale: `en_US.UTF-8`, and `C.UTF-8` available.

Install:

| Package | Version / note |
|---|---|
| `postgresql-16`, `postgresql-client-16` | Ubuntu 24.04 apt default. **Must be 16** to match the dump |
| `nginx` | apt |
| `certbot`, `python3-certbot-nginx` | Let's Encrypt (or Cloudflare origin certs, see section 5) |
| **bun 1.3.5** | `curl -fsSL https://bun.sh/install \| bash -s "bun-v1.3.5"` as the app user |
| **Node.js 22 LTS** | From NodeSource. Next.js 16 needs Node ≥ 20.9. PM2 runs under Node |
| **PM2** (latest) + `pm2-logrotate` | Global npm install. Enable `pm2 startup systemd` for the app user |
| `ffmpeg` | apt |
| Playwright Chromium system deps | `npx playwright install-deps chromium` (the app installs the browser itself on deploy) |
| **Telugu fonts** | `fonts-noto-core fonts-noto-ui-core fonts-telu fonts-noto-color-emoji`, then `fc-cache -f`. Verify with `fc-list :lang=te` (must list Noto Sans Telugu) |
| `git`, `build-essential`, `unzip`, `gzip`, `curl`, `jq`, `htop`, `rsync` | |
| `unattended-upgrades`, `ufw`, `fail2ban`, `auditd`, `chrony` | Security baseline (section 5) |
| `restic` **or** `pgbackrest` | Off-site backups (section 4) |

### Users and paths

- Create a non-root app user: **`deploy`**. App root: **`/home/deploy/app`**. PM2 home: `/home/deploy/.pm2`.
- `deploy` gets **no general sudo**. Allow only these without a password, via `/etc/sudoers.d/deploy`:
  - `systemctl reload nginx`
  - `nginx -t`
  - `apt-get install -y -qq ffmpeg`
- The app team will change `/home/azureuser/app` to `/home/deploy/app` in the workflows.
- Disable root SSH login and password auth for all users.

### PostgreSQL setup

- Listen on **`localhost` only** (`listen_addresses = 'localhost'`). Port 5432 must **never** be reachable from the internet.
- Create role `reapp` (LOGIN, strong **new** random password: the old one is leaked and must not be reused) and database `rayalaseema_express` owned by `reapp`.
- `pg_hba.conf`: `scram-sha-256` for local TCP; peer for the `postgres` OS user.
- Tuning for 16 GB RAM (scale down for 8 GB): `shared_buffers=2GB`, `effective_cache_size=6GB`, `work_mem=16MB`, `maintenance_work_mem=256MB`, `wal_level=replica`, `archive_mode=on` (for PITR, section 4).
- **Do not restore data.** The app team restores the recovered dump.

---

## 4. Backups and ransomware protection (most important section)

Last time the only backups lived on the same disk as the DB, and losing the host meant losing everything. The rule now: **no single compromise (server, provider account or our laptop) may destroy every copy.**

### 4.1 Layers (3-2-1-1-0)

| Layer | What | Frequency | Retention | Where |
|---|---|---|---|---|
| **A. Provider snapshots** | Whole-disk snapshot of the VM | Daily | 7 daily + 4 weekly | Provider (same account as VM) |
| **B. Logical DB dumps** | `pg_dump -Fc` of `rayalaseema_express` + `pg_dumpall --globals-only` | Every 6 h + pre-deploy (already in the deploy script) | Local: last 14. Off-site: see C | Local `/var/backups/rsn/` (fast restore only, NOT a real backup) |
| **C. Off-site immutable copies** | Every B dump, plus a nightly `restic` backup of `/home/deploy/app/apps/*/.env`, `/etc/nginx`, `/etc/letsencrypt` and `/home/deploy/app/apps/*/public/uploads` | After each dump / nightly | 30 daily, 12 weekly, 12 monthly | **Object storage with Object Lock / immutability (WORM) in COMPLIANCE mode, 30-day lock**, at a **different provider/account** from the VM. Options: Backblaze B2 (Object Lock), Wasabi (Object Lock), AWS S3 (Object Lock), Cloudflare R2 (bucket lock rules) |
| **D. Point-in-time recovery** | WAL archiving via **pgBackRest** or **wal-g** to the same immutable bucket (separate prefix) | Continuous | 14 days | Same as C |
| **E. Cold copy** | Monthly encrypted DB dump downloaded to the office NAS / admin PC | Monthly | 12 months | Offline / on-prem |

### 4.2 Hard rules

1. **The server's backup credentials are write-only.** The key on the server can PUT new objects but **cannot delete or overwrite** them (no `DeleteObject`, no lifecycle changes). Retention and pruning run from a **separate admin credential that is never stored on the server**. Ransomware on the box therefore cannot wipe backups.
2. **Object Lock / immutability is mandatory** on the backup bucket. Versioning on.
3. **Encrypt everything before upload.** restic and pgBackRest both encrypt client-side. Store the encryption passphrase in the team password manager, **not only on the server**.
4. **Separate account.** The backup bucket lives in a different provider account from the VM, with MFA on the root login. If the VM provider account is suspended or hijacked, as just happened with Azure, the backups survive.
5. **Restore tests.** Monthly, automated where possible: restore the latest dump into a scratch Postgres and check row counts. **A backup that has never been restored is not a backup.**
6. **Alerting.** If no new dump lands in the bucket for > 8 h, alert by email/Telegram/WhatsApp (e.g. healthchecks.io dead-man switch pinged after each successful upload).

---

## 5. Security hardening

### 5.1 Network

- **Put Cloudflare in front** (proxied DNS, orange cloud) for `rayalaseemanews.com`, `www`, `admin`, `epaper`. This gives a free WAF, DDoS protection and caching, and hides the origin IP.
  - Origin cloud firewall + ufw: allow **80/443 only from Cloudflare IP ranges** (https://www.cloudflare.com/ips/). Refresh weekly via cron.
  - TLS: Cloudflare **Full (strict)** with a Cloudflare Origin Certificate (15-year) or Let's Encrypt on origin.
  - If DNS stays at GoDaddy for now, plain Let's Encrypt + ufw is acceptable as a first step. Say which you did in section 9.
- **SSH (22):** key-only, `PermitRootLogin no`, `PasswordAuthentication no`, `MaxAuthTries 3`, `AllowUsers deploy <admin-user>`.
  - GitHub-hosted runners have changing IPs, so SSH cannot be IP-allowlisted for deploys. **Preferred:** install **Tailscale** on the server, keep SSH closed to the public internet, and the app team switches the deploy workflow to the Tailscale GitHub Action. **Fallback:** SSH open publicly with fail2ban (ban after 5 failures, 1 h), and a dedicated deploy key in GitHub secrets only.
- Postgres 5432, PM2 ports 3000/3001: **bound to localhost / blocked** from outside. Verify from an external host with `nmap -Pn <ip>`: only 22 (if not on Tailscale), 80 and 443 may show.
- Outbound: allow all. The app calls Azure OpenAI/Speech, Google APIs, YouTube, NewsData, PTI, Pexels, DataForSEO, Jina, OSM Nominatim, GitHub.

### 5.2 Host

- `unattended-upgrades` for security updates, with **auto-reboot disabled**. Weekly patch window: Sunday 02:00–03:00 IST, with a manual reboot.
- `fail2ban` with jails for sshd, plus nginx-limit-req / nginx-botsearch.
- `auditd` with a basic ruleset (watch `/etc/passwd`, `/etc/sudoers*`, `/home/deploy/app/apps/*/.env`).
- AppArmor enabled (Ubuntu default). Do not disable it.
- `chrony` for time sync (JWT/OAuth tokens fail with clock drift).
- File permissions: `.env` files `600 deploy:deploy`; `/home/deploy` `750`.
- No secrets in shell history, cloud-init user-data or world-readable files.
- Optional but recommended: **CrowdSec** agent + nginx bouncer (community IP blocklists).

### 5.3 Application-level security (app team handles this; listed so you know)

- **All production credentials will be rotated** at cutover (they leaked earlier, and the old DB password is hardcoded in workflows).
- Workflows will read the DB password from GitHub secrets instead of plaintext.
- nginx: rate-limit `/api/` and the admin login endpoint, security headers (HSTS, X-Content-Type-Options, frame-ancestors). The app team will provide the nginx confs from `infra/nginx/`. Install them as given.

### 5.4 Monitoring

- Uptime checks (UptimeRobot / Better Stack / healthchecks.io), every 1 min:
  - `https://rayalaseemanews.com`
  - `https://admin.rayalaseemanews.com/login`
- Host metrics with alerts: disk > 80 %, RAM > 90 % for 10 min, load > 4 for 15 min. Provider monitoring or Netdata Cloud are both fine.
- `pm2-logrotate`: max 50 MB per file, keep 14.
- Alert contact: reddygs@medhahosting.com (plus a phone/Telegram channel if available).

---

## 6. Object storage for media (replaces Azure Blob)

The app currently stores uploaded images/videos in Azure Blob (account `rayalaseemamedia`). That account is in the disabled subscription, so a replacement is needed. Please create:

| Bucket | Access | Purpose |
|---|---|---|
| `rsn-media` | **Public read** via custom domain `media.rayalaseemanews.com` (CDN in front) | Article images, video, thumbnails |
| `rsn-kyc` | **Private**, no public access, encryption at rest | Reporter KYC documents (Aadhaar/PAN images: sensitive PII) |
| `rsn-backups` | **Private, Object Lock / immutable**, different account from the VM (section 4) | Backups |

- **Chosen: our own MinIO server** for `rsn-media` / `rsn-kyc`. The app talks to it over the S3 API. Requirements:
  - MinIO must be reachable from the internet over **HTTPS** at `media.rayalaseemanews.com`. Every reader's browser loads article images directly from it.
  - Put it **behind Cloudflare (proxied)** so images are cached at the edge. Our office uplink then serves only cache misses, and the MinIO IP stays hidden.
  - **Uptime matters.** If MinIO or the office link goes down, every image on the site breaks. It needs a UPS, a static IP or tunnel (Cloudflare Tunnel is fine and avoids opening ports), and monitoring.
  - Disk: ≥ 200 GB to start (the current media set is ~13k files; see the download in `D:\RSN-DB-Backups\blob-uploads`), on RAID/erasure-coded drives.
  - Enable **versioning** on `rsn-media`. Create a **scoped access key** for the app (read/write on `rsn-media` + `rsn-kyc` only), never the MinIO root key.
  - Anonymous **read-only** policy on `rsn-media` (download only, no listing). `rsn-kyc` stays private.
  - Fallback if MinIO can't meet the uptime bar: Cloudflare R2 (same S3 code, zero egress).
- **Backups must NOT live only on that same MinIO.** `rsn-backups` goes to an off-site provider with Object Lock (Backblaze B2 / Wasabi / S3), as section 4 requires. If the office MinIO is used for backups, it is an *extra* copy, with MinIO Object Lock enabled on that bucket.
- **Existing media to load into MinIO** (initial import): the files in `D:\RSN-DB-Backups\blob-uploads\` (13,119 files, 5.1 GB, including `videos/` and `press-cards/` subfolders) keep the same object names. The app team will rewrite URLs in the DB from `https://rayalaseemamedia.blob.core.windows.net/uploads/<name>` to `https://media.rayalaseemanews.com/<name>` (or whatever public path you give us).
- Create **S3 API keys scoped per bucket**: the app key gets read/write on `rsn-media` + `rsn-kyc` only; the backup key is write-only on `rsn-backups`.
- CORS on `rsn-media`: allow `PUT` from `https://admin.rayalaseemanews.com` (the browser uploads video directly with presigned URLs).
- The app team will rewrite `apps/admin/src/lib/blob.ts` to the S3 API and migrate existing objects once the old blob account is readable again.

---

## 7. DNS (for awareness, cutover is coordinated with the app team)

- Domains: `rayalaseemanews.com` (primary), legacy `rayalaseemaexpress.com` / `.in` (301 redirects only). Registrar/DNS is currently GoDaddy.
- Records needed at cutover: `@`, `www`, `admin`, `epaper` pointing to the new IP (or proxied via Cloudflare), and `media` pointing to the media bucket/CDN.
- Lower TTLs to 300 s **now** so cutover is fast.
- **Do not cut DNS over** until the app team confirms the restore and smoke test pass.

---

## 8. Acceptance checklist (before handing back)

- [ ] Ubuntu 24.04 LTS, fully patched, hostname `rsn-prod-01`
- [ ] Size meets section 2 (state actual vCPU/RAM/disk)
- [ ] User `deploy` exists, key-only SSH works, root and password login disabled
- [ ] bun 1.3.5, Node 22, PM2 (+ startup on boot), nginx, certbot, PostgreSQL 16, ffmpeg, Chromium deps, Telugu fonts installed (`fc-list :lang=te` shows Noto Sans Telugu)
- [ ] Postgres listening on localhost only; role `reapp` + DB `rayalaseema_express` created, empty
- [ ] 4 GB swap active
- [ ] ufw + cloud firewall: only 80/443 (+22 or Tailscale) reachable; `nmap` from outside confirms
- [ ] fail2ban, unattended-upgrades, auditd, chrony active
- [ ] Provider daily snapshots enabled
- [ ] Immutable off-site backup bucket created; write-only key installed; one test upload done; deleting it with the server key **fails** (prove it)
- [ ] Backup timer/cron installed (6-hourly dump + nightly restic) and the dead-man alert wired
- [ ] Media buckets + scoped keys created (section 6)
- [ ] Uptime + resource monitoring configured
- [ ] Nothing restored and DNS not changed (the app team does both)

---

## 9. What to send back to the app team

Send these via a password manager share or another secure channel, **not** in plain chat or email:

```
Provider / region / plan name:
Public IPv4 (and IPv6 if any):
Hostname:
vCPU / RAM / disk (actual):
SSH: user, port, how to connect (public or Tailscale name), and which public key(s) are authorised
GitHub Actions deploy key: confirm the private key has been stored as repo secret VM_SSH_KEY
  (or hand it over securely; the app team will add it)
Tailscale used? (yes/no) If yes: tailnet name + OAuth client for the GitHub Action
Postgres: confirm role reapp + DB rayalaseema_express exist; password delivered securely
TLS approach: Cloudflare proxied + origin cert, or Let's Encrypt direct
Cloudflare: account in use? zone added for rayalaseemanews.com? (yes/no)
Media storage (MinIO): S3 endpoint URL (HTTPS), region string, path-style or virtual-host style,
  bucket names, public media base URL, scoped access key ID + secret, Cloudflare in front? (yes/no)
Cron: old server had a user crontab entry (daily 07:45 UTC Indexing API rotation using
  /home/<user>/secrets/gsc-key.json). Create /home/deploy/secrets/ (700); app team will place the key
Backup storage: provider, bucket, Object Lock mode/retention, how the passphrase is stored
Monitoring: tools used and where alerts go
Anything you deviated from in this spec, and why
```

Once we have these, the app team will:
1. Restore the recovered database.
2. Update the deploy workflows (host, user, paths, secrets).
3. Deploy the code and rotate all credentials.
4. Smoke-test, then cut DNS over with you.
