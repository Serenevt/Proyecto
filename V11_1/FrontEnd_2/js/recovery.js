import { apiClient } from './services/apiClient.js';
import { escape as e } from './components.js';
let step='request', email='', resetToken='', delivery='', message='';
export function clearRecovery(){step='request';email='';resetToken='';delivery='';message='';}
export function recoveryView(){
  const field=step==='request'?'<label for="reset-email">Correo</label><input id="reset-email" name="email" type="email" autocomplete="email" required maxlength="254">':step==='verify'?'<label for="reset-code">Código de recuperación</label><input id="reset-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" maxlength="8" required>':step==='reset'?'<label for="reset-password">Nueva contraseña</label><input id="reset-password" name="password" type="password" autocomplete="new-password" minlength="10" maxlength="72" required><p class="fine-print">Al menos 10 caracteres, máximo 72 bytes.</p>':'';
  return `<section class="login-screen"><h1>Recuperar contraseña</h1><p role="status">${e(message||'Indica el correo de tu cuenta.')}</p>${delivery==='demo'?'<p class="fine-print">Modo DEMO local: el responsable de la prueba entrega el código del buzón privado. No se envía correo ni SMS real.</p>':''}${delivery==='mailpit'?'<p class="fine-print">Correo local: abre Mailpit en el equipo que ejecuta Docker (puerto 10025). No se entrega a un buzón externo.</p>':''}${delivery==='disabled'?'<p class="fine-print">El envío de recuperación no está configurado en este entorno.</p>':''}${step==='done'?'':`<form id="recovery-form">${field}<p class="form-error" role="alert"></p><button class="primary" type="submit">${step==='request'?'Solicitar código':step==='verify'?'Verificar código':'Guardar contraseña'}</button></form>`}<p class="auth-switch"><a href="#login">Volver a iniciar sesión</a></p></section>`;
}
export async function submitRecovery(form,render){
 const button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;
 const data=new FormData(form);
 try {
  if(step==='request'){
   email=String(data.get('email')).trim().toLowerCase();
   const result=await apiClient('/auth/forgot-password',{method:'POST',body:{email},authenticated:false});
   delivery=result.delivery;message=result.message;step=delivery==='disabled'?'done':'verify';
  }else if(step==='verify'){
   const result=await apiClient('/auth/verify-reset-code',{method:'POST',body:{email,code:data.get('code')},authenticated:false});
   resetToken=result.resetToken;step='reset';message='Define tu nueva contraseña.';
  }else if(step==='reset'){
   const result=await apiClient('/auth/reset-password',{method:'POST',body:{resetToken,password:data.get('password')},authenticated:false});
   resetToken='';email='';step='done';message=result.message;
  }
  // Credentials remain only in this module's memory, never URL or localStorage.
  if(location.hash==='#recuperar')render();else clearRecovery();
 }finally{button.disabled=false;}
}
