require('./database-safety.cjs').assertLocalDatabase();
// Only initializes an unused V9 demo account; never resets balances or deletes data.
const { PrismaClient, Prisma } = require('@prisma/client');
const db = new PrismaClient();
async function main() {
  await db.$transaction(
    async (tx) => {
      const member = await tx.membership.findUniqueOrThrow({
        where: { number: 'PRIME-0001' },
        include: { user: true },
      });
      if (member.user.email !== 'demo@primaxprime.pe')
        throw Error('Not the demo account');
      const used = await tx.transaction.count({
        where: { membershipId: member.id },
      });
      const movement = await tx.walletMovement.findFirst({
        where: { membershipId: member.id },
      });
      if (used || movement || !member.balance.isZero()) {
        console.log(
          'Demo already initialized/in use. No changes. Use isolated E2E for a reproducible run.',
        );
        return;
      }
      const balance = new Prisma.Decimal('5.00');
      await tx.membership.update({
        where: { id: member.id },
        data: {
          balance,
          dni: member.dni ?? '12345678',
          ruc: member.ruc ?? '20123456789',
          businessName: member.businessName ?? 'Transportes Demo Ficticios SAC',
        },
      });
      await tx.walletMovement.create({
        data: {
          membershipId: member.id,
          kind: 'RECHARGE',
          amount: balance,
          balanceAfter: balance,
          operationId: 'v9-demo-initial-credit',
          note: 'Saldo inicial ficticio V9, sin dinero real',
        },
      });
      console.log('Demo ready: Diego / PRIME-0001 / ABC-123 / S/ 5.00');
    },
    { isolationLevel: 'Serializable' },
  );
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
