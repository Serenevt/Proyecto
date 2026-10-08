(function (F) {
  'use strict';
  F.receiptService = {
    async build(tx) {
      if (!tx) throw new Error('TRANSACTION_NOT_FOUND');
      const t = F.t;
      const doc = tx.tipoComprobante === 'FACTURA';
      const customer = tx.cliente || {};
      const rows = [
        [t('c_fecha'), new Date(tx.createdAt).toLocaleString(F.config.LOCALE_IDIOMA[F.state.idioma])],
        [t('c_doc'), t(doc ? 'doc_factura_full' : 'doc_boleta_full')],
        [t('c_docnum'), doc ? `RUC ${customer.ruc || '—'} · ${customer.razonSocial || '—'}` : `DNI ${customer.dni || '—'}`],
        [t('c_placa'), tx.placa + (tx.esMiembro ? ` (${tx.codigoCliente})` : '')],
        [t('c_combustible'), tx.combustible], [t('c_litros'), `${tx.litros.toFixed(2)} L`],
        [t('c_precio'), `S/ ${tx.precio.toFixed(2)}`], [t('c_subtotal'), `S/ ${tx.subtotal.toFixed(2)}`],
        [t('c_descuento'), `S/ ${tx.descuento.toFixed(2)}`], [t('c_total'), `S/ ${tx.monto.toFixed(2)}`],
        [t('c_modalidad'), t(tx.modalidad === 'PREPAGO' ? 'prepago' : 'postpago')],
        [t('c_metodo'), tx.pago?.metodo || '—'], [t('c_estado'), t(tx.estado === 'Pagado' ? 'c_pagado' : 'c_pendiente')],
      ];
      return { id: tx.id, text: [t('c_titulo'), t('c_subtitulo'), t('simulation'), ...rows.map(([key, value]) => `${key}: ${value}`), t('c_gracias')].join('\n') };
    },
    async exportText(receipt, plate) {
      const url = URL.createObjectURL(new Blob([receipt.text], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url; link.download = `primax_${plate}_${Date.now()}.txt`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    },
  };
})(globalThis.FuelFlow);
