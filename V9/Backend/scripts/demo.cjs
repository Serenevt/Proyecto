// Explicit smoke test: creates one S/100 purchase in the local demo membership.
const { randomUUID } = require('node:crypto');
const { existsSync } = require('node:fs');
if (existsSync('.env')) process.loadEnvFile('.env');
const base =
  process.env.API_URL || `http://localhost:${process.env.PORT || 3000}`;
async function api(route, options = {}) {
  const response = await fetch(`${base}/api/v1/${route}`, options);
  const body = await response.json();
  if (!response.ok) throw new Error(`${route}: HTTP ${response.status}`);
  return body;
}
async function main() {
  const login = await api('auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'demo@primaxprime.pe',
      password: process.env.DEMO_PASSWORD,
    }),
  });
  const fuels = await api('fuels');
  const stations = await api('stations');
  const result = await api('transactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-kiosk-key': process.env.KIOSK_API_KEY,
    },
    body: JSON.stringify({
      operationId: process.env.DEMO_OPERATION_ID || randomUUID(),
      plate: 'ABC-123',
      amount: '100.00',
      fuelId: fuels.find((f) => f.code === 'PREMIUM').id,
      stationId: stations.find((s) => s.code === 'PRIMAX-SUR').id,
      mode: 'PREPAGO',
      paymentMethod: 'TARJETA',
    }),
  });
  const history = await api('memberships/me/transactions', {
    headers: { Authorization: `Bearer ${login.accessToken}` },
  });
  if (!history.some((t) => t.id === result.transaction.id))
    throw new Error('Purchase missing from history');
  if (
    result.pointsEarned !==
    Math.floor(100 * Number(process.env.POINTS_PER_SOL || 1))
  )
    throw new Error('Unexpected points');
  const docs = await fetch(`${base}/api/docs`);
  if (!docs.ok) throw new Error('Swagger unavailable');
  console.log(
    JSON.stringify(
      {
        login: login.user.name,
        membership: result.transaction.membership.number,
        plate: result.transaction.vehicle.plate,
        transactionId: result.transaction.id,
        operationId: result.transaction.operationId,
        amount: result.transaction.amount,
        pointsEarned: result.pointsEarned,
        historyContainsPurchase: true,
        swagger: docs.status,
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
