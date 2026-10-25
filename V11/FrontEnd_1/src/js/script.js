/* ============================================================================
 * PRIMAX FuelFlow Autónomo — script.js
 * JavaScript vanilla, modular y comentado en español.
 * Flujo: inicio → combustible → pago → identificación → procesamiento
 *        → despacho → resumen (+ panel admin con login simulado)
 * Extras: i18n (es / en / qu) · asistente visual con 4 imágenes animadas
 * ========================================================================== */

import {mountInventory} from './inventory.js';
mountInventory();
import {openPlateCamera, insufficientBalance} from './plateCamera.js';
import { paymentState } from './paymentState.js';
import {customerIdentity} from './customerIdentity.js';
import {adminService, renderAlerts} from './adminService.js';
import {apiClient, catalogService, authorizationService} from './apiClient.js';
import {transactionsService} from './transactionsService.js';
let catalog, submitting=false, backendResult=null;

// ---------- Estado global de la aplicación ----------
const state = {
  combustible: null,      // { nombre, precio }
  modalidad: null,        // 'PREPAGO' | 'POSTPAGO'
  montoPrepago: 0,        // soles (solo prepago)
  montoTexto: '',         // dígitos del teclado virtual
  placa: '',
  esMiembro: false,
  codigoCliente: '',
  // --- Flujo de prepago: comprobante → datos → método de pago ---
  tipoComprobante: null,    // 'BOLETA' | 'FACTURA'
  dni: '',
  ruc: '',
  razonSocial: '',
  metodoPago: null,         // 'YAPE' | 'PLIN' | 'TARJETA' | 'EFECTIVO'
  efectivoIngresado: 0,
  efectivoPila: [],         // billetes/monedas insertidos (para "Devolver")
  efectivoEntregado: 0,     // cuánto dio el cliente
  efectivoVuelto: 0,        // cuánto se le devolvió
  // --- Postpago: placa + membresía verificada, monto o tanque lleno ---
  montoPostpago: 0,
  montoPostpagoTexto: '',
  tanqueLleno: false,
  membresiaVerificada: null,   // { codigo, placa, nombre }
  // Reserva de saldo postpago: el backend la descuenta antes del abastecimiento
  // y libera el excedente al confirmar la compra.
  autorizacionId: null,
  montoReservado: 0,
  ultimoAvanceEnviado: 0,
  detencionManual: false,
  motivoFin: null,
  // PENDIENTE → AUTORIZADO → ABASTECIENDO → FINALIZADO → COBRADO
  estadoOperacion: 'PENDIENTE',
  // Se marca en cuanto el cobro empieza y se limpia con limpiarEstadoOperacion.
  // Detener no puede abrir una segunda confirmación mientras la primera siga
  // viva, que es como se producían cobros duplicados.
  cobroIniciado: false,
  galones: 0,
  total: 0,
  despachoTimer: null,
  ultimoAnuncioGalones: 0,
  vozActivada: true,
  pagoAutorizado: false,
  adminAutenticado: false,
  idioma: 'es',           // idioma activo: es | en | qu
};

// ---------- Constantes del simulador de surtidor ----------
// Fuel prices and station IDs are loaded from the shared API.
const GALONES_POR_TICK = 0.13; // 0.13 gal cada 300 ms
const TICK_MS = 300;
// El descuento de membresía era una simulación exclusiva del navegador y se
// aplicaba sin que el backend lo conociera. Ahora el importe cobrado es siempre
// el consumo real; el backend es la única fuente de la regla comercial.
const DESCUENTO = 0;           // sin descuento en el importe cobrado
const MONTO_MIN = 10, MONTO_MAX = 500;
const DNI_LONG = 8;            // 8 dígitos
const RUC_LONG = 11;           // 11 dígitos
const BILLETES = [200, 100, 50, 20];   // billetes que acepta el cajero
const MONEDAS = [1, 0.5, 0.2, 0.1];    // monedas que acepta el cajero
const TANQUE_GALONES = 14.5;   // capacidad referencial del tanque (~54.9 L)
const GALONES_AVISO = 5;       // el asistente anuncia cada 5 galones

// Cámara de demostración; la pertenencia se verifica siempre por API.
const MIEMBROS_PARCELAS = ['ABC-123', 'DEF-456'];
const LS_KEY = 'primax_transacciones';
const LS_IDIOMA = 'primax_idioma';

// Código de idioma para SpeechSynthesis y locale para fechas/números
const CODIGO_IDIOMA = { es: 'es-PE', en: 'en-US', qu: 'qu' };
const LOCALE_IDIOMA = { es: 'es-PE', en: 'en-US', qu: 'es-PE' };



/* ============================================================================
 * 1. i18n — todos los textos en español, inglés y quechua
 * ========================================================================== */
