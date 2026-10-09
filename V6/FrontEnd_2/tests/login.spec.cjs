const {test,expect}=require('@playwright/test');
async function signIn(page){await page.getByLabel('Correo',{exact:true}).fill('demo@primaxprime.pe');await page.getByLabel('Contraseña',{exact:true}).fill('FixtureOnly123');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await expect(page.getByRole('heading',{name:'Hola, Diego'})).toBeVisible();}
test('login inicial, contraseña visible y credenciales exactas sin recarga',async({page})=>{
  await page.goto('/#beneficios');
  await expect(page.getByRole('heading',{name:'Bienvenido a Primax Prime'})).toBeVisible();
  await expect(page.getByRole('navigation')).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const marker=await page.evaluate(()=>window.__loginMarker=Math.random());
  await page.getByLabel('Correo',{exact:true}).fill('demo@primaxprime.pe');
  await page.getByLabel('Contraseña',{exact:true}).fill('incorrecta');
  await page.getByRole('button',{name:'Mostrar',exact:true}).click();
  await expect(page.getByLabel('Contraseña',{exact:true})).toHaveAttribute('type','text');
  await page.getByRole('button',{name:'Ocultar',exact:true}).click();
  await expect(page.getByLabel('Contraseña',{exact:true})).toHaveAttribute('type','password');
  await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('no son correctos');
  await expect(page.getByRole('navigation')).toBeHidden();
  expect(await page.evaluate(()=>localStorage.getItem('prime_session:v2'))).toBeNull();
  await signIn(page);
  expect(await page.evaluate(()=>window.__loginMarker)).toBe(marker);
  expect(await page.evaluate(()=>localStorage.getItem('prime_session:v2'))).toContain('fixture-jwt');
});
test('sesión persiste al recargar y al abrir una nueva página',async({page,context})=>{
  await page.goto('/');await signIn(page);await page.reload();
  await expect(page.getByRole('heading',{name:'Hola, Diego'})).toBeVisible();
  await page.close();const reopened=await context.newPage();await reopened.goto('/');
  await expect(reopened.getByRole('heading',{name:'Hola, Diego'})).toBeVisible();
  await expect(reopened.getByRole('button',{name:'Iniciar sesión'})).toHaveCount(0);
});
test('cerrar sesión conserva saldo, puntos, historial, vehículo, perfil, canjes y preferencias',async({page})=>{
  await page.goto('/');await signIn(page);
  await page.getByLabel('Seleccionar vehículo').selectOption('DEF-456');
  await page.getByRole('button',{name:'Recargar saldo'}).click();await page.getByLabel('Monto en soles').fill('50');await page.getByRole('button',{name:'Confirmar recarga'}).click();
  await page.getByRole('navigation').getByRole('link',{name:'Beneficios',exact:true}).click();await page.getByRole('button',{name:'Ver beneficio'}).nth(1).click();await page.getByRole('button',{name:'Canjear por 400 puntos'}).click();
  await page.getByRole('navigation').getByRole('link',{name:'Membresía',exact:true}).click();await page.getByLabel('Notificaciones de promociones').uncheck();await page.getByLabel('Nombre en este dispositivo',{exact:true}).fill('Diego Prime');await page.getByRole('button',{name:'Guardar cambios'}).click();
  const data=await page.evaluate(()=>localStorage.getItem('prime:local:fixture-user'));
  await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Bienvenido a Primax Prime'})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('prime_session:v2'))).toBeNull();
  expect(await page.evaluate(()=>localStorage.getItem('prime:local:fixture-user'))).toBe(data);
  await page.goto('/#membresia');await expect(page.getByRole('navigation')).toBeHidden();
  await page.getByLabel('Correo',{exact:true}).fill('demo@primaxprime.pe');await page.getByLabel('Contraseña',{exact:true}).fill('FixtureOnly123');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Hola, Diego'})).toBeVisible();await expect(page.locator('.balance')).toContainText('50.00');await expect(page.getByLabel('Seleccionar vehículo')).toHaveValue('DEF-456');
  expect(await page.evaluate(()=>localStorage.getItem('prime:local:fixture-user'))).toBe(data);
});

test.beforeEach(async({context})=>require('./api-fixture.cjs').installApi(context));
