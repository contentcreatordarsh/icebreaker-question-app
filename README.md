<div align="center">

# Dinner Table Cards

**Turn any gathering into something memorable.**

A premium conversation game platform with 600+ curated questions, live multiplayer sessions, and AI-powered question generation. Built for dinner parties, date nights, team meetings, and any occasion where real connection matters.

[Live Site](https://dinnertablecards.xyz) | [Join a Session](https://dinnertablecards.xyz/play)

</div>

---

## Overview

Dinner Table Cards is a full-stack web application that helps groups of people have deeper, more meaningful conversations. It serves two primary modes:

1. **Solo Card Browsing** — Browse, shuffle, and save questions from 7 curated categories. Get a daily question, explore by difficulty (Light or Deep), or let AI generate something unique.

2. **Live Multiplayer Sessions** — A Kahoot-style real-time game where a host presents questions, players submit anonymous answers, answers are revealed dramatically, players vote on the best response, and a leaderboard tracks scores across rounds.

---

## Features

### Core Experience
- **600+ hand-curated questions** across 7 categories: Icebreaker, Deep Talk, Funny, Team Building, Date Night, Philosophy, Creative Sparks
- **Two difficulty levels** per category: Light (playful, low-stakes) and Deep (values, regrets, hopes)
- **AI "Surprise Me" generation** powered by Cloudflare Workers AI for on-demand original questions
- **Favorites system** — save questions to personal collections synced via Firebase
- **Offline support** — PWA with service worker caching; works without internet after first load
- **Daily question** — fresh conversation starter every day

### Live Multiplayer Sessions
- **Real-time WebSocket** connections via Cloudflare Durable Objects
- **Room codes** — 4-character codes for easy sharing (e.g., `ABCD`)
- **Avatar selection** — Gender-based emoji avatars for player identity
- **Timed rounds** — Configurable answer timers with visual countdown
- **Dramatic reveal** — Host reveals answers one-by-one or all at once
- **Voting system** — Players vote for the best answer (can't vote for yourself)
- **Leaderboard** — Cumulative scoring with crown/medal badges for top 3
- **Sound effects** — Web Audio API tones for key moments (submit, reveal, win)
- **Share results** — Web Share API integration for posting session summaries
- **Question rating** — Thumbs up/down on each question for content quality feedback

### Monetization
- **Freemium model** — 4 free categories, 3 premium (Date Night, Philosophy, Creative Sparks)
- **Stripe integration** — Monthly ($4.99) and yearly ($39.99) subscription plans
- **Billing portal** — Self-serve subscription management
- **Usage limits** — Free users get limited daily questions and 1 live session per week

### Admin & Analytics
- **Analytics dashboard** (`/admin`) — Usage metrics, daily trends, feedback list
- **Session history** (`/sessions`) — Past games with player counts and timestamps
- **Feedback system** — Star ratings with email notifications via Resend
- **Trust signals** — Live animated counters on landing page (sessions, players, questions)

### Technical Quality
- **SEO optimized** — Meta tags, Open Graph, sitemap.xml, robots.txt
- **PWA** — Installable, offline-capable, auto-updating service worker
- **Responsive** — Mobile-first design, touch-optimized
- **Animations** — Framer Motion for smooth transitions and micro-interactions
- **Accessibility** — Semantic HTML, ARIA labels, keyboard navigation

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript, Vite 6 |
| **Styling** | Tailwind CSS v4, custom design system |
| **Animations** | Framer Motion (motion/react) |
| **Icons** | Lucide React |
| **Routing** | React Router v7 |
| **Auth** | Firebase Authentication (Google sign-in with redirect) |
| **Database** | Firestore (named database via REST API) |
| **Backend** | Cloudflare Workers (edge compute) |
| **Real-time** | Cloudflare Durable Objects (WebSocket Hibernation API) |
| **KV Store** | Cloudflare Workers KV (counters, rate limiting, room codes) |
| **AI** | Cloudflare Workers AI (question generation) |
| **Payments** | Stripe (subscriptions + webhooks) |
| **Email** | Resend (transactional notifications) |
| **PWA** | vite-plugin-pwa + Workbox |
| **Deployment** | Cloudflare Pages/Workers (single deploy) |
| **Domain** | dinnertablecards.xyz (Cloudflare DNS) |

---

## Project Structure

```
icebreaker-question-app/
├── public/                    # Static assets
│   ├── favicon.svg           # Brand logo SVG
│   ├── manifest.json         # PWA manifest
│   ├── og-image.svg          # Social share image
│   ├── robots.txt            # SEO
│   ├── sitemap.xml           # SEO
│   └── icons/                # PWA icons (192x192, 512x512)
├── src/
│   ├── components/
│   │   ├── game/             # Live session components
│   │   │   ├── AnswerCard.tsx        # Revealed answer with spring animation
│   │   │   ├── AvatarPicker.tsx      # Gender + emoji avatar selection
│   │   │   ├── CreateSessionButton.tsx # Host session creation
│   │   │   ├── Leaderboard.tsx       # Ranked scores with medals
│   │   │   ├── Lobby.tsx             # Pre-game waiting room
│   │   │   ├── PlayerList.tsx        # Connected players display
│   │   │   ├── QuestionVote.tsx      # Thumbs up/down rating
│   │   │   ├── RoomCodeDisplay.tsx   # Shareable room code
│   │   │   ├── ShareResults.tsx      # Post-game sharing
│   │   │   ├── SoundToggle.tsx       # Mute/unmute button
│   │   │   ├── Timer.tsx             # Countdown with pulse animation
│   │   │   └── VotingCard.tsx        # Answer + vote button
│   │   ├── ErrorBoundary.tsx         # React error boundary
│   │   ├── FeedbackModal.tsx         # Star rating + text feedback
│   │   ├── Logo.tsx                  # Brand SVG logo component
│   │   ├── TrustSignals.tsx          # Animated usage counters
│   │   ├── Pricing.tsx               # Subscription plans UI
│   │   └── ...                       # Other UI components
│   ├── data/
│   │   ├── questions.ts      # 600+ curated question bank
│   │   └── packs.ts          # Question pack definitions
│   ├── hooks/
│   │   ├── useGameSocket.ts  # WebSocket connection + state management
│   │   └── useSoundEffects.ts # Web Audio API sound engine
│   ├── lib/
│   │   ├── firebase.ts       # Firebase init, auth helpers, authedFetch/authedGet
│   │   ├── animations.ts     # Shared framer-motion variants
│   │   └── utils.ts          # cn() Tailwind class merger
│   ├── pages/
│   │   ├── Landing.tsx       # Homepage with hero, features, FAQ, pricing
│   │   ├── Play.tsx          # Join session (enter room code + name)
│   │   ├── PlaySession.tsx   # Player game view (writing, revealing, voting)
│   │   ├── HostSession.tsx   # Host control panel
│   │   ├── Account.tsx       # User profile, subscription, admin tools
│   │   ├── AdminDashboard.tsx # Owner analytics (protected)
│   │   ├── SessionHistory.tsx # Past sessions list
│   │   ├── Privacy.tsx       # Privacy policy
│   │   ├── Terms.tsx         # Terms of service
│   │   └── NotFound.tsx      # 404 page
│   ├── types.ts              # TypeScript interfaces & types
│   ├── constants.ts          # Plan definitions, limits
│   ├── main.tsx              # App entry + routing
│   ├── App.tsx               # Main app shell (solo card browsing)
│   └── index.css             # Tailwind imports + custom properties
├── worker/
│   ├── index.ts              # Cloudflare Worker entry (API routes, auth, payments)
│   ├── game-session.ts       # Durable Object (real-time game state machine)
│   └── tsconfig.json         # Worker-specific TS config
├── vite.config.ts            # Vite + PWA + Tailwind config
├── wrangler.toml             # Cloudflare deployment config
├── tsconfig.json             # TypeScript config
└── package.json              # Dependencies & scripts
```

---

## Architecture

### Frontend (SPA)
The React app is a single-page application served from Cloudflare's edge CDN. It uses client-side routing with React Router and lazy-loads secondary pages for performance. The main bundle includes the question browsing experience, while game session pages are code-split.

### Backend (Cloudflare Workers)
A single Worker handles all API requests. It performs:
- **Authentication** — Verifies Firebase ID tokens by fetching Google's public keys and validating JWT signatures
- **Firestore access** — Uses service account credentials to sign JWTs and exchange them for Google access tokens, then calls the Firestore REST API
- **Stripe webhooks** — Processes subscription events (checkout completed, subscription updated/deleted)
- **Rate limiting** — IP-based limits stored in KV for feedback and question voting
- **Static assets** — Falls through to the `ASSETS` binding for SPA routing

### Real-time (Durable Objects)
Each live game session is a Durable Object instance with:
- **WebSocket Hibernation API** — Connections persist across Worker restarts without holding open connections in memory
- **Serialized state** — Game state (players, answers, votes, scores) stored in DO storage for durability
- **Alarm-based timers** — Answer deadlines enforced server-side via DO alarms
- **State machine** — `lobby → writing → revealing → voting → (next question) → ended`

### Data Flow
```
Browser ──WebSocket──→ Cloudflare Worker ──→ Durable Object (game state)
                                          └──→ KV (counters, room codes, rate limits)
                                          └──→ Firestore REST (users, feedback, history)
                                          └──→ Stripe API (subscriptions)
                                          └──→ Resend API (email notifications)
```

---

## API Endpoints

### Public (no auth)
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/stats` | Usage counters for trust signals |
| `POST` | `/api/feedback` | Submit feedback (rate-limited 5/IP/hour) |
| `POST` | `/api/question-vote` | Rate a question up/down (rate-limited 20/IP/hour) |

### Authenticated (Firebase ID token)
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/profile` | Create/update user profile |
| `POST` | `/api/consume` | Consume a daily question (usage tracking) |
| `POST` | `/api/session/create` | Create a new live session (returns room code) |
| `GET` | `/api/session/lookup?code=XXXX` | Look up room code → Durable Object |
| `GET` | `/api/session/ws` | WebSocket upgrade for game connection |
| `GET` | `/api/sessions/history` | List user's past hosted sessions |
| `POST` | `/api/billing-portal` | Get Stripe billing portal URL |
| `POST` | `/api/delete-account` | Delete user data + Firebase account |

### Admin (Firebase auth + admin email)
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/dashboard-stats` | Aggregate metrics + 7-day daily breakdown |
| `GET` | `/api/admin/feedback-list` | Latest feedback entries |
| `POST` | `/api/admin/reset-usage` | Reset usage counter for testing |

### Webhooks
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/stripe-webhook` | Stripe subscription events |

---

## WebSocket Protocol (Live Sessions)

### Client → Server Messages
```typescript
{ type: 'join', name: string, gender?: string, avatar?: string }
{ type: 'start_question', text: string, timerSec?: number }  // host only
{ type: 'submit_answer', answer: string }
{ type: 'reveal_next' }           // host only
{ type: 'reveal_all' }            // host only
{ type: 'start_voting' }          // host only
{ type: 'cast_vote', targetPlayerId: string }
{ type: 'end_voting' }            // host only
{ type: 'next_question' }         // host only
{ type: 'end_session' }           // host only
{ type: 'kick', playerId: string } // host only
```

### Server → Client Messages
```typescript
{ type: 'welcome', playerId, players, roomCode, status, ... }
{ type: 'player_joined', player: { id, name, avatar, gender } }
{ type: 'player_left', playerId, name }
{ type: 'question_started', text, index, timerEndsAt }
{ type: 'answer_submitted', playerId }
{ type: 'timer_expired' }
{ type: 'reveal', answer: { playerId, name, answer, avatar } }
{ type: 'reveal_all', answers: [...] }
{ type: 'voting_started' }
{ type: 'vote_update', votes: Record<string, number>, voterCount, totalVoters }
{ type: 'vote_result', winnerId, winnerName, scores: [...] }
{ type: 'session_ended' }
{ type: 'error', message: string }
```

---

## Game State Machine

```
┌───────┐   start_question   ┌─────────┐   timer/all submitted   ┌───────────┐
│ LOBBY │ ──────────────────→ │ WRITING │ ──────────────────────→ │ REVEALING │
└───────┘                     └─────────┘                         └───────────┘
    ↑                                                                    │
    │                                                          start_voting
    │                                                                    ↓
    │         next_question   ┌────────┐                          ┌────────┐
    └─────────────────────── │ SCORED │ ←──── end_voting ──────── │ VOTING │
                              └────────┘                          └────────┘
```

**Scoring Rules:**
- Each vote received = 1 point
- Most votes = +2 bonus ("Best Answer")
- Ties: all tied players get the bonus
- Cannot vote for yourself

---

## Local Development

### Prerequisites
- Node.js 18+
- npm 9+
- A Cloudflare account (for Workers/KV/DO)
- Firebase project (for auth + Firestore)

### Setup

1. **Clone and install:**
   ```bash
   git clone https://github.com/contentcreatordarsh/icebreaker-question-app.git
   cd icebreaker-question-app
   npm install
   ```

2. **Environment variables:**
   Create a `.env.local` file:
   ```env
   VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
   VITE_STRIPE_MONTHLY_PRICE_ID=price_...
   VITE_STRIPE_YEARLY_PRICE_ID=price_...
   ```

3. **Cloudflare secrets** (for production):
   ```bash
   wrangler secret put STRIPE_SECRET_KEY
   wrangler secret put STRIPE_WEBHOOK_SECRET
   wrangler secret put FIREBASE_SERVICE_ACCOUNT_EMAIL
   wrangler secret put FIREBASE_PRIVATE_KEY
   wrangler secret put RESEND_API_KEY
   ```

4. **Run the dev server:**
   ```bash
   npm run dev        # Vite dev server (frontend only, hot reload)
   npm run preview    # Full stack via wrangler dev (Workers + DO + KV)
   ```

5. **Deploy:**
   ```bash
   npm run deploy     # Builds frontend + deploys Worker to Cloudflare
   ```

### Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Production build (outputs to `dist/`) |
| `npm run preview` | Run full stack locally via `wrangler dev` |
| `npm run deploy` | Build + deploy to Cloudflare |
| `npm run lint` | TypeScript type-checking |
| `npm run clean` | Remove build output |

---

## Design System

### Colors
| Name | Hex | Usage |
|---|---|---|
| Brand | `#1A1A1A` | Primary text, buttons |
| Paper | `#F5F2ED` | Background |
| Accent | `#5A5A40` | Olive green highlights, CTAs |

### Typography
- **Serif:** Cormorant Garamond (headings, questions, editorial feel)
- **Sans:** Inter (UI elements, labels, navigation)
- **Mono:** System monospace (room codes)

### Design Philosophy
The app uses an "editorial newspaper" aesthetic — clean typography, generous whitespace, subtle borders, and muted colors that let the conversation content be the focus. Animations are spring-based and organic, never flashy.

---

## Deployment

The app deploys as a single Cloudflare Worker that serves both the static SPA and handles all API logic:

```bash
npm run deploy
```

This runs `vite build` (outputs to `dist/`) then `wrangler deploy` which uploads the Worker code + static assets to Cloudflare's global edge network.

**Custom domain:** Configured via Cloudflare DNS with a CNAME to the Workers route.

**SSL:** Automatic via Cloudflare (Full strict mode).

**CDN:** Static assets served from 300+ edge locations worldwide.

---

## Environment & Secrets

### Build-time (Vite)
Set in `.env.local` or Cloudflare Pages build settings:
- `VITE_STRIPE_PUBLISHABLE_KEY` — Stripe public key

### Runtime (Worker)
Set via `wrangler secret put`:
- `STRIPE_SECRET_KEY` — Stripe API secret
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret
- `FIREBASE_SERVICE_ACCOUNT_EMAIL` — Service account for Firestore
- `FIREBASE_PRIVATE_KEY` — RSA private key (PEM format)
- `RESEND_API_KEY` — Email API key

### Non-secret vars (in wrangler.toml)
- `FIREBASE_PROJECT_ID`
- `FIREBASE_DATABASE_ID`
- `STRIPE_MONTHLY_PRICE_ID`
- `STRIPE_YEARLY_PRICE_ID`
- `RESEND_FROM`

---

## Contributing

This is a personal project by [@hegdedarsh](https://x.com/hegdedarsh). If you'd like to contribute or report issues:

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run `npm run build` to verify
5. Push and open a PR

---

## License

All rights reserved. This is a proprietary project.

---

## Contact

- **Twitter/X:** [@hegdedarsh](https://x.com/hegdedarsh)
- **Email:** contentcreatordarsh@gmail.com
- **Website:** [dinnertablecards.xyz](https://dinnertablecards.xyz)
