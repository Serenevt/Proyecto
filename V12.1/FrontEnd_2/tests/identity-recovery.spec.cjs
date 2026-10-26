const {test,expect}=require('@playwright/test');
const {installApi}=require('./api-fixture.cjs');
test('foreign registration selects passport without requiring a DNI',async({page,context})=>{
 await installApi(context);
 await page.route('**/api/v1/auth/register',async route=>{
  expect(route.request().postDataJSON()).toMatchObject({passport:'ab123456'});expect(route.request().postDataJSON().dni).toBeUndefined();
  await route.fulfill({status:201,json:{accessToken:'fixture-jwt',expiresIn:3600,user:{id:'foreign',name:'Diego'}}});
 });
 await page.goto('/#registro');await page.getByLabel('Nombre',{exact:true}).fill('Foreign');await page.getByLabel('Correo',{exact:true}).fill('foreign@example.test');await page.getByLabel('Contraseña',{exact:true}).fill('ForeignPassword123!');
 await page.getByLabel('Tipo de documento (opcional)').selectOption('passport');
 await expect(page.locator('#register-dni')).toBeDisabled();await page.getByLabel('Pasaporte',{exact:true}).fill('ab123456');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Crear cuenta',exact:true}).click();await expect(page.getByRole('heading',{name:'Hola, Diego'})).toBeVisible();
});
test('DNI uses the single identifier login and existing session',async({page,context})=>{
 await installApi(context);await page.route('**/api/v1/auth/login',async route=>{expect(route.request().postDataJSON()).toEqual({identifier:'12345678',password:'FixtureOnly123'});await route.fulfill({json:{accessToken:'fixture-jwt',expiresIn:3600,user:{id:'fixture-user',name:'Diego'}}});});
 await page.goto('/');await page.getByLabel('Correo o DNI',{exact:true}).fill('12345678');await page.getByLabel('Contraseña',{exact:true}).fill('FixtureOnly123');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await expect(page.getByRole('heading',{name:'Hola, Diego'})).toBeVisible();
});
test('recovery handles invalid code and keeps reset credentials out of storage and URL',async({page})=>{
 let attempts=0;const token='t'.repeat(43);
 await page.route('**/api/v1/auth/forgot-password',route=>route.fulfill({json:{message:'Si la cuenta existe, recibe instrucciones.',delivery:'demo'}}));
 await page.route('**/api/v1/auth/verify-reset-code',route=>{attempts++;return route.fulfill(attempts===1?{status:400,json:{message:'Código inválido'}}:{json:{resetToken:token}});});
 await page.route('**/api/v1/auth/reset-password',async route=>{expect(route.request().postDataJSON()).toEqual({resetToken:token,password:'ReplacementPassword456!'});await route.fulfill({json:{message:'Contraseña actualizada.'}});});
 await page.goto('/');await page.getByRole('link',{name:'¿Olvidaste tu contraseña?'}).click();await page.getByLabel('Correo',{exact:true}).fill('foreign@example.test');await page.getByRole('button',{name:'Solicitar código'}).click();await expect(page.locator('#main')).toContainText('Modo DEMO local');
 await page.getByLabel('Código de recuperación').fill('12345678');await page.getByRole('button',{name:'Verificar código'}).click();await expect(page.getByRole('alert')).toContainText('inválido');await page.getByRole('button',{name:'Verificar código'}).click();
 await page.getByLabel('Nueva contraseña').fill('ReplacementPassword456!');await page.getByRole('button',{name:'Guardar contraseña'}).click();await expect(page.locator('#main').getByRole('status')).toHaveText('Contraseña actualizada.');
 const saved=await page.evaluate(()=>JSON.stringify([localStorage,sessionStorage,location.href]));expect(saved).not.toContain(token);expect(saved).not.toContain('ReplacementPassword456!');expect(saved).not.toContain('12345678');
 await page.getByRole('link',{name:'Volver a iniciar sesión'}).click();await expect(page.locator('#login-form')).toBeVisible();
});
