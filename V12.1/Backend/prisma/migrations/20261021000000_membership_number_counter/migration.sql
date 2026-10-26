-- Transactional allocator; existing Membership rows and their UNIQUE index stay intact.
CREATE TABLE "MembershipNumberCounter" (
  "id" INTEGER NOT NULL PRIMARY KEY CHECK ("id" = 1),
  "value" BIGINT NOT NULL DEFAULT 0 CHECK ("value" >= 0)
);
INSERT INTO "MembershipNumberCounter" ("id", "value") VALUES (1, 0);