const I18N = {
  /* ------------------------------ ESPAÑOL ------------------------------ */
  es: {
    // Barra superior / globales
    brand_sub: 'FuelFlow Autónomo',
    voice_ready: 'Asistente listo',
    voice_muted: 'Voz silenciada',
    btn_lang_title: 'Cambiar idioma',
    btn_voice_title: 'Activar / silenciar voz',
    btn_admin_title: 'Panel de administración',
    lang_title: 'Selecciona tu idioma',
    lang_sub: 'Select your language · Simiykita akllay',
    lang_close: 'Cerrar',
    mascota_tag: 'Asistente Primax',

    // Asistencia humana
    btn_ayuda: 'Llamar asistencia',
    btn_ayuda_title: 'Llamar asistencia humana',
    help_cargando_txt: 'Cargando…',
    help_t_llamando: 'Llamando a asistencia…',
    help_m_llamando: 'Un operador del centro de control está siendo notificado. Por favor, permanezca en su vehículo.',
    help_e_llamando: 'Conectando con el operador…',
    help_paso_1: 'Solicitud enviada al surtidor 03',
    help_paso_2: 'Operador asignado',
    help_paso_3: 'El asistente va en camino',
    help_t_llegada: '¡El asistente ha llegado!',
    help_m_llegada: 'Un asesor de Primax está junto a usted en el surtidor 03. ¿En qué podemos ayudarle?',
    help_e_llegada: '● Asistente en sitio',
    help_cancelar: 'Cancelar solicitud',
    help_cerrar: 'Entendido',

    // Inicio
    logo_sub: '⛽ AUTOSERVICIO INTELIGENTE',
    hero_msg: 'Bienvenido. Presione para comenzar.',
    feat_voice: 'Asistente por voz',
    feat_pay: 'Pago integrado',
    feat_plate: 'Reconoce tu placa',
    feat_secure: 'Compra segura',
    btn_iniciar: 'INICIAR ▶',
    hint_inicio: 'Toque INICIAR · El asistente le guiará por voz en cada paso',
    kiosk_note: 'Kiosco 01 · Estación Primax Sur · Operativo 24/7',

    // Combustible
    step_1: 'PASO 1 / 5',
    fuel_title: 'Seleccione su combustible',
    voz_fuel: '🎙️ "Por favor, seleccione su combustible."',
    price_galon: '/ galón',
    tag_eco: 'Económico',
    tag_rec: 'Recomendado',
    tag_rend: 'Alto rendimiento',
    volver: '← Volver',

    // Modalidad de pago
    step_2: 'PASO 2 / 5',
    pay_title: 'Elija su modalidad de pago',
    voz_pago: '🎙️ "Ingrese el monto que desea cargar."',
    lbl_combustible: 'Combustible:',
    prepago: 'PREPAGO',
    prepago_desc: 'Ingresa un monto fijo',
    postpago: 'POSTPAGO',
    postpago_desc: 'Pague después de cargar',
    postpago_only_members: '🔒 Exclusivo para miembros Primax',
    monto_cargar: 'Monto a cargar (S/)',
    chip_otro: 'Otro',
    hint_monto: 'Mínimo S/ 10 · Máximo S/ 500',
    btn_confirmar_monto: 'Confirmar monto →',
    btn_postpago_cont: 'Continuar con postpago →',

    // Postpago: placa + membresía vinculada
    paso_n: 'PASO {n} / {total}',
    step_post_1: 'PASO 1 / 4',
    step_post_2: 'PASO 2 / 4',
    post_id_title: 'Identificación de placa y membresía',
    voz_post_id: '🎙️ "Lea su placa e ingrese su código de membresía."',
    lbl_codigo_post: 'Código de membresía',
    btn_verificar: 'Verificar →',

    cam_mem_text: 'LECTOR DE MEMBRESÍA · SIMULACIÓN',
    cam_mem_btn: 'Buscar membresia',
    post_datos_auto: '✓ DNI y placa completados desde la membresía verificada ({codigo}).',
    post_razon_libre: 'El RUC y la razón social son opcionales en postpago: puede dejarlos en blanco.',
    doc_sin_ruc: 'Consignado a nombre de la placa',
    auto_flag: 'autocompletado',
    post_auto_boleta: '✓ Completado desde la membresía {codigo}: placa {placa} y DNI {dni}.',
    post_auto_factura: '✓ Completado desde la membresía: placa {placa}. RUC y razón social quedan libres.',
    voz_auto_boleta: 'Sus datos ya están cargados: DNI {dni}. Confirme para continuar.',
    voz_auto_factura: 'Su placa {placa} ya está cargada. El RUC y la razón social son opcionales.',
    post_membresia_ok: '✓ Membresía verificada · {codigo} · {placa} · {nombre}',
    err_codigo_no_existe: 'Ese código no existe en el padrón de membresías.',
    err_post_no_coincide: 'La placa leída ({leida}) no coincide con la membresía ({member}). Verifique ambas.',
    modal_post_err_t: 'Membresía no coincide',

    // Postpago: monto / tanque lleno
    monto_post_title: '¿Cuánto desea cargar?',
    voz_monto_post: '🎙️ "Elija un monto o opte por tanque lleno."',
    lbl_ident_ok: 'Identificado:',
    tanque_lleno: 'Tanque lleno',
    tanque_lleno_desc: 'Cargar hasta llenar el tanque (~55 L) y detenerse solo',
    elegir_monto: 'O elija un monto',

    // Postpago: cargo al saldo Primax Prime
    cobro_titulo: 'Registrando su consumo…',
    cobro_pista: 'Actualizando el saldo de su membresía Primax Prime · Espere unos segundos',
    modal_cobro_t: 'Consumo registrado',
    reserva_titulo: 'Autorizando el saldo de tu membresía…',
    reserva_pista: 'Verificando tu membresía Primax Prime · Espere unos segundos',
    op_pendiente: 'PENDIENTE',
    op_autorizado: 'AUTORIZADO',
    op_abasteciendo: 'ABASTECIENDO',
    op_finalizado: 'FINALIZADO',
    op_cobrado: 'COBRADO',
    modal_cobro_m: 'Se registró un consumo de {monto} con cargo a su saldo Primax Prime. Por favor, retire la manguera.',

    // Identificación
    step_3: 'PASO 3 / 5',
    ident_title: 'Identificación del vehículo',
    voz_placa: '🎙️ "Por favor, ingrese la placa de su vehículo."',
    cam_text: 'CAMARA / OCR',
    cam_btn: 'Reconocer placa',
    lbl_placa: 'Placa del vehículo',
    ph_placa: 'Ej: ABC-123',
    membresia_lbl: '¿Es usuario membresía Primax? <em>(acumula puntos)</em>',
    lbl_codigo: 'Código de cliente',
    ph_codigo: 'Ej: PX-004821',
    discount_badge: '✓ Acumula puntos por tu compra',
    sum_fuel: 'Combustible:',
    sum_modalidad: 'Modalidad:',
    sum_monto: 'Monto prepago:',
    mini_post: 'Sin límite (postpago)',
    btn_continuar: 'Continuar →',

    // Comprobante (Boleta / Factura) — solo prepago
    step_4: 'PASO 4 / 5',
    step_5: 'PASO 5 / 5',
    doc_title: '¿Qué comprobante desea?',
    voz_doc: '🎙️ "Seleccione boleta o factura."',
    lbl_doc_tipo: 'Comprobante:',
    doc_boleta: 'BOLETA',
    doc_boleta_desc: 'Persona natural · se pide DNI',
    doc_factura: 'FACTURA',
    doc_factura_desc: 'Empresa · se pide RUC y razón social',
    doc_boleta_full: 'Boleta de venta',
    doc_factura_full: 'Factura electrónica',

    // Datos del comprobante
    datos_title: 'Datos del comprobante',
    voz_datos: '🎙️ "Ingrese su documento y la placa del vehículo."',
    sum_doc: 'Comprobante:',
    lbl_dni: 'DNI del cliente',
    ph_dni: 'Ej: 70123456',
    lbl_ruc: 'RUC',
    ph_ruc: 'Ej: 20509876543',
    lbl_razon: 'Razón social',
    ph_razon: 'Ej: Transportes del Sur S.A.C.',

    // Método de pago
    metodo_title: 'Seleccione su método de pago',
    voz_metodo: '🎙️ "Seleccione cómo desea pagar."',
    lbl_a_cobrar: 'Total a cobrar:',
    m_yape: 'YAPE',
    m_plin: 'PLIN',
    m_tarjeta: 'TARJETA',
    m_efectivo: 'EFECTIVO',
    btn_otro_metodo: '← Otro método',

    // Yape / Plin (QR)
    qr_msg: 'Escanee el código con {app} para pagar S/ {monto}.',
    btn_simular_qr: 'Ya pagué con la app',

    // Tarjeta (NFC)
    nfc_title: 'Pago sin contacto',
    nfc_card: 'Tarjeta',
    nfc_hint: 'Acereque su tarjeta, reloj o celular al lector',
    nfc_ok: '✓ Tarjeta leída · procesando pago',
    btn_simular_nfc: 'Simular acercamiento',

    // Efectivo
    ef_title: 'Ingrese su dinero',
    ef_ingresado: 'Ingresado',
    ef_falta: 'Falta',
    ef_billetes: 'Billetes',
    ef_monedas: 'Monedas',
    ef_completo: '✓ Efectivo suficiente',
    ef_vuelto_t: 'Vuelto a devolver',
    ef_vuelto_entregando: 'Entregando vuelto…',
    ef_vuelto_ok: '✓ Vuelto entregado',
    ef_vuelto_exacto: 'Entrega exacta, sin vuelto',
    c_ef_entregado: 'Entregado',
    c_ef_vuelto: 'Vuelto',
    btn_ef_retirar: '↩ Devolver',
    btn_ef_confirmar: 'Confirmar efectivo',

    // Ticket: nuevo campos
    row_doc: 'Comprobante',
    row_docnum: 'DNI / RUC',

    // Errores nuevos
    err_dni: 'Ingrese un DNI válido de 8 dígitos.',
    err_ruc: 'Ingrese un RUC válido de 11 dígitos.',
    err_razon: 'Ingrese la razón social o el nombre de la empresa.',
    err_ef_incompleto: 'Falta {falta} para completar el monto prepago.',

    // Procesamiento
    proc_title: 'Procesando pago...',
    proc_hint: 'Conectando con la pasarela segura · No retire su tarjeta',

    // Despacho
    step_live: 'ABASTECIENDO',
    despacho_title: 'Cargando {fuel}…',
    voz_despacho: '🎙️ El asistente anuncia cada 5 galones.',
    ct_galones: 'GALONES',
    ct_soles: 'SOLES',
    ct_precio: 'PRECIO / GAL',
    ct_meta: 'META PREPAGO',
    info_prepago: 'Modo PREPAGO: se detendrá en S/ {monto} automáticamente.',
    info_postpago: 'Modo POSTPAGO: se detendrá automáticamente en S/ {monto}.',
    info_tanque: 'Modo POSTPAGO · Tanque lleno: se detendrá automáticamente en {galones} gal.',
    btn_detener: '■ DETENER',

    // Resumen / ticket
    step_ok: '✓ CARGA COMPLETADA',
    resumen_title: 'Ticket digital',
    ticket_sub: 'FuelFlow Autónomo · Kiosco 01',
    row_placa: 'Placa',
    row_fuel: 'Combustible',
    row_galones: 'Galones cargados',
    row_precio: 'Precio por galón',
    row_subtotal: 'Subtotal',
    row_descuento: 'Descuento membresía (5%)',
    row_total: 'TOTAL A PAGAR',
    row_modalidad: 'Modalidad',
    row_estado: 'Estado',
    estado_pagado: '✅ Pagado',
    estado_cobrado: '✅ Consumo registrado',
    estado_pendiente: '⏳ Pendiente de pago',
    miembro_tag: '★ Miembro',
    ticket_foot: 'Gracias por preferir Primax · Que tenga un buen viaje 🛣️',
    btn_comprobante: '🧾 Generar comprobante',
    btn_finalizar: 'Finalizar ↺',

    // Admin
    admin_step: '🔒 ACCESO RESTRINGIDO',
    admin_title: 'Panel de Seguridad / Admin',
    lbl_usuario: 'Usuario',
    lbl_contrasena: 'Contraseña',
    btn_ingresar: 'Ingresar',

    dash_step: '🛡️ MONITOREO EN VIVO',
    dash_title: 'Dashboard operativo',
    btn_logout: 'Cerrar sesión',
    metric_ventas: 'Ventas registradas',
    metric_trans: 'Transacciones',
    metric_galones: 'Galones vendidos',
    tbl_title: 'Últimas transacciones',
    th_hora: 'Hora',
    th_placa: 'Placa',
    th_fuel: 'Combustible',
    th_monto: 'Monto',
    th_estado: 'Estado',
    alerts_title: '🚨 Alertas de seguridad',
    volver_inicio: '← Volver al inicio',
    badge_pagado: 'Pagado',
    badge_pendiente: 'Pendiente',




    // Footer y modales
    status_listo: '● Sistema listo',
    footer_surtidor: 'Surtidor 03 · Precios S/ incluyen impuestos',
    btn_entendido: 'Entendido',
    comp_title: 'Comprobante electrónico',
    comp_descargar: '⬇ Descargar .txt',
    comp_cerrar: 'Cerrar',

    // Mensajes de error / modales
    err_monto: 'Monto inválido. Ingrese un valor entre S/ {min} y S/ {max}.',
    err_placa_vacia: 'Ingrese la placa del vehículo para continuar.',
    err_placa_formato: 'Formato inválido. Use ABC-123 o ABC123 (3 letras + 3 números).',
    err_codigo: 'Ingrese su código de cliente Primax.',
    err_admin: 'Credenciales incorrectas.',
    modal_pago_t: 'Pago autorizado',
    modal_pago_m: 'Proceda a abastecer. El surtidor 03 está listo.',
    modal_sincarga_t: 'Sin carga',
    modal_sincarga_m: 'Aún no se ha cargado combustible.',
    modal_cierre_t: 'Sesión finalizada',

    // Frases del asistente de voz
    voz_bienvenida: 'Bienvenido a Primax. Por favor, seleccione su combustible.',
    voz_seleccion: 'Ha seleccionado {fuel}. Ahora elija su modalidad de pago.',
    voz_postpago: 'Ha elegido postpago. Presione continuar.',

    // Postpago: placa + membresía
    voz_post_codigo_malo: 'Ese código de membresía no existe en el padrón.',
    voz_mem_codigo: 'Lector de membresías: código detectado {codigo}.',
    voz_mem_texto: 'Lector de membresías: {nombre}, código {codigo}, placa {placa}.',
    voz_post_no_coincide: 'La placa no coincide con su membresía.',
    voz_post_rechazo: 'Verifique su placa y su membresía, o elija otra modalidad de pago.',
    voz_post_ok: 'Membresía {codigo} verificada para la placa {placa}.',
    voz_post_listo: 'Identificación completa. Iniciando el abastecimiento.',

    // Postpago: monto / tanque lleno
    voz_monto_post: 'Elija el monto que desea cargar o llene el tanque.',
    voz_tanque_lleno: 'Tanque lleno seleccionado. Se detendrá en {galones} galones.',
    voz_tanque_listo: 'Tanque lleno. Se cargaron {galones} galones.',
    voz_post_carga_lista: 'Carga finalizada. Procesando el cobro.',

    // Postpago: cargo al saldo Primax Prime
    voz_cobrando: 'Carga finalizada. Registrando el consumo en su saldo Primax Prime.',
    voz_cobrado: 'Consumo de {monto} registrado en su saldo Primax Prime.',
    voz_monto_invalido: 'Monto inválido. Ingrese un valor entre diez y quinientos soles.',
    voz_monto_ok: 'Monto confirmado: {monto} soles. Ahora ingrese la placa de su vehículo.',
    voz_ingrese_placa: 'Por favor, ingrese la placa de su vehículo.',
    voz_placa_invalida: 'Placa inválida. Use el formato A B C 1 2 3.',
    voz_camara: 'Cámara: placa detectada {placa}. Verifique y continúe.',
    voz_proc_pre: 'Procesando su pago. Un momento por favor.',
    voz_autorizado: 'Pago autorizado. Puede comenzar a cargar combustible.',
    voz_galones: 'Lleva {n} galones cargados.',
    voz_detenida: 'Carga detenida. Preparando su ticket digital.',
    voz_prepago_listo: 'Monto de prepago alcanzado. Preparando su ticket digital.',
    voz_gracias: 'Gracias por preferir Primax. Que tenga un buen viaje.',
    voz_sesion: 'Sesión finalizada. Bienvenido a Primax.',
    voz_admin: 'Acceso concedido. Bienvenido, administrador.',
    voz_datos_boleta: 'Ingrese su DNI y la placa del vehículo.',
    voz_datos_factura: 'Ingrese su RUC, la razón social y la placa del vehículo.',
    voz_datos_ok: 'Datos correctos. Ahora seleccione su método de pago.',
    voz_metodo_sel: 'Ha elegido {metodo}.',
    voz_nfc: 'Pago sin contacto. Acereque su tarjeta al lector.',
    voz_nfc_ok: 'Tarjeta leída. Procesando su pago.',
    voz_pago_qr_ok: 'Pago por billetera virtual recibido. Procesando.',
    voz_efectivo: 'Ingrese el efectivo en billetes o monedas.',
    voz_ef_incompleto: 'El efectivo es insuficiente. Ingrese el monto restante.',
    voz_ef_exacto: 'Efectivo recibido. No hay vuelto.',
    voz_vuelto: 'Vuelto a devolver: {monto}.',
    voz_vuelto_ok: 'Vuelto de {monto} entregado. Procesando su pago.',
    voz_ef_ok: 'Efectivo recibido. Cambio {cambio}. Procesando su pago.',
    voz_ticket: 'Se ha generado su {doc}. Gracias por preferir Primax.',
    voz_help_llamando: 'Solicitando asistencia humana. Por favor, espere un momento.',
    voz_help_cancelada: 'Solicitud cancelada. Seguimos a su disposición.',
    voz_help_llegada: 'El asistente ha llegado. Está junto a usted en el surtidor.',

    // Comprobante (.txt)
    c_titulo: 'PRIMAX - COMPROBANTE',
    c_subtitulo: 'FuelFlow Autónomo - Kiosco 01',
    c_fecha: 'Fecha',
    c_doc: 'Comprobante',
    c_docnum: 'DNI/RUC',
    c_metodo: 'Método',
    c_placa: 'Placa',
    c_combustible: 'Combustible',
    c_galones: 'Galones',
    c_precio: 'Precio/gal',
    c_subtotal: 'Subtotal',
    c_descuento: 'Descuento 5%',
    c_total: 'TOTAL',
    c_modalidad: 'Modalidad',
    c_estado: 'Estado',
    c_pagado: 'PAGADO',
    c_cobrado: 'CONSUMO REGISTRADO (SALDO PRIME)',
    c_pendiente: 'PENDIENTE',
    c_gracias: 'Gracias por preferir Primax.',
  },

  /* ------------------------------ INGLÉS ------------------------------- */
  en: {
    brand_sub: 'FuelFlow Autonomous',
    voice_ready: 'Assistant ready',
    voice_muted: 'Voice muted',
    btn_lang_title: 'Change language',
    btn_voice_title: 'Toggle voice',
    btn_admin_title: 'Admin panel',
    lang_title: 'Select your language',
    lang_sub: 'Selecciona tu idioma · Simiykita akllay',
    lang_close: 'Close',
    mascota_tag: 'Primax Assistant',

    // Human assistance
    btn_ayuda: 'Call assistance',
    btn_ayuda_title: 'Call human assistance',
    help_cargando_txt: 'Loading…',
    help_t_llamando: 'Calling assistance…',
    help_m_llamando: 'A control center operator is being notified. Please stay in your vehicle.',
    help_e_llamando: 'Connecting with the operator…',
    help_paso_1: 'Request sent to pump 03',
    help_paso_2: 'Operator assigned',
    help_paso_3: 'The assistant is on the way',
    help_t_llegada: 'The assistant has arrived!',
    help_m_llegada: 'A Primax advisor is next to you at pump 03. How can we help you?',
    help_e_llegada: '● Assistant on site',
    help_cancelar: 'Cancel request',
    help_cerrar: 'Got it',

    logo_sub: '⛽ SMART SELF-SERVICE',
    hero_msg: 'Welcome. Press to start.',
    feat_voice: 'Voice assistant',
    feat_pay: 'Integrated payment',
    feat_plate: 'Reads your plate',
    feat_secure: 'Safe purchase',
    btn_iniciar: 'START ▶',
    hint_inicio: 'Tap START · The assistant will guide you by voice at every step',
    kiosk_note: 'Kiosk 01 · Primax Sur Station · Open 24/7',

    step_1: 'STEP 1 / 5',
    fuel_title: 'Select your fuel',
    voz_fuel: '🎙️ "Please, select your fuel."',
    price_galon: '/ gallon',
    tag_eco: 'Economy',
    tag_rec: 'Recommended',
    tag_rend: 'High performance',
    volver: '← Back',

    step_2: 'STEP 2 / 5',
    pay_title: 'Choose your payment mode',
    voz_pago: '🎙️ "Enter the amount you want to load."',
    lbl_combustible: 'Fuel:',
    prepago: 'PREPAY',
    prepago_desc: 'Enter a fixed amount',
    postpago: 'POSTPAY',
    postpago_desc: 'Pay after fueling',
    postpago_only_members: '🔒 Primax members only',
    monto_cargar: 'Amount to load (S/)',
    chip_otro: 'Other',
    hint_monto: 'Minimum S/ 10 · Maximum S/ 500',
    btn_confirmar_monto: 'Confirm amount →',
    btn_postpago_cont: 'Continue with postpay →',

    // Postpay: plate + linked membership
    paso_n: 'STEP {n} / {total}',
    step_post_1: 'STEP 1 / 4',
    step_post_2: 'STEP 2 / 4',
    post_id_title: 'Plate and membership identification',
    voz_post_id: '🎙️ "Please read your plate and enter your membership code."',
    lbl_codigo_post: 'Membership code',
    btn_verificar: 'Verify →',

    cam_mem_text: 'MEMBERSHIP READER · SIMULATION',
    cam_mem_btn: 'Buscar membresia',
    post_datos_auto: '✓ ID and plate filled from the verified membership ({codigo}).',
    post_razon_libre: 'Tax ID and business name are optional in postpay: you may leave them blank.',
    doc_sin_ruc: 'Issued to the plate holder',
    auto_flag: 'auto-filled',
    post_auto_boleta: '✓ Filled from membership {codigo}: plate {placa} and ID {dni}.',
    post_auto_factura: '✓ Filled from the membership: plate {placa}. Tax ID and business name stay free.',
    voz_auto_boleta: 'Your details are already loaded: ID {dni}. Please confirm to continue.',
    voz_auto_factura: 'Your plate {placa} is already loaded. Tax ID and business name are optional.',
    post_membresia_ok: '✓ Membership verified · {codigo} · {placa} · {nombre}',
    err_codigo_no_existe: 'That code does not exist in the membership registry.',
    err_post_no_coincide: 'The plate read ({leida}) does not match the membership ({member}). Please check both.',
    modal_post_err_t: 'Membership mismatch',

    monto_post_title: 'How much do you want to load?',
    voz_monto_post: '🎙️ "Please choose an amount or select full tank."',
    lbl_ident_ok: 'Identified:',
    tanque_lleno: 'Full tank',
    tanque_lleno_desc: 'Fill the tank (~55 L) and stop automatically',
    elegir_monto: 'Or choose an amount',

    cobro_titulo: 'Registering your consumption…',
    cobro_pista: 'Updating your Primax Prime membership balance · Please wait a moment',
    modal_cobro_t: 'Consumption registered',
    modal_cobro_m: 'A consumption of {monto} was charged to your Primax Prime balance. Please remove the nozzle.',
    reserva_titulo: 'Authorizing your membership balance…',
    reserva_pista: 'Verifying your Primax Prime membership · Please wait a moment',
    op_pendiente: 'PENDING',
    op_autorizado: 'AUTHORIZED',
    op_abasteciendo: 'DISPENSING',
    op_finalizado: 'FINISHED',
    op_cobrado: 'CHARGED',

    step_3: 'STEP 3 / 5',
    ident_title: 'Vehicle identification',
    voz_placa: '🎙️ "Please, enter your vehicle plate."',
    cam_text: 'CAMARA / OCR',
    cam_btn: 'Reconocer placa',
    lbl_placa: 'Vehicle plate',
    ph_placa: 'Ex: ABC-123',
    membresia_lbl: 'Are you a Primax member? <em>(earn points)</em>',
    lbl_codigo: 'Customer code',
    ph_codigo: 'Ex: PX-004821',
    discount_badge: '✓ You earn points on this purchase',
    sum_fuel: 'Fuel:',
    sum_modalidad: 'Mode:',
    sum_monto: 'Prepay amount:',
    mini_post: 'No limit (postpay)',
    btn_continuar: 'Continue →',

    proc_title: 'Processing payment...',
    proc_hint: 'Connecting to the secure gateway · Do not remove your card',

    // Receipt type (Boleta / Factura) — prepay only
    step_4: 'STEP 4 / 5',
    step_5: 'STEP 5 / 5',
    doc_title: 'Which receipt do you want?',
    voz_doc: '🎙️ "Please select receipt or invoice."',
    lbl_doc_tipo: 'Receipt:',
    doc_boleta: 'RECEIPT',
    doc_boleta_desc: 'Individual · ID number (DNI) required',
    doc_factura: 'INVOICE',
    doc_factura_desc: 'Company · tax ID (RUC) and business name required',
    doc_boleta_full: 'Sales receipt',
    doc_factura_full: 'Electronic invoice',

    datos_title: 'Receipt details',
    voz_datos: '🎙️ "Please enter your document and your vehicle plate."',
    sum_doc: 'Receipt:',
    lbl_dni: 'Customer ID (DNI)',
    ph_dni: 'Ex: 70123456',
    lbl_ruc: 'Tax ID (RUC)',
    ph_ruc: 'Ex: 20509876543',
    lbl_razon: 'Business name',
    ph_razon: 'Ex: Southern Transport Ltd.',

    metodo_title: 'Select your payment method',
    voz_metodo: '🎙️ "Please select how you want to pay."',
    lbl_a_cobrar: 'Amount to pay:',
    m_yape: 'YAPE',
    m_plin: 'PLIN',
    m_tarjeta: 'CARD',
    m_efectivo: 'CASH',
    btn_otro_metodo: '← Other method',

    qr_msg: 'Scan the code with {app} to pay S/ {monto}.',
    btn_simular_qr: 'I paid with the app',

    nfc_title: 'Contactless payment',
    nfc_card: 'Card',
    nfc_hint: 'Tap your card, watch or phone on the reader',
    nfc_ok: '✓ Card read · processing payment',
    btn_simular_nfc: 'Simulate tap',

    ef_title: 'Insert your money',
    ef_ingresado: 'Inserted',
    ef_falta: 'Remaining',
    ef_billetes: 'Banknotes',
    ef_monedas: 'Coins',
    ef_completo: '✓ Enough cash',
    ef_vuelto_t: 'Change to return',
    ef_vuelto_entregando: 'Dispensing change…',
    ef_vuelto_ok: '✓ Change handed over',
    ef_vuelto_exacto: 'Exact amount, no change',
    c_ef_entregado: 'Received',
    c_ef_vuelto: 'Change',
    btn_ef_retirar: '↩ Return',
    btn_ef_confirmar: 'Confirm cash',

    row_doc: 'Receipt',
    row_docnum: 'ID / Tax ID',

    err_dni: 'Enter a valid 8-digit ID number.',
    err_ruc: 'Enter a valid 11-digit tax ID.',
    err_razon: 'Enter the business name.',
    err_ef_incompleto: 'You still need {falta} to reach the prepay amount.',

    step_live: 'FUELING',
    despacho_title: 'Fueling {fuel}…',
    voz_despacho: '🎙️ The assistant announces every 5 gallons.',
    ct_galones: 'GALLONS',
    ct_soles: 'SOLES',
    ct_precio: 'PRICE / GAL',
    ct_meta: 'PREPAY TARGET',
    info_prepago: 'PREPAY mode: it will stop automatically at S/ {monto}.',
    info_postpago: 'POSTPAY mode: it will stop automatically at S/ {monto}.',
    info_tanque: 'POSTPAY mode · Full tank: it will stop automatically at {galones} gal.',
    btn_detener: '■ STOP',

    step_ok: '✓ FUELING COMPLETED',
    resumen_title: 'Digital ticket',
    ticket_sub: 'FuelFlow Autonomous · Kiosk 01',
    row_placa: 'Plate',
    row_fuel: 'Fuel',
    row_galones: 'Gallons loaded',
    row_precio: 'Price per liter',
    row_subtotal: 'Subtotal',
    row_descuento: 'Membership discount (5%)',
    row_total: 'TOTAL TO PAY',
    row_modalidad: 'Mode',
    row_estado: 'Status',
    estado_pagado: '✅ Paid',
    estado_cobrado: '✅ Consumption registered',
    estado_pendiente: '⏳ Pending payment',
    miembro_tag: '★ Member',
    ticket_foot: 'Thank you for choosing Primax · Have a great trip 🛣️',
    btn_comprobante: '🧾 Generate receipt',
    btn_finalizar: 'Finish ↺',

    admin_step: '🔒 RESTRICTED ACCESS',
    admin_title: 'Security / Admin Panel',
    lbl_usuario: 'User',
    lbl_contrasena: 'Password',
    btn_ingresar: 'Login',

    dash_step: '🛡️ LIVE MONITORING',
    dash_title: 'Operations dashboard',
    btn_logout: 'Sign out',
    metric_ventas: 'Recorded sales',
    metric_trans: 'Transactions',
    metric_galones: 'Gallons sold',
    tbl_title: 'Latest transactions',
    th_hora: 'Time',
    th_placa: 'Plate',
    th_fuel: 'Fuel',
    th_monto: 'Amount',
    th_estado: 'Status',
    alerts_title: '🚨 Security alerts',
    volver_inicio: '← Back to home',
    badge_pagado: 'Paid',
    badge_pendiente: 'Pending',




    status_listo: '● System ready',
    footer_surtidor: 'Pump 03 · Prices S/ include taxes',
    btn_entendido: 'Got it',
    comp_title: 'Electronic receipt',
    comp_descargar: '⬇ Download .txt',
    comp_cerrar: 'Close',

    err_monto: 'Invalid amount. Enter a value between S/ {min} and S/ {max}.',
    err_placa_vacia: 'Enter the vehicle plate to continue.',
    err_placa_formato: 'Invalid format. Use ABC-123 or ABC123 (3 letters + 3 digits).',
    err_codigo: 'Enter your Primax customer code.',
    err_admin: 'Wrong credentials.',
    modal_pago_t: 'Payment authorized',
    modal_pago_m: 'Please proceed to fuel. Pump 03 is ready.',
    modal_sincarga_t: 'No fueling',
    modal_sincarga_m: 'No fuel has been loaded yet.',
    modal_cierre_t: 'Session finished',

    voz_bienvenida: 'Welcome to Primax. Please select your fuel.',
    voz_seleccion: 'You selected {fuel}. Now choose your payment mode.',
    voz_postpago: 'You chose postpay. Press continue.',

    // Postpay: plate + membership
    voz_post_codigo_malo: 'That membership code does not exist in the registry.',
    voz_mem_codigo: 'Membership reader: code detected {codigo}.',
    voz_mem_texto: 'Membership reader: {nombre}, code {codigo}, plate {placa}.',
    voz_post_no_coincide: 'The plate does not match your membership.',
    voz_post_rechazo: 'Please check your plate and membership, or choose another payment mode.',
    voz_post_ok: 'Membership {codigo} verified for plate {placa}.',
    voz_post_listo: 'Identification complete. Starting to fuel.',

    voz_monto_post: 'Please choose the amount to load or fill the tank.',
    voz_tanque_lleno: 'Full tank selected. It will stop at {galones} gallons.',
    voz_tanque_listo: 'Full tank done. {galones} gallons loaded.',
    voz_post_carga_lista: 'Fueling finished. Processing the charge.',

    voz_cobrando: 'Fueling finished. Registering the charge in your Primax Prime balance.',
    voz_cobrado: 'Consumption of {monto} registered in your Primax Prime balance.',
    voz_monto_invalido: 'Invalid amount. Enter a value between ten and five hundred soles.',
    voz_monto_ok: 'Amount confirmed: {monto} soles. Now enter your vehicle plate.',
    voz_ingrese_placa: 'Please enter your vehicle plate.',
    voz_placa_invalida: 'Invalid plate. Use the format A B C 1 2 3.',
    voz_camara: 'Camera: plate detected {placa}. Verify and continue.',
    voz_proc_pre: 'Processing your payment. One moment please.',
    voz_autorizado: 'Payment authorized. You can start fueling now.',
    voz_galones: 'You have loaded {n} gallons so far.',
    voz_detenida: 'Fueling stopped. Preparing your digital ticket.',
    voz_prepago_listo: 'Prepay amount reached. Preparing your digital ticket.',
    voz_gracias: 'Thank you for choosing Primax. Have a great trip.',
    voz_sesion: 'Session finished. Welcome to Primax.',
    voz_admin: 'Access granted. Welcome, administrator.',
    voz_datos_boleta: 'Please enter your ID number and your vehicle plate.',
    voz_datos_factura: 'Please enter your tax ID, business name and vehicle plate.',
    voz_datos_ok: 'Details are correct. Now select your payment method.',
    voz_metodo_sel: 'You chose {metodo}.',
    voz_nfc: 'Contactless payment. Please tap your card on the reader.',
    voz_nfc_ok: 'Card read. Processing your payment.',
    voz_pago_qr_ok: 'Wallet payment received. Processing.',
    voz_efectivo: 'Please insert your cash using banknotes or coins.',
    voz_ef_incompleto: 'Not enough cash. Please insert the remaining amount.',
    voz_ef_exacto: 'Cash received. No change needed.',
    voz_vuelto: 'Change to return: {monto}.',
    voz_vuelto_ok: 'Change of {monto} handed over. Processing your payment.',
    voz_ef_ok: 'Cash received. Change {cambio}. Processing your payment.',
    voz_ticket: 'Your {doc} has been generated. Thank you for choosing Primax.',
    voz_help_llamando: 'Requesting human assistance. Please wait a moment.',
    voz_help_cancelada: 'Request cancelled. We remain at your disposal.',
    voz_help_llegada: 'The assistant has arrived. It is next to you at the pump.',

    c_titulo: 'PRIMAX - RECEIPT',
    c_subtitulo: 'FuelFlow Autonomous - Kiosk 01',
    c_fecha: 'Date',
    c_doc: 'Receipt',
    c_docnum: 'ID/Tax ID',
    c_metodo: 'Method',
    c_placa: 'Plate',
    c_combustible: 'Fuel',
    c_galones: 'Gallons',
    c_precio: 'Price/gal',
    c_subtotal: 'Subtotal',
    c_descuento: 'Discount 5%',
    c_total: 'TOTAL',
    c_modalidad: 'Mode',
    c_estado: 'Status',
    c_pagado: 'PAID',
    c_cobrado: 'CONSUMPTION REGISTERED (PRIME BALANCE)',
    c_pendiente: 'PENDING',
    c_gracias: 'Thank you for choosing Primax.',
  },

  /* ----------------------------- QUECHUA ------------------------------ */
  /* Términos simples con préstamos adaptados: plaka, qolqe, akllay, etc. */
  qu: {
    brand_sub: 'FuelFlow Autoservicio',
    voice_ready: 'Yanapaq listo',
    voice_muted: 'Rimay harksqa',
    btn_lang_title: 'Simi akllay',
    btn_voice_title: 'Rimayta harkay / kichay',
    btn_admin_title: 'Administrador',
    lang_title: 'Simiykita akllay',
    lang_sub: 'Selecciona tu idioma · Select your language',
    lang_close: 'Harkay',
    mascota_tag: 'Primax Yanapaq',

    // Yanapata runaypaq llamakuy
    btn_ayuda: 'Yanapata waqay',
    btn_ayuda_title: 'Runay yanapata waqaychay',
    help_cargando_txt: 'Karganchkan…',
    help_t_llamando: 'Yanapata waqachkan…',
    help_m_llamando: 'Kunan muruchiq qhaway simiyman. Carroypi kikillan mana puriychu.',
    help_e_llamando: 'Yanapaqta tinkichkan…',
    help_paso_1: 'Solicitud surtidor 03man pusasqa',
    help_paso_2: 'Yanapaq asignasqa',
    help_paso_3: 'Yanapaq chayman rinan',
    help_t_llegada: 'Yanapaq chayam!',
    help_m_llegada: 'Primax yanapaqmi surtidor 03pi kikilla. ¿Imayna yanapayqanchik?',
    help_e_llegada: '● Yanapaq chaypi kachkan',
    help_cancelar: 'Wichayta saqiy',
    help_cerrar: 'Ari',

    logo_sub: '⛽ KIKINMANTA SERVICIO',
    hero_msg: 'Allin hamusqayki. Ñitinyta ñitiy.',
    feat_voice: 'Rimaynintin yanapaq',
    feat_pay: 'Pago integrado',
    feat_plate: 'Plakaykita rikuwan',
    feat_secure: "Jap'iy compra",
    btn_iniciar: 'QALLARIY ▶',
    hint_inicio: 'QALLARIYTAROJQA ñitiy · Yanapaqqa simintin huk huktanchu qatiyan',
    kiosk_note: 'Kiosco 01 · Primax Sur · 24/7',

    step_1: 'PASO 1 / 5',
    fuel_title: 'Combustiblekita akllay',
    voz_fuel: '🎙️ "Ama hina kaspa, combustiblekita akllay."',
    price_galon: '/ galón',
    tag_eco: 'Qolqe yarqan',
    tag_rec: 'Allin akllasqa',
    tag_rend: 'Allin ruwan',
    volver: '← Kutiy',

    step_2: 'PASO 2 / 5',
    pay_title: 'Pagaykita akllay',
    voz_pago: '🎙️ "Ama hina kaspa, cargayki qolqeta churay."',
    lbl_combustible: 'Combustible:',
    prepago: 'ÑAWPAQ PAGA',
    prepago_desc: 'Qolqeta churay',
    postpago: 'QIPAN PAGA',
    postpago_desc: 'Cargaspayki qipaman paga',
    postpago_only_members: '🔒 Primax socotakunallapaq',
    monto_cargar: 'Carganayki qolqe (S/)',
    chip_otro: 'Huk',
    hint_monto: 'S/ 10 mínimo · S/ 500 máximo',
    btn_confirmar_monto: 'Qolqeta tokay →',
    btn_postpago_cont: 'Qipan pagawanta qatiy →',

    // Qipan paga: plaka + sociotakuq
    paso_n: 'PASO {n} / {total}',
    step_post_1: 'PASO 1 / 4',
    step_post_2: 'PASO 2 / 4',
    post_id_title: 'Plakaykita y sociotaykita yachay',
    voz_post_id: '🎙️ "Plakaykita riway y sociota codigoykita churay."',
    lbl_codigo_post: 'Sociota codigo',
    btn_verificar: 'Yachay →',

    cam_mem_text: 'SOCIOTA LECTOR · SIMULADO',
    cam_mem_btn: 'Buscar membresia',
    post_datos_auto: '✓ DNI y plaka membresía yachasqamanta churasqa ({codigo}).',
    post_razon_libre: 'Qipan pagapi RUC y razón social mana churaymi atin. Blancodaykita saqiy.',
    doc_sin_ruc: 'Plakayoq runawan',
    auto_flag: 'kikinanchikmanta',
    post_auto_boleta: '✓ Sociota {codigo} yachasqamanta: plaka {plaka} y DNI {dni}.',
    post_auto_factura: '✓ Sociota yachasqamanta: plaka {plaka}. RUC y razón social kikin.',
    voz_auto_boleta: 'Willaykita churasqa: DNI {dni}. Qatiy churay.',
    voz_auto_factura: 'Plakaykita {plaka} churasqa. RUC y razón social mana churaymi atin.',
    post_membresia_ok: '✓ Sociota allichasqa · {codigo} · {placa} · {nombre}',
    err_codigo_no_existe: 'Chay codigo sociotakullapi mana kanchu.',
    err_post_no_coincide: 'Rikuwasqa plaka ({leida}) manaraq sociotawan ({member}) tinkichkanchu.',
    modal_post_err_t: 'Sociota mana tinkichkan',

    monto_post_title: 'Qachayta qayllaykita churanki?',
    voz_monto_post: '🎙️ "Qolqeta akllay utaq tinkita tankita huntichuy."',
    lbl_ident_ok: 'Yachasqa:',
    tanque_lleno: 'Tinki tanki',
    tanque_lleno_desc: 'Tankita huntichuy (~55 L) y sayan',
    elegir_monto: 'Utaq qolqeta akllay',

    cobro_titulo: 'Qatipayta qillqarichkan…',
    cobro_pista: 'Prime Prime qillqayniyki qillqarichkan · Suwita suyay',
    modal_cobro_t: 'Pago qatipasqa',
    modal_cobro_m: 'Saldo Primax Primepi {monto} qatipasqa. Hosekita hurquy.',
    reserva_titulo: 'Qillqayniyki yachisqachiyki…',
    reserva_pista: 'Primax Prime membresiyki yatipay · Suwita suyay',
    op_pendiente: 'WAÑUCHAQ',
    op_autorizado: 'YACHISQACHISQA',
    op_abasteciendo: 'QUNAQCHIKCHAN',
    op_finalizado: 'WUCHIKUSQA',
    op_cobrado: 'QATIPAQ',

    step_3: 'PASO 3 / 5',
    ident_title: 'Carroyki ñawpaq yachaq',
    voz_placa: '🎙️ "Ama hina kaspa, carroyki plakata churay."',
    cam_text: 'CAMARA / OCR',
    cam_btn: 'Reconocer placa',
    lbl_placa: 'Carroyki plaka',
    ph_placa: 'ABC-123 hina',
    membresia_lbl: '¿Primax sociotakuqchu? <em>(puntoschusqay)</em>',
    lbl_codigo: 'Cliente código',
    ph_codigo: 'PX-004821 hina',
    discount_badge: '✓ Puntoschusqay churana',
    sum_fuel: 'Combustible:',
    sum_modalidad: 'Ushay:',
    sum_monto: 'Ñawpaqta qolqe:',
    mini_post: 'Mana hukllaychu (qipan paga)',
    btn_continuar: 'Qatiy →',

    proc_title: 'Pagota ruwachkan...',
    proc_hint: 'Segura pasarelatan tikrachkan · Tarjetaykta harkay',

    // Comprobante (Boleta / Factura) — ñawpaq pagullapi
    step_4: 'PASO 4 / 5',
    step_5: 'PASO 5 / 5',
    doc_title: 'Hamaq ticketta munaykichu?',
    voz_doc: '🎙️ "Boletata utaq factura akllay."',
    lbl_doc_tipo: 'Comprobante:',
    doc_boleta: 'BOLETA',
    doc_boleta_desc: 'Runa · DNI churay',
    doc_factura: 'FACTURA',
    doc_factura_desc: 'Empresa · RUC y razón social churay',
    doc_boleta_full: 'Boleta de venta',
    doc_factura_full: 'Factura electrónica',

    datos_title: 'Comprobante willakuy',
    voz_datos: '🎙️ "Documentoykita y plakaykita churay."',
    sum_doc: 'Comprobante:',
    lbl_dni: 'DNI',
    ph_dni: 'Hina: 70123456',
    lbl_ruc: 'RUC',
    ph_ruc: 'Hina: 20509876543',
    lbl_razon: 'Razón social',
    ph_razon: 'Hina: Transportes del Sur S.A.C.',

    metodo_title: 'Pagay payta akllay',
    voz_metodo: '🎙️ "Imayna payta qatiy churayniñki"',
    lbl_a_cobrar: 'Huntan pagay:',
    m_yape: 'YAPE',
    m_plin: 'PLIN',
    m_tarjeta: 'TARJETA',
    m_efectivo: 'EFECTIVO',
    btn_otro_metodo: '← Huk pay',

    qr_msg: '{app} nisqawan QR nisqata qhaway S/ {monto} pagaypaq.',
    btn_simular_qr: 'Apuwan paykañ',

    nfc_title: 'Sin contacto pagay',
    nfc_card: 'Tarjeta',
    nfc_hint: 'Tarjetaykta, relojta utaq celularta qhawaq llaqtayman apachiy',
    nfc_ok: '✓ Tarjetayta riqsisqa · pagota ruwachkan',
    btn_simular_nfc: 'Qhawarquy simulay',

    ef_title: 'Qolqeykita churay',
    ef_ingresado: 'Churasqa',
    ef_falta: 'Falta',
    ef_billetes: 'Billetes',
    ef_monedas: 'Monedas',
    ef_completo: '✓ Qolqe allin',
    ef_vuelto_t: 'Qutuy',
    ef_vuelto_entregando: 'Qutuyta rinchkan…',
    ef_vuelto_ok: '✓ Qutuy qatasqa',
    ef_vuelto_exacto: 'Chiqap churay, mana qutuy',
    c_ef_entregado: 'Chaychasqa',
    c_ef_vuelto: 'Qutuy',
    btn_ef_retirar: '↩ Qutuy',
    btn_ef_confirmar: 'Qolqeta tokay',

    row_doc: 'Comprobante',
    row_docnum: 'DNI / RUC',

    err_dni: 'DNI allin mana: huntan pukyuna.',
    err_ruc: 'RUC allin mana: chunka huk punwaq pukyuna.',
    err_razon: 'Razón socialta utaq enterprise sutinta churay.',
    err_ef_incompleto: 'Ñawpaq pagaypaq {falta} falta.',

    step_live: 'CARGACHKAN',
    despacho_title: '{fuel} cargachkan…',
    voz_despacho: '🎙️ Yanapaqqa chinka galonesta riman.',
    ct_galones: 'GALONES',
    ct_soles: 'SOLES',
    ct_precio: 'PRECIO / GAL',
    ct_meta: 'ÑAWPAQTA QOLQE',
    info_prepago: 'ÑAWPAQ PAGA: S/ {monto} chayman sayan.',
    info_postpago: 'QIPAN PAGA: S/ {monto} chayman sayan.',
    info_tanque: 'QIPAN PAGA · Tinki tanki: {galones} gal chayman sayan.',
    btn_detener: '■ SAYAY',

    step_ok: '✓ CARGA TUKUSQA',
    resumen_title: 'Ticket digital',
    ticket_sub: 'FuelFlow · Kiosco 01',
    row_placa: 'Plaka',
    row_fuel: 'Combustible',
    row_galones: 'Cargaq galones',
    row_precio: 'Litruyuq price',
    row_subtotal: 'Subtotal',
    row_descuento: 'Socio rebaja (5%)',
    row_total: 'HUNTAN PAGAY',
    row_modalidad: 'Ushay',
    row_estado: 'Estadu',
    estado_pagado: '✅ Pagerqa',
    estado_cobrado: '✅ Qillqay pi qatipasqa',
    estado_pendiente: '⏳ Pagan nin',
    miembro_tag: '★ Socio',
    ticket_foot: 'Primaxta akllasqaykiman gracias · Allin riykita munayku 🛣️',
    btn_comprobante: '🧾 Ticket churay',
    btn_finalizar: 'Tukuchiy ↺',

    admin_step: '🔒 YAYKUY HUKNIN',
    admin_title: 'Seguridad / Admin Panel',
    lbl_usuario: 'Usuario',
    lbl_contrasena: 'Contraseña',
    btn_ingresar: 'Yaykuy',

    dash_step: '🛡️ KUNAN RIKUWAN',
    dash_title: 'Dashboard',
    btn_logout: 'Maqutay',
    metric_ventas: "Kunan p'un ventan",
    metric_trans: 'Transacciones',
    metric_galones: 'Vendidosq galones',
    tbl_title: 'Qipa transacciones',
    th_hora: 'Hora',
    th_placa: 'Plaka',
    th_fuel: 'Combustible',
    th_monto: 'Monto',
    th_estado: 'Estadu',
    alerts_title: '🚨 Seguridad alertas',
    volver_inicio: '← Qallanman kutiy',
    badge_pagado: 'Pagado',
    badge_pendiente: 'Pendiente',




    status_listo: '● Sistema listo',
    footer_surtidor: 'Surtidor 03 · Precios S/ impueston kan',
    btn_entendido: 'Ari',
    comp_title: 'Digital ticket',
    comp_descargar: '⬇ .txt kichay',
    comp_cerrar: 'Harkay',

    err_monto: 'Qolqe mana allinchu. S/ {min} - S/ {max} churay.',
    err_placa_vacia: 'Carroyki plakata churay.',
    err_placa_formato: 'Mana allinchu. ABC-123 hina churay.',
    err_codigo: 'Primax cliente codigota churay.',
    err_admin: 'Credenciales mana allinchu.',
    modal_pago_t: 'Pago allichasqa',
    modal_pago_m: 'Kunan cargayta qallariy. Surtidor 03 listo.',
    modal_sincarga_t: 'Manan cargasqa',
    modal_sincarga_m: 'Aman cargaqchu.',
    modal_cierre_t: 'Sesión tukusqa',

    voz_bienvenida: 'Allin hamusqayki Primax. Ama hina kaspa, combustiblekita akllay.',
    voz_seleccion: '{fuel} akllarqanki. Kunan pagaykita akllay.',
    voz_postpago: 'Qipan paga akllarqanki. Qatiy ñitiy.',

    // Qipan paga: plaka + sociota
    voz_post_codigo_malo: 'Chay sociota codigo manaraq kanchu.',
    voz_mem_codigo: 'Sociota llector: codigo rikuwasqa {codigo}.',
    voz_mem_texto: 'Sociota llector: {nombre}, codigo {codigo}, plaka {plaka}.',
    voz_post_no_coincide: 'Plaka manaraq sociotawan tinkichkanchu.',
    voz_post_rechazo: 'Plakaykita y sociotaykita yachay, utaq huk ushanta akllay.',
    voz_post_ok: 'Sociota {codigo} allichasqa {plaka} plataman.',
    voz_post_listo: 'Yachay tukusqa. Cargayta qallariy.',

    voz_monto_post: 'Churayta qachayninta qolqeta akllay utaq tankita huntichuy.',
    voz_tanque_lleno: 'Tinki tanki akllasqa. {galones} galonupi sayan.',
    voz_tanque_listo: 'Tinki tanki tukusqa. {galones} galones cargachkan.',
    voz_post_carga_lista: 'Carga tukusqa. Qatipayta ruwachkan.',

    voz_cobrando: 'Carga tukusqa. Saldo Primax Primepi qillqarichkan.',
    voz_cobrado: 'Saldo Primax Primepi {monto} qatipasqa.',
    voz_monto_invalido: "Qolqe mana allinchu. Ch'unka huktan, pichqa ch'unka pakchikman.",
    voz_monto_ok: 'Qolqe tokusqa: {monto} soles. Kunan carroyki plakata churay.',
    voz_ingrese_placa: 'Ama hina kaspa, carroyki plakata churay.',
    voz_placa_invalida: 'Plaka mana allinchu. A B C 1 2 3 hina.',
    voz_camara: 'Cámara: plaka rikuwasqa {placa}. Rikuy chaymanta qatiy.',
    voz_proc_pre: 'Pagota ruwachkan. Suwita suyay.',
    voz_autorizado: 'Pago allichasqa. Kunan cargayta qallariy.',
    voz_galones: '{n} galones ñan cargan.',
    voz_detenida: 'Carga sayasqa. Ticket digital ruwachkan.',
    voz_prepago_listo: 'Ñawpaqta qolqe tukusqa. Ticket digital ruwachkan.',
    voz_gracias: 'Primaxta akllasqaykiman gracias. Allin riykita munayku.',
    voz_sesion: 'Sesión tukusqa. Allin hamusqayki Primax.',
    voz_admin: 'Yaykuy allichasqa. Allin hamusqayki, administrador.',
    voz_datos_boleta: 'DNIykihta y carroyki plakata churay.',
    voz_datos_factura: 'RUCykihta, razón socialta y carroyki plakata churay.',
    voz_datos_ok: 'Willayki allin. Kunan pagay payta akllay.',
    voz_metodo_sel: '{metodo} akllarqanki.',
    voz_nfc: 'Sin contacto pagay. Tarjetaykita llaqtaman apachiy.',
    voz_nfc_ok: 'Tarjetayta riqsisqa. Pagota ruwachkan.',
    voz_pago_qr_ok: 'Billetera virtual pagay chaychasqa. Ruwachkan.',
    voz_efectivo: 'Qolqeykita billete utaq moneda nisqawan churay.',
    voz_ef_incompleto: 'Qolqe mana allin. Qelqayta churay.',
    voz_ef_exacto: 'Qolqe chaychasqa. Mana qutuy.',
    voz_vuelto: 'Qutuy: {monto}.',
    voz_vuelto_ok: '{monto} qutuy qatasqa. Pagota ruwachkan.',
    voz_ef_ok: 'Qolqe chaychasqa. Qutuy {cambio}. Pagota ruwachkan.',
    voz_ticket: '{doc} ruwachasqa. Primaxta akllasqaykiman gracias.',
    voz_help_llamando: 'Runay yanapata waqachkan. Suwita suyay.',
    voz_help_cancelada: 'Wichay saqisqa. Kikinanchikpaq kachkanchik.',
    voz_help_llegada: 'Yanapaq chayam. Surtidormanta kikilla.',

    c_titulo: 'PRIMAX - TICKET',
    c_subtitulo: 'FuelFlow - Kiosco 01',
    c_fecha: 'Fecha',
    c_doc: 'Comprobante',
    c_docnum: 'DNI/RUC',
    c_metodo: 'Ushay',
    c_placa: 'Plaka',
    c_combustible: 'Combustible',
    c_galones: 'Galones',
    c_precio: 'Precio/gal',
    c_subtotal: 'Subtotal',
    c_descuento: 'Rebaja 5%',
    c_total: 'TOTAL',
    c_modalidad: 'Ushay',
    c_estado: 'Estadu',
    c_pagado: 'PAGERQA',
    c_cobrado: 'QATIPAQ SALDO PRIMEPI',
    c_pendiente: 'PAGAN NIN',
    c_gracias: 'Primaxta akllasqaykiman gracias.',
  },
};

