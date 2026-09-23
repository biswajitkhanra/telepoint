# TelePoint ✨

Premium EMI collection, retailer management, and customer finance workflow built with Next.js, Supabase, and a mobile-first customer experience.

<div align="center">

![TelePoint](https://img.shields.io/badge/TelePoint-EMI%20Portal-3A67DD?style=for-the-badge&logo=nextdotjs&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?style=flat-square&logo=supabase&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-React%20Native-000020?style=flat-square&logo=expo&logoColor=white)

</div>

## Why TelePoint?

TelePoint helps lending teams and retailers manage EMI schedules, customer follow-ups, approval flows, collections, and mobile-first reminders without forcing a clunky legacy workflow.

- 💸 Real-time EMI tracking and fine calculation
- 📊 Retailer and admin dashboards with collection insights
- 🔔 Smart reminder flows and customer broadcasts
- 📱 Customer app experience for EMI visibility and mobile access
- 🧾 Backup, audit logs, and reporting workflows

## Live experience

The web app ships with a premium, animated login/portal experience designed to feel polished and modern.

- ✨ Animated gradient hero and floating emoji accents
- 💎 Glassmorphism cards and premium UI polish
- 🚀 Fast customer and retailer onboarding flows
- 📲 Mobile-ready layout for everyday field use

## Tech stack

- Next.js 14
- React 18
- Tailwind CSS
- Framer Motion
- Supabase SSR + Postgres
- Expo / React Native for the mobile app
- TypeScript throughout

## Project structure

```text
telepoint/
├── app/                    # Next.js app router pages and API routes
├── components/             # Reusable UI blocks and dashboards
├── lib/                    # Utility logic, formatters, motion config, auth helpers
├── public/                 # Static assets and branding files
├── mobile/                 # Standalone Expo Android app
├── backups/                # Automated database backup snapshots
├── backup/                 # Backup docs and setup workflows
├── docs/                   # Additional documentation and notes
├── middleware.ts           # Request middleware
├── package.json            # Web app dependencies and scripts
├── next.config.js          # Next.js configuration
├── tailwind.config.js      # Tailwind theme settings
├── tsconfig.json           # TypeScript configuration
└── README.md               # This file
```

## Quick start

### Web app

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

### Mobile app

```bash
cd mobile
npm install
npm start
```

## Environment variables

Create a local environment using your Supabase project values.

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Core workflows

- Admin portal for loan approval and operation oversight
- Retailer dashboard for customer portfolio and collections
- Customer EMI portal for account visibility and checklists
- Broadcast messaging and reminder systems
- CSV/export and full backup flows for operational resilience

## Documentation

- `mobile/README.md` — mobile app documentation and deployment notes
- `backup/README.md` — secure database backup instructions
- `backups/README.md` — stored backup snapshot notes
- `docs/` — supporting operational and product docs

## Design direction

TelePoint aims for a premium, trustworthy fintech feel:

- Deep navy and metallic blue surfaces
- Financial confidence styling with soft glass layers
- Motion that feels deliberate and premium, not noisy
- Emoji-led visual accents to humanize the experience without sacrificing clarity

## Running notes

This repository is built around a real operational portal and is designed for managed finance workflows. If you are testing locally, make sure the relevant Supabase tables and auth policies are prepared before login flows are validated.

## Status

This repo is actively shaped around a full EMI management and collection platform with both web and mobile touchpoints.

---

Built with ❤️ for a premium fintech workflow experience.
