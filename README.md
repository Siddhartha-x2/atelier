# Art Studio

This is my project for the GDGC web development recruitment task. Customers can buy paintings, book wall painting and request pottery. The studio account manages paintings and responds to requests.

I used HTML, CSS and plain JavaScript for the frontend, with Express and SQLite for the backend. There is no frontend framework or build step. Dark mode opens by default, and there is a light mode switch too.

## Run it

You need **Node.js 24.x** because the app uses its built-in SQLite support.

```sh
npm ci
```

Copy `.env.example` to `.env` and replace the `STUDIO_PASSWORD` placeholder with a password of 10-128 characters. Leave the optional settings commented unless you want to change them.

On Windows, the copy command is `Copy-Item .env.example .env`. On macOS/Linux, use `cp .env.example .env`.

```sh
npm run seed
npm start
```

Open **http://localhost:3000**. Keep the terminal running. If PowerShell blocks npm, use `npm.cmd` instead. After the first setup, Windows users can also run `start-studio.cmd`.

## Login

Sign up to create a customer account. The studio email is **studio@artstudio.in**, and its password is the one you chose in `.env` before the first seed. The `studio` role is the admin role from the brief.

Passwords are hashed before saving. Running the seed again keeps existing accounts and data; it does not reset the studio password.

## What works

- Painting collection, purchase and cancellation. Cancelling makes the painting available again. The studio can add paintings and edit available ones.
- Wall bookings for 7-90 days ahead, with a size of 10-500 sq ft. The rate comes from the seed data. The studio confirms or declines requests, and customers can cancel through the day three days before the booking.
- Pottery requests using the supplied items and glazes, quantities of 1-12 and a needed-by date at least 14 days ahead. Customers can edit or cancel while requested; the studio can accept or decline.
- Customer records are private to their owner. Role and ownership checks happen on the server. The interface has loading, empty, error and retry states.

## Code

- `public/` has the HTML, one stylesheet, browser JavaScript and artwork.
- `public/app.js` handles navigation, forms and API requests. `public/ui.js` keeps the shared views and animations together.
- `src/routes/` has one route file for each feature.
- `src/schema.sql` defines the tables and constraints. `src/db.js` handles transactions.
- `seed/seed.json` contains the supplied data, with the shared demo password removed.
- `test/` has the integration tests. [DESIGN.md](DESIGN.md) explains the main decisions and remaining scope.

## Tests and notes

```sh
npm run check
npm test
```

There are 23 tests covering setup, login, permissions, validation, conflicting purchases/bookings, failed writes and restart recovery. They use temporary databases, so they do not reset normal app data. No `.env` is needed for tests.

Normal data is saved in `data/art-studio.sqlite` and survives a restart. Keep that folder when updating the code. `.env`, databases and `node_modules` are ignored by Git. If you change the port, change `APP_ORIGIN` to match it; other options are listed in `.env.example`.

Buying only creates an order. Real payments, uploads, emails, password reset and deployment are outside this project's scope.
