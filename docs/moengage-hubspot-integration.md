# HubSpot → MoEngage Event Integration — Full KT

> A complete, no-prior-knowledge guide to how HubSpot events get into MoEngage
> through this middleware. Read top to bottom. If you only have 2 minutes, read
> the **TL;DR** and the **Confirm it yourself** section.

---

## TL;DR (the whole thing in 6 lines)

1. HubSpot can only send **flat** JSON (`{ "email": "...", "amount": 123 }`).
2. MoEngage's event API only accepts **nested** JSON (`{ "actions": [ { ... } ] }`).
3. This middleware sits in the middle: HubSpot POSTs flat → we reshape to nested → we POST to MoEngage.
4. There are **3 URLs**, one per event type (Lead Created / Project Status Updated / Payment Update). The URL decides the event name.
5. The user is matched in MoEngage by **`customer_id`, which is the email**.
6. Everything is config + one small transformer file. No controllers were written.

---

## 1. The problem, explained like you're five

Imagine HubSpot writes letters, but it can **only write on a flat postcard**:

```
email: priya@example.com
amount: 250000
```

MoEngage only accepts letters folded into a **special envelope with pockets**:

```
Envelope
 └── type: "event"
 └── customer_id: priya@example.com
 └── actions (a pocket)
      └── action: "Payment Update"
      └── attributes (a smaller pocket)
           └── amount: 250000
```

HubSpot can't fold the postcard into that envelope. So we hire a **helper in the
middle** (this middleware). HubSpot hands it the flat postcard; the helper folds
it into MoEngage's envelope and drops it in MoEngage's mailbox.

That helper is the whole project.

---

## 2. The big flow (one picture)

```
  HubSpot Workflow                    THIS MIDDLEWARE (NestJS)                     MoEngage Data API
  ────────────────                    ───────────────────────                     ─────────────────
                                                                                
  Deal stage changes                                                            
        │                                                                       
        │  POST flat JSON                                                       
        │  { email, amount, dealstage }                                        
        ▼                                                                       
  /xp-mi/public/v1/hubspot/moengage/payment-update ─────┐                       
                                                         │                       
                                            1. match URL in route-config.json    
                                            2. run the "reqTransform" function    
                                               (flat  ➜  nested actions[])        
                                            3. POST nested JSON  ───────────────►  POST /v1/event/{WorkspaceID}
                                                                                   Authorization: Basic ...
                                                                                   { type:"event",
                                                                                     customer_id:"priya@…",
                                                                                     actions:[{ action:"Payment Update",
                                                                                                attributes:{amount,dealstage},
                                                                                                user_time, current_time }] }
                                                                                        │
                                            4. return MoEngage's reply ◄──────────── { status:"success", req_id }
        ◄────────────────────────────────────────────────┘                       
  HubSpot sees 200 OK                                                            
                                                                                
                                                                       MoEngage stores the event on the
                                                                       user whose customer_id = that email
```

---

## 3. How this codebase works (you must understand this first)

This app is a **config-driven proxy**. That means:

- There is basically **one controller** and **one service**. They do not contain
  any HubSpot or MoEngage logic.
- **Every** incoming request hits the same wildcard route and is handed to
  `ProxyService.handleRequest()`.
- The service looks up the request's URL + method in a big JSON list
  (`src/assets/route-config.json`) and does whatever that JSON entry says.
- If the JSON entry names a **transformer** (a function, referenced by a string
  like `"moengage.transformers.hubspotLeadCreatedToMoengage"`), the service loads
  that function **at request time** and runs it to reshape the request.

So "adding an integration" here = **add JSON entries + write a transformer
function**. That is exactly what we did. We wrote **zero** new controllers/services.

---

## 4. The files we added / changed

| File | What it is | Why |
|---|---|---|
| `src/config/moengage.config.ts` | The MoEngage address + password | So the URL/credentials live in one place, overridable per environment |
| `src/transformations/moengage.transformers.ts` | The "helper" that folds flat → nested | The actual integration logic |
| `src/assets/route-config.json` | 3 new route entries | The 3 HubSpot-facing URLs |
| `package.json` / `pnpm-lock.yaml` | Added 2 OpenTelemetry packages | Pre-existing missing deps; app wouldn't boot without them |
| `.env` (gitignored, local only) | Dummy values for unrelated routes | So the app boots locally (see Caveats) |

---

## 5. The code, explained piece by piece

### 5a. `src/config/moengage.config.ts` — the address book

