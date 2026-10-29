-- Reconcile only the two known V12.1 academic memberships. Existing users,
-- vehicles, balances and financial records keep their original IDs.
UPDATE "Membership"
SET "number" = 'PRIM-001'
WHERE "number" = 'PRIME-0001'
  AND EXISTS (
    SELECT 1 FROM "User" u
    WHERE u."id" = "Membership"."userId"
      AND u."email" = 'prime.staging@primax-v12-1.example'
  );

UPDATE "Membership"
SET "number" = 'PRIM-002'
WHERE "number" = 'PRIM001'
  AND EXISTS (
    SELECT 1 FROM "User" u
    WHERE u."id" = "Membership"."userId"
      AND u."email" = 'mateo.stg@example.com'
  );

UPDATE "MembershipNumberCounter"
SET "value" = GREATEST("value", 2)
WHERE "id" = 1
  AND EXISTS (
    SELECT 1 FROM "Membership" m
    JOIN "User" u ON u."id" = m."userId"
    WHERE u."email" = 'mateo.stg@example.com' AND m."number" = 'PRIM-002'
  );
