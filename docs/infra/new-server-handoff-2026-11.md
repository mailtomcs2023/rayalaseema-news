# Rayalaseema News — New Production Server Handoff (Nov 2026)

**For:** the app team (`mailtomcs2023/rayalaseema-news`)
**From:** infra
**Date:** 2026-11-06
**Spec followed:** `docs/infra/new-server-spec-2026-11.md`
**Secrets:** not in this file. They are in `D:\RSN-DB-Backups\new-server-secrets.txt` (owner-only; share via password manager).

**Current state:** the server is built, hardened and backed up. DNS for all three domains is on Cloudflare and points at the new server. Every hostname answers **HTTP 503 + `Retry-After: 3600`** with the maintenance page until you deploy.

**Not done by infra, as required:** no database restored, no media uploaded, no app code deployed.

---

## 1. Server

| Item | Value |
|---|---|
| Provider / region / plan | **Medha Cloud own infrastructure** (Proxmox cluster `mcpmxcls01`, node `mcn02`), Yotta DC, India (AS136171). VM 130 |
| Hostname | `rsn-prod-01` |
| Public IPv4 | **103.83.37.54** (static, /22, gw 103.83.36.1). No public IPv6 |
| vCPU / RAM / disk (actual) | **4 vCPU** (host CPU passthrough, high CPU weight) / **16 GB RAM**, no ballooning, 15 GB usable / **100 GB SSD** (ZFS on WD SA510 SATA SSD) + **4 GB swap** |
| OS | Ubuntu 24.04.5 LTS, kernel 6.8.0-149, fully patched 2026-11-06, timezone **UTC**, locale `en_US.UTF-8` |
| Snapshots ("provider backups") | Proxmox `vzdump` **daily 21:00 UTC (02:30 IST)**, snapshot mode (no downtime), keep **7 daily + 4 weekly**. Stored on a different SSD from the VM disk. First backup verified (1.8 GB) |
| Cloud firewall | Proxmox VM firewall: default DROP. Allows 80/443 **only from Cloudflare IPv4 ranges**, 22/tcp (see 2), 41641/udp (Tailscale) and ICMP |

## 2. Access

| Item | Value |
|---|---|
| Deploy user | **`deploy`** (no general sudo). Key-only |
| Admin user | `rsnadmin` (sudo, infra only). Key-only |
| SSH | `ssh deploy@103.83.37.54` (port 22), **or** over Tailscale: `ssh deploy@rsn-prod-01.tail79a070.ts.net` (100.73.19.66, tailnet `medhahosting.com`) |
| Authorised keys | `deploy`: `rsn_deploy@rsn-prod-01` (ed25519). `rsnadmin`: `rsn_admin@rsn-prod-01` (ed25519). Private keys are in the secrets file |
| GitHub secret `VM_SSH_KEY` | **Not set by infra** (to avoid overwriting the old secret mid-migration). Put the `deploy` private key from the secrets file into `VM_SSH_KEY` when you switch the workflows |
| Tailscale | **Installed and online.** OAuth client for the GitHub Action: **not created yet**. Create it in Tailscale admin → Settings → OAuth clients (tag `tag:ci`), add `TS_OAUTH_CLIENT_ID` / `TS_OAUTH_SECRET`, then tell infra to close public port 22 |
| sudo for `deploy` | NOPASSWD only for: `systemctl reload nginx`, `nginx -t`, `apt-get install -y -qq ffmpeg` |
| SSH rate limit | ufw `limit` on 22: more than 6 new connections in 30 s from one IP are dropped briefly. Reuse one SSH session per job |
| Paths | App `/home/deploy/app`. PM2 home `/home/deploy/.pm2`. Secrets dir **`/home/deploy/secrets` (700)**: put `gsc-key.json` here and recreate the 07:45 UTC crontab entry. `/home/deploy` is 750 |

## 3. Software installed (section 3)

