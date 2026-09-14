# CinePrime — Product Requirements Document (Full-Stack)

## Software Requirements Specification & Frontend Specification

**Project:** cineprime
**Document type:** Product Requirements Document (PRD) — Full-Stack  
**Version:** 3.0
**Last update:** 2026-06-21
**Previous version:** v2.1 (Full-Stack, 2026-05-27)

---

## Table of Contents

1. [Purpose and Scope](#1-purpose-and-scope)
2. [System Context](#2-system-context)
3. [Architecture Overview](#3-architecture-overview)
4. [Functional Requirements — Backend](#4-functional-requirements--backend)
5. [Functional Requirements — Frontend](#5-functional-requirements--frontend)
6. [Use Cases (1–12)](#6-use-cases-112)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [Data Model and Integrity Rules](#8-data-model-and-integrity-rules)
9. [API Contract and Error Standard](#9-api-contract-and-error-standard)
10. [Frontend Component Specification](#10-frontend-component-specification)
11. [Security and Access Control](#11-security-and-access-control)
12. [Operational Requirements](#12-operational-requirements)
13. [Requirements Traceability Matrix](#13-requirements-traceability-matrix)
14. [Out of Scope](#14-out-of-scope)

---

## 1. Purpose and Scope

The CinePrime platform is a full-stack cinema reservation system composed of a production-oriented REST backend (Django/DRF) and a browser-based frontend application.

**Scope covered by this document:**

Backend (carried over from SRS v1.0, with amendments):
- User registration and JWT authentication
- Public catalog browsing (genres, movies, rooms, sessions)
- Session seat map inspection
- Temporary seat reservation with distributed lock and expiration
- Checkout with ticket-type pricing and payment-method selection
- Ticket generation and authenticated ticket listing
- Standardized API error responses, rate limiting, health checks, background processing, and CI validation

Frontend (new in v2.0):
- Home page with featured film banner and categorized movie listings
- Movie detail and session selection page
- Interactive seat map with real-time lock feedback
- Ticket-type selection with dynamic subtotal calculation
- Checkout and payment flow with order summary
- Post-purchase ticket confirmation screen

New in v3.0 (backend and admin UI):
- Movie enrichment fields: `age_rating`, `spotlight_url`, `director`, `cast`, `classification_description`
- Movie reviews system with half-star ratings and helpfulness votes
- Movie interest tracking for upcoming films
- Room type pricing table with per-experience-type base prices
- Bulk room layout creation and accessible-row provisioning API
- Admin role system (Staff and Master roles) with permission audit log
- User management API (list, delete, role grant/revoke)
- Admin web UI for managing genres, movies, rooms, sessions, pricing, and users
- TMDB integration (Next.js proxy) for importing movie data during admin creation

---

## 2. System Context

### 2.1 Business Context

The platform supports the complete online reservation workflow: browsing the catalog, selecting a session and seats, choosing ticket types, paying, and receiving purchase confirmation — all accessible from a web browser without requiring a native application.

### 2.2 Actors

| Actor | Description | Capabilities |
|---|---|---|
| Visitor | Unauthenticated user | Browse home, catalog, movie details, session seat maps; register; login |
| Authenticated User | User with valid JWT access token | All visitor capabilities plus: temporary reservation, checkout, view own tickets, view own profile, submit movie reviews, register interest in upcoming films |
| Admin (Staff) | User with `is_staff = true` | All authenticated capabilities plus: create/update/delete catalog entities (genres, movies, rooms, sessions), manage room layouts, configure pricing, manage movie reviews; access the admin UI |
| Master Admin | User with `is_superuser = true` | All staff capabilities plus: list and delete users, grant and revoke Staff/Master roles, view permission audit logs, access user management in admin UI |

---

## 3. Architecture Overview

### 3.1 Architectural Style

- **Backend:** Modular monolith — Django and Django REST Framework
- **Frontend:** Single-page application (SPA) consuming the REST API

### 3.2 Core Backend Components

- **API layer:** DRF views and serializers
- **Domain/data layer:** Django ORM models with relational constraints
- **Service layer:** reservation, checkout, expiration, and pricing services
- **Infrastructure:** PostgreSQL, Redis, Celery worker

### 3.3 Frontend Stack

- Browser-based SPA (framework choice: React or equivalent)
- Communicates exclusively with the REST API via HTTP(S)
- No server-side rendering required; static asset delivery via CDN or web server

### 3.4 Redis Responsibilities

- List caching for catalog endpoints
- Distributed seat locking: `lock:session-seat:{session_id}:{seat_id}`

### 3.5 Celery Responsibilities

- Release expired temporary reservations
- Send ticket confirmation emails asynchronously

### 3.6 Error Handling Model

- Centralized exception handler on the backend
- Consistent error envelope across all API endpoints
- Frontend interprets error codes to display user-facing messages

---

## 4. Functional Requirements — Backend

### FR-01 User Registration

The system shall allow account creation with `email`, `username`, and `password`.

### FR-02 User Login

The system shall authenticate users using email/password and issue JWT access and refresh tokens.

### FR-03 Current User Data

The system shall expose an authenticated endpoint to retrieve the current user profile.

### FR-04 Catalog Endpoints

The system shall provide endpoints for genres, movies, rooms, and sessions with public list/retrieve operations and admin-only create/update/delete operations.

### FR-04a Movie Status and Featured Flag

The Movie model shall include a `status` field (enumeration: `em_cartaz`, `pre_venda`, `em_breve`) to support frontend catalog filtering across now-showing, pre-sale, and upcoming movies. It shall also include an `is_featured` boolean field to designate films for the home page banner. The catalog list endpoint shall accept a `status` query parameter for filtering and shall include `is_featured` in its response payload.

### FR-05 Seat Map Visualization

The system shall provide public session seat maps with per-seat status (`AVAILABLE`, `RESERVED`, `PURCHASED`).

### FR-06 Temporary Reservation

The system shall allow authenticated users to temporarily reserve session seats, enforcing seat availability and ownership metadata via a distributed Redis lock.

### FR-07 Reservation Expiration

The system shall expire temporary seat reservations after 600 seconds and restore seat availability when expired.

### FR-08 Checkout with Ticket Type and Payment Method

The system shall finalize valid reserved seats into purchased seats in a transactional operation and generate tickets. The checkout payload shall accept, for each reserved seat, a `ticket_type` value (`inteira` or `meia`) and shall accept a `payment_method` field (`cartao_credito` or `pix`) at the order level. The service layer shall calculate the total amount based on each seat's applicable `base_price` and `ticket_type` (where `meia` = 50% of `base_price`) and validate that the submitted total matches the computed total before committing the transaction.

### FR-08a Session Base Price

Each `Session` record shall carry a `base_price` field (decimal) representing the full ticket price for that session. This value is used by the checkout service to compute per-seat amounts.

### FR-08b Room and Session Experience Metadata

Rooms shall expose optional experience metadata: `experience_type`, `display_name`, and `description`. Sessions shall expose optional format metadata: `audio_format`, `projection_format`, and `session_type`. Admin users shall be able to create and update these values through catalog APIs and Django admin. Existing rooms and sessions without metadata remain valid and serialize empty metadata values.

### FR-09 My Tickets

The system shall allow authenticated users to list their own tickets, with optional `type=upcoming|past` filtering. Each ticket record shall include the `ticket_type` and `amount_paid` associated with the purchase.

### FR-10 API Documentation Endpoints

The system shall expose OpenAPI schema and Swagger UI.

### FR-11 Health Check

The system shall expose a health endpoint verifying database, Redis, and Celery connectivity.

### FR-12 Movie Enrichment Fields

The Movie model shall include:
- `age_rating` (enum): `L`, `10`, `12`, `14`, `16`, `18` — Brazilian classification rating.
- `classification_description` (text): free-text explanation of the rating classification.
- `director` (text): director name, blank by default.
- `cast` (related model `CastMember`): ordered list of cast member names tied to the movie.
- `spotlight_url` (URL, optional): a secondary image URL for hero/spotlight rendering on the home page, distinct from the catalog poster.

These fields are managed through catalog admin API endpoints and the Django admin.

### FR-13 Movie Reviews

The system shall allow authenticated users to submit a single review per movie, containing a numeric rating between 0.5 and 5.0 (half-star granularity) and an optional text comment. Reviews shall be publicly readable. Each review may receive helpfulness votes (`like` or `dislike`) from authenticated users other than the author. One vote per user per review is enforced. Reviews shall support pagination and optional rating filter on the list endpoint.

### FR-14 Movie Interest

The system shall allow authenticated users to register interest in a specific movie (e.g., upcoming releases). The interest endpoint shall be public for read access (returns total count and whether the current user is interested) and require authentication for creating or deleting an interest entry. One interest record per user per movie is enforced.

### FR-15 Room Type Pricing

The system shall maintain a `RoomTypePricing` table associating each room experience type with a base price. When a `Room` is saved, its `base_price` is automatically derived from the matching `RoomTypePricing` record, falling back to R$25.00 if no record exists. Admin users may list and update pricing entries through the API; the `experience_type` field is unique and not editable by PUT — only the `base_price` is patchable.

### FR-16 Bulk Room Layout Creation

The system shall provide an admin-only endpoint to create multiple seat rows and their seats in a single atomic transaction, subject to room capacity validation and the constraint that room layout changes are blocked while future sessions exist.

### FR-17 Accessible Row Provisioning

The system shall provide an admin-only endpoint to add a dedicated accessible-priority row to a room. Each accessible pair consists of one wheelchair-accessible seat and one companion seat. A room may have at most one accessible-priority row. The endpoint enforces capacity limits and blocks changes to rooms with future sessions.

### FR-18 Admin Role Management

The system shall allow Master Admin users to:
- Promote a user to Staff (`is_staff = true`) or Master (`is_superuser = true`).
- Downgrade a Master to Staff (revoking `is_superuser` while retaining `is_staff`).
- Fully demote a Staff or Master user back to regular user.
- Protect against leaving the system without any master admin (one remaining master cannot be demoted without designating a successor).
- Mark a master as "protected" (`is_protected_master`) requiring an explicit successor before self-deletion.

### FR-19 User Management API

The system shall allow Master Admin users to list all users with optional role filter (`master`, `staff`, `user`) and to delete user accounts. Deleting a user who owns active tickets is blocked unless the deletion is forced via an explicit flag. The system enforces that the last master admin cannot be deleted.

### FR-20 Admin Permission Audit Log

Every role grant and revoke action shall be persisted in an `AdminPermissionLog` record capturing the target user, the actor who performed the change, the action (`granted`/`revoked`), the role involved, and the timestamp. Master Admin users may retrieve the permission log for any specific user.

---

## 5. Functional Requirements — Frontend

### FE-01 Home Page

The home page shall display a featured-film banner driven by movies where `is_featured = true`. Below the banner, catalog sections shall be populated by filtering by `status`: "Em Cartaz" (`em_cartaz`), "Pré-venda" (`pre_venda`), and upcoming/movie-announcement surfaces using "Em breve" (`em_breve`). Each film card shall display the movie poster and title and shall navigate to the movie detail page on interaction.

### FE-02 Movie Detail and Session Selection Page

The movie detail page shall display the film's synopsis, genre(s), duration, and release date when available. It shall present a date picker allowing the user to select a viewing date and, upon date selection, render the available sessions for that date grouped by room display name. Session cards shall show badges when metadata is available, such as `VIP`, `3D`, `Legendado`, `Dublado`, and `Pré-estreia`. Selecting a session shall navigate the user to the seat selection page for that session.

Movie `age_rating` and `trailer_url` are evaluated as a follow-up because the current backend movie schema does not expose those fields yet. The frontend shall not invent or hard-code those values before the backend contract is added.

### FE-03 Seat Selection Page

The seat selection page shall render an interactive visual map of the session's room. The map shall display a "TELA" (screen) indicator at the top and each seat as a selectable element positioned according to its row and number. Seat states shall be visually distinguished: Available (white/outline), Selected (filled highlight color), Occupied (grey), and Accessible/Wheelchair (distinct marker). Clicking an available seat shall call the temporary reservation endpoint; the seat state shall update optimistically and revert if the lock fails. A countdown timer shall display the remaining reservation window (600 s). A summary panel shall show the selected seats and current total. Clicking a selected seat shall release the reservation and restore the seat to Available.

Page layout: the `CheckoutStepIndicator` shall be placed inside the seat map column (stacked above the seat map), not as a separate full-width row outside the two-column flex container. This keeps the step indicator's edges aligned with the seat map and leaves the order summary panel independent on the right. The seat map wrapper retains its own `overflow-x-auto` with a `min-w-[900px]` inner div so horizontal scrolling on narrow viewports is not affected.

### FE-04 Ticket Type Selection Page

After confirming seat selection, the user shall proceed to the ticket-type page. For each selected seat, the user shall choose a ticket type: Inteira (full price) or Meia-entrada (50% of base price). The page shall display the per-seat price based on the selection and recalculate the order subtotal in real time as types are changed. A voucher/coupon code input field shall be present.

### FE-05 Checkout and Payment Page

The checkout page shall present an order summary (movie title, session date/time, room, selected seats with ticket types, and total amount). The user shall select a payment method (Cartão de Crédito or PIX). Upon confirmation, the page shall submit the checkout payload to the API. While the request is in-flight, the UI shall display a loading indicator. On success, the user shall be redirected to the confirmation page. On failure, an appropriate error message derived from the API error code shall be displayed.

### FE-06 Order Confirmation and My Tickets

Upon successful checkout, the user shall be presented with a confirmation screen displaying each purchased ticket. Each ticket shall show: movie title, session date/time, room, seat identifier, ticket type, amount paid, and a generated QR code or barcode representation (fictitious/display-only in this scope). A "Meus Ingressos" section accessible from the authenticated user's navigation shall display all past and upcoming tickets, filterable by `upcoming` or `past`.

### FE-07 Authentication Flow (Register / Login)

The frontend shall provide registration and login forms. On successful login, JWT tokens shall be stored in memory (or `httpOnly` cookies if supported) and attached to subsequent API requests as Bearer tokens. On token expiry, the user shall be redirected to the login page. Protected routes (checkout, my tickets) shall be inaccessible to unauthenticated visitors.

### FE-08 Admin UI

The frontend shall provide a protected administration area at `/admin/*` accessible to staff and master admin users. The admin area shall support:

- **Dashboard** (`/admin/`): summary stats (total movies, now-showing count, room count, sessions today).
- **Genre management** (`/admin/genres/`): list and create genres with localization support.
- **Movie management** (`/admin/movies/`, `/admin/movies/new/`, `/admin/movies/{id}/edit/`): list, create, and edit movies including all enrichment fields (`age_rating`, `spotlight_url`, `director`, cast, `classification_description`, `status`, `is_featured`, translations). The create form integrates TMDB search to prefill fields.
- **Room management** (`/admin/rooms/`, `/admin/rooms/new/`, `/admin/rooms/{id}/edit/`): list, create, and edit rooms including experience type, display name, and translations.
- **Room layout editor** (`/admin/rooms/{id}/layout/`): visually manage seat rows and seats; add standard rows via bulk wizard; add accessible-priority rows; delete rows.
- **Session management** (`/admin/sessions/`, `/admin/sessions/new/`, `/admin/sessions/{id}/edit/`): list, create, and edit sessions including base price, audio format, projection format, and session type.
- **Pricing management** (`/admin/pricing/`): list and edit room-type base prices per experience type.
- **User management** (`/admin/users/`): master-only; list users with role filter, promote/demote roles, view permission audit log, delete accounts.

Admin routes shall be guarded by role: standard admin pages require at least Staff, user management requires Master.

### FE-09 TMDB Integration (Admin Movie Import)

The admin movie creation form shall integrate a TMDB search/import flow through Next.js proxy API routes (`/api/tmdb/search` and `/api/tmdb/movie/{id}`). The proxy fetches data from TMDB using a server-side token, preventing exposure of credentials in the browser. Search results return up to eight matching titles. Selecting a result prefills the form with title, synopsis, poster, runtime, release date, director, cast, and available translations.

The TMDB token is resolved by the proxy with the following priority:

1. `TMDB_API_READ_TOKEN` environment variable on the Next.js server — used directly if present.
2. If not set, the proxy calls `GET /api/v1/internal/tmdb-token/` on the Django backend (authenticated via `X-Internal-Key: <INTERNAL_API_KEY>`) to retrieve the token stored in the `SiteConfig` table. This response is cached in memory for 5 minutes.

Master Admin users may configure the TMDB token through the admin UI without server restarts via `GET/PUT /api/v1/users/config/tmdb-token/`. The `GET` response returns `{ configured: bool, hint: "<last-4-chars>" }` to confirm the token is set without revealing it in full.

### FE-10 Movie Reviews UI

The movie detail page shall display user reviews for a movie with star ratings (half-star granularity, 0.5–5.0) and optional comments. Authenticated users shall be able to submit, edit, or delete their own review through a review form on the page. Visitors shall see reviews in read-only mode. Each review shall show the author's username, rating, comment, and helpfulness vote counts. Authenticated users (other than the author) shall be able to cast a like or dislike vote on any review, or remove their vote. The review list shall be paginated and support optional rating filter.

### FE-11 Movie Interest UI

On the movie detail page, authenticated users shall be able to register or remove interest in an upcoming movie. The interest control shall show the total number of interested users and indicate whether the current user is already registered. Visitors shall see the count in read-only mode. The interest feature is most relevant for movies with `status = em_breve`.

### FE-12 Language Switcher

The frontend shall provide a language switcher component in the global header allowing users to toggle between `pt-BR` and `en-US`. The selected locale shall be persisted in a `cineprime_locale` cookie and applied globally to UI text, formatting, accessible labels, and API requests.

---

## 6. Use Cases (1–12)

### UC-1 Register User

**Actor:** Visitor  
**Precondition:** none  
**Main flow:** submit registration payload (username, email, password); system validates and creates user account.  
**Result:** user account created; user may log in.

### UC-2 Login User

**Actor:** Visitor  
**Precondition:** registered account exists  
**Main flow:** submit credentials; system authenticates and returns JWT tokens; frontend stores tokens.  
**Result:** user can access protected pages and endpoints.

### UC-3 Browse Home Page

**Actor:** Visitor or Authenticated User  
**Main flow:** load home page; frontend fetches featured movies (`is_featured=true`) for the banner and fetches catalog sections by lifecycle status (`em_cartaz`, `pre_venda`, and `em_breve` where an upcoming section is displayed); results are displayed.

### UC-4 View Movie Detail and Select Session

**Actor:** Visitor or Authenticated User  
**Main flow:** navigate to movie detail; frontend fetches movie metadata and available sessions; user selects a date and session.

### UC-5 View Session Seat Map and Reserve Seats

**Actor:** Authenticated User  
**Precondition:** session selected  
**Main flow:** frontend fetches seat map for the session; user clicks available seats; frontend calls temporary reservation endpoint for each seat; countdown timer starts.  
**Alternative:** seat lock fails (already reserved by another user) — UI displays error and reverts seat to available.

### UC-6 Select Ticket Types

**Actor:** Authenticated User  
**Precondition:** at least one seat temporarily reserved  
**Main flow:** user selects a ticket type (inteira/meia) per reserved seat; frontend displays real-time subtotal.

### UC-7 Checkout

**Actor:** Authenticated User  
**Precondition:** seats reserved and ticket types selected  
**Main flow:** user reviews order summary; selects payment method; confirms checkout; frontend submits payload to checkout endpoint; backend validates amounts and marks seats purchased.  
**Result:** tickets created; user redirected to confirmation page.

### UC-8 View Confirmation and My Tickets

**Actor:** Authenticated User  
**Precondition:** successful checkout  
**Main flow:** confirmation screen displays generated tickets with QR representation; user can access "Meus Ingressos" to view all tickets filtered by upcoming/past.

### UC-9 Reservation Expiration

**Actor:** System (Celery)  
**Precondition:** temporary reservation older than 600 s without checkout  
**Main flow:** Celery task fires; seat status restored to AVAILABLE; Redis lock released.  
**Result:** seat becomes available to other users; frontend timer expiry prompts user to restart.

### UC-10 Browse Catalog Without Authentication

**Actor:** Visitor  
**Main flow:** visitor accesses home, movie detail, and seat map pages without logging in; all read-only catalog and seat-map endpoints are public.  
**Result:** visitor can explore the catalog; attempting to reserve seats redirects to login.

### UC-11 Submit and Vote on Movie Review

**Actor:** Authenticated User  
**Precondition:** user is logged in  
**Main flow:** user navigates to a movie detail page; submits a rating (0.5–5.0) and optional comment; review appears in the movie review list. User or other authenticated users may cast like/dislike votes on any review or remove existing votes.  
**Alternative:** if the user already submitted a review, the form pre-populates for editing. Deleting a review removes it and all associated votes.

### UC-12 Register Interest in an Upcoming Movie

**Actor:** Authenticated User or Visitor  
**Main flow:** visitor views the movie detail page for an upcoming movie (`em_breve`); the interest count is shown. Authenticated user clicks the interest button; the system records their interest and updates the count. Clicking again removes the interest.

---

## 7. Non-Functional Requirements

### NFR-01 Performance and Response Behavior

- All list endpoints are paginated.
- Movies and sessions list endpoints use Redis-backed caching.
- Frontend shall display skeleton loaders or spinners while API requests are in-flight.
- Time-to-interactive for the home page shall not exceed 3 s on a standard broadband connection.

### NFR-02 Concurrency and Consistency

- Distributed Redis lock prevents competing seat reservation attempts.
- Checkout runs inside a DB transaction.
- Seat status transitions are validated and persisted consistently.
- Total amount validation in checkout prevents price manipulation from the client.

### NFR-03 Reliability

- Expiration and email tasks are executed asynchronously via Celery.
- Email task has retry behavior for transient failures.
- Frontend countdown timer aligns with server-side expiration to minimize UX surprises.

### NFR-04 Security

- JWT Bearer authentication for all protected operations.
- Password validation enforced in the registration serializer.
- Access control via DRF permissions on the backend.
- Frontend never stores tokens in `localStorage`; prefer memory or `httpOnly` cookies.
- Checkout total is validated server-side; client-submitted totals are not trusted.

### NFR-05 Abuse Protection

- Global anonymous and authenticated throttles on the backend.
- Endpoint-specific throttles for login and reservation operations.

### NFR-06 Operability

- Structured logging on the backend.
- Correlation ID middleware for request tracing.
- Health check endpoint for infrastructure monitoring.

### NFR-07 Accessibility

- Seat map must visually and semantically distinguish wheelchair-accessible seats.
- Interactive seat elements must be keyboard-navigable and carry appropriate ARIA roles.
- Color-based status indicators must include a text/icon alternative (legend).

### NFR-08 Testability

- Backend: automated integration test suite covering core business flows and error contracts.
- Frontend: component-level and end-to-end tests covering the reservation and checkout flows.

---

## 8. Data Model and Integrity Rules

### 8.1 Primary Entities

- `User`
- `SiteConfig`
- `AdminPermissionLog`
- `Genre`
- `Movie` *(amended)*
- `CastMember`
- `MovieInterest`
- `MovieReview`
- `MovieReviewVote`
- `RoomTypePricing`
- `Room` *(amended)*
- `Session` *(amended)*
- `SeatRow` *(amended)*
- `Seat` *(amended)*
- `SessionSeat`
- `Ticket` *(amended)*

### 8.2 Model Amendments

#### Movie (amended)

| Field | Type | Notes |
|---|---|---|
| `status` | CharField (enum) | `em_cartaz` \| `pre_venda` \| `em_breve`; default `em_cartaz` |
| `is_featured` | BooleanField | `default=False`; controls banner placement on home page |
| `spotlight_url` | URLField (optional) | Secondary hero image for the home-page spotlight/banner, distinct from the catalog poster |
| `age_rating` | CharField (enum, optional) | `L` \| `10` \| `12` \| `14` \| `16` \| `18` (Brazilian CLASSIND ratings); blank means unrated |
| `classification_description` | TextField (optional) | Free-text explanation of the age rating classification |
| `director` | CharField (optional) | Director name; blank by default |

#### CastMember (new)

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `movie` | FK → Movie | Cascade delete |
| `name` | CharField | Cast member name |
| `order` | PositiveSmallIntegerField | Display order; default 0 |

Up to 10 cast members are typically imported from TMDB during admin movie creation.

#### MovieInterest (new)

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `movie` | FK → Movie | Cascade delete |
| `user` | FK → User | Cascade delete |
| `created_at` | DateTimeField | Auto-set at creation |

Unique constraint: `(movie, user)`.

#### MovieReview (new)

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `movie` | FK → Movie | Cascade delete |
| `user` | FK → User | Cascade delete |
| `rating` | DecimalField (max 3, dp 1) | 0.5 to 5.0 in 0.5 increments |
| `comment` | TextField (optional) | User's written review |
| `created_at` | DateTimeField | Auto-set at creation |
| `updated_at` | DateTimeField | Auto-updated |

Unique constraint: `(movie, user)`. Check constraint: `rating ∈ [0.5, 5.0]`.

#### MovieReviewVote (new)

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `review` | FK → MovieReview | Cascade delete |
| `user` | FK → User | Cascade delete |
| `vote` | CharField (enum) | `like` \| `dislike` |
| `created_at` | DateTimeField | Auto-set at creation |

Unique constraint: `(review, user)`. A user may not vote on their own review.

#### RoomTypePricing (new)

| Field | Type | Notes |
|---|---|---|
| `id` | AutoField | Primary key |
| `experience_type` | CharField (enum, unique) | `standard` \| `vip` \| `premium` \| `imax` |
| `base_price` | DecimalField | Minimum R$0.01; sets the default price for rooms of this type |
| `updated_at` | DateTimeField | Auto-updated |

#### Room (amended)

| Field | Type | Notes |
|---|---|---|
| `experience_type` | CharField (enum, optional) | `standard` \| `vip` \| `premium` \| `imax`; blank means unspecified |
| `display_name` | CharField (optional) | Public room label used by session lists and checkout |
| `description` | TextField (optional) | Admin-editable room experience description |
| `base_price` | DecimalField | Auto-derived from `RoomTypePricing` on save; falls back to R$25.00 if no pricing record exists |
| `max_center_seats_per_row` | PositiveIntegerField (optional) | Maximum number of center seats per row; used by the seat map rendering layout |
| `accessible_row_index` | PositiveIntegerField | Index of the accessible-priority row in the room layout; default 0 |

#### SeatRow (amended)

| Field | Type | Notes |
|---|---|---|
| `is_accessible_row` | BooleanField | `True` for the accessible-priority row; at most one per room |

#### Seat (amended)

| Field | Type | Notes |
|---|---|---|
| `is_accessible` | BooleanField | Wheelchair-accessible seat |
| `companion_seat` | FK → Seat (optional) | Companion seat paired with an accessible seat in an accessible row |

#### Session (amended)

| Field | Type | Notes |
|---|---|---|
| `base_price` | DecimalField | Full-price ticket value for this session; required |
| `audio_format` | CharField (enum, optional) | `original` \| `legendado` \| `dublado`; blank means unspecified |
| `projection_format` | CharField (enum, optional) | `2d` \| `3d` \| `imax`; blank means unspecified |
| `session_type` | CharField (enum, optional) | `regular` \| `preview` \| `special_event`; blank means unspecified |

#### Ticket (amended)

| Field | Type | Notes |
|---|---|---|
| `ticket_type` | CharField (enum) | `inteira` \| `meia`; required at checkout |
| `amount_paid` | DecimalField | Actual amount charged (after ticket-type discount) |
| `payment_method` | CharField (enum) | `cartao_credito` \| `pix`; stored at ticket level |

#### SiteConfig (new)

| Field | Type | Notes |
|---|---|---|
| `key` | CharField (unique) | Configuration key; e.g., `tmdb_api_read_token` |
| `value` | TextField | Configuration value; blank allowed |
| `updated_at` | DateTimeField | Auto-updated |

Key-value store for runtime configuration that must be editable by Master Admin without a server restart. Currently used exclusively for `tmdb_api_read_token`.

#### AdminPermissionLog (new)

| Field | Type | Notes |
|---|---|---|
| `id` | AutoField | Primary key |
| `target_user` | FK → User | The user whose role changed; SET_NULL on delete |
| `actor_user` | FK → User | The master who performed the action; SET_NULL on delete |
| `action` | CharField (enum) | `granted` \| `revoked` |
| `role` | CharField (enum) | `staff` \| `master` |
| `created_at` | DateTimeField | Auto-set at creation |

### 8.3 Key Integrity Rules

- Unique movie constraint: `(title, release_date)`
- Room capacity and movie duration check constraints
- No overlapping sessions in the same room (DB exclusion constraint + model validation)
- Unique seat coordinates (`row`, `number`) and unique seat per session
- `SessionSeat` validation across status/lock fields
- `Ticket` only for a purchased seat (`OneToOne` with `SessionSeat`)
- `amount_paid` must equal `base_price` (if `inteira`) or `base_price × 0.5` (if `meia`), validated in `CheckoutService`
- `MovieReview.rating` must be in `[0.5, 5.0]`; one review per `(movie, user)` pair
- `MovieReviewVote`: one vote per `(review, user)` pair; user may not vote on their own review
- `MovieInterest`: one interest record per `(movie, user)` pair
- `RoomTypePricing.experience_type` is unique; at least one pricing record should exist per experience type
- `SeatRow.is_accessible_row` allows at most one `True` value per room (enforced by DB unique constraint)
- Room layout changes (seat row/seat additions) are blocked while future sessions exist for that room
- A companion seat in an accessible pair is linked via `Seat.companion_seat` and is non-accessible

---

## 9. API Contract and Error Standard

### 9.1 API Endpoints

Support and documentation:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health/` | Health check for database, Redis, and Celery connectivity |
| `GET` | `/api/schema/` | OpenAPI schema |
| `GET` | `/api/docs/` | Swagger UI |

Authentication and user endpoints:

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/auth/register/` | Register a user | Public |
| `POST` | `/api/v1/auth/login/` | Authenticate and issue access and refresh tokens | Public |
| `POST` | `/api/v1/auth/token/refresh/` | Refresh an access token from a valid refresh token | Public |
| `GET`, `DELETE` | `/api/v1/users/me/` | Return or delete current authenticated user profile | Auth |
| `GET` | `/api/v1/users/me/tickets/` | Return authenticated user's tickets | Auth |
| `GET` | `/api/v1/users/` | List all users with optional role filter (`master`, `staff`, `user`) | Master |
| `DELETE` | `/api/v1/users/{user_id}/` | Delete a user account | Master |
| `POST`, `DELETE` | `/api/v1/users/{user_id}/admin/` | Grant (`POST`) or revoke (`DELETE`) staff/master role | Master |
| `GET` | `/api/v1/users/{user_id}/admin/logs/` | Retrieve permission audit log for a user | Master |
| `GET`, `PUT` | `/api/v1/users/config/tmdb-token/` | Read TMDB token status or set a new token value | Master |
| `GET` | `/api/v1/internal/tmdb-token/` | Server-to-server endpoint — Next.js proxy retrieves the stored TMDB token | Internal (`X-Internal-Key` header) |

Catalog endpoints:

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET`, `POST` | `/api/v1/catalog/genres/` | List or create genres | Read: Public; Write: Admin |
| `GET`, `PUT`, `PATCH`, `DELETE` | `/api/v1/catalog/genres/{genre_id}/` | Retrieve, update, or delete a genre | Read: Public; Write: Admin |
| `GET`, `POST` | `/api/v1/catalog/movies/` | List or create movies | Read: Public; Write: Admin |
| `GET`, `PUT`, `PATCH`, `DELETE` | `/api/v1/catalog/movies/{movie_id}/` | Retrieve, update, or delete a movie | Read: Public; Write: Admin |
| `GET` | `/api/v1/catalog/movies/{movie_id}/interest/` | Get interest count and current user's status | Public (count); Auth (user_interested) |
| `POST`, `DELETE` | `/api/v1/catalog/movies/{movie_id}/interest/` | Register or remove interest | Auth |
| `GET`, `POST` | `/api/v1/catalog/movies/{movie_id}/reviews/` | List or submit reviews | Read: Public; Write: Auth |
| `GET`, `PATCH`, `DELETE` | `/api/v1/catalog/movies/{movie_id}/reviews/{review_id}/` | Retrieve, update, or delete a review | Read: Public; Write: Owner |
| `POST`, `DELETE` | `/api/v1/catalog/movies/{movie_id}/reviews/{review_id}/vote/` | Cast or remove a helpfulness vote | Auth |
| `GET`, `POST` | `/api/v1/catalog/rooms/` | List or create rooms | Read: Public; Write: Admin |
| `GET`, `PUT`, `PATCH`, `DELETE` | `/api/v1/catalog/rooms/{room_id}/` | Retrieve, update, or delete a room | Read: Public; Write: Admin |
| `GET` | `/api/v1/catalog/room-type-pricing/` | List all room-type pricing entries | Admin |
| `GET`, `PATCH` | `/api/v1/catalog/room-type-pricing/{id}/` | Retrieve or update a pricing entry | Admin |
| `GET`, `POST` | `/api/v1/catalog/sessions/` | List or create sessions | Read: Public; Write: Admin |
| `GET`, `PUT`, `PATCH`, `DELETE` | `/api/v1/catalog/sessions/{session_id}/` | Retrieve, update, or delete a session | Read: Public; Write: Admin |

Reservation endpoints:

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET`, `POST` | `/api/v1/reservation/seat-rows/` | List or create seat rows | Read: Auth; Write: Admin |
| `GET`, `PUT`, `PATCH`, `DELETE` | `/api/v1/reservation/seat-rows/{seat_row_id}/` | Retrieve, update, or delete a seat row | Read: Auth; Write: Admin |
| `GET`, `POST` | `/api/v1/reservation/seats/` | List or create seats | Read: Auth; Write: Admin |
| `GET`, `PUT`, `PATCH`, `DELETE` | `/api/v1/reservation/seats/{seat_id}/` | Retrieve, update, or delete a seat | Read: Auth; Write: Admin |
| `GET`, `POST` | `/api/v1/reservation/session-seats/` | List or create session seats | Read: Auth; Write: Admin |
| `GET`, `DELETE` | `/api/v1/reservation/session-seats/{session_seat_id}/` | Retrieve or delete a session seat | Read: Auth; Write: Admin |
| `GET`, `POST` | `/api/v1/reservation/tickets/` | List or create tickets | Auth |
| `GET`, `DELETE` | `/api/v1/reservation/tickets/{ticket_id}/` | Retrieve or delete a ticket | Auth |
| `GET` | `/api/v1/reservation/sessions/{session_id}/seats/` | Return the seat map for a session | Public |
| `POST`, `DELETE` | `/api/v1/reservation/sessions/{session_id}/reservations/` | Create or release temporary reservations | Auth |
| `POST` | `/api/v1/reservation/checkout/` | Finalize checkout for temporarily reserved seats | Auth |
| `POST` | `/api/v1/reservation/bulk-create-layout/` | Bulk create seat rows and seats for a room | Admin |
| `POST` | `/api/v1/reservation/accessible-row/` | Create an accessible-priority row with companion seat pairs | Admin |

Authentication routes and user-profile routes are intentionally split. Duplicated
wrong-prefix aliases such as `/api/v1/users/login/` and `/api/v1/auth/me/`
return `404` and are not documented in OpenAPI.

### 9.1.1 Room, Seat, and Session Consistency Rules

- `Room.capacity` is a declarative maximum for the room layout. The registered
  `Seat` count for a room cannot exceed `capacity`, and `capacity` cannot be
  reduced below the number of registered seats.
- Creating a `Session` through the API generates one `SessionSeat` for each
  registered seat in the room at creation time.
- Room seat layout changes are blocked while future sessions exist for that
  room. This prevents future session seat maps from becoming silently incomplete
  after sessions have been published.
- Existing sessions cannot change `movie`, `room`, `start_time`, `end_time`, or
  `base_price` after any seat in the session is reserved or purchased.

### 9.2 Catalog Query Parameters (amended)

`GET /api/v1/catalog/movies/` shall support:

| Parameter | Type | Description |
|---|---|---|
| `status` | string | Filter by `em_cartaz`, `pre_venda`, or `em_breve` |
| `is_featured` | boolean | Filter featured movies for the home banner |

`GET /api/v1/catalog/movies/` shall also support:

| Parameter | Type | Description |
|---|---|---|
| `age_rating` | string | Filter by rating: `L`, `10`, `12`, `14`, `16`, or `18` |

`GET /api/v1/catalog/movies/{movie_id}/reviews/` shall support:

| Parameter | Type | Description |
|---|---|---|
| `page` | integer | Pagination page number |
| `rating` | integer | Filter reviews by exact rating value |

`GET /api/v1/catalog/sessions/` shall support:

| Parameter | Type | Description |
|---|---|---|
| `movie` | UUID | Filter sessions by movie |
| `date` | date | Filter sessions by local start date (`YYYY-MM-DD`) |
| `start_from` | datetime | Filter sessions starting at or after an ISO 8601 timestamp |
| `start_to` | datetime | Filter sessions starting at or before an ISO 8601 timestamp |
| `experience_type` | string | Filter by room `standard`, `vip`, `premium`, or `imax` |

### 9.3 Localization Contract

Supported locales are `pt-BR` and `en-US`. The documented fallback locale is
`pt-BR`. Clients may request localized catalog payloads with `Accept-Language`
or the optional `locale` query parameter; `locale` takes precedence when both
are provided.

Catalog write payloads remain backward compatible: canonical fields such as
`title`, `synopsis`, `name`, `display_name`, and `description` are still
accepted and returned. Admin clients may also send a `translations` object:

```json
{
  "translations": {
    "en-US": {
      "title": "Localized movie title",
      "synopsis": "Localized synopsis"
    }
  }
}
```

Supported translation fields:

| Resource | Fields |
|---|---|
| Genre | `name` |
| Movie | `title`, `synopsis` |
| Room | `display_name`, `description` |

Read responses include `locale`, `available_locales`, and `translations`.
Localized fields fall back field-by-field to `pt-BR` canonical values when a
translation is missing or blank. Checkout responses, user ticket payloads, and
ticket confirmation emails use the selected locale when available and otherwise
fall back to `pt-BR`.

Frontend error handling must map backend `error.code` values to localized copy.
Raw backend `error.message` values are preserved for diagnostics but must not be
displayed directly to users.
| `audio_format` | string | Filter by `original`, `legendado`, or `dublado` |
| `projection_format` | string | Filter by `2d`, `3d`, or `imax` |
| `session_type` | string | Filter by `regular`, `preview`, or `special_event` |

### 9.4 Catalog Payload Examples (amended)

Create room:

```json
{
  "name": "Room VIP 1",
  "capacity": 48,
  "experience_type": "vip",
  "display_name": "Sala VIP Prime",
  "description": "Sala com poltronas reclinaveis e atendimento dedicado."
}
```

Create session:

```json
{
  "movie": "7a98bfc0-a535-4a73-b78d-3f11d5cbecb5",
  "room": "1354ffba-427d-4f8a-aae5-90c54a6c1a2d",
  "start_time": "2026-04-01T18:00:00Z",
  "end_time": "2026-04-01T20:30:00Z",
  "base_price": "54.00",
  "audio_format": "legendado",
  "projection_format": "3d",
  "session_type": "preview"
}
```

Read session response excerpt:

```json
{
  "id": "f7dd338a-8c0e-4cb3-924d-d2d7d3ce90de",
  "room": {
    "id": "1354ffba-427d-4f8a-aae5-90c54a6c1a2d",
    "name": "Room VIP 1",
    "capacity": 48,
    "experience_type": "vip",
    "display_name": "Sala VIP Prime",
    "description": "Sala com poltronas reclinaveis e atendimento dedicado."
  },
  "base_price": "54.00",
  "audio_format": "legendado",
  "projection_format": "3d",
  "session_type": "preview"
}
```

### 9.5 Checkout Payload (amended)

```json
{
  "seats": [
    {
      "session_seat_id": 42,
      "ticket_type": "inteira"
    },
    {
      "session_seat_id": 43,
      "ticket_type": "meia"
    }
  ],
  "payment_method": "pix"
}
```

The backend shall:
1. Verify all `session_seat_id` values are in `RESERVED` status and belong to the requesting user.
2. Compute expected total from each seat's session `base_price` and submitted `ticket_type`.
3. Persist `ticket_type`, `amount_paid`, and `payment_method` on each generated `Ticket` record.
4. Mark each `SessionSeat` as `PURCHASED` and release the Redis lock within a single DB transaction.

### 9.6 Standardized Error Payload

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "status": 400,
    "details": {}
  }
}
```

Error codes in active use:

| Code | HTTP Status | Trigger |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Request payload invalid |
| `INVALID_CREDENTIALS` | 401 | Wrong email/password |
| `NOT_AUTHENTICATED` | 401 | Missing or expired JWT |
| `PERMISSION_DENIED` | 403 | Insufficient permissions |
| `RESOURCE_NOT_FOUND` | 404 | Entity does not exist |
| `SEAT_ALREADY_RESERVED` | 409 | Concurrent reservation conflict |
| `INVALID_TICKET_TYPE` | 400 | Unrecognized `ticket_type` value |
| `INVALID_PAYMENT_METHOD` | 400 | Unrecognized `payment_method` value |
| `THROTTLED` | 429 | Rate limit exceeded |
| `INTERNAL_SERVER_ERROR` | 500 | Unhandled server error |
| `REVIEW_ALREADY_EXISTS` | 409 | User already submitted a review for this movie |
| `CANNOT_VOTE_OWN_REVIEW` | 403 | User attempts to vote on their own review |
| `LAST_MASTER_ADMIN` | 400 | Attempt to demote or delete the last master admin |
| `USER_HAS_ACTIVE_TICKETS` | 409 | Attempt to delete a user who owns tickets without force flag |
| `ROOM_LAYOUT_LOCKED` | 409 | Attempt to modify a room layout while future sessions exist |

---

## 10. Frontend Component Specification

### 10.1 Page Inventory

**Public / User pages:**

| Page | Route | Auth Required |
|---|---|---|
| Home | `/` | No |
| Movie Detail | `/movies/{movieId}` | No |
| Seat Selection | `/sessions/{sessionId}/seats` | Partial (map public; reservation requires auth) |
| Ticket Type Selection | `/ticket-types` | Yes |
| Checkout | `/checkout` | Yes |
| Order Confirmation | `/confirmation` | Yes |
| My Tickets | `/my-tickets` | Yes |
| Login | `/login` | No |
| Register | `/register` | No |

**Admin pages (Staff and Master):**

| Page | Route | Role Required |
|---|---|---|
| Admin Dashboard | `/admin/` | Staff |
| Genre Management | `/admin/genres/` | Staff |
| Movie List | `/admin/movies/` | Staff |
| Create Movie | `/admin/movies/new/` | Staff |
| Edit Movie | `/admin/movies/{id}/edit/` | Staff |
| Room List | `/admin/rooms/` | Staff |
| Create Room | `/admin/rooms/new/` | Staff |
| Edit Room | `/admin/rooms/{roomId}/edit/` | Staff |
| Room Layout Editor | `/admin/rooms/{roomId}/layout/` | Staff |
| Session List | `/admin/sessions/` | Staff |
| Create Session | `/admin/sessions/new/` | Staff |
| Edit Session | `/admin/sessions/{id}/edit/` | Staff |
| Pricing Management | `/admin/pricing/` | Staff |
| User Management | `/admin/users/` | Master |

### 10.2 Shared UI Components

- **Navigation bar (`AppHeader`):** logo, primary nav links, language switcher, and authenticated-user menu (Meus Ingressos, Sair); shows admin link for staff/master users.
- **Language switcher (`LanguageSwitcher`):** toggles between `pt-BR` and `en-US`; persists selection in `cineprime_locale` cookie.
- **Movie card (`MovieCard`):** poster image, title, genre tags, and duration. Age rating badge shown when `age_rating` is present.
- **Session badges (`SessionBadges`):** compact labels derived from room/session metadata (`VIP`, `Premium`, `IMAX`, `2D`, `3D`, `Legendado`, `Dublado`, `Pré-estreia`) on session cards and checkout.
- **Countdown timer:** real-time display of remaining reservation window; triggers expiry warning at 60 s remaining.
- **Order summary panel (`OrderSummaryPanel`):** persistent sidebar or bottom sheet visible during seat selection, ticket-type, and checkout steps displaying selected seats, types, and running total.
- **Error toast / alert:** maps API `error.code` to user-friendly Portuguese message.
- **Star rating (`StarRating`):** interactive half-star rating input (0.5–5.0) for review submission; read-only display mode for review lists.
- **Admin shell (`AdminShell`):** shared layout wrapper for all admin pages with sidebar navigation.
- **Admin table (`AdminTable`):** reusable sortable/paginated table component for admin list views.
- **Admin toolbar (`AdminToolbar`):** search/filter bar shared across admin list pages.
- **Checkout step indicator (`CheckoutStepIndicator`):** progress indicator showing Session → Seats → Ticket Types → Checkout → Confirmation.
- **Purchase flow guard (`PurchaseFlowGuard`):** redirects users who navigate to mid-flow pages (`/ticket-types`, `/checkout`) without active reservations.

### 10.3 Seat Map Rendering

The seat map is a grid derived from the `SessionSeat` list returned by `GET /api/v1/reservation/sessions/{session_id}/seats/`. Rendering rules:

- Rows are labeled alphabetically (A, B, C…) on both sides of the grid.
- Seats within a row are numbered and rendered as adjacent pairs (sofa/loveseat layout) with a visual gap at the center aisle.
- A blue curved "TELA" banner is rendered above row A.
- "FUNDO DA SALA" label is rendered below the last row.
- Seat states map to CSS classes:

| API Status | Visual State | Color/Style |
|---|---|---|
| `AVAILABLE` | Selectable | White background, dark border |
| `RESERVED` (by current user) | Selected | Brand highlight (e.g., green) |
| `RESERVED` (by another user) | Occupied | Grey, non-interactive |
| `PURCHASED` | Occupied | Grey, non-interactive |
| Accessible seat | Accessible | Standard color + wheelchair icon |

### 10.4 State Management

- Seat selections and reservation state are held in client memory during the reservation flow.
- JWT access token is held in memory and refreshed using the refresh token prior to expiry.
- On countdown expiry, client state is reset and the user is redirected to the session list with an explanatory message.

---

## 11. Security and Access Control

- JWT Bearer authentication is the default API auth mechanism.
- Catalog read and health endpoints are public.
- Catalog mutation operations require admin (`is_staff`) permissions.
- Reservation admin resources (seat row/seat/session-seat CRUD, bulk layout, accessible row) require admin permissions; user-facing reservation, checkout, current-user, and my-ticket endpoints require authentication.
- Movie review submission requires authentication; review read is public. Users may only edit or delete their own review. Votes require authentication and are forbidden on the author's own review.
- Movie interest read is public; interest create/delete requires authentication.
- Room type pricing endpoints require admin permissions.
- User management endpoints (list, delete, role grant/revoke, audit log) require master (`is_superuser`) permissions.
- Login and reservation endpoints have dedicated throttle scopes.
- The checkout service validates computed totals server-side; the frontend-submitted total is never blindly trusted.
- Frontend routes requiring authentication redirect unauthenticated users to `/login`, preserving the originally requested path for post-login redirect.
- Admin frontend routes (`/admin/*`) are guarded by `AdminRoute` (requires `is_staff`); the user management page (`/admin/users/`) is additionally guarded by `MasterRoute` (requires `is_superuser`).
- TMDB API credentials are never exposed to the browser. The Next.js proxy resolves the token server-side via `TMDB_API_READ_TOKEN` (env var, priority) or via the internal backend endpoint `GET /api/v1/internal/tmdb-token/` (requires `INTERNAL_API_KEY`). The internal endpoint is protected by a shared `X-Internal-Key` header and is not part of the public API surface.

---

## 12. Operational Requirements

### 12.1 Deployment / Runtime

- Docker Compose stack includes: `web`, `db`, `redis`, `celery`, and optionally `frontend` services.
- Environment variables control DB connection, Redis, JWT lifetimes, throttling, email, logging behavior, and frontend API base URL.
- The frontend production deployment uses a Next.js-compatible runtime container unless the app is explicitly configured and validated for static export.
- TMDB token resolution uses a two-tier strategy: the `TMDB_API_READ_TOKEN` env var takes priority; if absent, the Next.js server fetches the token from the Django backend using `INTERNAL_API_KEY` as the shared secret. The `BACKEND_INTERNAL_URL` env var allows the proxy to reach Django via a Docker-internal hostname (e.g., `http://backend:8000`), falling back to `NEXT_PUBLIC_API_BASE_URL`.
- `INTERNAL_API_KEY` must match between the Django backend (`settings.INTERNAL_API_KEY`) and the Next.js server. It must be treated as a secret and never set in `NEXT_PUBLIC_*` variables.

### 12.2 CI Requirements

GitHub Actions pipeline validates:
- Backend: dependency installation via Poetry, Django system check, migrations, test suite execution
- Frontend: dependency installation, linting, unit/integration tests, Playwright E2E tests, and production build
- Docker Compose configuration validation
- Docker image build (both backend and frontend images)

---

## 13. Requirements Traceability Matrix

| Requirement | Implementation Artifact |
|---|---|
| FR-01 | `users.views.UserRegistrationView`, `users.serializers.UserRegistrationSerializer` |
| FR-02 | `users.views.UserLoginView`, `users.serializers.UserLoginSerializer` |
| FR-03 | `users.views.CurrentUserView` |
| FR-04 | `catalog.views.*`, `catalog.urls` |
| FR-04a | `catalog.models.Movie` (`status`, `is_featured`), `catalog.serializers.MovieSerializer`, `catalog.views.MovieListView` |
| FR-05 | `reservations.views.SessionSeatMapView` |
| FR-06 | `reservations.views.TemporarySeatReservationView`, `reservations.services.TemporaryReservationService` |
| FR-07 | `reservations.tasks.release_expired_session_seat`, `reservations.services.ExpiredSeatReleaseService` |
| FR-08 | `reservations.views.CheckoutView`, `reservations.services.CheckoutService`, `reservations.models.Ticket` |
| FR-08a | `catalog.models.Session` (`base_price`), `reservations.services.CheckoutService` (pricing logic) |
| FR-08b | `catalog.models.Room` (experience/display/description), `catalog.models.Session` (audio/projection/session_type) |
| FR-09 | `users.views.MyTicketsView` |
| FR-10 | `cineprime_api.urls` (`/api/schema/`, `/api/docs/`) |
| FR-11 | `cineprime_api.health.HealthCheckService`, `/health/` |
| FR-12 | `catalog.models.Movie` (`age_rating`, `spotlight_url`, `director`, `classification_description`), `catalog.models.CastMember` |
| FR-13 | `catalog.models.MovieReview`, `catalog.models.MovieReviewVote`, `catalog.views.MovieReviewListCreateView`, `catalog.views.MovieReviewDetailView`, `catalog.views.MovieReviewVoteView` |
| FR-14 | `catalog.models.MovieInterest`, `catalog.views.MovieInterestView` |
| FR-15 | `catalog.models.RoomTypePricing`, `catalog.views.RoomTypePricingListView`, `catalog.views.RoomTypePricingDetailView`, `catalog.models.Room.save()` (auto-price derivation) |
| FR-16 | `reservations.views.BulkLayoutView`, `reservations.serializers.BulkLayoutRequestSerializer` |
| FR-17 | `reservations.views.AccessibleRowView`, `reservations.models.SeatRow` (`is_accessible_row`), `reservations.models.Seat` (`is_accessible`, `companion_seat`) |
| FR-18 | `users.views.AdminGrantView`, `users.views.AdminRevokeView`, `users.models.User` (`is_staff`, `is_superuser`, `is_protected_master`) |
| FR-19 | `users.views.UserListView`, `users.views.UserDeleteView` |
| FR-20 | `users.models.AdminPermissionLog`, `users.views.UserPermissionLogsView` |
| FE-01 | `src/app/page.tsx`, `src/components/movies/FeaturedMovieBanner.tsx`, `src/components/movies/MovieGrid.tsx`, `src/app/HomeCatalog.tsx`, `src/components/movies/TabbedMovieCatalog.tsx`, `src/components/movies/HomeSchedule.tsx` |
| FE-02 | `src/app/movies/[movieId]/page.tsx`, `src/components/movies/MovieDetail.tsx`, `src/components/movies/session-selection.ts` |
| FE-03 | `src/app/sessions/[sessionId]/seats/page.tsx`, `src/components/seats/SeatMap.tsx`, `src/components/seats/SeatSelectionActions.tsx`, `src/hooks/useReservationCountdown.ts` |
| FE-04 | `src/app/ticket-types/page.tsx`, `src/components/reservations/TicketTypeSelection.tsx`, `src/components/reservations/OrderSummaryPanel.tsx` |
| FE-05 | `src/app/checkout/page.tsx`, `src/components/reservations/CheckoutReview.tsx`, `src/api/checkout.ts` |
| FE-06 | `src/app/confirmation/page.tsx`, `src/components/reservations/CheckoutConfirmation.tsx`, `src/app/my-tickets/page.tsx`, `src/components/tickets/TicketCard.tsx`, `src/components/tickets/MyTicketsClient.tsx` |
| FE-07 | `src/app/login/page.tsx`, `src/app/register/page.tsx`, `src/api/auth.ts`, `src/contexts/AuthContext.tsx`, `src/contexts/auth-state.ts`, `src/contexts/auth-persistence.ts` |
| FE-08 | `src/app/admin/*`, `src/components/admin/*`, `src/components/auth/AdminRoute.tsx`, `src/components/auth/MasterRoute.tsx`, `src/api/admin.ts` |
| FE-09 | `src/app/api/tmdb/get-token.ts`, `src/app/api/tmdb/movie/[id]/route.ts`, `src/app/api/tmdb/search/route.ts`, `src/components/admin/AdminMovieForm.tsx` (TMDB import flow), `adminApi.getTmdbTokenStatus()`, `adminApi.setTmdbToken()`, backend: `users.views.TmdbTokenView` (`/api/v1/users/config/tmdb-token/`), `cineprime_api.views.internal_tmdb_token` (`/api/v1/internal/tmdb-token/`), `users.models.SiteConfig` |
| FE-10 | `src/api/reviews.ts`, `src/components/movies/MovieReviews.tsx`, `src/components/movies/StarRating.tsx`, `src/components/admin/AdminMovieReviewList.tsx` |
| FE-11 | `src/api/interest.ts`, `src/components/movies/MovieDetail.tsx` (interest button) |
| FE-12 | `src/components/layout/LanguageSwitcher.tsx`, `src/i18n/` |

---

## 14. Out of Scope

Not implemented in this project scope:
- Real payment gateway processing (Stripe, PagSeguro, Mercado Pago, etc.)
- Native mobile applications (iOS / Android)
- Club CinePrime membership management, cashback, or real coupon/discount validation beyond the voucher input field
- Concession / bomboniére ordering
- Real QR code validation at the physical entrance
- Movie trailer URL (`trailer_url` field is not exposed by the backend or frontend)
- Review moderation tools (admin review deletion/flagging interface beyond what's handled via Django admin)
- Multi-tenant or franchise cinema chain support
