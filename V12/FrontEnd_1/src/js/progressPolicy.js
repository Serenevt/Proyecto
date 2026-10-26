export function shouldReportProgress({ amount, previousAmount, lastAt, now, force = false, staging = false }) {
  if (force) return true;
  return amount - previousAmount >= 1 && (!staging || now - lastAt >= 2000);
}
