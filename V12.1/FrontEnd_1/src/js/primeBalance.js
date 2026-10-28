/**
 * Rechecks membership data at the backend before retrying a Prime reserve.
 * A failed retry remains a backend rejection; this module never edits balance.
 */
export function createPrimeBalanceRetry({ refreshVehicle, reserve, updateMembership }) {
  let inFlight;
  return function refreshAndReserve({ plate, membershipNumber, amount }) {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const vehicle = await refreshVehicle(plate);
      const membership = vehicle?.membership;
      if (!membership || membership.number !== membershipNumber) {
        throw Error('No pudimos confirmar la membresía asociada a esta placa.');
      }
      if (membership.status !== 'ACTIVE') {
        throw Error('La membresía Primax Prime no está activa.');
      }
      updateMembership(membership);
      return reserve(amount);
    })().finally(() => { inFlight = null; });
    return inFlight;
  };
}

/** Keeps a postpaid amount when it is valid for the prepaid keypad. */
export function prepaidAmountFromPostpaid(amount, minimum = 10, maximum = 500) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < minimum || value > maximum) return null;
  return (Math.round(value * 100) / 100).toFixed(2);
}
