import { Prisma } from '@prisma/client';
export const transactionInclude = {
  vehicle: true,
  fuel: true,
  station: true,
  payment: true,
  membership: {
    select: {
      id: true,
      number: true,
      userId: true,
      user: { select: { name: true } },
    },
  },
} satisfies Prisma.TransactionInclude;
export type TransactionModel = Prisma.TransactionGetPayload<{
  include: typeof transactionInclude;
}>;
export function transactionResponse(value: TransactionModel) {
  const { requestHash: _hash, membership, ...transaction } = value;
  return {
    ...transaction,
    amount: value.amount.toFixed(2),
    membership: membership
      ? {
          id: membership.id,
          number: membership.number,
          name: membership.user.name,
        }
      : null,
  };
}
