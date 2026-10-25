-- Read-only operational queries
SELECT s.name AS station, f.name AS fuel, i.liters FROM "FuelInventory" i JOIN "Station" s ON s.id=i."stationId" JOIN "Fuel" f ON f.id=i."fuelId";
SELECT id, "transactionId", "amountPending", status FROM "MembershipDebt" WHERE "amountPending">0;
SELECT id, status, "providerId", amount FROM "OnlineOrder" WHERE status <> 'CAPTURED';
SELECT count(*) AS unclaimed_welcome FROM "Membership" WHERE "welcomeAvailable";
