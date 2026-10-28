import { ConflictException } from '@nestjs/common';
import { InventoryReservation, Prisma } from '@prisma/client';

export type ReservationDb = Prisma.TransactionClient;

export interface ReserveInventoryInput {
  operationId: string;
  stationId: string;
  fuelId: string;
  terminalOperationId: string | null;
  source: 'TERMINAL' | 'LEGACY';
  maxGallons: Prisma.Decimal;
  requestHash: string;
  status: 'ACTIVE' | 'PENDING_PAYMENT';
}

/** Create a safe, idempotent commitment. The SQL function is the only stock writer. */
export async function reserveInventory(
  tx: ReservationDb,
  input: ReserveInventoryInput,
): Promise<InventoryReservation> {
  const existing = await tx.inventoryReservation.findUnique({
    where: { operationId: input.operationId },
  });
  if (existing) {
    if (
      existing.requestHash.trim() !== input.requestHash ||
      existing.stationId !== input.stationId ||
      existing.fuelId !== input.fuelId ||
      existing.terminalOperationId !== input.terminalOperationId ||
      !existing.maxGallons.eq(input.maxGallons)
    )
      throw new ConflictException('operationId ya usado con otros datos');
    if (['CANCELLED', 'CLOSED'].includes(existing.status))
      throw new ConflictException('La reserva ya fue cerrada');
    return existing;
  }

  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT inventory_create_reservation(
      ${input.operationId}::uuid, ${input.stationId}::uuid, ${input.fuelId}::uuid,
      ${input.source}::"InventoryReservationSource", ${input.maxGallons}::numeric,
      ${input.requestHash}::char(64), NULL,
      ${input.terminalOperationId}::uuid, NULL
    ) AS id`;
  const id = rows[0]?.id;
  if (!id) throw new Error('La reserva SQL no devolvió identificador');
  if (input.status === 'PENDING_PAYMENT') {
    await tx.inventoryReservation.update({
      where: { id },
      data: { status: 'PENDING_PAYMENT' },
    });
  }
  return tx.inventoryReservation.findUniqueOrThrow({ where: { id } });
}

export async function activateInventoryReservation(
  tx: ReservationDb,
  reservationId: string,
) {
  await tx.$executeRaw`SELECT inventory_activate_reservation(${reservationId}::uuid)`;
}

export async function reviewInventoryReservation(
  tx: ReservationDb,
  reservationId: string,
  reason: string,
) {
  await tx.$executeRaw`SELECT inventory_mark_reservation_review(${reservationId}::uuid, ${reason})`;
}

export async function releaseInventoryReservation(
  tx: ReservationDb,
  reservation: Pick<InventoryReservation, 'id' | 'remainingLiters' | 'status'>,
  eventKey: string,
  reason: string,
) {
  if (['CANCELLED', 'CLOSED'].includes(reservation.status)) return;
  if (reservation.remainingLiters.lte(0)) return;
  await tx.$executeRaw`SELECT inventory_release_reservation(
    ${reservation.id}::uuid, ${reservation.remainingLiters}::numeric,
    ${eventKey}, NULL, ${reason}
  )`;
}

export async function closeInventoryReservation(
  tx: ReservationDb,
  reservationId: string,
  transactionId: string,
  eventKey: string,
) {
  await tx.$executeRaw`SELECT inventory_close_reservation(
    ${reservationId}::uuid, ${transactionId}::uuid, ${eventKey},
    'Unused commitment released at transaction close'
  )`;
}