/** Traduce una clave; acepta parámetros {clave: valor} para plantillas. */
function t(clave, params) {
  const pack = I18N[state.idioma] || I18N.es;
  let texto = pack[clave] || I18N.es[clave] || clave;
  if (params) {
    Object.keys(params).forEach((k) => { texto = texto.split('{' + k + '}').join(params[k]); });
  }
  return texto;
}

/**
 * Aplica el idioma a toda la página:
 *  - [data-i18n]      → contenido (admite etiquetas <em>, <b>)
 *  - [data-i18n-ph]   → placeholder
 *  - [data-i18n-title]→ title
 *  - [data-i18n-aria] → aria-label
 */
function setIdioma(lang, hablarSaludo = false) {
  if (!I18N[lang]) lang = 'es';
  state.idioma = lang;
  document.documentElement.lang = lang;

  document.querySelectorAll('[data-i18n]').forEach((el) => { el.innerHTML = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });

  // Idioma elegido se resalta en el selector
  document.querySelectorAll('.lang-opt').forEach((b) =>
    b.classList.toggle('selected-lang', b.dataset.lang === lang));

  try { localStorage.setItem(LS_IDIOMA, lang); } catch (e) { /* sin storage */ }

  refrescarTextosDinamicos();   // textos que se generan por JS
  refrescarAdmin();             // tabla, métricas y alertas

  if (hablarSaludo) hablar(t('voz_bienvenida'));
}