```ts
export const MOENGAGE_HUBSPOT = {
  dataApiUrl:
    process.env.MOENGAGE_DATA_API_URL ||
    'https://api-03.moengage.com/v1/event/4311B84VU6UTCNRSAT5JZ3RV_DEBUG',

  authHeader:
    process.env.MOENGAGE_HUBSPOT_AUTH ||
    'Basic NDMxMUI4NFZ...==',
};
```

Plain English:
- `dataApiUrl` = **where** we send events. It is the MoEngage **Data API**, and the
  workspace id (`4311B84VU6UTCNRSAT5JZ3RV_DEBUG`) is baked into the URL path.
  The `_DEBUG` at the end means this is the **test** workspace.
- `authHeader` = the **password**. Format is `Basic base64(WorkspaceID:DataAPIKey)`.
- `process.env.X || 'default'` means: **if an environment variable is set, use it;
  otherwise use the test default.** This is how you switch to production without
  touching code (see §9).

> **Why the URL is `/v1/event/...` and not `/partner/hubspot-crm/...`:** see the
> big caveat in §8. Short version: the partner URL replied "200 OK" but silently
> threw our data away. The `/v1/event/` Data API actually stores it.

### 5b. `src/transformations/moengage.transformers.ts` — the helper

This file has **3 tiny public functions** and **one shared worker**. The 3 public
functions are what the routes call; each one just says "I am the X event":

```ts
export function hubspotLeadCreatedToMoengage(request)         { return buildMoengageEventRequest(request, 'Lead Created'); }
export function hubspotProjectStatusUpdatedToMoengage(request){ return buildMoengageEventRequest(request, 'Project Status Updated'); }
export function hubspotPaymentUpdateToMoengage(request)       { return buildMoengageEventRequest(request, 'Payment Update'); }
```

That second argument (`'Lead Created'`, etc.) is the **event name** MoEngage will
show. **This is the only reason we need 3 separate URLs** — the URL tells the
helper which event name to stamp, because HubSpot's flat postcard can't vary it
easily.

Now the shared worker, step by step:

```ts
function buildMoengageEventRequest(request, action) {
  const body = request.body || {};             // ← HubSpot's flat postcard
```

**Step 1 — Who is this event for? (customer_id)**
```ts
  const customerId = firstNonEmpty(body, ['customer_id', 'email', 'u_em']);
  // customer_id = the email. This is how MoEngage attaches the event to the right person.
```
`firstNonEmpty` walks the list and returns the first key that actually has a value.
So it prefers `customer_id`, then `email`, then `u_em`. In practice: **the email**.

**Step 2 — When did it happen? (the timestamp checker you asked for)**
```ts
  const isoTime = resolveIsoTimestamp(body);
```
`resolveIsoTimestamp` does this:
- Look for a time in `modified_time`, `user_time`, `current_time`, or `timestamp`.
- If it finds one, accept it whether it's an **ISO string** (`2026-07-26T10:15:00Z`)
  or an **epoch number** (seconds or milliseconds) and convert it to ISO.
- **If it finds nothing valid, stamp the current time.** So an event always has a time.

**Step 3 — Fold everything else into the attributes pocket**
```ts
  attributes = buildAttributes(body);
```
`buildAttributes` copies **every** field from HubSpot into `attributes`, EXCEPT the
"reserved" ones (`customer_id`, `email`, `u_em`, the timestamp keys, `type`,
`action`, `event_name`) — because those have special jobs and shouldn't be
duplicated as attributes. It also drops empty values, and adds a friendly marker
`platform: "HubSpot"` if not already present.

> This is why the integration is **flexible**: whatever new field HubSpot sends,
> it automatically shows up as an event attribute in MoEngage. No code change.

**Step 4 — Build the MoEngage envelope**
```ts
  const moengageBody = {
    type: 'event',                      // Data API envelope type — ALWAYS "event"
    customer_id: String(customerId),    // the email
    actions: [
      {
        action,                         // "Lead Created" / "Project Status Updated" / "Payment Update"
        attributes,                     // all the HubSpot fields
        platform: 'web',                // RESERVED MoEngage field, must be web/ANDROID/iOS/TV/unknown
        user_time: isoTime,             // local event time (ISO-8601)
        current_time: isoTime,          // UTC event time (ISO-8601)
      },
    ],
  };
```

> ⚠️ Two different "platform"s on purpose: the **reserved** `platform: "web"` (a
> MoEngage system field with a fixed set of allowed values) and the **custom**
> `attributes.platform: "HubSpot"` (just a label we add). They are not the same field.

