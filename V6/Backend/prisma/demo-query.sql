-- Optional read-only query for DBeaver or psql. No application dependency.
SELECT
  t.id AS transaction_id,
  v.plate,
  t.amount,
  t."pointsEarned" AS points_earned,
  f.name AS fuel,
  s.name AS station,
  u.name AS member,
  m.number AS membership,
  r.points AS ledger_points
FROM "Transaction" t
JOIN "Vehicle" v ON v.id = t."vehicleId"
JOIN "Fuel" f ON f.id = t."fuelId"
JOIN "Station" s ON s.id = t."stationId"
LEFT JOIN "Membership" m ON m.id = t."membershipId"
LEFT JOIN "User" u ON u.id = m."userId"
LEFT JOIN "RewardMovement" r ON r."transactionId" = t.id
ORDER BY t."createdAt" DESC;