/** Actualiza los textos creados dinámicamente al cambiar de idioma. */
function refrescarTextosDinamicos() {
  // Estado de la barra inferior (mismo criterio que mostrarPantalla)
  const activa = document.querySelector('.screen.active');
  const h2 = activa ? activa.querySelector('h2') : null;
  actualizarEstado(h2 ? '📍 ' + h2.textContent : t('status_listo'));

  // Línea del asistente de voz
  if (!mascotaEstado.hablando) {
    $('voice-status-text').textContent = state.vozActivada ? t('voice_ready') : t('voice_muted');
  }

  // Mini resúmenes
  if (state.combustible) {
    $('resumen-fuel-mini').textContent = `${state.combustible.nombre} · S/ ${state.combustible.precio}`;
    $('mini-fuel').textContent = `${state.combustible.nombre} (S/ ${state.combustible.precio.toFixed(2)})`;
    $('mini-modalidad').textContent = state.modalidad || '—';
    $('mini-monto').textContent = state.modalidad === 'PREPAGO'
      ? 'S/ ' + state.montoPrepago.toFixed(2) : t('mini_post');

    // Pantalla de despacho (solo si ya se está cargando)
    if (state.despachoTimer) {
      $('despacho-titulo').textContent = t('despacho_title', { fuel: state.combustible.nombre });
      pintarInfoDespacho();
    }
  }

  // Estado del ticket
  if (state.combustible && activa && activa.id === 'pantalla-resumen') {
    const esPost = state.modalidad === 'POSTPAGO';
    $('t-estado').textContent = esPost ? t('estado_cobrado') : t('estado_pagado');
    $('t-modalidad').textContent = state.modalidad +
      (esPost
        ? (state.tanqueLleno ? ` (${t('tanque_lleno')})` : ` (S/ ${state.montoPostpago.toFixed(2)})`)
        : ` (S/ ${state.montoPrepago.toFixed(2)})`);
  }
}

/* ============================================================================
 * 2. UTILIDADES
 * ========================================================================== */
const $ = (id) => document.getElementById(id);

// Muestra una pantalla y oculta las demás (transición fade vía CSS)
function mostrarPantalla(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const h2 = $(id).querySelector('h2');
  actualizarEstado('📍 ' + (h2 ? h2.textContent : t('status_listo')));
}

function actualizarEstado(texto) { $('status-state').textContent = '● ' + texto.replace(/^●\s*/, ''); }

// Modal personalizado (NO se usa alert nativo)
let modalCallback = null;
function mostrarModal(titulo, mensaje, icono = 'ℹ️', callback = null) {
  $('modal-title').textContent = titulo;
  $('modal-msg').textContent = mensaje;
  $('modal-icon').textContent = icono;
  $('modal-overlay').classList.remove('hidden');
  modalCallback = callback;
}
function cerrarModal() {
  $('modal-overlay').classList.add('hidden');
  if (typeof modalCallback === 'function') { const cb = modalCallback; modalCallback = null; cb(); }
}

/* ============================================================================
 * 3. ASISTENTE VIRTUAL — 4 imágenes animadas
 *     m-ac: ojos ABiertos  boca Cerrada  → reposo
 *     m-aa: ojos ABiertos  boca ABierta  → hablando
 *     m-cc: ojos CErrados  boca Cerrada  → parpadeo en reposo
 *     m-ca: ojos CErrados  boca ABierta  → parpadeo mientras habla
 * ========================================================================== */
const mascotaEstado = { boca: false, ojos: false, hablando: false, timerHabla: null, ultimoTexto: '' };
const FRAMES_MASCOTA = ['m-aa', 'm-ac', 'm-ca', 'm-cc'];

// Muestra solo la imagen que corresponde al estado actual (ojos × boca)
function pintarMascota() {
  const clave = (mascotaEstado.ojos ? 'c' : 'a') + (mascotaEstado.boca ? 'a' : 'c');
  FRAMES_MASCOTA.forEach((fid) => {
    const img = $(fid);
    if (img) img.style.opacity = (fid === 'm-' + clave) ? '1' : '0';
  });
}

// Activa/desactiva la animación de boca (bucle de 180 ms por paso)
function mascotaHablando(activa) {
  mascotaEstado.hablando = activa;
  clearInterval(mascotaEstado.timerHabla);
  if (activa) {
    mascotaEstado.boca = true;
    mascotaEstado.timerHabla = setInterval(() => {
      mascotaEstado.boca = !mascotaEstado.boca;  // abre y cierra la boca
      pintarMascota();
    }, 180);
  } else {
    mascotaEstado.boca = false;
  }
  pintarMascota();
  const caja = $('mascota');
  if (caja) caja.classList.toggle('hablando', activa);  // brillo al hablar
}

// Parpadeo independiente (aprox. 1 parpadeo cada 4.5 s)
function iniciarParpadeoMascota() {
  setInterval(() => {
    if (mascotaEstado.ojos) return;
    mascotaEstado.ojos = true; pintarMascota();
    setTimeout(() => { mascotaEstado.ojos = false; pintarMascota(); }, 170);
  }, 4500);
}

// Al tocar la mascota se repite la última frase del asistente
function repetirFraseMascota() {
  if (mascotaEstado.ultimoTexto) hablar(mascotaEstado.ultimoTexto);
}

/* ============================================================================
 * 4. ASISTENTE DE VOZ (SpeechSynthesis API)
 * ========================================================================== */
// Elige la voz más natural disponible para el idioma pedido
function vozIdeal(codigo) {
  if (!('speechSynthesis' in window)) return null;
  const preferidas = ['natural', 'neural', 'google', 'samantha', 'monica', 'jorge', 'helena', 'sabina', 'diego', 'paulina'];
  let voces = [];
  try { voces = window.speechSynthesis.getVoices() || []; } catch (e) { return null; }
  const base = (codigo || '').slice(0, 2).toLowerCase();
  let cands = voces.filter((v) => v.lang && v.lang.toLowerCase().indexOf(base) === 0);
  // Quechua: si no hay voz 'qu', se usa una voz española (fallback)
  if (!cands.length && base === 'qu') cands = voces.filter((v) => v.lang && v.lang.toLowerCase().indexOf('es') === 0);
  if (!cands.length) return null;
  for (const p of preferidas) {
    const hallada = cands.find((v) => v.name.toLowerCase().indexOf(p) !== -1);
    if (hallada) return hallada;
  }
  return cands.find((v) => v.localService) || cands[0];
}

let timerSeguridadVoz = null;
let hablaToken = 0;   // identificador de la frase activa (evita que el
                      // onend de una frase cancelada apague la animación)

function hablar(texto) {
  mascotaEstado.ultimoTexto = texto;
  // Actualiza la línea visible siempre, aunque no haya audio
  $('voice-status-text').textContent = '🎙️ ' + texto.slice(0, 60) + (texto.length > 60 ? '…' : '');
  if (!state.vozActivada) return;
  try {
    if (!('speechSynthesis' in window)) return; // sin soporte: solo texto
    const token = ++hablaToken;
    window.speechSynthesis.cancel();   // cancela la frase anterior (su onend se ignora por token)

    const u = new SpeechSynthesisUtterance(texto);
    const codigo = CODIGO_IDIOMA[state.idioma] || 'es-PE';
    const voz = vozIdeal(codigo);
    if (voz && voz.lang) { u.voice = voz; u.lang = voz.lang; }
    else { u.lang = (state.idioma === 'qu') ? 'es-PE' : codigo; }  // fallback quechua → español
    u.rate = 0.95;   // un poco más pausado, menos robótico
    u.pitch = 1.1;   // tono más cálido y amigable

    // Boca sincronizada con los eventos del audio (solo si sigue siendo la frase activa)
    u.onstart = () => { if (token === hablaToken) mascotaHablando(true); };
    u.onend = () => { if (token === hablaToken) mascotaHablando(false); };
    u.onerror = () => { if (token === hablaToken) mascotaHablando(false); };

    mascotaHablando(true);          // respaldo si onstart no dispara
    window.speechSynthesis.speak(u);

    // Red de seguridad por si onend nunca llega
    clearTimeout(timerSeguridadVoz);
    timerSeguridadVoz = setTimeout(() => { if (token === hablaToken) mascotaHablando(false); }, 15000);
  } catch (e) {
    mascotaHablando(false);         // voz no disponible: se continúa sin audio
  }
}

// ---------- Reloj del footer ----------
function iniciarReloj() {
  const tick = () => {
    $('status-clock').textContent = new Date().toLocaleTimeString(LOCALE_IDIOMA[state.idioma] || 'es-PE');
  };
  tick(); setInterval(tick, 1000);
}

/* ============================================================================
 * 5. PERSISTENCIA (localStorage)
 * ========================================================================== */
function leerTransacciones() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      localStorage.setItem(LS_KEY, JSON.stringify([]));
      return [];
    }
    return JSON.parse(raw).map(row => row.id ? {...row, estado:paymentState(row).label} : row);
  } catch (e) { return []; }
}
function guardarTransaccion(tx) {
  const lista = leerTransacciones();
  const previous = tx.id ? lista.findIndex(row=>row.id===tx.id) : -1;
  if(previous >= 0) lista.splice(previous,1);
  lista.unshift(tx);
  try { localStorage.setItem(LS_KEY, JSON.stringify(lista)); } catch (e) {}
}

/* ============================================================================
 * 6. FLUJO DEL CLIENTE
 * ========================================================================== */
async function iniciar() {
  try {
    const pending=transactionsService.current();
    if(pending?.intervention || (!pending?.payload && pending?.authorizationRequest)){
      Object.assign(state,pending.snapshot||{});
      state.autorizacionId = pending.authorization?.authorization?.id || state.autorizacionId;
      requerirIntervencion(Error(pending.intervention || 'Operación interrumpida antes del cierre; revisar autorización y consumo.'));
      return;
    }
    if(pending?.payload){
      // Antes de reenviar nada, se consulta el estado real en el backend. Una
      // reserva ya liquidada hace que el reenvío siempre fuera 409 y el terminal
      // quedara atrapado en "compra pendiente" para siempre.
      const check=await transactionsService.reconcile();
      if(check.action==='blocked'){mostrarModal('Operación conservada',check.reason,'⚠️');return;}
      if(check.action==='discard'){
        // Solo se descarta esta operación obsoleta; el resto del
        // almacenamiento local (idioma, historial de ejemplo) se conserva.
        transactionsService.discard();
        limpiarEstadoOperacion();
        mostrarModal('Operación descartada',check.reason+' Ya puede iniciar una nueva compra.','ℹ️',
          ()=>{void iniciar();});
        return;
      }
      if(check.action==='recovered'){
        Object.assign(state,pending.snapshot||{});
        backendResult=check.result;
        state.codigoCliente=backendResult.transaction.membership?.number||state.codigoCliente;
        state.esMiembro=Boolean(state.codigoCliente);
        marcarEstadoOperacion(paymentState(backendResult.transaction).paid ? 'COBRADO' : 'PAYMENT_PENDING');
        mostrarModal('Compra recuperada','El backend ya había registrado esta compra. Se recuperó el comprobante sin cobrar de nuevo.','✅',()=>pintarResumen());
        return;
      }
      Object.assign(state,pending.snapshot);await mostrarResumen();return;
    }
    limpiarEstadoOperacion();
    const [fuels,stations]=await Promise.all([catalogService.fuels(),catalogService.stations()]);
    const station=stations.find(s=>s.code==='PRIMAX-SUR'&&s.active);
    if(!station)throw Error('La estación no está disponible.');
    catalog={fuels,station};transactionsService.begin();
    document.querySelectorAll('.fuel-card').forEach(card=>{const fuel=fuels.find(f=>f.name===card.dataset.fuel&&f.active);card.disabled=!fuel;if(fuel){card.dataset.price=fuel.pricePerGallon;const price=card.querySelector('.price');if(price)price.firstChild.textContent='S/ '+Number(fuel.pricePerGallon).toFixed(2)+' ';}});
  }catch(error){mostrarModal('No pudimos iniciar',error.message,'⚠️');return;}
  hablar(t('voz_bienvenida'));
  mostrarPantalla('pantalla-combustible');
}

function seleccionarCombustible(nombre, precio, tarjeta) {
  const fuel=catalog?.fuels.find(f=>f.name===nombre&&f.active);if(!fuel)return;
  precio=fuel.pricePerGallon;
  document.querySelectorAll('.fuel-card').forEach((c) => c.classList.remove('selected'));
  tarjeta.classList.add('selected');
  state.combustible = { id: fuel.id, nombre, precio: parseFloat(precio) };
  $('resumen-fuel-mini').textContent = `${nombre} · S/ ${precio}`;
  hablar(t('voz_seleccion', { fuel: nombre }));
  // Pequeña pausa para que el usuario vea el resaltado antes de avanzar
  setTimeout(() => mostrarPantalla('pantalla-pago'), 900);
}

function elegirModalidad(modo) {
  state.modalidad = modo;
  $('btn-prepago').classList.toggle('selected', modo === 'PREPAGO');
  $('btn-postpago').classList.toggle('selected', modo === 'POSTPAGO');
  const esPre = modo === 'PREPAGO';
  $('prepago-panel').classList.toggle('hidden', !esPre);
  $('btn-postpago-continuar').classList.toggle('hidden', esPre);
  if (!esPre) hablar(t('voz_postpago'));
}

function actualizarMontoDisplay() {
  const n = parseFloat(state.montoTexto || '0');
  $('monto-display').textContent = 'S/ ' + (isNaN(n) ? 0 : n).toFixed(2);
}

// Teclado numérico virtual
function teclaPresionada(key) {
  $('monto-error').classList.add('hidden');
  if (key === 'C') { state.montoTexto = ''; }
  else if (key === '←') { state.montoTexto = state.montoTexto.slice(0, -1); }
  else if (/^[0-9]$/.test(key)) {
    if (state.montoTexto.replace('.', '').length >= 5) return; // evita montos absurdos
    state.montoTexto += key;
  }
  actualizarMontoDisplay();
}