| Component | Version / note |
|---|---|
| PostgreSQL | **16.15**. `listen_addresses = localhost` (127.0.0.1 and ::1 only). Role **`reapp`** (LOGIN, new random password in the secrets file) + DB **`rayalaseema_express`** owned by `reapp`, **empty** (0 tables). `pg_hba`: peer for local sockets, scram-sha-256 for 127.0.0.1/::1. Tuned for 16 GB: `shared_buffers=2GB`, `effective_cache_size=6GB`, `work_mem=16MB`, `maintenance_work_mem=256MB`, `wal_level=replica`, `archive_mode=on` (pgBackRest) |
| nginx | 1.24.0. `server_tokens off`. Currently **maintenance mode** (see 7) |
| certbot | 2.9.0 + python3-certbot-nginx. Auto-renew timer on, nginx reload hook installed |
| bun | **1.3.5** (`/home/deploy/.bun/bin/bun`, symlinked `/usr/local/bin/bun`) |
| Node.js | **22 LTS** (v22.23.4, NodeSource) |
| PM2 | 7.1.2, systemd unit `pm2-deploy` enabled at boot. `pm2-logrotate`: max_size 50M, retain 14, compress |
| ffmpeg | 6.1.1 |
| Playwright | Chromium **system deps** installed (`playwright install-deps chromium`). The app installs the browser itself |
| Telugu fonts | `fonts-noto-core fonts-noto-ui-core fonts-telu fonts-noto-color-emoji`. `fc-list :lang=te` lists **Noto Sans Telugu**, Noto Sans Telugu UI, Noto Serif Telugu and 25 more |
| Other | git, build-essential, unzip, gzip, curl, jq, htop, rsync, restic, pgbackrest, age, rclone, qemu-guest-agent |

## 4. TLS and Cloudflare

