# The Clip Deal Track - Product Requirements Document

## Original Problem Statement
Plateforme SaaS de gestion de campagnes de clipping vidéo multi-rôles (Clippeur, Agence, Manager, Client) avec rémunération au RPM (revenu par 1000 vues).

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Shadcn/UI + Framer Motion
- **Backend**: FastAPI + Motor (async MongoDB)
- **Database**: MongoDB
- **Auth**: Emergent Google OAuth
- **Real-time**: WebSockets for chat and notifications

## User Personas
1. **Clippeur** - Créateurs de clips vidéo freelance, rémunérés selon leurs vues
2. **Agence** - Gère des campagnes, recrute des clippeurs, configure les règles
3. **Manager** - Supervise les équipes, envoie des conseils, suit les performances
4. **Client** - Créateurs/influenceurs qui suivent leurs campagnes

## Core Requirements (Static)
- Google OAuth authentication uniquement
- 4 rôles distincts avec interfaces personnalisées
- Sidebar dynamique avec campagnes et chats isolés
- Système RPM (rémunération par 1000 vues)
- Liens d'invitation uniques (3 par campagne)
- Système de strikes automatique
- Chat temps réel par campagne
- Gestion des comptes réseaux sociaux

## What's Been Implemented (MVP - March 25, 2025)
### Authentication
- ✅ Google OAuth via Emergent Auth
- ✅ Role selection on first login
- ✅ Protected routes per role
- ✅ Session management with cookies

### Landing Page
- ✅ Hero section with gradient text
- ✅ Features overview (4 roles explained)
- ✅ RPM system showcase
- ✅ Stats display
- ✅ CTA buttons

### Agency Dashboard
- ✅ Announcements feed (create/view)
- ✅ Discover campaigns (read-only)
- ✅ Campaign creation form (all fields)
- ✅ Campaign dashboard with stats
- ✅ Invitation links page (3 links per campaign)
- ✅ Chat per campaign
- ✅ Settings page

### Clipper Dashboard
- ✅ Home with announcements feed
- ✅ Discover campaigns
- ✅ Social accounts management (add/remove)
- ✅ Account attribution per campaign
- ✅ Campaign dashboard
- ✅ Payment history
- ✅ Settings page

### Manager Dashboard
- ✅ 72h reminder system
- ✅ Campaign dashboard with clipper list
- ✅ Advice sending system
- ✅ Chat per campaign
- ✅ Settings page

### Client Dashboard
- ✅ Campaign list
- ✅ Campaign view (read-only)
- ✅ Chat per campaign
- ✅ Settings page

### Backend APIs
- ✅ Auth endpoints (session, me, logout, select-role)
- ✅ Campaigns CRUD + join + stats
- ✅ Social accounts management
- ✅ Messages/Chat
- ✅ Announcements
- ✅ Advices (Manager)
- ✅ WebSocket for real-time updates

## Prioritized Backlog

### P0 (Critical - Next Sprint)
- [ ] Real stats integration (replace mocked data)
- [ ] Actual strike system automation (cron job)
- [ ] Social account verification system
- [ ] Stripe payment integration for agencies

### P1 (High Priority)
- [ ] Video viral ranking
- [ ] Application form for campaigns
- [ ] Push notifications
- [ ] Mobile responsive improvements
- [ ] Export data (CSV/PDF)

### P2 (Nice to Have)
- [ ] Dark/Light mode toggle
- [ ] Analytics dashboard
- [ ] Email notifications
- [ ] Clipper profile page
- [ ] Campaign image upload

## Next Tasks List
1. Implement real-time stats tracking with external API
2. Set up cron job for automatic strike system
3. Integrate Stripe for budget top-up and clipper payouts
4. Add social account verification (TikTok/YouTube/Instagram API)
5. Mobile responsive testing and fixes
