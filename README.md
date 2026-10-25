# Art Studio

A full-stack application for buying original paintings, booking wall painting and requesting custom pottery. Customers manage their own activity; studio users manage paintings and review requests.

## Stack

- Frontend: HTML, plain CSS and browser JavaScript. Dark mode is the default, with a saved light-theme preference.
- Backend: Node.js 24 and Express 5.
- Database: SQLite through Node's built-in database API, using explicit SQL and transactions.

There is no frontend build step. Express is the only direct npm dependency.

## Run locally

Install **Node.js 24.x**; the project was checked with 24.20.0. Open the folder containing package.json and run:

```sh
npm ci
```

Copy `.env.example` to `.env`. On Windows PowerShell use `Copy-Item .env.example .env`; on macOS/Linux use `cp .env.example .env`. In .env, replace the STUDIO_PASSWORD placeholder with your own password of 10-128 characters. Leave the optional settings commented unless needed. Then run:

```sh
npm run seed
npm start
```

Open **http://localhost:3000**. Keep the terminal running and stop it with Ctrl+C. On Windows, use `npm.cmd` if PowerShell blocks npm.ps1. After initial setup, `start-studio.cmd` also starts the app from the correct folder.

The first seed requires STUDIO_PASSWORD to create the studio account; its value is hashed before storage. Later seed runs preserve the existing password, accounts, painting edits and transactions, and do not require STUDIO_PASSWORD again. Changing the environment variable does not reset an existing account. Use the Express URL; opening public/index.html directly cannot provide API or session features.

## Accounts and features

Create a customer account with **Sign up**. Passwords must contain 10-128 characters. The studio login uses:

```text
Email: studio@artstudio.in
Password: the value you chose for STUDIO_PASSWORD before the first seed
```

No studio password is committed in the source or seed dataset. Signup always creates a customer. The `studio` role corresponds to the brief's admin role.

- **Paintings:** studio users add paintings and edit available works. Customers buy available originals and cancel their own placed orders, releasing the painting.
- **Wall painting:** choose a date 7-90 Kolkata calendar days away, a size of 10-500 sq ft and an address. The server uses the seeded rate, currently ₹150/sq ft. Requested/confirmed bookings reserve their date. The studio confirms/declines; customers may cancel through the calendar day three days before the booking.
- **Pottery:** choose a seeded item/glaze, an integer quantity of 1-12 and a needed-by date at least 14 days away. Customers edit/cancel while requested; the studio accepts/declines.
- **Permissions and feedback:** customer records are restricted to their owner. Signed-out requests receive 401, wrong-role actions 403 and another customer's record 404. Data screens provide loading, empty and error/retry states; conflicts have clear messages.

Use separate browser profiles if you want simultaneous customer and studio sessions.

## Configuration and storage

`.env.example` lists every variable with placeholders. STUDIO_PASSWORD is required for first-time seeding; the other variables have these defaults:

| Variable | Default |
| --- | --- |
| STUDIO_PASSWORD | No default; choose locally before the first seed |
| PORT | 3000 |
| HOST | 127.0.0.1 |
| DATABASE_PATH | data/art-studio.sqlite |
| APP_ORIGIN | http://localhost:3000 |
| COOKIE_SECURE | false |
| SESSION_HOURS | 12 |

For a different port, update PORT and APP_ORIGIN together. APP_ORIGIN must be the exact browser origin without a trailing slash. HTTPS requires COOKIE_SECURE=true. Keep DATABASE_PATH outside public/.

SQLite persists activity in data/art-studio.sqlite. Restarting the app does not erase committed records. Keep data/ when applying updates. Only public/ is served as static content. .gitignore excludes node_modules/, private databases, logs and real .env files; commit .env.example instead.

## Checks

```sh
npm run check
npm test
```

The syntax check covers 19 JavaScript files. The 23 tests use isolated temporary databases and cover first-seed password setup, repeat-seed preservation, authentication, permissions, ownership, validation, purchase/date conflicts, cancellation, studio decisions, restart/reseed persistence, failed writes, lock recovery and abrupt process termination. Test-only studio passwords are generated during the test run; no .env is needed for tests. These are local functional/recovery tests, not a production load or complete accessibility audit.

## Project structure

```text
public/                 HTML, CSS, browser scripts, artwork and local fonts
src/app.js              Shared request checks and route mounting
src/server.js           HTTP server startup and shutdown
src/routes/             Auth, catalog, paintings, orders, bookings and pottery
src/auth.js             Session-cookie and role checks
src/passwords.js        Password hashing and verification
src/validation.js       Input and calendar validation
src/db.js               SQLite connection and transactions
src/schema.sql          Tables, constraints and active reservation indexes
src/seed.js             Repeatable seed import
seed/seed.json          Supplied studio, painting, item, glaze and rate data
scripts/                Syntax checker and integration-test worker
test/                   HTTP, persistence and recovery tests
```

Feature routes keep validation, SQL and JSON responses together. See [DESIGN.md](DESIGN.md) for authentication, database and concurrency decisions, completed scope and next improvements.

## Troubleshooting and scope

For an npm ENOENT error, enter the folder containing package.json. If port 3000 is busy, stop the previous server or configure another port/origin. If node:sqlite is unavailable, install Node 24.x. A source-code change needs a server restart; HTML/CSS changes need a browser refresh.

Buying creates an order without charging money. Real payments, image uploads, email, password reset, deployment and CI are outside scope.
