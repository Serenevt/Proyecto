import { Prisma } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

export function debtLimit() {
  const raw = process.env.PRIME_DEBT_LIMIT ?? '200';
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(raw))
    throw new Error('Invalid PRIME_DEBT_LIMIT');
  return new Prisma.Decimal(raw);
}

export async function pendingDebt(
  tx: Prisma.TransactionClient,
  membershipId: string,
) {
  const result = await tx.membershipDebt.aggregate({
    where: { membershipId },
    _sum: { amountPending: true },
  });
  return result._sum.amountPending ?? new Prisma.Decimal(0);
}

/** Call with the membership row locked; open credit reservations count too. */
export async function creditCapacity(
  tx: Prisma.TransactionClient,
  membershipId: string,
) {
  const pending = await pendingDebt(tx, membershipId);
  const reservations = await tx.fuelAuthorization.findMany({
    where: {
      membershipId,
      mode: 'POSTPAGO',
      status: { in: ['RESERVED', 'DISPENSING', 'INTERVENTION_REQUIRED'] },
    },
    select: { authorizedAmount: true, reservedAmount: true },
  });
  const committed = reservations.reduce(
    (sum, row) => sum.plus(row.authorizedAmount.minus(row.reservedAmount)),
    new Prisma.Decimal(0),
  );
  return {
    pending,
    committed,
    remaining: Prisma.Decimal.max(
      0,
      debtLimit().minus(pending).minus(committed),
    ),
  };
}

export function funding(amount: Prisma.Decimal, balance: Prisma.Decimal) {
  const cash = Prisma.Decimal.min(amount, balance);
  return {
    cash,
    pending: amount.minus(cash),
    balanceAfter: balance.minus(cash),
  };
}

/** Recharge is first credited in the wallet; each FIFO allocation is a separate debit. */
export async function settleDebts(
  tx: Prisma.TransactionClient,
  membershipId: string,
  rechargeId: string,
  amount: Prisma.Decimal,
  startingBalance: Prisma.Decimal,
) {
  let remaining = amount;
  let balance = startingBalance;
  const debts = await tx.membershipDebt.findMany({
    where: { membershipId, amountPending: { gt: 0 } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  for (const debt of debts) {
    if (remaining.lte(0)) break;
    const applied = Prisma.Decimal.min(remaining, debt.amountPending);
    const pending = debt.amountPending.minus(applied);
    balance = balance.minus(applied);
    remaining = remaining.minus(applied);
    await tx.membershipDebt.update({
      where: { id: debt.id },
      data: {
        amountPaid: debt.amountPaid.plus(applied),
        amountPending: pending,
        status: pending.isZero() ? 'SETTLED' : 'PARTIAL',
        settledAt: pending.isZero() ? new Date() : null,
      },
    });
    await tx.walletMovement.create({
      data: {
        membershipId,
        debtId: debt.id,
        transactionId: debt.transactionId,
        kind: 'DEBT_SETTLEMENT',
        amount: applied.negated(),
        balanceAfter: balance,
        operationId: `${rechargeId}:${debt.id}`,
        note: 'Liquidación FIFO de saldo pendiente (DEMO)',
      },
    });
    await tx.payment.update({
      where: { transactionId: debt.transactionId },
      data: { status: pending.isZero() ? 'CAPTURED' : 'PARTIAL' },
    });
    if (pending.isZero())
      await tx.transaction.update({
        where: { id: debt.transactionId },
        data: { status: 'PAID' },
      });
  }
  if (balance.lt(0)) throw new BadRequestException('Saldo inválido');
  return { balance, applied: amount.minus(remaining) };
}