function validarYConfirmarMonto() {
  const monto = parseFloat(state.montoTexto || '0');
  const err = $('monto-error');
  if (!monto || isNaN(monto) || monto < MONTO_MIN || monto > MONTO_MAX) {
    err.textContent = t('err_monto', { min: MONTO_MIN, max: MONTO_MAX });
    err.classList.remove('hidden');
    hablar(t('voz_monto_invalido'));
    return;
  }
  state.montoPrepago = Math.round(monto * 100) / 100;
  hablar(t('voz_monto_ok', { monto: state.montoPrepago }));
  irAComprobante();
}

// ---------- Prepago: tipo de comprobante ----------
function irAComprobante() {
  // Reinicia los datos del comprobante por si se vuelve atrás
  state.tipoComprobante = null;
  $('resumen-doc-mini').textContent = '—';
  ponerPaso('step-comprobante', 3);
  document.querySelectorAll('#btn-boleta, #btn-factura').forEach((b) => b.classList.remove('selected'));
  mostrarPantalla('pantalla-comprobante');
  hablar(t('voz_doc'));
}

function elegirComprobante(tipo) {
  state.tipoComprobante = tipo;
  $('btn-boleta').classList.toggle('selected', tipo === 'BOLETA');
  $('btn-factura').classList.toggle('selected', tipo === 'FACTURA');
  $('resumen-doc-mini').textContent = tipo === 'BOLETA' ? t('doc_boleta') : t('doc_factura');
  irADatos();   // irADatos() ya anuncia la frase del documento elegido
}

// ---------- Autocompletado del postpago ----------
// Boleta  → se rellenan PLACA y DNI (el DNI viene del padrón de membresías).
// Factura → se rellena SOLO la PLACA; el RUC y la razón social quedan libres.
function autocompletarPostpago() {
  const esFactura = state.tipoComprobante === 'FACTURA';
  const socio = state.membresiaVerificada || {};

  // La placa siempre: ya se verificó junto con la membresía
  $('prep-input-placa').value = state.placa || '';
  marcarAuto('prep-input-placa', 'flag-placa', true);

  // El DNI solo en boleta
  const dni = esFactura ? '' : (socio.dni || '');
  $('input-dni').value = dni;
  $('input-dni').readOnly = false;
  marcarAuto('input-dni', 'flag-dni', !esFactura && dni !== '');

  // RUC y razón social: se limpian y quedan libres
  $('input-ruc').value = socio.ruc || '';
  $('input-razon').value = socio.businessName || '';

  // Avisos en pantalla
  $('post-datos-auto').textContent = 'Datos del perfil Primax Prime. Verifica o completa tu comprobante.';
  $('post-datos-auto').classList.remove('hidden');
  $('post-razon-libre').classList.toggle('hidden', !esFactura);
}

/** Marca (o desmarca) un campo como rellenado por el sistema. */
function marcarAuto(inputId, flagId, activo) {
  $(inputId).classList.toggle('auto-ok', activo);
  $(flagId).classList.toggle('hidden', !activo);
}

/** Quita las marcas de autocompletado (al volver al prepago o reiniciar). */
function limpiarAuto() {
  ['prep-input-placa', 'input-dni'].forEach((id) => $(id).classList.remove('auto-ok'));
  ['flag-placa', 'flag-dni', 'post-datos-auto', 'post-razon-libre']
    .forEach((id) => $(id).classList.add('hidden'));
  $('input-dni').readOnly = false;
  $('input-dni').value = '';
}

function irADatos() {
  const esFactura = state.tipoComprobante === 'FACTURA';
  const esPost = state.modalidad === 'POSTPAGO';
  $('panel-dni').classList.toggle('hidden', esFactura);
  $('panel-ruc').classList.toggle('hidden', !esFactura);
  $('prep-mini-doc').textContent = esFactura ? t('doc_factura') : t('doc_boleta');
  $('prep-mini-fuel').textContent = state.combustible
    ? `${state.combustible.nombre} (S/ ${state.combustible.precio.toFixed(2)})` : '—';
  $('prep-mini-monto').textContent = esPost
    ? (state.tanqueLleno ? t('tanque_lleno') : 'S/ ' + state.montoPostpago.toFixed(2))
    : 'S/ ' + state.montoPrepago.toFixed(2);
  ['dni-error', 'ruc-error', 'razon-error', 'prep-placa-error'].forEach((id) =>
    $(id).classList.add('hidden'));

  if (esPost || state.membresiaVerificada) autocompletarPostpago(); else limpiarAuto();

  ponerPaso('step-datos', 4);
  mostrarPantalla('pantalla-datos');
  // En postpago el DNI/placa ya vienen cargados: no se vuelven a pedir
  if (esPost) hablar(esFactura ? t('voz_auto_factura', { placa: state.placa || '—' })
                              : t('voz_auto_boleta', { dni: $('input-dni').value }));
  else hablar(esFactura ? t('voz_datos_factura') : t('voz_datos_boleta'));
}

function irAIdentificacion() {
  // Rellena el mini resumen antes de mostrar
  $('mini-fuel').textContent = state.combustible ? `${state.combustible.nombre} (S/ ${state.combustible.precio.toFixed(2)})` : '—';
  $('mini-modalidad').textContent = state.modalidad || '—';
  $('mini-monto').textContent = state.modalidad === 'PREPAGO' ? 'S/ ' + state.montoPrepago.toFixed(2) : t('mini_post');
  mostrarPantalla('pantalla-identificacion');
  hablar(t('voz_ingrese_placa'));
}

