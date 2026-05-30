# Prisma Schema Review

Audit of `packages/db/prisma/schema.prisma` — findings only, no destructive
changes proposed for direct application. Each finding includes severity and
the migration that would address it.

## Strengths

- Composite indexes on `Post` cover the dominant query patterns: feed by
  area+status, author moderation history, and chronological by status.
- All foreign keys have explicit relations with declared `onDelete`
  behavior (mostly `Cascade` for user-scoped data, which matches the
  privacy-first posture — deleting a user wipes their personal artifacts).
- Hard-rule comments at the top of the file are durable guardrails:
  no demographic fields, area-level posts only, anonymized personal
  safety artifacts. These prevent class of schema-creep mistakes that
  would otherwise need code review to catch.

## Findings

### 1. Missing index on `Area.parentSlug` — **medium**

Every city-page query filters areas by `parentSlug` (e.g.
`Area.where(parentSlug: "san-diego")`). Without an index the query does a
sequential scan. As the area table grows (5,000+ neighborhoods at full
37-city rollout), this gets visible in p95 latency.

**Migration:** add `@@index([parentSlug])` to the `Area` model.

### 2. Reverse-direction indexes on social safety relations — **medium**

`UserBlock` and `UserMute` index the `blockerId`/`muterId` direction
(via the unique constraint), but the reverse query — "has this user
been blocked by anyone?" — does a sequential scan. The community feed
should filter posts authored by users who have blocked the viewer, so
this query runs on every feed render for authenticated users.

**Migration:** add `@@index([blockedId])` and `@@index([mutedId])`.

### 3. Missing index on `User.trustLevel` — **low**

The new trust system (commit landed this session) introduces queries
like "list TRUSTED contributors in this area". With the index, the
moderator dashboard's "newly trusted users this week" query is point
lookup; without it, a full user table scan.

**Migration:** add `@@index([trustLevel])`.

### 4. `PostComment` lacks `authorId` index — **low**

The "my comments" view filters comments by `authorId`. Currently the
only `PostComment` index is `@@index([postId, status])`. With <1k
comments per user this is fine; at scale it becomes a seq scan.

**Migration:** add `@@index([authorId, createdAt])`.

### 5. No soft-delete pattern, no archival policy — **informational**

Posts that get `REJECTED` stay in the table forever, as do moderator
review actions. Over time this accumulates dead rows that slow
moderator-history queries. Worth deciding:
- Retain forever (good for audit, bad for query speed)
- Soft-delete after 90 days
- Archive to a cold table

This is a product/legal decision, not a pure-engineering one. **No
migration recommended without product input.**

### 6. `Post.reportCount` is denormalized but never indexed — **informational**

`Post.reportCount` is incremented on `PostReport` insert (via service
layer, not DB trigger) and used to surface "flagged for review"
posts to moderators. If the moderator queue sorts by `reportCount
DESC` this should be indexed; if it sorts purely by `createdAt` it
doesn't matter.

**Migration (conditional):** add `@@index([status, reportCount])` if
the moderator queue actually uses this ordering.

### 7. Email uniqueness is case-sensitive — **medium**

`User.email` is `String @unique` — Postgres treats this as
case-sensitive by default. `bob@example.com` and `Bob@example.com`
can both exist. Standard practice is to normalize to lowercase at
insert time (already done in the auth service?) but the schema does
not enforce it. A `@db.Citext` annotation or a generated lowercase
column would harden this.

**Migration:** confirm normalization in the service layer; if it's
not there, either fix the service OR convert the column to citext.

### 8. `PushSubscription.endpoint` storage size — **low**

`endpoint` is `String` (default 1GB Postgres TEXT). FCM/APNs endpoint
URLs are typically <1KB. Not a real problem at CommunitySafe's scale, but
a `@db.VarChar(2048)` would document the expected upper bound and let
the planner make better stats decisions.

## Non-findings (deliberately not flagged)

- **No `@@id([userId, areaId])` on saved-areas** — saved areas are
  client-side (localStorage), not in the DB. Intentional, per the
  privacy posture in CLAUDE.md.
- **No "incident" table** — incidents are pulled from external feeds on
  every request, not stored. Intentional, per the schema's hard-rule
  comment block.
- **No phone-number formatting constraint on TrustedContact.phone** —
  service-layer validation already normalizes via libphonenumber;
  duplicating it at the DB level adds friction without preventing
  the bypass we already prevented.

## Suggested next step

Run findings 1, 2, 3 in a single migration — they're additive,
low-risk, and produce immediate p95 query-time wins on the read paths
most users hit. Findings 4-8 are smaller and can land opportunistically.
