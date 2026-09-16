## Frontend Security

| | Security Measure | Description |
|---|-----------------|-------------|
| ☑ | Use HTTPS everywhere | Backend redirects to HTTPS in production (server.js); all app API URLs are env-configured |
| ☑ | Input validation and sanitization | Backend now sanitizes all body/query/param input globally (server.js → sanitizeInput) plus express-validator on routes |
| ☑ | Don't store sensitive data in the browser | Audited AsyncStorage usage across all 3 apps — only cart/theme/offline-queue data, no tokens or secrets |
| ☑ | CSRF protection | N/A — API uses Bearer JWT auth only, no cookie-based sessions, so CSRF (which relies on ambient cookies) doesn't apply |
| ☑ | Never expose API keys in frontend | No hardcoded secrets found in app code; removed a real PayFast merchant key that was committed in apps/customer/README.md (rotate that key — see note below) |

## Backend Security

| | Security Measure | Description |
|---|-----------------|-------------|
| ☑ | Authentication fundamentals | Supabase Auth (bcrypt-hashed passwords) + custom JWT fallback with token blacklist on logout |
| ☑ | Authorization checks | Role-based `authorize()` middleware enforced on all protected routes, including admin |
| ☑ | API endpoint protection | Every route file requires `authenticate` |
| ☑ | SQL injection prevention | All queries go through the Supabase client (parameterized) — no raw/concatenated SQL found |
| ☑ | Basic security headers | `helmet()` applied (HSTS, X-Frame-Options, X-Content-Type-Options, CSP) |
| ☐ | DDoS protection | Not code-level — needs an infra decision (e.g. putting Cloudflare in front of Railway). Flagging for you to set up separately |

## Practical Security Habits

| | Security Measure | Description |
|---|-----------------|-------------|
| ☑ | Keep dependencies updated | Fixed 6 known vulnerabilities in backend deps (multer high-severity DoS, qs/decode-uri-component moderate) via npm audit fix + package.json overrides. `npm audit` is now clean |
| ☑ | Proper error handling | Global error handler returns generic messages in production, full detail only in dev |
| ☑ | Secure cookies | N/A — no cookies are used anywhere in this app (Bearer token auth only) |
| ☑ | File upload security | Multer type/size limits + magic-byte signature check + ClamAV malware scanning before accepting any image |
| ☑ | Rate limiting | Global limiter, stricter auth-route limiter, and a separate PayFast webhook limiter — all backed by a distributed (Redis) store |

---

**Manual follow-up needed:**
- ~~Rotate the PayFast merchant key that was committed in `apps/customer/README.md`~~ — done, key rotated 2026-09-14.
- Decide on a DDoS mitigation layer in front of Railway (e.g. Cloudflare).