// ---------- Identificación / membresía ----------
function normalizarPlaca(v) { return v.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function placaValida(v) {
  const p = normalizarPlaca(v);
  return /^[A-Z]{3}[0-9]{3}$/.test(p) || /^[A-Z0-9]{6}$/.test(p); // ABC-123 o ABC123
}
function formatearPlaca(v) {
  const p = normalizarPlaca(v);
  return p.length === 6 ? p.slice(0, 3) + '-' + p.slice(3) : p;
}

function continuarIdentificacion() {
  const placaRaw = $('input-placa').value;
  const errP = $('placa-error');
  if (!placaRaw.trim()) {
    errP.textContent = t('err_placa_vacia');
    errP.classList.remove('hidden'); return;
  }
  if (!placaValida(placaRaw)) {
    errP.textContent = t('err_placa_formato');
    errP.classList.remove('hidden');
    hablar(t('voz_placa_invalida'));
    return;
  }
  errP.classList.add('hidden');
  state.placa = formatearPlaca(placaRaw);
  state.esMiembro = $('check-membresia').checked;

  if (state.esMiembro) {
    const cod = $('input-codigo').value.trim();
    const errC = $('codigo-error');
    if (!cod) {
      errC.textContent = t('err_codigo');
      errC.classList.remove('hidden'); return;
    }
    errC.classList.add('hidden');
    state.codigoCliente = cod.toUpperCase();
  } else { state.codigoCliente = ''; }

  procesarPago();
}

// Simula la cámara ANPR rellenando una placa.
// ids: { input, cam } → permite reutilizarlo en los otros pasos.
// placas: lista opcional de la que se sortea (si no, cualquier placa al azar).
function simularCamara(ids = { input: 'input-placa', cam: 'cam-plate' }) {
  if (!ids.input) ids = { input: 'input-placa', cam: 'cam-plate' };
  if (state.modalidad !== 'POSTPAGO') return;
  openPlateCamera(async result => {
    $(ids.input).value = result.plate; $(ids.cam).textContent = result.plate;
    if (result.vehicle) applyVehicle(result.vehicle);
  });
}

function applyVehicle(vehicle) {
  state.placa = vehicle.plate;
  const m = vehicle.membership;
  state.membresiaVerificada = m ? { ...m, codigo: m.number, placa: vehicle.plate } : null;
  if (m) {
    state.codigoCliente = m.number;
    $('post-input-codigo').value = m.number;
    $('input-dni').value = m.dni || '';
    $('input-ruc').value = m.ruc || '';
    $('input-razon').value = m.businessName || '';
    $('post-membresia-ok').textContent = m.number + ' / ' + m.name + ' / Saldo disponible: S/ ' + m.balance + ' / Saldo pendiente: S/ ' + m.pendingBalance;
    $('post-membresia-ok').classList.remove('hidden');
  }
}

// ---------- Procesamiento de pago (solo prepago) ----------
// El postpago no pasa por aquí: el saldo ya se descontó al reservar.
let paymentInFlight = false;
async function procesarPago() {
  if (paymentInFlight || state.pagoAutorizado || state.estadoOperacion === 'INTERVENTION_REQUIRED') return;
  paymentInFlight = true;
  mostrarPantalla('pantalla-procesamiento');
  $('proc-titulo').textContent = 'Validando pago DEMO en Backend';
  try {
    await ejecutarReserva(state.montoPrepago);
    state.pagoAutorizado = true;
    mostrarModal(t('modal_pago_t'), t('modal_pago_m'), '✅', simularDespacho);
  } catch (error) {
    state.pagoAutorizado = false;
    mostrarModal('Pago no autorizado', error.message + ' Reintenta con la misma operación.', '⚠️', () => void procesarPago());
  } finally { paymentInFlight = false; }
}

// ---------- Aviso de consumo postpago (solo postpago) ----------
// El descuento del saldo ya ocurrió al reservar y se liquida al confirmar.
// Este módulo solo informa el importe consumido antes de emitir el ticket.
function mostrarConsumoPostpago() {
  mostrarPantalla('pantalla-procesamiento');
  $('proc-titulo').innerHTML = t('cobro_titulo');
  $('proc-pista').innerHTML = t('cobro_pista');
  actualizarEstado(t('cobro_titulo'));
  hablar(t('voz_cobrando'));
  setTimeout(() => {
    const monto = 'S/ ' + state.total.toFixed(2);
    hablar(t('voz_cobrado', { monto }));
    mostrarModal(t('modal_cobro_t'), t('modal_cobro_m', { monto }), '🛢️', mostrarResumen);
  }, 2200);
}

// ---------- Simulación de despacho ----------
/**
 * Tope del abastecimiento en SOLES, no en galones.
 *
 * El tope anterior se calculaba en galones (monto / precio) y el surtidor lo
 * redondeaba a 2 decimales: 50.00 / 23.50 = 2.1276 gal -> 2.13 gal -> S/ 50.06,
 * seis céntimos por encima de lo autorizado. El backend rechazaba la compra con
 * "el consumo supera el importe reservado" y el usuario veía perpetually
 * "compra pendiente".
 *
 * Ahora el corte se hace sobre el importe: el surtidor nunca pasa del monto
 * reservado, que es el contrato con el backend.
 */
function topeImporte() {
  if (state.modalidad === 'PREPAGO') return state.montoPrepago;
  if (state.tanqueLleno) {
    const lleno = Math.round(TANQUE_GALONES * state.combustible.precio * 100) / 100;
    // Nunca por encima de lo que el backend autorizó y reservó.
    return state.montoReservado > 0 ? state.montoReservado : lleno;
  }
  return state.montoReservado > 0 ? state.montoReservado : state.montoPostpago;
}

function pintarInfoDespacho() {
  if (state.modalidad === 'PREPAGO') {
    $('despacho-info').textContent = t('info_prepago', { monto: state.montoPrepago.toFixed(2) });
  } else if (state.tanqueLleno) {
    $('despacho-info').textContent = t('info_tanque', { galones: TANQUE_GALONES });
  } else {
    $('despacho-info').textContent = t('info_postpago', { monto: state.montoPostpago.toFixed(2) });
  }
}

function simularDespacho() {
  if (!state.autorizacionId || state.estadoOperacion !== 'AUTORIZADO' || (state.modalidad === 'PREPAGO' && !state.pagoAutorizado)) return;
  progressInFlight = Promise.resolve();
  // Reinicia contadores
  state.galones = 0; state.total = 0; state.ultimoAnuncioGalones = 0;
  state.ultimoAvanceEnviado = 0; state.detencionManual = false;
  $('precio-count').textContent = 'S/ ' + state.combustible.precio.toFixed(2);
  $('despacho-titulo').textContent = t('despacho_title', { fuel: state.combustible.nombre });
  const esPre = state.modalidad === 'PREPAGO';
  $('meta-prepago').classList.toggle('hidden', !esPre);
  if (esPre) $('meta-monto').textContent = 'S/ ' + state.montoPrepago.toFixed(2);
  pintarInfoDespacho();
  mostrarPantalla('pantalla-despacho');
  actualizarEstado(t('step_live'));
  marcarEstadoOperacion('ABASTECIENDO');

  // Tope del abastecimiento en importe: el surtidor nunca pasa del
  // monto reservado, que es el contrato con el backend. Sin esta
  // asignación el tick leería una variable no declarada y el despacho
  // se congelaría en 0.00 mientras el importe interno crece sin límite.
  const tope = topeImporte();

  clearInterval(state.despachoTimer);
  state.despachoTimer = setInterval(() => {
    state.galones = Math.round((state.galones + GALONES_POR_TICK) * 100) / 100;
    state.total = Math.round(state.galones * state.combustible.precio * 100) / 100;

    // El corte es siempre sobre el IMPORTE, nunca sobre los galones: así el
    // redondeo de los galones no puede empujar el total por encima de lo
    // autorizado y provocar el rechazo "consume más de lo reservado".
    if (tope > 0 && state.total >= tope) {
      state.total = tope;
      // Los galones se derivan del importe final para que coincidan con él.
      state.galones = Math.round((state.total / state.combustible.precio) * 1000) / 1000;
      pintarDespacho(esPre);
      detenerDespacho(true);
      return;
    }
    pintarDespacho(esPre);

    // Avance validado por backend; no cobra. Se agrupa para no generar una
    // llamada por cada tick del simulador.
    reportarAvance();

    // Voz cada 5 galones (o al llegar al tope)
    const hito = Math.floor(state.galones / GALONES_AVISO) * GALONES_AVISO;
    if (hito > state.ultimoAnuncioGalones) {
      state.ultimoAnuncioGalones = hito;
      hablar(t('voz_galones', { n: hito }));
    }
  }, TICK_MS);
}

/**
 * Informa el avance del abastecimiento al backend.
 *
 * No mueve saldo ni registra cobro: el dinero ya está reservado. Sirve para
 * que el backend conserve lo despachado si el terminal se reinicia. Los errores
 * detienen la automatización: el último avance validado por Backend es la
 * fuente de verdad del cierre y una discrepancia requiere intervención.
 */
let progressInFlight = Promise.resolve();
function reportarAvance(force = false) {
  if (!state.autorizacionId || state.estadoOperacion === 'INTERVENTION_REQUIRED') return progressInFlight;
  if (!force && state.total - state.ultimoAvanceEnviado < 1) return progressInFlight;
  const amount = state.total.toFixed(2);
  const gallons = (state.total / state.combustible.precio).toFixed(3);
  state.galones = Number(gallons);
  state.ultimoAvanceEnviado = state.total;
  const snapshot = {...state, despachoTimer:null};
  transactionsService.checkpoint(snapshot);
  progressInFlight = progressInFlight.then(async () => {
    if (state.estadoOperacion === 'INTERVENTION_REQUIRED') throw Error('Requiere intervención');
    return authorizationService.progress(state.autorizacionId, amount, gallons);
  });
  progressInFlight.catch(error => requerirIntervencion(error));
  return progressInFlight;
}

function requerirIntervencion(error) {
  clearInterval(state.despachoTimer);
  state.despachoTimer = null;
  marcarEstadoOperacion('INTERVENTION_REQUIRED');
  transactionsService.requireIntervention(error.message, {...state});
  if (state.autorizacionId) authorizationService.intervention(state.autorizacionId).catch(() => {});
  mostrarModal('Requiere intervención del personal', error.message + ' Operación detenida. El estado se conserva; no continúe abasteciendo.', '⚠️');
}

function pintarDespacho(esPre) {
  $('galones-count').textContent = state.galones.toFixed(2) + ' gal';
  $('soles-count').textContent = 'S/ ' + state.total.toFixed(2);
  const ref = topeImporte();
  const pct = ref > 0 ? Math.min(100, (state.total / ref) * 100) : 0;
  $('despacho-bar').style.width = pct + '%';
  $('fuel-level').style.height = pct + '%';
  $('despacho-pct').textContent = Math.floor(pct) + '%';
}

async function detenerDespacho(automatico = false) {
  if (state.estadoOperacion === 'INTERVENTION_REQUIRED') return;
  clearInterval(state.despachoTimer);
  state.despachoTimer = null;
  // El cobro se emite UNA sola vez por consumo final: no se abre la
  // confirmación si la compra ya está confirmándose o ya se confirmó.
  if (state.cobroIniciado) return;
  // Distingue "el cliente pulsó Detener" de "el surtidor llegó al tope".
  // El backend lo registra como MANUAL o AUTO para la auditoría.
  state.detencionManual = !automatico;
  state.motivoFin = automatico ? 'AUTO' : 'MANUAL';
  if (state.galones <= 0) {
    mostrarModal(t('modal_sincarga_t'), t('modal_sincarga_m'), '⚠️');
    // No se consumió nada: la reserva se libera íntegra más adelante.
    state.motivoFin = 'CANCELLED';
    return;
  }
  if (state.modalidad === 'POSTPAGO') {
    hablar(t(state.tanqueLleno ? t('voz_tanque_listo', { galones: state.galones.toFixed(2) }) : t('voz_post_carga_lista')));
  } else {
    hablar(automatico ? t('voz_prepago_listo') : t('voz_detenida'));
  }
  try { await reportarAvance(true); } catch { return; }
  if (state.estadoOperacion === 'INTERVENTION_REQUIRED') return;
  marcarEstadoOperacion('FINALIZADO');
  finDeCarga();
}

/**
 * Muestra el estado de la operación en el pie del terminal.
 *
 * PENDIENTE → AUTORIZADO → ABASTECIENDO → FINALIZADO → COBRADO
 *
 * Solo informa; ninguna regla financial se decide aquí.
 */
function marcarEstadoOperacion(estado) {
  state.estadoOperacion = estado;
  const el = document.getElementById('estado-operacion');
  if (!el) return;
  el.textContent = estado === 'PAYMENT_PENDING' ? 'Pago pendiente' : estado === 'INTERVENTION_REQUIRED' ? 'Requiere intervención' : t('op_' + estado.toLowerCase());
  el.setAttribute('data-estado', estado);
}

/** Tras la carga: postpago pasa por el cobro externo; prepago va al ticket. */
function finDeCarga() {
  if (state.estadoOperacion === 'INTERVENTION_REQUIRED') return;
  if (state.modalidad === 'POSTPAGO') mostrarConsumoPostpago();
  else mostrarResumen();
}

// ---------- Resumen final / ticket ----------
/**
 * Importes de la compra.
 *
 * El importe es siempre el consumo real (state.total), sin descuento de
 * membresía. El descuento del 5% era una simulación que solo existía en el
 * navegador: el backend registraba un importe menor sin conocer la regla, y no
 * podía auditarla. Ahora el backend calcula el importe autoritativo y valida
 * que coincida con gallons × unitPrice.
 *
 * En postpago el importe ya está descontado del saldo Prime desde la reserva;
 * el excedente lo libera el backend al confirmar la compra.
 */
function calcularTotales() {
  const transaction = backendResult?.transaction;
  const total = Number(transaction?.amount ?? state.total);
  const descuento = Number(transaction?.discountAmount ?? 0);
  const subtotal = Number(transaction?.originalAmount ?? total);
  return { subtotal, descuento, total, aplica_descuento: descuento > 0 };
}

async function mostrarResumen() {
  if (state.estadoOperacion === 'INTERVENTION_REQUIRED') return;
  if(submitting)return;
  submitting=true;
  mostrarPantalla('pantalla-procesamiento');
  $('proc-titulo').textContent='Confirmando tu compra';
  $('proc-pista').textContent='Espera un momento…';
  try {
    // El importe enviado es el consumo real. El backend lo contrasta con la
    // reserva y con gallons × unitPrice, y es quien confirma el cobro: el
    // frontend nunca registra un cobro por su cuenta.
    // cobroIniciado bloquea un segundo intento: el backend es idempotente por
    // operationId, pero un doble disparo podría reenviar antes de que exista
    // result y generar dos confirmaciones.
    state.cobroIniciado = true;
    if(!transactionsService.current()?.payload){
      const total=calcularTotales().total;
      transactionsService.prepare({plate:state.placa,stationId:catalog.station.id,fuelId:state.combustible.id,amount:total.toFixed(2),gallons:state.galones.toFixed(3),mode:state.modalidad,paymentMethod:state.modalidad==='POSTPAGO'?'SALDO_PRIME':state.metodoPago,receiptType:state.tipoComprobante,...(state.dni?{receiptDni:state.dni}:{}),...(state.ruc?{receiptRuc:state.ruc}:{}),...(state.razonSocial?{receiptBusinessName:state.razonSocial}:{}),...(state.codigoCliente?{membershipCode:state.codigoCliente}:{}),saveReceiptProfile:Boolean($('save-receipt-profile')?.checked),authorizationId:state.autorizacionId,unitPrice:state.combustible.precio.toFixed(2),outcome:state.motivoFin==='AUTO'?'AUTO':'MANUAL'},
        {dni:state.dni,ruc:state.ruc,razonSocial:state.razonSocial,efectivoEntregado:state.efectivoEntregado,efectivoVuelto:state.efectivoVuelto,combustible:state.combustible,modalidad:state.modalidad,placa:state.placa,total:state.total,galones:state.galones,montoPrepago:state.montoPrepago,montoPostpago:state.montoPostpago,tanqueLleno:state.tanqueLleno,tipoComprobante:state.tipoComprobante,metodoPago:state.modalidad==='POSTPAGO'?'SALDO_PRIME':state.metodoPago,esMiembro:state.esMiembro,codigoCliente:state.codigoCliente,autorizacionId:state.autorizacionId,motivoFin:state.motivoFin});
    }
    backendResult=await transactionsService.submit();
    state.codigoCliente=backendResult.transaction.membership?.number||'';
    state.esMiembro=Boolean(state.codigoCliente);
    marcarEstadoOperacion(paymentState(backendResult.transaction).paid ? 'COBRADO' : 'PAYMENT_PENDING');
  }catch(error){
    // Fallo de red o rechazo del backend: la operación queda pendiente con su
    // mismo operationId, así que reintentar no duplica el cobro. No se marca
    // COBRADO porque el backend aún no lo confirmó.
    await manejarFalloConfirmacion(error);return;
  }
  finally{submitting=false;}
  pintarResumen();
}

/**
 * Resuelve un fallo al confirmar la compra sin entrar en bucle.
 *
 * Si la autorización sigue abierta, reintentar es correcto. Si el backend ya
 * la liquidó o liberó, reintentar produciría el mismo 409 indefinidamente:
 * en ese caso se reconcilia con el backend y se ofrece empezar de nuevo.
 */
async function manejarFalloConfirmacion(error) {
  if (error.status === 400) { requerirIntervencion(error); return; }
  const cerrada=/liquidada o liberada|autorización.*no encontrada|no encontrada/i.test(error.message||'');
  if(!cerrada){
    // Fallo de red o validación: la operación sigue pendiente con su mismo
    // operationId, así que reintentar no duplica el cobro.
    mostrarModal('Compra pendiente de confirmación',error.message+' Pulsa Entendido para reintentar.','⚠️',()=>void mostrarResumen());
    return;
  }
  const check=await transactionsService.reconcile().catch(()=>({action:'retry'}));
  if(check.action==='recovered'){
    backendResult=check.result;
    state.codigoCliente=backendResult.transaction.membership?.number||state.codigoCliente;
    state.esMiembro=Boolean(state.codigoCliente);
    marcarEstadoOperacion(paymentState(backendResult.transaction).paid ? 'COBRADO' : 'PAYMENT_PENDING');
    mostrarModal('Compra recuperada','Esta compra ya estaba registrada. Se recuperó el comprobante sin cobrar de nuevo.','✅',()=>pintarResumen());
    return;
  }
  if(check.action !== 'discard'){mostrarModal('Operación conservada',check.reason || 'Reintenta la consulta de estado.','⚠️');return;}
  transactionsService.discard();
  limpiarEstadoOperacion();
  mostrarModal('Operación descartada',
    'La reserva de saldo se cerró sin confirmar la compra. Puede iniciar una nueva operación.','ℹ️',
    ()=>{state.modalidad=null;document.querySelectorAll('#btn-prepago, #btn-postpago').forEach(b=>b.classList.remove('selected'));mostrarPantalla('pantalla-pago');});
}

/** Pinta el ticket con el resultado que ya existe en backendResult. */
function pintarResumen(){
  state.total = Number(backendResult.transaction.amount);
  if(backendResult.transaction.gallons != null) state.galones = Number(backendResult.transaction.gallons);
  if(backendResult.transaction.unitPrice != null) state.combustible.precio = Number(backendResult.transaction.unitPrice);
  const { subtotal, descuento, total, aplica_descuento: aplicaDescuento } = calcularTotales();
  const esFactura = state.tipoComprobante === 'FACTURA';
  $('t-placa').textContent = state.placa + ' · ' + (backendResult.transaction.membership?.name || 'No afiliado');
  $('t-doc').textContent = esFactura ? t('doc_factura_full') : t('doc_boleta_full');
  $('t-docnum').textContent = esFactura
    ? (state.ruc || state.razonSocial
        ? `RUC ${state.ruc || '—'} · ${state.razonSocial}`
        : t('doc_sin_ruc'))
    : `DNI ${state.dni || '—'}`;
  $('t-fuel').textContent = state.combustible.nombre;
  $('t-galones').textContent = state.galones.toFixed(2) + ' gal';
  $('t-precio').textContent = 'S/ ' + state.combustible.precio.toFixed(2);
  $('t-subtotal').textContent = 'S/ ' + subtotal.toFixed(2);
  // Descuento confirmado por PostgreSQL en ambas modalidades.
  $('row-descuento').classList.toggle('hidden', !aplicaDescuento);
  $('t-descuento').textContent = '- S/ ' + descuento.toFixed(2);
  $('t-total').textContent = 'S/ ' + backendResult.transaction.amount;
  $('t-modalidad').textContent = state.modalidad +
    (state.modalidad === 'PREPAGO' ? ` (S/ ${state.montoPrepago.toFixed(2)})`
      : (state.tanqueLleno ? ` (${t('tanque_lleno')})` : ` (S/ ${state.montoPostpago.toFixed(2)})`));
  $('t-estado').textContent = paymentState(backendResult.transaction).label + ' · +' + backendResult.pointsEarned + ' puntos' + (state.codigoCliente ? ' · ' + state.codigoCliente : '');

  // Conserva el estado financiero confirmado; una deuda nunca se etiqueta pagada.
  const hora = new Date().toLocaleTimeString(LOCALE_IDIOMA[state.idioma] || 'es-PE', { hour: '2-digit', minute: '2-digit' });
  guardarTransaccion({
    id: backendResult.transaction.id, hora, placa: state.placa, combustible: state.combustible.nombre,
    monto: Number(backendResult.transaction.amount), estado: paymentState(backendResult.transaction).label,
    status:backendResult.transaction.status,payment:backendResult.transaction.payment,debt:backendResult.transaction.debt,
  });
  refrescarAdmin(); // mantiene el dashboard al día

  mostrarPantalla('pantalla-resumen');
  hablar(t('voz_ticket', { doc: esFactura ? t('doc_factura') : t('doc_boleta') }));
  actualizarEstado(t('resumen_title'));
}


// Comprobante: vista previa + descarga .txt real (funciona con file://)
function generarComprobante() {
  const { subtotal, descuento, total, aplica_descuento: aplicaDescuento } = calcularTotales();
  const fecha = new Date(backendResult.transaction.createdAt).toLocaleString(LOCALE_IDIOMA[state.idioma] || 'es-PE');
  const esPost = state.modalidad === 'POSTPAGO';
  const texto =
`========================================
         ${t('c_titulo')}
     ${t('c_subtitulo')}
========================================
${t('c_fecha')} : ${fecha}
Referencia: ${backendResult.transaction.id}
Puntos: +${backendResult.pointsEarned}
${t('c_doc')}   : ${state.tipoComprobante === 'FACTURA' ? t('doc_factura_full') : t('doc_boleta_full')}
${t('c_docnum')} : ${state.tipoComprobante === 'FACTURA'
        ? (state.ruc || state.razonSocial ? `RUC ${state.ruc} · ${state.razonSocial}` : t('doc_sin_ruc'))
        : `DNI ${state.dni}`}
${t('c_placa')} : ${state.placa}${state.esMiembro ? ' (' + state.codigoCliente + ')' : ''}
${t('c_combustible')} : ${state.combustible.nombre}
${t('c_galones')}      : ${state.galones.toFixed(2)} gal
${t('c_precio')}    : S/ ${state.combustible.precio.toFixed(2)}
----------------------------------------
${t('c_subtotal')}    : S/ ${subtotal.toFixed(2)}${aplicaDescuento ? `\n${t('c_descuento')}  : - S/ ${descuento.toFixed(2)}` : ''}
${t('c_total')}       : S/ ${total.toFixed(2)}
${t('c_modalidad')}   : ${state.modalidad}
${t('c_metodo')}     : ${state.metodoPago || '—'}${state.metodoPago === 'EFECTIVO'
        ? `\n${t('c_ef_entregado')}  : S/ ${(state.efectivoEntregado || 0).toFixed(2)}`
          + `\n${t('c_ef_vuelto')}    : S/ ${(state.efectivoVuelto || 0).toFixed(2)}`
        : ''}
${t('c_estado')}   : ${paymentState(backendResult.transaction).label}
========================================
  ${t('c_gracias')}
========================================`;
  $('comprobante-text').textContent = texto;
  $('ticket-overlay').classList.remove('hidden');
}
function descargarTxt() {
  const blob = new Blob([$('comprobante-text').textContent], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `primax_${state.placa}_${Date.now()}.txt`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Reinicia toda la aplicación al estado inicial
function finalizar() {
  $('save-receipt-profile').checked = false;
  try{transactionsService.finish();backendResult=null;}catch(error){mostrarModal('Compra pendiente',error.message,'⚠️');return;}
  clearInterval(state.despachoTimer);
  detenerProgresoAyuda();
  $('help-overlay').classList.add('hidden');
  Object.assign(state, {
    combustible: null, modalidad: null, montoPrepago: 0, montoTexto: '',
    placa: '', esMiembro: false, codigoCliente: '', galones: 0, total: 0,
    ultimoAnuncioGalones: 0, pagoAutorizado: false, despachoTimer: null,
    tipoComprobante: null, dni: '', ruc: '', razonSocial: '',
    metodoPago: null, efectivoIngresado: 0, efectivoPila: [],
    efectivoEntregado: 0, efectivoVuelto: 0,
    montoPostpago: 0, montoPostpagoTexto: '', tanqueLleno: false, membresiaVerificada: null,
    autorizacionId: null, montoReservado: 0,
  });
  // Limpia formularios y selecciones
  document.querySelectorAll('.fuel-card,.pay-card').forEach((c) => c.classList.remove('selected'));
  document.querySelectorAll('#prepago-panel .chip, #pantalla-monto-post .chip')
    .forEach((c) => c.classList.remove('selected'));
  ['input-placa', 'input-codigo', 'admin-user', 'admin-pass',
   'input-dni', 'input-ruc', 'input-razon', 'prep-input-placa']
    .forEach((id) => { $(id).value = ''; });
  $('check-membresia').checked = false;
  $('membresia-panel').classList.add('hidden');
  $('panel-dni').classList.remove('hidden');
  ['panel-ruc', 'panel-qr', 'panel-nfc', 'panel-efectivo', 'ef-ok']
    .forEach((id) => $(id).classList.add('hidden'));
  ['dni-error', 'ruc-error', 'razon-error', 'prep-placa-error', 'ef-error']
    .forEach((id) => $(id).classList.add('hidden'));
  ['t-doc', 't-docnum'].forEach((id) => { $(id).textContent = '—'; });
  actualizarEfectivo();
  $('ef-ok').classList.add('hidden');   // con montoPrepago = 0 el saldo da 0; se oculta a mano
  $('membresia-panel').classList.add('hidden');
  limpiarAuto();
  limpiarPostpago();
  $('prepago-panel').classList.add('hidden');
  $('btn-postpago-continuar').classList.add('hidden');
  actualizarMontoDisplay();
  mostrarPantalla('pantalla-inicio');
  hablar(t('voz_sesion'));
  actualizarEstado(t('status_listo'));
}

/* ============================================================================
 * 6a. POSTPAGO: placa + membresía vinculada → monto (o tanque lleno)
 *              → comprobante → datos → reserva de saldo → abastecimiento → consumo
 * ========================================================================== */

/** Número de paso visible según el modo (prepago 5 pasos, postpago 4). */
function ponerPaso(id, num) {
  $(id).textContent = t('paso_n', { n: num, total: state.modalidad === 'POSTPAGO' ? 4 : 5 });
}

// ---------- Paso 1: placa + membresía ----------
function irAPlacaPostpago() {
  limpiarPostpago();
  mostrarPantalla('pantalla-placa');
  hablar(t('voz_post_id'));
}

/**
 * Limpia el estado de la operación en memoria.
 *
 * No toca localStorage: quien lo hace es transactionsService, y solo cuando la
 * operación local está realmente obsoleta. Así se conserva el resto del
 * almacenamiento (idioma, historial de ejemplo).
 */
function limpiarEstadoOperacion() {
  clearInterval(state.despachoTimer);
  state.despachoTimer = null;
  Object.assign(state, {
    galones: 0, total: 0, ultimoAnuncioGalones: 0, ultimoAvanceEnviado: 0,
    autorizacionId: null, montoReservado: 0, detencionManual: false,
    motivoFin: null, estadoOperacion: 'PENDIENTE', montoPostpago: 0,
    cobroIniciado: false,
    montoPostpagoTexto: '', tanqueLleno: false, membresiaVerificada: null,
    codigoCliente: '', esMiembro: false,
  });
  backendResult = null;
  marcarEstadoOperacion('PENDIENTE');
}

/** Limpia todo lo del postpago (al entrar, al rechazar o al reiniciar). */
function limpiarPostpago() {
  state.montoPostpago = 0;
  state.montoPostpagoTexto = '';
  state.tanqueLleno = false;
  state.membresiaVerificada = null;
  ['post-input-placa', 'post-input-codigo'].forEach((id) => { $(id).value = ''; });
  ['post-placa-error', 'post-codigo-error', 'monto-post-error'].forEach((id) => $(id).classList.add('hidden'));
  $('post-membresia-ok').classList.add('hidden');
  $('post-mem-codigo').textContent = '—';
  $('btn-tanque-lleno').classList.remove('selected');
  document.querySelectorAll('#pantalla-monto-post .chip').forEach((c) => c.classList.remove('selected'));
  actualizarMontoPost();
}

/**
 * Simula el lector de membresías: rellena el código del padrón para poder
 * completar la demostración. El backend valida la correspondencia placa↔código
 * antes de reservar saldo, así que un código incorrecto aquí no habilita el
 * postpago.
 */
async function simularMembresia() {
  try{const vehicle=await catalogService.vehicle(formatearPlaca($('post-input-placa').value));if(!vehicle.membership)throw Error('El vehículo no tiene membresía.');$('post-input-codigo').value=vehicle.membership.number;}catch(error){mostrarModal('Membresía',error.message,'⚠️');}
}
let plateCheckOperation;
async function verificarMembresiaPostpago() {
  try {
    const placa=formatearPlaca($('post-input-placa').value);
    if(!placaValida(placa))throw Error('Ingresa una placa válida.');
    const codigo=$('post-input-codigo').value.trim().toUpperCase();
    if(!codigo)throw Error('Ingresa tu código de membresía Primax Prime.');
    // El backend valida la correspondencia entre placa y código. La consulta al
    // padrón solo orienta al operador; no sustituye la validación autoritativa.
    let vehicle;
    try { vehicle=await catalogService.vehicle(placa); }
    catch(error) { if(error.status!==404) throw error; }
    if (!vehicle?.membership || vehicle.membership.number!==codigo) {
      plateCheckOperation ||= crypto.randomUUID();
      await apiClient('/admin/check-plate', {method:'POST', body:{plate:placa, membershipCode:codigo, operationId:plateCheckOperation}});
    }
    if(!vehicle) throw Error('Vehículo no encontrado');
    if(!vehicle.membership)throw Error('El vehículo no está asociado a una membresía Primax Prime.');
    if(vehicle.membership.status!=='ACTIVE')throw Error('Tu membresía no está activa.');
    if(vehicle.membership.number!==codigo)throw Error('La placa y la membresía activa deben coincidir.');
    state.placa=placa;state.codigoCliente=codigo;state.esMiembro=true;state.membresiaVerificada={...vehicle.membership,codigo,placa};
    plateCheckOperation=null; $('post-codigo-error').classList.add('hidden');irAMontoPostpago();
  }catch(error){$('post-codigo-error').textContent=error.message;$('post-codigo-error').classList.remove('hidden');}
}

/** Mismatch: avisa y devuelve al usuario a elegir la modalidad. */
function rechazarPostpago(motivo) {
  mostrarModal(t('modal_post_err_t'), motivo, '⚠️', () => {
    limpiarPostpago();
    state.modalidad = null;
    document.querySelectorAll('#btn-prepago, #btn-postpago').forEach((b) => b.classList.remove('selected'));
    mostrarPantalla('pantalla-pago');
    hablar(t('voz_post_rechazo'));
  });
}

// ---------- Paso 2: monto o tanque lleno ----------
function irAMontoPostpago() {
  $('monto-post-id').textContent = customerIdentity(state.placa, state.membresiaVerificada);
  actualizarMontoPost();
  mostrarPantalla('pantalla-monto-post');
  hablar(t('voz_monto_post'));
}

function actualizarMontoPost() {
  const n = parseFloat(state.montoPostpagoTexto || '0');
  $('monto-post-display').textContent = 'S/ ' + (isNaN(n) ? 0 : n).toFixed(2);
}

function teclaPostpago(key) {
  $('monto-post-error').classList.add('hidden');
  if (key === 'C') { state.montoPostpagoTexto = ''; }
  else if (key === '←') { state.montoPostpagoTexto = state.montoPostpagoTexto.slice(0, -1); }
  else if (key === '.' && !state.montoPostpagoTexto.includes('.')) { state.montoPostpagoTexto = (state.montoPostpagoTexto || '0') + '.'; }
  else if (/^[0-9]$/.test(key)) {
    if (state.montoPostpagoTexto.includes('.') && state.montoPostpagoTexto.split('.')[1].length >= 2) return;
    if (state.montoPostpagoTexto.replace('.', '').length >= 5) return;
    state.montoPostpagoTexto += key;
  }
  // Si se teclea a mano, se desmarca el preset y tanque lleno
  $('btn-tanque-lleno').classList.remove('selected');
  document.querySelectorAll('#pantalla-monto-post .chip').forEach((c) => c.classList.remove('selected'));
  actualizarMontoPost();
}

function elegirTanqueLleno() {
  state.tanqueLleno = !state.tanqueLleno;
  state.montoPostpago = 0;
  state.montoPostpagoTexto = '';
  $('btn-tanque-lleno').classList.toggle('selected', state.tanqueLleno);
  document.querySelectorAll('#pantalla-monto-post .chip').forEach((c) => c.classList.remove('selected'));
  $('monto-post-error').classList.add('hidden');
  actualizarMontoPost();
  hablar(state.tanqueLleno ? t('voz_tanque_lleno', { galones: TANQUE_GALONES }) : t('voz_monto_post'));
}

function confirmarMontoPostpago() {
  if (state.tanqueLleno) { hablar(t('voz_post_listo')); irAComprobante(); return; }
  const monto = parseFloat(state.montoPostpagoTexto || '0');
  const err = $('monto-post-error');
  if (!monto || isNaN(monto) || monto < MONTO_MIN || monto > MONTO_MAX) {
    err.textContent = t('err_monto', { min: MONTO_MIN, max: MONTO_MAX });
    err.classList.remove('hidden');
    hablar(t('voz_monto_invalido'));
    return;
  }
  state.montoPostpago = Math.round(monto * 100) / 100;
  state.tanqueLleno = false;
  hablar(t('voz_monto_ok', { monto: state.montoPostpago }));
  irAComprobante();
}

/* ============================================================================
 * 6b. PREPAGO: TIPO DE COMPROBANTE → DATOS → MÉTODO DE PAGO
 *     Solo aplica al flujo PREPAGO; el POSTPAGO sigue igual.
 * ========================================================================== */

// ---------- Validadores de documento ----------
function dniValido(v) { return /^[0-9]{8}$/.test(v.trim()); }
function rucValido(v) { return /^[0-9]{11}$/.test(v.trim()); }

// ---------- Confirma DNI/RUC + placa ----------
async function continuarDatos() {
  if (state.reserving) return;
  state.reserving = true;
  try { return await continuarDatosOnce(); } finally { state.reserving = false; }
}
async function continuarDatosOnce() {
  const err = (id, texto) => { $(id).textContent = texto; $(id).classList.remove('hidden'); };
  const ok = (id) => $(id).classList.add('hidden');
  const esPost = state.modalidad === 'POSTPAGO';
  let valido = true;

  // Documento según el tipo de comprobante elegido.
  // En postpago el DNI/placa ya vienen del padrón y el RUC es opcional.
  if (state.tipoComprobante === 'FACTURA') {
    const ruc = $('input-ruc').value.trim();
    const razon = $('input-razon').value.trim();
    if (ruc && !rucValido(ruc)) { err('ruc-error', t('err_ruc')); valido = false; } else ok('ruc-error');
    if (esPost && !razon) ok('razon-error');          // en postpago puede quedar en blanco
    else if (!razon) { err('razon-error', t('err_razon')); valido = false; } else ok('razon-error');
    state.ruc = esPost && !ruc ? '' : ruc;
    state.razonSocial = razon;
  } else {
    const dni = $('input-dni').value.trim();
    if (!dniValido(dni)) { err('dni-error', t('err_dni')); valido = false; } else ok('dni-error');
    state.dni = dni;
  }

  // Placa del vehículo
  const placaRaw = $('prep-input-placa').value;
  if (!placaRaw.trim()) { err('prep-placa-error', t('err_placa_vacia')); valido = false; }
  else if (!placaValida(placaRaw)) {
    err('prep-placa-error', t('err_placa_formato')); valido = false;
    hablar(t('voz_placa_invalida'));
  }
  else ok('prep-placa-error');

  // Membresía: solo aplica en postpago, donde ya fue verificada por placa
  if (esPost) {
    state.esMiembro = true;
    state.codigoCliente = (state.membresiaVerificada || {}).codigo || '';
  } else {
    state.esMiembro = false;
    state.codigoCliente = '';
  }

  if (!valido) return;

  state.placa = formatearPlaca(placaRaw);
  try{const vehicle=await catalogService.vehicle(state.placa); state.membresiaVerificada=vehicle.membership; if(vehicle.membership) { state.codigoCliente=vehicle.membership.number; state.esMiembro=true; }}catch(error){if(esPost || error.status !== 404){err('prep-placa-error',error.message);return;} state.membresiaVerificada=null;}

  if (esPost) {
    // Antes de abastecer hay que comprometer saldo: el backend valida placa,
    // código, membresía activa y disponibilidad, y descuenta el importe
    // autorizado. Si no alcanza, el postpago se detiene aquí.
    const reservado = await reservarSaldoPostpago();
    if (!reservado) return;
    hablar(t('voz_post_listo'));
    simularDespacho();
    return;
  }
  hablar(t('voz_datos_ok'));
  irAMetodoPago();
}

/**
 * Pide al backend reservar el importe previsto en el saldo Primax Prime.
 * El saldo se descuenta antes del abastecimiento y el excedente se libera al
 * confirmar la compra. Ante saldo insuficiente se detiene el postpago.
 */
async function reservarSaldoPostpago() {
  const precio = state.combustible.precio;
  let monto;
  if (state.tanqueLleno) {
    // Tanque lleno: pide lo que costaría llenar el tanque, pero el backend
    // puede autorizar menos si el saldo no alcanza. Ante "saldo insuficiente"
    // se reintenta con el saldo disponible, que es el máximo seguro.
    monto = Math.round(TANQUE_GALONES * precio * 100) / 100;
  } else {
    monto = state.montoPostpago;
  }
  if (!monto || monto <= 0) {
    mostrarModal('Postpago', 'Indica un monto o elige tanque lleno.', '⚠️');
    return false;
  }
  marcarEstadoOperacion('PENDIENTE');
  mostrarPantalla('pantalla-procesamiento');
  $('proc-titulo').innerHTML = t('reserva_titulo');
  $('proc-pista').innerHTML = t('reserva_pista');
  try {
    return await ejecutarReserva(monto);
  } catch (error) {
    if (['INSUFFICIENT_BALANCE', 'DEBT_LIMIT'].includes(error.details?.code)) {
      const action = await insufficientBalance(error.details, allowDebt => ejecutarReserva(monto, allowDebt));
      if (action === 'authorized') return true;
      mostrarPantalla('pantalla-datos');
      return false;
    }
    // El backend es la única autoridad sobre el saldo. Si dice que no alcanza,
    // se pide de nuevo por el importe disponible, que es el tope seguro.
    if (state.tanqueLleno && /saldo insuficiente/i.test(error.message)) {
      const disponible = /Disponible: S\/\s*([\d.]+)/.exec(error.message)?.[1];
      if (disponible && Number(disponible) > 0) {
        mostrarModal('Saldo insuficiente en Primax Prime',
          'Recargue su saldo para continuar. Hay S/ ' + disponible +
            ' disponibles; el surtidor se ajustará a ese importe máximo.', '⚠️',
          () => { void reservarSaldoPostpago(); });
        return false;
      }
    }
    if (/saldo insuficiente/i.test(error.message)) {
      mostrarModal('Saldo insuficiente en Primax Prime',
        'Recargue su saldo para continuar.', '⚠️', () => {
          state.modalidad = null;
          document.querySelectorAll('#btn-prepago, #btn-postpago').forEach((b) => b.classList.remove('selected'));
          mostrarPantalla('pantalla-pago');
        });
      return false;
    }
    mostrarModal('No pudimos autorizar el saldo', error.message, '⚠️', () => {
      state.modalidad = null;
      document.querySelectorAll('#btn-prepago, #btn-postpago').forEach((b) => b.classList.remove('selected'));
      mostrarPantalla('pantalla-pago');
    });
    return false;
  }
}

/** Pide la reserva al backend y refleja el estado AUTORIZADO. */
async function ejecutarReserva(monto, allowDebt = false) {
  const body = {
    mode: state.modalidad,
    ...(state.modalidad === 'PREPAGO' ? {paymentMethod:state.metodoPago} : {}),
    unitPrice:state.combustible.precio.toFixed(2),
    allowDebt,
    plate: state.placa,
    amount: monto.toFixed(2),
    ...(state.codigoCliente ? {membershipCode: state.codigoCliente} : {}),
    stationId: catalog.station.id,
    fuelId: state.combustible.id,
    receiptType: state.tipoComprobante || 'BOLETA',
  };
  const result = await transactionsService.authorize(body, {...state, despachoTimer:null});
  state.autorizacionId = result.authorization.id;
  state.montoReservado = Number(result.authorization.authorizedAmount);
  state.combustible.precio = Number(result.authorization.unitPrice);
  state.codigoCliente = result.membershipNumber || state.codigoCliente;
  transactionsService.checkpoint({...state, despachoTimer:null});
  marcarEstadoOperacion('AUTORIZADO');
  return true;
}

// ---------- Pantalla de método de pago ----------
function irAMetodoPago() {
  // El postpago nunca pasa por aquí: su saldo se reservó antes de abastecer.
  if (state.modalidad === 'POSTPAGO') { mostrarResumen(); return; }
  state.metodoPago = null;
  state.efectivoIngresado = 0;
  state.efectivoPila = [];
  $('metodo-monto').textContent = 'S/ ' + state.montoPrepago.toFixed(2);
  document.querySelectorAll('[data-metodo]').forEach((b) => b.classList.remove('selected'));
  ['panel-qr', 'panel-nfc', 'panel-efectivo'].forEach((id) => $(id).classList.add('hidden'));
  pintarEfectivo();
  mostrarPantalla('pantalla-metodo');
  // No se habla aquí: continuarDatos() ya anunció "ahora seleccione su método de pago"
}

function elegirMetodoPago(metodo) {
  state.metodoPago = metodo;
  document.querySelectorAll('[data-metodo]').forEach((b) =>
    b.classList.toggle('selected', b.dataset.metodo === metodo));
  ['panel-qr', 'panel-nfc', 'panel-efectivo'].forEach((id) => $(id).classList.add('hidden'));
  $('btn-nfc-tap').disabled = false;

  if (metodo === 'YAPE' || metodo === 'PLIN') {
    $('panel-qr').classList.remove('hidden');
    $('qr-titulo').textContent = metodo === 'YAPE' ? t('m_yape') : t('m_plin');
    $('qr-msg').textContent = t('qr_msg', {
      app: metodo === 'YAPE' ? 'Yape' : 'Plin',
      monto: state.montoPrepago.toFixed(2),
    });
    void crearOrdenQR(metodo);
    hablar(t('voz_metodo_sel', { metodo }));
  } else if (metodo === 'TARJETA') {
    $('panel-nfc').classList.remove('hidden');
    $('nfc-zone').classList.remove('tap');
    $('nfc-msg').textContent = t('nfc_hint');
    hablar(t('voz_nfc'));
  } else {
    $('panel-efectivo').classList.remove('hidden');
    hablar(t('voz_efectivo'));
  }
}

/** Vuelve a la lista de métodos dejando el panel abierto cerrado. */
function volverAMetodos() {
  state.metodoPago = null;
  ['panel-qr', 'panel-nfc', 'panel-efectivo'].forEach((id) => $(id).classList.add('hidden'));
  $('btn-nfc-tap').disabled = false;
  document.querySelectorAll('[data-metodo]').forEach((b) => b.classList.remove('selected'));
}

// ---------- Yape / Plin: QR ----------
/** Dibuja un QR decorativo (21x21 con 3 patrones de localización) según una semilla. */
async function confirmarPagoQR() {
  if (!state.onlineOrderId) { $('qr-msg').textContent='Primero genera la orden de pago.'; return; }
  try { const order=await apiClient('/online-orders/'+state.onlineOrderId);
    if(order.status==='CAPTURED') { await procesarPago(); }
    else $('qr-msg').textContent='Pago pendiente de confirmaci?n del proveedor.';
  } catch(error) { $('qr-msg').textContent=error.message; }
}

// ---------- Tarjeta: contactless NFC ----------
function confirmarPagoNFC() {
  if ($('btn-nfc-tap').disabled) return;   // evitacobrar dos veces por doble toque
  $('btn-nfc-tap').disabled = true;
  const zona = $('nfc-zone');
  zona.classList.add('tap');
  $('nfc-msg').textContent = t('nfc_ok');
  hablar(t('voz_nfc_ok'));
  setTimeout(procesarPago, 900);
}

// ---------- Efectivo: billetes, monedas y vuelto ----------
function soles(n) { return 'S/ ' + n.toFixed(2); }

// Denominaciones con las que el cajero devuelve el vuelto
const DENOM_VUELTO = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1];

/** Descompone el vuelto en billetes y monedas (greedy). */
function descomponerVuelto(monto) {
  let resto = Math.round(monto * 100) / 100;
  const partes = [];
  DENOM_VUELTO.forEach((d) => {
    const cant = Math.floor((resto + 1e-9) / d);
    if (cant > 0) {
      partes.push({ valor: d, cant });
      resto = Math.round((resto - cant * d) * 100) / 100;
    }
  });
  return partes;
}

/** Pinta el vuelto y lo "entrega"; después sigue con el proceso de pago. */
function devolverVuelto(cambio) {
  const partes = descomponerVuelto(cambio);
  $('ef-error').classList.add('hidden');
  $('ef-vuelto').classList.remove('hidden');
  $('ef-vuelto-monto').textContent = soles(cambio);
  $('ef-vuelto-nota').textContent = t('ef_vuelto_entregando');

  const det = $('ef-vuelto-detalle');
  det.innerHTML = '';
  partes.forEach((p) => {
    const b = document.createElement('span');
    b.className = 'vuelto-item';
    b.textContent = p.cant > 1 ? `${soles(p.valor)} × ${p.cant}` : soles(p.valor);
    det.appendChild(b);
  });
  if (!partes.length) det.textContent = t('ef_vuelto_exacto');

  // Bloquea el cajero mientras se entrega el vuelto
  ['btn-ef-retirar', 'btn-ef-confirmar'].forEach((id) => {
    $(id).disabled = true;
    $(id).classList.add('btn-disabled');
  });
  hablar(t('voz_vuelto', { monto: soles(cambio) }));

  setTimeout(() => {
    $('ef-vuelto-nota').textContent = t('ef_vuelto_ok');
    hablar(t('voz_vuelto_ok', { monto: soles(cambio) }));
    setTimeout(procesarPago, 900);
  }, 2200);
}

function pintarEfectivo() {
  // Botones de billetes y monedas (se generan una sola vez)
  const mk = (contenedor, lista, etiqueta) => {
    if (contenedor.childElementCount) return;
    lista.forEach((v) => {
      const b = document.createElement('button');
      b.className = 'chip chip-dinero';
      b.type = 'button';
      b.dataset.valor = v;
      b.textContent = etiqueta(v);
      b.addEventListener('click', () => insertarEfectivo(v));
      contenedor.appendChild(b);
    });
  };
  mk($('ef-billetes'), BILLETES, (v) => soles(v));
  mk($('ef-monedas'), MONEDAS, (v) => soles(v));
  actualizarEfectivo();
}

function insertarEfectivo(valor) {
  state.efectivoPila.push(valor);
  state.efectivoIngresado = Math.round((state.efectivoIngresado + valor) * 100) / 100;
  $('ef-error').classList.add('hidden');
  actualizarEfectivo();
}

/** "Devolver" saca el último billete o moneda insertado. */
function retirarEfectivo() {
  const ultimo = state.efectivoPila.pop();
  if (ultimo === undefined) return;
  state.efectivoIngresado = Math.max(0, Math.round((state.efectivoIngresado - ultimo) * 100) / 100);
  actualizarEfectivo();
}

function actualizarEfectivo() {
  // Cada vez que se vuelve a elegir el método, el vuelto se reinicia
  $('ef-vuelto').classList.add('hidden');
  $('ef-vuelto-detalle').innerHTML = '';
  ['btn-ef-retirar', 'btn-ef-confirmar'].forEach((id) => {
    $(id).disabled = false;
    $(id).classList.remove('btn-disabled');
  });
  const falta = Math.max(0, Math.round((state.montoPrepago - state.efectivoIngresado) * 100) / 100);
  $('ef-total').textContent = soles(state.efectivoIngresado);
  $('ef-faltante').textContent = soles(falta);
  $('ef-ok').classList.toggle('hidden', falta > 0);
  $('btn-ef-retirar').disabled = state.efectivoPila.length === 0;
  $('btn-ef-confirmar').disabled = falta > 0;
  $('btn-ef-confirmar').classList.toggle('btn-disabled', falta > 0);
}

function confirmarPagoEfectivo() {
  const falta = Math.max(0, Math.round((state.montoPrepago - state.efectivoIngresado) * 100) / 100);
  if (falta > 0) {
    $('ef-error').textContent = t('err_ef_incompleto', { falta: soles(falta) });
    $('ef-error').classList.remove('hidden');
    hablar(t('voz_ef_incompleto'));
    return;
  }
  // Si se entregó más de lo Due, se devuelve el vuelto antes de seguir
  const cambio = Math.round((state.efectivoIngresado - state.montoPrepago) * 100) / 100;
  state.efectivoVuelto = cambio;
  state.efectivoEntregado = state.efectivoIngresado;
  if (cambio > 0) { devolverVuelto(cambio); return; }
  state.efectivoVuelto = 0;
  hablar(t('voz_ef_exacto'));
  procesarPago();
}

/* ============================================================================
 * 7. PANEL ADMIN
 * ========================================================================== */
async function abrirAdmin() {
  mostrarPantalla('pantalla-admin');
  $('admin-login').classList.toggle('hidden', state.adminAutenticado);
  $('admin-dash').classList.toggle('hidden', !state.adminAutenticado);
  const hint=$('admin-demo-hint'); hint.classList.add('hidden'); hint.textContent='';
  try {
    const demo=await adminService.demo();
    if(demo.enabled) { hint.textContent=`Cuenta de demostración · Usuario: ${demo.username} · Contraseña: ${demo.password}`; hint.classList.remove('hidden'); }
  } catch { /* Login remains usable if the optional hint is unavailable. */ }
  if(state.adminAutenticado) await refrescarAdmin();
}
async function loginAdmin() {
  const error=$('admin-error'); error.classList.add('hidden');
  try {
    await adminService.login($('admin-user').value, $('admin-pass').value);
    $('admin-pass').value=''; state.adminAutenticado=true;
    $('admin-login').classList.add('hidden'); $('admin-dash').classList.remove('hidden');
    await refrescarAdmin();
  } catch(e) { error.textContent=e.message; error.classList.remove('hidden'); }
}
async function refrescarAdmin() {
  if(!state.adminAutenticado) return;
  const ul=$('lista-alertas');
  try {
    const [alerts, data]=await Promise.all([adminService.alerts(), adminService.dashboard()]);
    $('m-ventas').textContent='S/ '+Number(data.summary._sum.amount||0).toFixed(2);
    $('m-trans').textContent=data.summary._count;
    $('m-galones').textContent=Number(data.summary._sum.gallons||0).toFixed(3)+' gal';
    const tbody=document.querySelector('#tabla-trans tbody'); tbody.replaceChildren();
    for(const tx of data.transactions) {
      const tr=document.createElement('tr');
      for(const value of [new Date(tx.createdAt).toLocaleString(),tx.plate,tx.fuel.name,'S/ '+Number(tx.amount).toFixed(2),tx.status==='PAID'?'Pagado':'Saldo pendiente']) {
        const td=document.createElement('td');td.textContent=value;tr.append(td);
      }
      tbody.append(tr);
    }
    renderAlerts(ul, alerts, async id => {
      try { await adminService.resolve(id); await refrescarAdmin(); }
      catch(e) { mostrarModal('Alertas', e.message, '⚠️'); }
    });
  } catch(e) {
    ul.textContent='No se pudieron consultar las alertas. '+e.message;
    if(e.status===401 || e.status===403) { state.adminAutenticado=false;adminService.logout();$('admin-login').classList.remove('hidden');$('admin-dash').classList.add('hidden'); }
  }
}

/* ============================================================================
 * 8. SELECTOR DE IDIOMA
 * ========================================================================== */
function abrirIdiomas() { $('lang-overlay').classList.remove('hidden'); }
function cerrarIdiomas() { $('lang-overlay').classList.add('hidden'); }

/* ============================================================================
 * 9. ASISTENCIA HUMANA
 *     Botón fijo en la esquina (visible en todas las pantallas). Al pulsarlo
 *     se muestra un cuadro de "cargando" con barra y pasos; al terminar
 *    _avisa que el asistente ya llegó_.
 * ========================================================================== */
const HELP_DURACION_MS = 6000;   // tiempo simulado de llegada del asistente
let helpReloj = null;            // intervalo que dibuja la barra de progreso

/** Detiene el progreso en curso (cancelación o cierre). */
function detenerProgresoAyuda() {
  clearInterval(helpReloj);
  helpReloj = null;
}

/** Pinta la barra y marca cada paso como activo / completado según el avance. */
function pintarProgresoAyuda(pct) {
  $('help-bar').style.width = pct + '%';
  const pasos = document.querySelectorAll('#help-pasos li');
  const salto = 100 / pasos.length;
  pasos.forEach((li, i) => {
    const umbral = salto * (i + 1);
    li.classList.toggle('done', pct >= umbral);
    li.classList.toggle('active', pct >= umbral - salto && pct < umbral);
  });
}

/** El asistente ya está en el surtidor: cambia el cuadro por el aviso de llegada. */
function asistenciaHaLlegado() {
  detenerProgresoAyuda();
  $('help-icon').textContent = '🛎️';
  $('help-title').textContent = t('help_t_llegada');
  $('help-msg').textContent = t('help_m_llegada');
  $('help-estado').textContent = t('help_e_llegada');
  $('help-cargando').classList.add('hidden');
  $('help-bar-wrap').classList.add('hidden');
  $('help-btn-cancelar').classList.add('hidden');
  $('help-btn-cerrar').classList.remove('hidden');
  document.querySelectorAll('#help-pasos li').forEach((li) => {
    li.classList.add('done');
    li.classList.remove('active');
  });
  hablar(t('voz_help_llegada'));
}

/** Abre el cuadro de carga y arranca la cuenta de llegada. */
function abrirAsistencia() {
  if (state.estadoOperacion === 'INTERVENTION_REQUIRED') {
    mostrarModal('Intervención requerida', 'La operación está detenida. Contacta al personal de la estación. Este piloto no notifica ni asigna un operador automáticamente.', '⚠️');
    return;
  }
  detenerProgresoAyuda();
  $('help-overlay').classList.remove('hidden');
  $('help-icon').textContent = '📞';
  $('help-title').textContent = t('help_t_llamando');
  $('help-msg').textContent = t('help_m_llamando');
  $('help-estado').textContent = t('help_e_llamando');
  $('help-cargando').classList.remove('hidden');
  $('help-bar-wrap').classList.remove('hidden');
  $('help-btn-cancelar').classList.remove('hidden');
  $('help-btn-cerrar').classList.add('hidden');
  document.querySelectorAll('#help-pasos li').forEach((li) => {
    li.classList.remove('done', 'active');
  });
  pintarProgresoAyuda(0);
  hablar(t('voz_help_llamando'));

  // Un solo intervalo mueve la barra; al 100 % se dispara la llegada
  const inicio = Date.now();
  helpReloj = setInterval(() => {
    const pct = Math.min(100, ((Date.now() - inicio) / HELP_DURACION_MS) * 100);
    pintarProgresoAyuda(pct);
    if (pct >= 100) asistenciaHaLlegado();
  }, 80);
}

/** El cliente se arrepiente de pedir ayuda. */
function cancelarAsistencia() {
  detenerProgresoAyuda();
  $('help-overlay').classList.add('hidden');
  hablar(t('voz_help_cancelada'));
}

/** Cierra el cuadro ya llegado y vuelve la línea de estado del asistente. */
function cerrarAsistencia() {
  detenerProgresoAyuda();
  $('help-overlay').classList.add('hidden');
  $('voice-status-text').textContent = state.vozActivada ? t('voice_ready') : t('voice_muted');
}

/* ============================================================================
 * 10. REGISTRO DE EVENTOS (wiring)
 * ========================================================================== */
function init() {
  iniciarReloj();
  leerTransacciones(); // siembra datos iniciales
  actualizarMontoDisplay();
  pintarMascota();               // imagen base del asistente
  iniciarParpadeoMascota();      // parpadeo periódico de ojos
  try { if ('speechSynthesis' in window) window.speechSynthesis.getVoices(); } catch (e) {}

  // Idioma guardado (o español por defecto y muestra el selector en el 1er ingreso)
  let idiomaGuardado = null;
  try { idiomaGuardado = localStorage.getItem(LS_IDIOMA); } catch (e) {}
  setIdioma(idiomaGuardado || 'es', false);
  if (!idiomaGuardado) setTimeout(abrirIdiomas, 600);  // primera visita

  // Navegación genérica "Volver"
  document.querySelectorAll('[data-nav]').forEach((b) =>
    b.addEventListener('click', () => mostrarPantalla(b.dataset.nav)));

  // 1. Inicio
  $('btn-iniciar').addEventListener('click', iniciar);

  // 2. Combustible
  document.querySelectorAll('.fuel-card').forEach((card) =>
    card.addEventListener('click', () => seleccionarCombustible(card.dataset.fuel, card.dataset.price, card)));

  // 3. Pago
  $('btn-prepago').addEventListener('click', () => elegirModalidad('PREPAGO'));
  $('btn-postpago').addEventListener('click', () => elegirModalidad('POSTPAGO'));
  $('btn-postpago-continuar').addEventListener('click', () => {
    hablar(t('voz_postpago'));
    irAPlacaPostpago();
  });
  // Teclado y chips del monto PREPAGO (scoped: los .chip-dinero del efectivo
  // y los del postpago comparten la clase .chip y no deben entrar aquí)
  document.querySelectorAll('#prepago-panel .keypad button').forEach((b) =>
    b.addEventListener('click', () => teclaPresionada(b.dataset.key)));
  document.querySelectorAll('#prepago-panel .chip').forEach((c) =>
    c.addEventListener('click', () => {
      document.querySelectorAll('#prepago-panel .chip').forEach((x) => x.classList.remove('selected'));
      c.classList.add('selected');
      if (c.dataset.monto !== 'otro') { state.montoTexto = c.dataset.monto; actualizarMontoDisplay(); }
      else { state.montoTexto = ''; actualizarMontoDisplay(); }
      $('monto-error').classList.add('hidden');
    }));
  $('btn-confirmar-monto').addEventListener('click', validarYConfirmarMonto);

  // 4. Identificación
  $('check-membresia').addEventListener('change', (e) =>
    $('membresia-panel').classList.toggle('hidden', !e.target.checked));
  $('input-placa').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });
  $('btn-simular-camara').addEventListener('click', simularCamara);
  $('btn-continuar-ident').addEventListener('click', continuarIdentificacion);

  // 4a. Postpago: placa + membresía vinculada
  $('post-btn-camara').addEventListener('click', () =>
    simularCamara({ input: 'post-input-placa', cam: 'post-cam-plate' }, MIEMBROS_PARCELAS));
  $('post-btn-mem').addEventListener('click', simularMembresia);
  $('post-input-placa').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });
  $('btn-verificar-post').addEventListener('click', verificarMembresiaPostpago);
  $('post-input-codigo').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
    $('post-codigo-error').classList.add('hidden');
  });

  // 4b. Postpago: monto o tanque lleno
  $('btn-tanque-lleno').addEventListener('click', elegirTanqueLleno);
  document.querySelectorAll('#pantalla-monto-post .chip').forEach((c) =>
    c.addEventListener('click', () => {
      document.querySelectorAll('#pantalla-monto-post .chip').forEach((x) => x.classList.remove('selected'));
      c.classList.add('selected');
      state.tanqueLleno = false;
      $('btn-tanque-lleno').classList.remove('selected');
      state.montoPostpagoTexto = c.dataset.montoPost !== 'otro' ? c.dataset.montoPost : '';
      $('monto-post-error').classList.add('hidden');
      actualizarMontoPost();
    }));
  document.querySelectorAll('#keypad-post button').forEach((b) =>
    b.addEventListener('click', () => teclaPostpago(b.dataset.keyp)));
  $('btn-confirmar-monto-post').addEventListener('click', confirmarMontoPostpago);

  // 4c. Tipo de comprobante (ambos modos)
  $('btn-boleta').addEventListener('click', () => elegirComprobante('BOLETA'));
  $('btn-factura').addEventListener('click', () => elegirComprobante('FACTURA'));

  // 4c. Datos del comprobante (solo prepago)
  $('prep-btn-camara').addEventListener('click', () =>
    simularCamara({ input: 'prep-input-placa', cam: 'prep-cam-plate' }));
  $('prep-input-placa').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });
  $('input-dni').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '');
    $('dni-error').classList.add('hidden');
  });
  $('input-ruc').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '');
    $('ruc-error').classList.add('hidden');
  });
  $('btn-continuar-datos').addEventListener('click', continuarDatos);
  $('prep-input-placa').addEventListener('keydown', (e) => { if (e.key === 'Enter') continuarDatos(); });

  // 4d. Método de pago (solo prepago)
  document.querySelectorAll('[data-metodo]').forEach((b) =>
    b.addEventListener('click', () => elegirMetodoPago(b.dataset.metodo)));
  document.querySelectorAll('.btn-metodo-volver').forEach((b) =>
    b.addEventListener('click', volverAMetodos));
  $('btn-qr-pagado').addEventListener('click', confirmarPagoQR);
  $('btn-nfc-tap').addEventListener('click', confirmarPagoNFC);
  $('btn-ef-retirar').addEventListener('click', retirarEfectivo);
  $('btn-ef-confirmar').addEventListener('click', confirmarPagoEfectivo);

  // 6. Despacho
  $('btn-detener').addEventListener('click', () => detenerDespacho(false));

  // 7. Resumen
  $('btn-comprobante').addEventListener('click', generarComprobante);
  $('btn-descargar-txt').addEventListener('click', descargarTxt);
  $('ticket-close').addEventListener('click', () => $('ticket-overlay').classList.add('hidden'));
  $('btn-finalizar').addEventListener('click', finalizar);

  // 8. Admin
  $('btn-admin-open').addEventListener('click', abrirAdmin);
  $('btn-admin-login').addEventListener('click', loginAdmin);
  $('admin-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') loginAdmin(); });
  $('btn-admin-logout').addEventListener('click', () => {
    state.adminAutenticado = false; adminService.logout();
    $('admin-dash').classList.add('hidden');
    $('admin-login').classList.remove('hidden');
    mostrarPantalla('pantalla-inicio');
  });

  // Voz on/off
  $('btn-voice-toggle').addEventListener('click', () => {
    state.vozActivada = !state.vozActivada;
    if (!state.vozActivada) {
      try { window.speechSynthesis?.cancel(); } catch (e) {}
      mascotaHablando(false);
    }
    $('btn-voice-toggle').textContent = state.vozActivada ? '🔊' : '🔇';
    $('voice-status').classList.toggle('muted', !state.vozActivada);
    $('voice-status-text').textContent = state.vozActivada ? t('voice_ready') : t('voice_muted');
  });

  // Asistencia humana (visible en todas las pantallas)
  $('btn-ayuda').addEventListener('click', abrirAsistencia);
  $('help-btn-cancelar').addEventListener('click', cancelarAsistencia);
  $('help-btn-cerrar').addEventListener('click', cerrarAsistencia);

  // 0. Idioma (botón 🌐 del topbar)
  $('btn-lang').addEventListener('click', abrirIdiomas);
  $('lang-close').addEventListener('click', cerrarIdiomas);
  document.querySelectorAll('.lang-opt').forEach((b) =>
    b.addEventListener('click', () => {
      setIdioma(b.dataset.lang, true);   // cambia textos y la mascota saluda en ese idioma
      cerrarIdiomas();
    }));

  // Mascota: tocarla repite la última frase
  const marco = document.querySelector('.mascota-frame');
  if (marco) {
    marco.style.pointerEvents = 'auto';
    marco.style.cursor = 'pointer';
    marco.addEventListener('click', repetirFraseMascota);
  }

  // Modal
  $('modal-ok').addEventListener('click', cerrarModal);

  // Permite Enter en placa para continuar
  $('input-placa').addEventListener('keydown', (e) => { if (e.key === 'Enter') continuarIdentificacion(); });
}

