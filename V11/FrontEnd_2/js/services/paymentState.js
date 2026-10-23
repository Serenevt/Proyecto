export function paymentState(transaction = {}) {
  const status = transaction.status;
  const payment = transaction.payment?.status;
  const terminal = { REFUNDED: 'Reembolsado', CANCELLED: 'Cancelado', FAILED: 'Fallido', REJECTED: 'Rechazado', ERROR: 'Error de pago' };
  if (terminal[status] || terminal[payment]) return { paid: false, label: terminal[status] || terminal[payment] };
  if (Number(transaction.debt?.amountPending || transaction.pendingBalance || 0) > 0 ||
      ['PAYMENT_PENDING', 'PENDING', 'PARTIAL'].includes(status) || ['PENDING', 'PARTIAL'].includes(payment)) {
    return { paid: false, label: payment === 'PARTIAL' || status === 'PARTIAL' ? 'Saldo pendiente' : 'Pago pendiente' };
  }
  const paid = (status === 'PAID' || status === 'CAPTURED' || (!status && payment === 'CAPTURED')) &&
    (!payment || payment === 'CAPTURED');
  return { paid, label: paid ? 'Pagado' : 'Pago por verificar' };
}
