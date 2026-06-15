# Social Network Service - Development Plan & TODO

## 🎯 Overview
The Social Service drives community engagement. It handles the pet feed, creating posts with photos/videos, liking, commenting, and managing friend connections.

## 🗄️ Database Schema (Drizzle ORM)
- `posts`: id, user_id, pet_id, content, media_urls (JSON), created_at
- `comments`: id, post_id, user_id, content, created_at
- `likes`: id, post_id, user_id, created_at
- `connections`: user_id, friend_id, status (PENDING, ACCEPTED)

## 🛣️ Endpoints
- `GET    /api/v1/social/feed` : Get customized social feed
- `POST   /api/v1/social/posts` : Create a new post
- `DELETE /api/v1/social/posts/` : id
- `POST   /api/v1/social/posts/` : id/like
- `GET    /api/v1/social/posts/` : id/comments
- `POST   /api/v1/social/posts/` : id/comments
- `POST   /api/v1/social/friends/request` : Send friend request
- `GET    /api/v1/social/friends` : List friends

## 🧪 Test Cases to Write (`social.test.ts`)
[ ] **Test 1:** `POST /posts` with image returns 201 Created.
[ ] **Test 2:** `GET /feed` returns chronologically sorted posts.
[ ] **Test 3:** `POST /posts/:id/like` toggles like status accurately.

## 📋 Task Execution Tracker (TDD Workflow)

### Phase 1: Setup & Database
- [ ] Initialize Bun project (`bun init`)
- [ ] Install dependencies (`elysia`, `drizzle-orm`, `postgres`)
- [ ] Create `drizzle.config.ts` and DB connection logic (`src/db/index.ts`)
- [ ] Write schema definition in `src/db/schema.ts`
- [ ] Generate & apply initial database migration

### Phase 2: Core Logic (TDD)
- [ ] Create `tests/social.test.ts` with failing tests
- [ ] Implement Auth Middleware (Mocked/Shared JWT verifier)
- [ ] Build core endpoints and routes
- [ ] Run `bun test` to ensure core tests pass

### Phase 3: Advanced Features & Refinement
- [ ] Complete remaining endpoint implementations
- [ ] Integrate with internal inter-service HTTP calls if necessary
- [ ] Run `bun test` to ensure all tests pass 100%
