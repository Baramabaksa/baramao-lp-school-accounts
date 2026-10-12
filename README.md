# Baramao LP School Accounts Website

A starter web application for a school notice board and basic accounts records. It supports multiple authorised users, PostgreSQL storage, cash book, payment vouchers, students, meal expenditure, CSV exports, browser print/PDF and administrator JSON backup.

## Important before using real school data

This is a starter project, not a deployed or security-audited school system. Test it with sample records first. Do not put real student or financial data online until you have configured HTTPS, strong secrets, database access controls and a tested backup/restore process. The app does not currently include password reset, multi-factor authentication, audit history, or an automated JSON restore workflow.

## Requirements

- Node.js 20 or newer
- A PostgreSQL database (local or managed)
- A hosting service that supports Node.js and persistent environment variables

## 1. Create the database

Create a PostgreSQL database on your host. Keep its connection string private.

## 2. Configure environment variables

Copy `.env.example` to `.env`, then set:
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: a long random secret (at least 32 characters)
- `NODE_ENV=production` on the production host
- `TRUST_PROXY=true` only if the host uses a trusted reverse proxy that terminates HTTPS
- `INIT_ADMIN_USERNAME`, `INIT_ADMIN_PASSWORD`, and optionally `INIT_ADMIN_NAME` for first administrator creation

The initial admin password must be at least 12 characters. Set these variables in the hosting dashboard, not in public source code. After the first admin is created, remove the `INIT_ADMIN_PASSWORD` environment variable from the host.

## 3. Run locally

```bash
npm install
cp .env.example .env
# Edit .env with your database connection and secrets
npm start
```

Open `http://localhost:3000`. The database tables are created on first start. If no initial admin environment variables were provided, the login will not work until an administrator is created directly in the database. For a first deployment, set the `INIT_ADMIN_*` environment variables before starting.

## 4. Deploy online

1. Upload this folder to a private Git repository or your Node.js host.
2. Create a managed PostgreSQL database.
3. Set the environment variables above in the hosting dashboard.
4. Deploy with build command `npm install` and start command `npm start`.
5. Confirm HTTPS is enabled.
6. Sign in with the initial administrator and create individual accounts from the Users tab.
7. Test creating and exporting sample notices, cashbook entries, vouchers, students and meal records.
8. Schedule database backups with the hosting provider and test restoring a backup.

Never share one login among several people. Use `admin` only for the person responsible for user access and full backup; `accounts` for staff entering records; `viewer` for read-only access.

## Features and limitations

- Notice categories: School, Accounts, Holidays, Urgent
- Daily cash book receipts and payments
- Payment voucher register
- Student register for Classes I–V
- Meal records using a default rate of ₹6.78 per student/day (editable per record)
- CSV export for Excel-compatible use; this is not a native `.xlsx` workbook
- Browser print dialog can save visible pages as PDF
- Admin JSON data export; this is not a one-click restore function
- Role checks: administrator, accounts, viewer
- Data remains in PostgreSQL, not only in one browser

## Before production

Ask a qualified developer to review authentication, session security, data retention, privacy, backups, audit logging and local school requirements. The current app does not provide a password-change or password-reset screen. If a credential is exposed, rotate it through a controlled administrator/database process immediately.