// Arranque por HTTP; la API se publica a través del proxy.
document.addEventListener('DOMContentLoaded', init);

$('prep-input-placa').addEventListener('change', async () => {
  const plate = formatearPlaca($('prep-input-placa').value);
  try {
    const vehicle = await catalogService.vehicle(plate);
    if (formatearPlaca($('prep-input-placa').value) === plate) applyVehicle(vehicle);
  } catch {
    if (formatearPlaca($('prep-input-placa').value) === plate) state.membresiaVerificada = null;
  }
});

const membershipScan=document.createElement('button');
membershipScan.type='button';membershipScan.className='btn';membershipScan.textContent='Escanear membres?a Primax Prime';
$('post-input-codigo').insertAdjacentElement('afterend',membershipScan);
membershipScan.onclick=()=>{if(state.modalidad==='POSTPAGO')openPlateCamera(async result=>{$('post-input-codigo').value=result.number;},'membership');};

async function crearOrdenQR(method) {
 $('qr-code').replaceChildren();$('btn-qr-pagado').textContent='Consultar estado del proveedor';
 try {
  const pending=transactionsService.begin();
  const authorization={mode:'PREPAGO',paymentMethod:method,unitPrice:state.combustible.precio.toFixed(2),allowDebt:false,plate:state.placa,amount:state.montoPrepago.toFixed(2),...(state.codigoCliente?{membershipCode:state.codigoCliente}:{}),stationId:catalog.station.id,fuelId:state.combustible.id,receiptType:state.tipoComprobante||'BOLETA',operationId:pending.operationId};
  const customer=await paymentCustomer(); if(!customer)return;
  const order=await apiClient('/online-orders',{method:'POST',body:{operationId:pending.operationId,method,authorization,customer}});
  state.onlineOrderId=order.id;
  if(order.qr && new URL(order.qr).protocol==='https:'){const img=document.createElement('img');img.src=order.qr;img.alt='QR del proveedor para '+method;img.style.width='100%';$('qr-code').append(img);}
  $('qr-msg').textContent=order.qr?'Escanea el QR. Esperando confirmaci?n del proveedor.':'Orden pendiente de conciliaci?n con el proveedor.';
 }catch(error){$('qr-msg').textContent=error.message;}
}
function paymentCustomer(){return new Promise(resolve=>{
 const dialog=document.createElement('dialog');dialog.className='v9-dialog';
 dialog.innerHTML='<h2>Datos para el pago</h2><form method="dialog"><label>Nombres<input name="first_name" required maxlength="80"></label><label>Apellidos<input name="last_name" required maxlength="80"></label><label>Correo<input name="email" type="email" required></label><label>Tel?fono<input name="phone_number" required maxlength="20"></label><button>Generar orden</button></form>';
 dialog.querySelector('form').onsubmit=()=>{resolve(Object.fromEntries(new FormData(dialog.querySelector('form'))));dialog.remove();};dialog.oncancel=()=>{resolve(null);dialog.remove();};document.body.append(dialog);dialog.showModal();
});}
setInterval(()=>{if(state.onlineOrderId&&['YAPE','PLIN'].includes(state.metodoPago)&&!state.pagoAutorizado&&!document.hidden)void confirmarPagoQR();},5000);

setInterval(async()=>{
 const result=transactionsService.current?.()?.result;
 if(!result?.transaction?.id||result.transaction.status!=='PAYMENT_PENDING'||document.hidden)return;
 try{const fresh=await apiClient('/transactions/'+result.transaction.id);if(fresh.status==='PAID'){backendResult={...result,transaction:fresh};marcarEstadoOperacion('COBRADO');if($('t-estado'))$('t-estado').textContent=paymentState(fresh).label;actualizarEstado('PAGADO - confirmado por Backend');}}catch{/* retry next cycle */}
},5000);
