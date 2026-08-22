# SAKHAAI Operations

## Install and run

```powershell
npm install
npm start
```

The project uses Node.js 20+, Baileys 6.7.24, MongoDB Driver 6.x, Express, and the existing OpenAI-compatible AI integration. The first run uses the existing `auth/` session. If no valid session exists, scan the QR shown by the current pairing flow.

Copy `.env.example` to `.env` and set:

```text
PHONE_NUMBER=+91XXXXXXXXXX
OWNER_NUMBER=+919352334463
DELETE_ALERT_NUMBER=+918609232849
AI_API_KEY=your-key
AI_MODEL=your-existing-model
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/
MONGODB_DB=SAKHAAI
TIMEZONE=Asia/Kolkata
```

`OWNER_NUMBER` is canonical. Existing installations with only `ADMIN_NUMBERS` remain compatible, but should be migrated to `OWNER_NUMBER`.

## Commands

- `.start` clears the sender's personal MongoDB pause.
- `.stop` pauses only the sender for ten minutes.
- `.menu` shows general commands; the owner also sees owner commands.
- `.msz | DD-MM-YYYY HH:mm | +91XXXXXXXXXX | Message` creates a pending IST schedule. The message may contain additional `|` characters.
- `.fstop` pauses normal replies globally without deleting scheduled jobs.
- `.fstart` resumes global normal replies without clearing personal pauses.

Owner authorization compares the normalized sender JID to `OWNER_NUMBER`; display names and message text are never trusted.

## MongoDB

The application creates these collections and indexes on startup:

- `user_states`: unique `userId` index.
- `bot_state`: unique `key` index.
- `scheduled_messages`: `{ status: 1, scheduledAt: 1 }` index.
- `message_cache`: unique `messageId`, `{ chatId: 1, timestamp: 1 }`, and an `expiresAt` TTL index using `MESSAGE_CACHE_TTL_DAYS` (default 30 days).

Use a MongoDB user with read/write access to the configured database. The database connection is shared and reused. Startup logs a clear error and normal AI can still run if MongoDB is temporarily unavailable; database-backed commands remain unavailable until the connection retry succeeds.

The scheduler polls MongoDB every `SCHEDULER_INTERVAL_MS` milliseconds. It atomically changes due `pending` jobs to `processing` using `findOneAndUpdate`, sends them, then marks them `sent` or `failed`. This prevents two running bot instances from claiming the same pending job. A crash after WhatsApp accepts a send but before MongoDB records `sent` cannot be made exactly-once by any external WhatsApp API; inspect `processing` records before manually retrying them.

## Deleted messages

Baileys 6.7.24 emits incoming revoke notifications through `messages.update` with `messageStubType: WAMessageStubType.REVOKE`; that exact supported path is used here. Baileys also exposes `messages.delete`, but its current source uses that event for local delete-for-me history actions, so it is intentionally not treated as delete-for-everyone. Private text and supported message metadata are cached before handling. Media files are never downloaded by this implementation. Group deletion events are ignored. If no cached content exists, the alert explicitly says the original content was unavailable.

Set `ALERT_OWNER_SELF_DELETE=true` only if alerts for the owner's own deletions are desired. Deletion alerts are sent to `DELETE_ALERT_NUMBER`, independently of `OWNER_NUMBER`.

## Test checklist

Run `Get-ChildItem src\*.js | ForEach-Object { node --check $_.FullName }` in PowerShell, then `npm start` and test from a private chat:

- `.start`, `.stop`, `.start` during the pause, and expiry after ten minutes.
- `.fstop`, `.fstart`, and unauthorized attempts from another number.
- Owner and unauthorized `.msz`, invalid date/time/number, future scheduling, and a message containing `|`.
- Restart before a scheduled job is due and verify it remains in MongoDB and sends once.
- Send and delete text, image, and video messages; verify only the owner receives alerts and unavailable content is not fabricated.
- Send normal messages and commands in a group; verify no reply.
- Verify AI replies and `data/data.json` answers still work.
- Temporarily stop MongoDB, observe the error and retry logs, then restore it.

## Railway

1. Push the repository without `.env`, `auth/`, or credentials.
2. Create a Railway service from the repository.
3. Add `MONGODB_URI`, `MONGODB_DB`, `PHONE_NUMBER`, `OWNER_NUMBER`, `DELETE_ALERT_NUMBER`, `AI_API_KEY`, `AI_MODEL`, `BOT_NAME`, `TIMEZONE`, `ALERT_OWNER_SELF_DELETE`, and `DEBUG_EVENTS` as Railway variables.
4. Deploy with the existing `npm start` command from `railway.json`.
5. Pair the WhatsApp session. Persisting `auth/` on ephemeral Railway storage requires an external session strategy; the existing local auth behavior is preserved, but a fresh ephemeral instance may require pairing again.
6. Check `/health` and Railway logs. Use one Railway replica for the WhatsApp session unless the auth/session strategy explicitly supports multiple sockets.

## GitHub

```powershell
git status
git add package.json package-lock.json src .env.example OPERATIONS.md
git commit -m "Add persistent bot controls and scheduling"
git push origin main
```

Never add `.env`, `auth/`, API keys, MongoDB credentials, or WhatsApp session files. MongoDB Atlas network access and database-user permissions must allow the Railway deployment to connect.

## Troubleshooting

- `MongoDB is not configured`: set `MONGODB_URI` and `MONGODB_DB`; do not paste credentials into source files.
- `MongoDB connection failed`: check Atlas network access, user permissions, URI encoding, and Railway variables.
- Owner commands rejected: set `OWNER_NUMBER` in E.164 form and restart; the sender must be the matching WhatsApp number.
- QR does not appear: inspect `auth/latest_qr.txt`, `/qr.png`, and the existing connection logs; do not delete `auth/` unless a fresh pairing is intended.
- A scheduled job is `failed`: inspect its `error` field and create a new schedule after fixing the recipient/session issue.
- A job is `processing`: do not blindly duplicate it; determine whether WhatsApp delivered it before retrying.
- No deletion alert: confirm the original message was received by this bot, MongoDB was available, the deletion was private, and `ALERT_OWNER_SELF_DELETE` is enabled for owner-self deletion.
- AI unavailable: verify the existing provider key/model variables and inspect the redacted AI error log.
- Groups receiving nothing is expected; group protection is unconditional.