| Item | Value |
|---|---|
| Cloudflare | **Yes.** Zones `rayalaseemanews.com`, `rayalaseemaexpress.com` and `rayalaseemaexpress.in` are **active** in the Medha Cloudflare account. Nameservers are `barbara.ns.cloudflare.com` / `max.ns.cloudflare.com` (switched at GoDaddy 2026-11-06) |
| Proxy | `@`, `www`, `admin`, `epaper` (and the legacy domains' web hosts) are **proxied** (orange cloud), so the origin IP is hidden. Mail and other records are DNS-only |
| TLS mode | Cloudflare **Full (strict)**, Always Use HTTPS on, minimum TLS 1.2, TLS 1.3 on |
| Origin certs | **Let's Encrypt** (HTTP-01 through Cloudflare, auto-renew), valid until 2027-02-04: `rayalaseemanews` (apex, www, admin, epaper), `rayalaseemaexpress-com` (apex, www, admin), `rayalaseemaexpress-in` (apex, www). Paths: `/etc/letsencrypt/live/<name>/fullchain.pem` + `privkey.pem` |
| Origin firewall | ufw and the Proxmox firewall allow 80/443 **only from Cloudflare ranges**. `/usr/local/sbin/rsn-cf-ips` refreshes the list weekly (cron Mon 04:23 UTC) and writes the nginx real-IP snippet `/etc/nginx/snippets/cloudflare-realip.conf`. **Include that snippet in your nginx confs** so logs and rate limits see real client IPs |

## 5. Media storage (MinIO / Silo)

| Item | Value |
|---|---|
| S3 endpoint URL | **`https://media.rayalaseemanews.com`** (Cloudflare Tunnel `rsn-media` → nginx → Silo, a maintained MinIO fork, on Medha VM 300). Origin IP hidden, no inbound ports |
| Region string | `us-east-1` |
| Addressing | **Path-style** (`forcePathStyle: true`). Virtual-host style is not supported |
| Buckets | **`rsn-media`**: versioning on, encrypted at rest, **anonymous read of objects only** (no listing). **`rsn-kyc`**: private (no anonymous access), versioned, encrypted; responses carry `Cache-Control: private, no-store`, so Cloudflare never caches them |
| Public media base URL | **`https://media.rayalaseemanews.com/rsn-media/<object-name>`**. Rewrite DB URLs from `https://rayalaseemamedia.blob.core.windows.net/uploads/<name>` to this, keeping object names |
| Scoped app key | Access key ID `rsnapp`, secret in the secrets file. Read/write on `rsn-media` + `rsn-kyc` only. **Not** the MinIO root key |
| CORS | `GET, HEAD, PUT` allowed **only from `https://admin.rayalaseemanews.com`** (preflight answered by nginx; `ETag` exposed) for presigned browser uploads |
| Blocked paths | `/minio/*` admin API and every other bucket → 404 |
| Cloudflare in front | **Yes** (proxied CNAME to the tunnel) |
| Initial import | Not done (spec: app team). `D:\RSN-DB-Backups\blob-uploads\uploads\` → `rsn-media`, same names |

## 6. Backups and ransomware protection (section 4)

| Layer | Implementation |
|---|---|
| A. Snapshots | Proxmox vzdump daily, 7 daily + 4 weekly (see 1) |
| B. Logical dumps | `rsn-pgdump.timer` **every 6 h** (00:15/06:15/12:15/18:15 UTC): `pg_dump -Fc` + `pg_dumpall --globals-only` → `/var/backups/rsn/`, keep 14. Your pre-deploy dump in the workflow is unaffected |
| C. Off-site immutable | **Backblaze B2**, a separate provider and account from the server, bucket **`rsn-backups-medha`**, private, **Object Lock COMPLIANCE, 30-day default retention**, SSE-B2. Each dump and the nightly file archive (`.env`, `/etc/nginx`, `/etc/letsencrypt`, `apps/*/public/uploads`; `rsn-files-backup.timer` 21:30 UTC) is **age-encrypted on the server** and uploaded with a **write-only key** |
| D. PITR | **pgBackRest** stanza `rsn`, continuous WAL archiving to repo1 (local, encrypted, weekly full + daily diff) **and repo2 = B2** prefix `pgbackrest/` (encrypted; weekly full Sun 22:00 UTC). Expiry of repo2 is never run from the server (`expire-auto=n`) |
| E. Cold copy | Not automated. Admin: monthly download of the latest encrypted dump to the office NAS |
| Dead-man alert | healthchecks.io `rsn-db-dump-offsite`: pinged only after a successful **off-site** upload. Alerts by email if none arrives for **> 8 h** (6 h period + 2 h grace). Also `rsn-files-offsite` (daily) |
| Encryption keys | age **public** key only on the server. The private key (needed to restore) and the pgBackRest cipher are in the secrets file / password manager, **not only on the server** |

**Proof that the server key cannot destroy a backup** (run 2026-11-06 with the server's own B2 key, raw S3 API):

```
DELETE specific VERSION (server key): HTTP 403  AccessDenied  not entitled
GET object (server key):              HTTP 403
PUT lifecycle (server key):           HTTP 403
List bucket (server key, rclone):     AccessDenied: not entitled (403)
Admin view after: [upload 1899B lock=compliance until 2026-12-06]   <- data intact
Master key delete of a locked version: 401 access_denied            <- even the admin can't before 30 days
```

**Caveat:** a plain S3 `DELETE` without a version ID returns 204, but B2 only adds a **hide marker**. The locked data version stays, and an admin removes the marker with the master key. Ransomware on the server can therefore *hide* backups but cannot delete or read them.

**Restore test:** `pg_restore -l` checks each dump's readability at creation. The **monthly restore-into-scratch-Postgres test is not automated yet**; recommended as an app-team or admin task.

## 7. Making the site live (app team runbook)

1. **Restore the DB** into `rayalaseema_express` as `reapp` (password in the secrets file; `DATABASE_URL` line provided there).
2. **Workflows:** host `103.83.37.54` (or the Tailscale name), user `deploy`, path `/home/deploy/app`, secret `VM_SSH_KEY` = `deploy` private key. Move the DB password into GitHub secrets.
3. **Deploy the code** (`bun install`, builds, PM2 `web` :3000, `admin` :3001, `cron`). PM2 boot persistence: run `pm2 save` after starting.
4. **nginx:**
   - Install your confs from `infra/nginx/` (main site plus the `*-redirect.conf` files for the legacy domains).
   - Use the Let's Encrypt cert paths from section 4.
   - `include /etc/nginx/snippets/cloudflare-realip.conf;` in the `http` or `server` context.
   - Then remove maintenance mode: delete `/etc/nginx/conf.d/00-rsn-maintenance.conf`, keep `/etc/nginx/snippets/rsn-maintenance-body.conf` for future maintenance, then `sudo nginx -t && sudo systemctl reload nginx`.
   - Keep the `/.well-known/acme-challenge/` location (webroot `/var/www/letsencrypt`), or certificate renewals will fail.
5. **Media:** upload `blob-uploads` to `rsn-media`, then rewrite URLs (section 5).
6. **Smoke test:** `https://rayalaseemanews.com`, `/login` on admin, epaper, an image URL, a presigned upload from admin, Telugu rendering in a Playwright PDF.
7. **Monitoring:** **unpause** the two UptimeRobot monitors (account reddygs@medhahosting.com).
8. **Tell infra** to (a) close public port 22 once the deploy runs over Tailscale, and (b) optionally enable HSTS in Cloudflare.
9. **Go/no-go:** the owner asks the app team to confirm 1–7 before announcing.

## 8. Monitoring (section 5.4)

| What | Tool | Alerts to |
|---|---|---|
| Uptime `https://rayalaseemanews.com` and `https://admin.rayalaseemanews.com/login` | UptimeRobot, **every 5 min** (plan minimum; spec asked 1 min). **Paused until go-live** (site is intentionally 503) | reddygs@medhahosting.com |
| Host: disk > 80 %, RAM > 90 % for 10 min, 15-min load > 4, host silent | `rsn-hostcheck` timer every minute → healthchecks.io `rsn-host-health` (`/fail` with reason) | reddygs@medhahosting.com |
| Off-site backup dead-man | healthchecks.io `rsn-db-dump-offsite` (> 8 h), `rsn-files-offsite` | reddygs@medhahosting.com |
| VM backup failure | Proxmox job mail on failure | reddygs@medhahosting.com |
| Logs | `pm2-logrotate` 50 MB × 14; journald; auditd | — |

## 9. Security hardening (section 5)

- **SSH:** `PermitRootLogin no`, `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, `MaxAuthTries 3`, `AllowUsers deploy rsnadmin`, publickey only. Verified: password and root logins are refused.
- **fail2ban:** jails `sshd`, `nginx-limit-req`, `nginx-botsearch`; ban 1 h after 5 failures in 10 min.
- **unattended-upgrades:** security updates daily, **Automatic-Reboot false**. Patch window: Sunday 02:00–03:00 IST, manual reboot.
- **auditd:** watches passwd/shadow/group/sudoers/sshd_config/`/home/deploy/secrets`/authorized_keys. `/home/deploy/app/apps/*/.env` watches are added automatically once the files exist (hourly + boot).
- **Other host settings:**
  - AppArmor enabled; chrony in sync;
  - sysctl hardening: rp_filter, no redirects, syncookies, `kptr_restrict`, `dmesg_restrict`;
  - qemu-guest-agent installed;
  - no secrets in cloud-init user-data or shell history.
- **Not installed:** CrowdSec (optional in spec). Cloudflare's WAF and bot checks are in front instead.

## 10. External port scan

`nmap -Pn 103.83.37.54` from 103.83.36.12. That is outside the VM and **not** a Cloudflare address, so it sees what any non-Cloudflare client sees:

```
Not shown: 999 filtered tcp ports (no-response)
PORT   STATE SERVICE
22/tcp open  ssh

22/tcp   open     ssh
80/tcp   filtered http
443/tcp  filtered https
3000/tcp filtered ppp
3001/tcp filtered nessus
5432/tcp filtered postgresql
8081/tcp filtered blackice-icecap
9000/tcp filtered cslistener
```

From the public internet (home ISP), TCP connect test: `22 OPEN`; `80, 443, 3000, 3001, 5432, 8080, 8081, 9000` closed or filtered.

Through Cloudflare, all hostnames return `503` + `retry-after: 3600`, and `http://` redirects 301 to `https://`.

**Result:** only 22 is reachable directly. 80/443 work only through Cloudflare. 3000, 3001 and 5432 are not reachable.

## 11. DNS — before and after

Full GoDaddy export (all three domains, with raw JSON for re-import): `docs/infra/dns-before-2026-11.txt`.

**Mail:** all three domains use **Microsoft 365 / Outlook** mail (MX `*.mail.protection.outlook.com`, SPF `include:spf.protection.outlook.com`, DKIM `selector1/2._domainkey`, `autodiscover`), **not** Google Workspace. Every MX, SPF, DKIM, DMARC, `google-site-verification` and `MS=` record was copied **exactly**. Before the nameserver switch, the Cloudflare zone was checked record-by-record against the export: **ALL MATCH**.

| Domain | Record | BEFORE (GoDaddy) | AFTER (Cloudflare) |
|---|---|---|---|
| rayalaseemanews.com | NS | ns47/ns48.domaincontrol.com | barbara/max.ns.cloudflare.com |
| | A @ | 20.198.2.80 (600) | 103.83.37.54 **proxied** |
| | www | CNAME @ (600) | A 103.83.37.54 **proxied** |
| | A admin | 20.198.2.80 (600) | 103.83.37.54 **proxied** |
| | epaper | *(none)* | A 103.83.37.54 **proxied** (new) |
| | media | *(none)* | CNAME `1e1531e3-….cfargotunnel.com` **proxied** (new) |
| | MX @ | 0 rayalaseemanews-com.mail.protection.outlook.com | same, TTL 300 |
| | TXT @ | v=spf1 include:spf.protection.outlook.com -all | same, TTL 300 |
| | TXT @ | google-site-verification=Dcklr1L2… / =S716xSxm… | same (both), TTL 300 |
| | TXT _dmarc | v=DMARC1; p=quarantine; … rua=mailto:dmarc_rua@onsecureserver.net; | same, TTL 300 |
| | TXT _acme-challenge | -4vhjqv9DaTX-UbZkOMNeKu_lV2j_AakwGREe_-nIdY | same, TTL 300 |
| | CNAME autodiscover / enterpriseenrollment / enterpriseregistration / _domainconnect | Microsoft / GoDaddy targets | same, TTL 300 |
| rayalaseemaexpress.com | NS | ns15/ns16.domaincontrol.com | barbara/max.ns.cloudflare.com |
| | A @, A admin, www | 20.198.2.80 / CNAME @ | A 103.83.37.54 **proxied** (301 redirects by your `*-redirect.conf`) |
| | MX, SPF, DMARC, google-site-verification, `MS=2698547`, DKIM selector1/selector2, autodiscover, enterprise*, _domainconnect | as exported | same, TTL 300 |
| rayalaseemaexpress.in | NS | ns29/ns30.domaincontrol.com | barbara/max.ns.cloudflare.com |
| | A @, www | 20.198.2.80 / CNAME @ | A 103.83.37.54 **proxied** |
| | TXT _dmarc, CNAME _domainconnect | as exported | same, TTL 300 |

TTL: DNS-only records **300 s**. Proxied records use Cloudflare "auto".

**Not touched:** `rayalaseema.news` and `rayalaseemaexpress.co.in`, which are also in the GoDaddy account but not in the spec.

## 12. Section 8 acceptance checklist

- [x] **Ubuntu 24.04 LTS, fully patched, hostname `rsn-prod-01`.** 24.04.5, 0 pending upgrades, rebooted onto the new kernel.
- [x] **Size meets section 2.** 4 vCPU / 16 GB / 100 GB SSD + 4 GB swap. SATA SSD, not NVMe; see deviations.
- [x] **User `deploy` exists, key-only SSH works, root and password login disabled.** Verified by actual login attempts.
- [x] **bun 1.3.5, Node 22, PM2 (+ boot), nginx, certbot, PostgreSQL 16, ffmpeg, Chromium deps, Telugu fonts.** `fc-list :lang=te` shows Noto Sans Telugu.
- [x] **Postgres on localhost only; `reapp` + `rayalaseema_express` created, empty.** Sockets 127.0.0.1:5432 and [::1]:5432; 0 tables; `reapp` login tested.
- [x] **4 GB swap active.**
- [x] **ufw + cloud firewall: only 80/443 (+22 or Tailscale) reachable; nmap confirms.** 80/443 only via Cloudflare; 22 public until Tailscale cutover. See section 10.
- [x] **fail2ban, unattended-upgrades, auditd, chrony active.**
- [x] **Daily snapshots enabled.** Proxmox vzdump, first run OK.
- [x] **Immutable off-site bucket; write-only key installed; test upload done; delete with server key fails.** See the proof in section 6.
- [x] **Backup timers (6-hourly dump + nightly off-site) and dead-man alert wired.** Nightly files backup uses age + rclone instead of restic; see deviations.
- [x] **Media buckets + scoped keys created.**
- [x] **Uptime + resource monitoring configured.** Uptime monitors are paused until go-live.
- [x] **Nothing restored.** DNS **was** changed, on the owner's explicit instruction of 2026-11-06, following the rules given (export first, mail records kept, record-by-record verification, maintenance 503 until deploy).

## 13. Deviations from the spec, and why

1. **Hosting on Medha's own Proxmox**, which the spec allows. The disk is a **SATA SSD (WD SA510, ZFS), not NVMe**. "Provider snapshots" are Proxmox vzdump backups on a **different SSD in the same host**, not a separate provider; off-site safety comes from B2.
2. **Backup bucket is `rsn-backups-medha`**, not `rsn-backups`, because B2 bucket names are global and that one is taken. B2 region **us-east-005**: B2 has no India region, and region doesn't matter for an off-site copy.
3. **No restic for the off-site copy.** restic must delete its own lock files, which a write-only key cannot do. Dumps and file archives are instead **age-encrypted and uploaded PUT-only with rclone**, which meets the spec's intent better. pgBackRest handles WAL/PITR with `expire-auto=n`; pruning happens only through the admin key and the 30-day lock.
4. **Hide-marker caveat:** see section 6. Data versions cannot be deleted by the server; hide markers can be removed by an admin.
5. **Public media URL includes the bucket:** `https://media.rayalaseemanews.com/rsn-media/<name>`, because path-style S3 uses one hostname for the API and public reads.
6. **UptimeRobot interval 5 min** (plan minimum), not 1 min. Monitors paused until go-live.
7. **SSH 22 is still public** (spec fallback: key-only + fail2ban + ufw rate limit). Tailscale is installed; close 22 after the deploy workflow moves to the Tailscale action. The OAuth client still needs creating.
8. **TLS on the origin uses Let's Encrypt**, because Cloudflare refused Origin CA certificates while the zones were pending. Mode is Full (strict).
9. **Email is Microsoft 365, not Google Workspace,** as the request assumed. Records were preserved exactly either way.
10. **Monthly automated restore test (4.2.5) and monthly cold copy (layer E) are not automated.** They remain admin/app-team tasks.
11. **CrowdSec not installed** (optional); Cloudflare WAF and browser checks are in front.
12. **DNS was changed** (section 8 says infra doesn't change DNS) on the owner's explicit later instruction. The site shows a 503 maintenance page until you deploy.