**Step 5 — Set the address and the password, then hand it back**
```ts
  const url = new URL(MOENGAGE_HUBSPOT.dataApiUrl);
  const headers = { 'content-type': 'application/json', accept: 'application/json' };
  if (MOENGAGE_HUBSPOT.authHeader) headers.authorization = MOENGAGE_HUBSPOT.authHeader;

  return { ...request, url, body: moengageBody, headers };
}
```
The proxy takes this returned object and fires the actual HTTP POST to MoEngage.

### 5c. `src/assets/route-config.json` — the 3 doors

Three entries, identical except the path and which transformer they call:

```jsonc
{
  "path": "/xp-mi/public/v1/hubspot/moengage/payment-update",
  "method": "POST",
  "routeHandler": "TRANSFORM",                 // one target, optional transform
  "target": {
    "name": "moengage-hubspot-payment-update",
    "url": "https://api-03.moengage.com/v1/event/4311B84VU6UTCNRSAT5JZ3RV_DEBUG",
    "method": "POST",
    "timeout": { "request": 20000, "socket": 1000 },
    "staticHeaders": { "Content-Type": "application/json" },
    "reqTransform": "moengage.transformers.hubspotPaymentUpdateToMoengage"
  }
}
```

The three:
| Door (path) | Transformer | Event name in MoEngage |
|---|---|---|
| `…/hubspot/moengage/lead-created` | `hubspotLeadCreatedToMoengage` | `Lead Created` |
| `…/hubspot/moengage/project-status-updated` | `hubspotProjectStatusUpdatedToMoengage` | `Project Status Updated` |
| `…/hubspot/moengage/payment-update` | `hubspotPaymentUpdateToMoengage` | `Payment Update` |

> The `url` here just needs to be a valid URL (the proxy calls `new URL()` on it).
> The transformer overrides it anyway using `moengage.config.ts`. It's mostly for logs.

---

## 6. The exact request lifecycle (what happens on every call)

Follow one `payment-update` request through the machine:

1. **Request arrives** at `POST /xp-mi/public/v1/hubspot/moengage/payment-update`.
2. `ProxyController` catches it (wildcard route) → calls `ProxyService.handleRequest(req)`.
3. `findRoute()` matches the path+method to our JSON entry. Handler is `TRANSFORM`.
4. `buildRequestFromSource()` builds a base request: URL from config, body = HubSpot's JSON, headers from `staticHeaders`.
   - ⚠️ Here it does `url.search = ''`, which **wipes any query string** on the target URL. (Doesn't matter for us — the Data API URL has no query string.)
5. Because the target has a `reqTransform`, `applyTransform()` dynamically `import()`s
   `moengage.transformers.ts` and runs `hubspotPaymentUpdateToMoengage(baseRequest)`.
6. Our function returns the nested MoEngage body + URL + auth header.
7. The proxy creates an Axios client and does the real `POST` to MoEngage.
8. It logs `[DOWNSTREAM REQUEST] ... body={...}` (auth masked) — **this log is your best friend for debugging** (see §7).
9. MoEngage replies `{ "status": "success", ... "req_id": "..." }`. The proxy returns that to the caller (HubSpot).

---

## 7. Confirm it yourself (the important part)

### Step A — Start the app

```bash
pnpm run start
```
Wait for the log line: **`Nest application successfully started`**. It listens on
**port 3000** (`http://localhost:3000`).

> ⚠️ `pnpm run start` is **NOT** watch mode. If you edit code, you must **stop
> (Ctrl-C) and start again** to pick up changes. (`pnpm run start:dev` is the
> watch version.)

### Step B — Send a test event through the middleware

```bash
curl -sS -w '\n[HTTP %{http_code}]\n' \
  'http://localhost:3000/xp-mi/public/v1/hubspot/moengage/lead-created' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "priya.sharma234@example.com",
    "firstname": "Priya",
    "lastname": "John",
    "phone": "+919876543210",
    "lifecyclestage": "lead",
    "joh_lead_status": "New",
    "modified_time": "2026-07-26T10:15:00Z"
  }'
```

**A good response looks like this** (this is MoEngage's *real* success shape):
```json
{"status":"success","message":"Your request has been accepted and will be processed soon.","req_id":"5CmE7dH0"}
[HTTP 200]
```
Copy that `req_id` — you can give it to MoEngage support to trace the exact event.

Try the other two doors too:
```bash
# Project Status Updated
curl -sS -w '\n[HTTP %{http_code}]\n' \
  'http://localhost:3000/xp-mi/public/v1/hubspot/moengage/project-status-updated' \
  -H 'Content-Type: application/json' \
  -d '{ "email":"priya.sharma234@example.com","dealname":"Tower A Flat 402","dealstage":"construction_in_progress","amount":4500000 }'

# Payment Update (no timestamp sent on purpose — middleware will stamp "now")
curl -sS -w '\n[HTTP %{http_code}]\n' \
  'http://localhost:3000/xp-mi/public/v1/hubspot/moengage/payment-update' \
  -H 'Content-Type: application/json' \
  -d '{ "email":"priya.sharma234@example.com","amount":250000,"closedate":"2026-07-30","dealstage":"payment_pending" }'
```

### Step C — See exactly what we sent to MoEngage

In the terminal running the app, look for the `[DOWNSTREAM REQUEST]` line. It shows
the **real nested payload** we sent (with the password masked). If something looks
wrong in MoEngage, check this line first.

### Step D — Confirm it landed in MoEngage (2 ways)

**Way 1 — Event catalog (quick):**
MoEngage → **Data Management → Events**. Find `Lead Created` / `Project Status
Updated` / `Payment Update`. The proof is the **"Last seen"** column showing
**today's date**, and new attribute names (e.g. `firstname`, `lastname`, `phone`)
also dated today. If "Last seen" updated to now, your event was ingested.

**Way 2 — The user's profile (definitive):**
MoEngage → find the user by email `priya.sharma234@example.com` → open their
**Activities / Events timeline**. Your event should appear with today's timestamp
and its attributes. This is the most trustworthy confirmation.

> ⚠️ **"30 day volume" often shows `0` in this test (`_DEBUG`) workspace.** That's a
> known quirk of debug workspaces — volume analytics aren't always computed there.
> Do **not** treat `0` volume as "it failed". Trust "Last seen = today" and the
> profile timeline instead.

### Step E (optional) — Test MoEngage directly, bypassing the middleware

Useful to prove the endpoint/credentials independently:
```bash
curl -sS -w '\n[HTTP %{http_code}]\n' \
  -X POST 'https://api-03.moengage.com/v1/event/4311B84VU6UTCNRSAT5JZ3RV_DEBUG' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Basic NDMxMUI4NFZ...==' \
  -d '{
    "type":"event",
    "customer_id":"priya.sharma234@example.com",
    "actions":[{
      "action":"Manual Test Event",
      "attributes":{"amount":250000,"dealstage":"payment_pending","platform":"HubSpot"},
      "platform":"web",
      "user_time":"2026-07-26T10:15:00Z",
      "current_time":"2026-07-26T10:15:00Z"
    }]
  }'
```

---

## 8. CAVEATS — read these, they will save you hours

1. **`200 OK` does NOT mean "stored".** MoEngage accepts asynchronously. A 200 only
   means "queued". The event can still be dropped during processing. Always confirm
   in the MoEngage UI (§7 Step D), not just by the HTTP status.

2. **The `/partner/hubspot-crm/events/?configName=...` endpoint is a trap.** It
   returns a friendly `200 "Successfully submitted for processing"` and then stores
   **nothing** (in our testing). We abandoned it. The **only** endpoint that
   actually stored events is the **Data API** `/v1/event/{WorkspaceID}`. If someone
   points you back at the partner/configName URL, be very suspicious and verify
   storage in the UI.

3. **`type` means different things on different endpoints.** On the partner endpoint
   the docs say `type` = `Contacts`/`Leads`/`Deals`. On the **Data API** (what we
   use) `type` is **always the literal string `"event"`**. Don't send `Leads` here.

4. **Right data center matters.** This workspace is on **DC-03** (`api-03`). We
   tested `api-01` and got `403 "given app_id is invalid/blocked"`. The `api-01`
   seen in old MoEngage emails was just Check Point URL-proxy noise, not the real DC.

5. **`_DEBUG` = test workspace.** The workspace id `4311B84VU6UTCNRSAT5JZ3RV_DEBUG`
   is MoEngage's **test/debug** environment. Production uses the **same id without
   `_DEBUG`** (and possibly a different DC). See §9.

6. **`customer_id` must be the same everywhere, forever.** It's how MoEngage merges
   events onto one person. We use **email**. If HubSpot ever sends a different
   identifier for the same person, you'll create duplicate profiles. Keep it
   consistent between the Users sync and these events.

7. **`pnpm run start` is not watch mode.** Edit code → you must restart. (Use
   `pnpm run start:dev` if you want auto-reload.)

8. **The app needs a populated `.env` to even boot.** The route config loader reads
   ALL `${VAR}` placeholders across all 142 routes at startup and throws on the
   first empty one — even for routes you don't use. Locally we filled `.env` with
   **dummy** values so it boots; the MoEngage routes don't use any of them. `.env`
   is gitignored.

9. **Two OpenTelemetry packages were missing from `package.json`.** `instrumentation.ts`
   imported `@opentelemetry/exporter-metrics-otlp-http` and `@opentelemetry/sdk-metrics`
   but they weren't declared. We added them. This is unrelated to the integration but
   required to run — keep them.

10. **The auth token is currently hardcoded as a default in `moengage.config.ts`.**
    That's fine for the test workspace, but for production you should supply it via
    the `MOENGAGE_HUBSPOT_AUTH` env var and not commit the real secret.

11. **The query-string wipe.** The proxy clears any `?query` on the target URL before
    the transform runs. Our Data API URL has no query, so it's irrelevant — but it's
    why we could never put `?configName=...` on a target URL and have it survive.

---

## 9. Going to production

**No code changes.** Set two environment variables in the prod environment:

```bash
MOENGAGE_DATA_API_URL="https://api-0X.moengage.com/v1/event/<PROD_WORKSPACE_ID>"
MOENGAGE_HUBSPOT_AUTH="Basic <base64 of PROD_WORKSPACE_ID:PROD_DATA_API_KEY>"
```

Where to get these (MoEngage UI): **Settings → Account → APIs**
- **Workspace ID** (a.k.a. App ID) → goes in the URL path (prod id has **no** `_DEBUG`).
- **Data API Key** → the password half of the Basic token.
- Confirm the **data center** (the `api-0X` number) for your prod workspace.

Build the Basic token: `base64("WorkspaceID:DataAPIKey")` → prefix with `Basic `.

Because `moengage.config.ts` reads `process.env.X || default`, setting these env
vars makes prod use them and ignore the test defaults.

---

## 10. How to add a NEW event type later (recipe)

Say you want a new `Site Visit Scheduled` event:

1. **Add a transformer wrapper** in `moengage.transformers.ts`:
   ```ts
   export function hubspotSiteVisitScheduledToMoengage(request) {
     return buildMoengageEventRequest(request, 'Site Visit Scheduled');
   }
   ```
2. **Add a route** in `route-config.json` (copy an existing block, change `path`,
   `name`, and `reqTransform` to `moengage.transformers.hubspotSiteVisitScheduledToMoengage`).
3. **Restart** the app.
4. **Test** with curl (§7 Step B) against the new path.
5. In **HubSpot**, add a workflow whose webhook posts flat data to the new URL.

That's it — no controller/service changes, ever.

---

## 11. Wiring HubSpot (the last mile)

In each HubSpot workflow:
1. Trigger on the relevant change (e.g. Deal stage = "payment_pending").
2. Action → **Data Ops → Send a webhook**.
3. **Method:** POST.
4. **URL:** your deployed host + the route, e.g.
   `https://<your-host>/xp-mi/public/v1/hubspot/moengage/payment-update`
5. **Request body:** flat key/values. At minimum send **`email`** plus the fields you
   care about (`amount`, `dealstage`, `lifecyclestage`, etc.). Optionally send
   `modified_time`; if you don't, the middleware stamps the current time.

You do **not** need to send `event_name`, `type`, or fold anything — the middleware
handles all of that. Whatever extra flat fields you send automatically become event
attributes in MoEngage.

---

## 12. Quick reference card

| Thing | Value |
|---|---|
| Middleware base (local) | `http://localhost:3000` |
| Route prefix | `/xp-mi/public/v1/hubspot/moengage/...` |
| Events | `lead-created`, `project-status-updated`, `payment-update` |
| MoEngage endpoint (test) | `https://api-03.moengage.com/v1/event/4311B84VU6UTCNRSAT5JZ3RV_DEBUG` |
| Auth | `Basic base64(WorkspaceID:DataAPIKey)` |
| Envelope `type` | always `"event"` |
| User key | `customer_id` = email |
| Good response | `{ "status":"success", ..., "req_id":"..." }` |
| Debug log line | `[DOWNSTREAM REQUEST]` in the app terminal |
| Confirm in UI | Data Management → Events (Last seen = today) OR user profile timeline |
| Prod switch | env vars `MOENGAGE_DATA_API_URL`, `MOENGAGE_HUBSPOT_AUTH` |

---

*Files: `src/config/moengage.config.ts`, `src/transformations/moengage.transformers.ts`,
`src/assets/route-config.json` (3 entries at the end).*
