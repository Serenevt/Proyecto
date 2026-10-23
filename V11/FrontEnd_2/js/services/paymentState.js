export function paymentState(transaction = {}) {
  const status = transaction.status;
  const payment = transaction.payment?.status;
  if (Number(transaction.debt?.amountPending || transaction.pendingBalance || 0) > 0 ||
      ['PAYMENT_PENDING', 'PENDING', 'PARTIAL'].includes(status) || ['PENDING', 'PARTIAL'].includes(payment)) {
    return { paid: false, label: payment === 'PARTIAL' || status === 'PARTIAL' ? 'Saldo pendiente' : 'Pago pendiente' };
  }
  const paid = (status === 'PAID' || status === 'CAPTURED' || (!status && payment === 'CAPTURED')) &&
    (!payment || payment === 'CAPTURED');
  return { paid, label: paid ? 'Pagado' : 'Pago por verificar' };
}
