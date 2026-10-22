const {test,expect}=require('@playwright/test');
const {installApi}=require('./api-fixture.cjs');
async function fill(page){
  await page.getByLabel('Nombre',{exact:true}).fill('Nueva Cuenta');
  await page.getByLabel(/^Correo(?: o DNI)?$/,{exact:true}).fill('new@example.test');
  await page.getByLabel('Contraseña',{exact:true}).fill('RegistrationTest123!');
}
test('registro responsive, datos opcionales y sesión usando respuesta Backend',async({page,context})=>{
  await installApi(context);let requests=0;
  await page.route('**/api/v1/auth/register',async route=>{requests++;expect(route.request().postDataJSON()).toMatchObject({name:'Nueva Cuenta',dni:'12345678'});await new Promise(r=>setTimeout(r,150));await route.fulfill({status:201,json:{accessToken:'registration-fixture',expiresIn:3600,user:{id:'new-user',name:'Diego'}}});});
  await page.goto('/');await page.getByRole('link',{name:'Crear cuenta',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Crear cuenta',exact:true})).toBeVisible();await fill(page);
  await page.getByText('Datos para comprobantes (opcional)',{exact:true}).click();await page.getByLabel('DNI',{exact:true}).fill('12345678');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Crear cuenta',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Hola, Diego'})).toBeVisible();expect(requests).toBe(1);
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('RegistrationTest123!');
});
test('registro inaccesible conserva formulario y permite reintentar',async({page})=>{
  await page.route('**/api/v1/auth/register',route=>route.abort('connectionrefused'));
  await page.goto('/#registro');await fill(page);await page.getByRole('button',{name:'Crear cuenta',exact:true}).click();
  await expect(page.locator('.form-error')).toContainText('No pudimos conectar');
  await expect(page.getByLabel(/^Correo(?: o DNI)?$/,{exact:true})).toHaveValue('new@example.test');
  await expect(page.getByRole('button',{name:'Crear cuenta',exact:true})).toBeEnabled();
  await page.getByRole('link',{name:'Iniciar sesión',exact:true}).click();await expect(page.locator('#login-form')).toBeVisible();
});
test('correo duplicado muestra mensaje Backend sin crear sesión',async({page})=>{
  await page.route('**/api/v1/auth/register',route=>route.fulfill({status:409,json:{message:'El correo ya está registrado. Inicia sesión.'}}));
  await page.goto('/#registro');await fill(page);await page.getByRole('button',{name:'Crear cuenta',exact:true}).click();
  await expect(page.locator('.form-error')).toContainText('ya está registrado');
  expect(await page.evaluate(()=>localStorage.getItem('prime_session:v2'))).toBeNull();
});
