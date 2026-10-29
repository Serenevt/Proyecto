import { Prisma } from '@prisma/client';

export function formatMembershipNumber(value: bigint): string {
  if (value < 1n) throw new Error('Invalid membership ordinal');
  let group = (value - 1n) / 999n;
  let suffix = '';
  while (group > 0n) {
    group -= 1n;
    suffix = String.fromCharCode(65 + Number(group % 26n)) + suffix;
    group /= 26n;
  }
  return `PRIM-${String(((value - 1n) % 999n) + 1n).padStart(3, '0')}${suffix}`;
}

// The counter row is locked until User + Membership commit. Failed registration
// rolls back the counter too. Historical codes are skipped, never rewritten.
export async function nextMembershipNumber(tx: Prisma.TransactionClient) {
  for (;;) {
    const [counter] = await tx.$queryRaw<{ value: bigint }[]>`
      UPDATE "MembershipNumberCounter" SET "value" = "value" + 1
      WHERE "id" = 1 RETURNING "value"
    `;
    if (!counter) throw new Error('Membership counter migration missing');
    const number = formatMembershipNumber(counter.value);
    if (
      !(await tx.membership.findUnique({
        where: { number },
        select: { id: true },
      }))
    )
      return number;
  }
}
