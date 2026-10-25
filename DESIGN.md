# Design decisions

## 1. How do login and the two roles work?

Signup always creates a customer; the studio account is seeded separately using a password chosen locally through STUDIO_PASSWORD in an untracked .env file. No studio password is committed, and repeat seeding preserves the existing password. Passwords are salted scrypt hashes, and a random session ticket is sent in an HTTP-only cookie while its hash is stored in SQLite. Shared middleware verifies the session; each route checks the role and each customer record query includes its owner ID. Signup/session rotation commits before the cookie is set, so a failed write does not leave a partial account or lose the previous session.

## 2. Which database did you choose, and why?

SQLite is one local file and works through Node 24's built-in database API, keeping setup small and reproducible. The code uses explicit SQL with bound values, foreign keys and database constraints. Money is stored as integer paise, and purchases/bookings retain the price/rate used when created. The database stays outside public/ and repeat seeding preserves existing records.

## 3. How do you stop two people taking the same painting or date?

A purchase transaction changes an available painting to sold and inserts its order together; a partial unique index permits only one placed order per painting. Active wall requests have a unique date index, and conflicting requests receive 409. Cancellation first checks the owned record and permitted status, so repeating an old cancellation cannot undo a later purchase. Requested/confirmed wall dates are reserved; declined/cancelled dates are released, and cancellation is allowed throughout the Kolkata calendar day three days before the booking.

## 4. What did you finish, leave out, and what would you do next?

Implemented customer/studio authentication, ownership/role checks, painting management and orders, wall requests/decisions/cancellation, pottery requests/editing/decisions, persistent storage and readable data states. The frontend uses HTML/CSS and plain JavaScript; the backend has one explicit route file per feature, with automated behaviour/storage/recovery tests. Real payments, uploads, email, password reset, deployment and CI are outside scope. Next I would improve accessibility automation and operational backup/login-abuse controls before public hosting.
