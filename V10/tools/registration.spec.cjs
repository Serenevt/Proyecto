const {test,expect}=require('../FrontEnd_2/node_modules/@playwright/test');
const {PrismaClient}=require('./database.cjs');
const {compare}=require('./database.cjs');
const {randomUUID,randomInt}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
require('./test-env.cjs');
test('registro → login → vehículo → FuelFlow → Prime comparten PostgreSQL',async({browser})=>{
  const dni=String(randomInt(40000000,49999999));
  const db=new PrismaClient();const email=`register-${randomUUID()}@example.test`,password='RegistrationTest123!';
  const prime='http://localhost:'+process.env.FRONTEND2_PORT,kiosk='http://localhost:'+process.env.FRONTEND1_PORT;
  let context=await browser.newContext({viewport:{width:390,height:844}}),member=await context.newPage();
  try{
    await member.goto(prime);await member.getByRole('link',{name:'Crear cuenta',exact:true}).click();
    await member.getByLabel('Nombre',{exact:true}).fill('Nueva Cuenta');await member.getByLabel(/^Correo(?: o DNI)?$/,{exact:true}).fill(email);await member.getByLabel('Contraseña',{exact:true}).fill(password);
    await member.getByText('Datos para comprobantes (opcional)',{exact:true}).click();await member.getByLabel('DNI',{exact:true}).fill(dni);
    await member.getByRole('button',{name:'Crear cuenta',exact:true}).click();await expect(member.getByRole('heading',{name:'Hola, Nueva Cuenta'})).toBeVisible();
    const stored=await db.user.findUniqueOrThrow({where:{email},include:{membership:true}});expect(await compare(password,stored.passwordHash)).toBe(true);expect(stored.membership.status).toBe('ACTIVE');expect(stored.membership.dni).toBe(dni);
    expect(await db.vehicle.count({where:{membershipId:stored.membership.id}})).toBe(0);
    await member.reload();await expect(member.getByRole('heading',{name:'Hola, Nueva Cuenta'})).toBeVisible();
    await member.getByRole('navigation').getByRole('link',{name:'Membresía',exact:true}).click();await member.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
    await context.close();context=await browser.newContext({viewport:{width:390,height:844}});member=await context.newPage();
    await member.goto(prime);await member.getByLabel(/^Correo(?: o DNI)?$/,{exact:true}).fill(email);await member.getByLabel('Contraseña',{exact:true}).fill(password);await member.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await expect(member.getByRole('heading',{name:'Hola, Nueva Cuenta'})).toBeVisible();
    let plate;do{plate='R'+randomInt(0,1296).toString(36).padStart(2,'0').toUpperCase()+'-'+String(randomInt(1000)).padStart(3,'0');}while(await db.vehicle.findUnique({where:{plate}}));
    await member.getByRole('navigation').getByRole('link',{name:'Membresía',exact:true}).click();await member.getByRole('button',{name:'Agregar vehículo',exact:true}).click();await member.getByLabel('Placa',{exact:true}).fill(plate);await member.getByLabel('Nombre del vehículo',{exact:true}).fill('Auto registrado');await member.getByRole('button',{name:'Guardar vehículo',exact:true}).click();await expect(member.getByRole('dialog')).not.toBeVisible();
    expect((await db.vehicle.findUniqueOrThrow({where:{plate}})).membershipId).toBe(stored.membership.id);
    const terminal=await context.newPage();await terminal.addInitScript(()=>localStorage.setItem('primax_idioma','es'));await terminal.goto(kiosk);await terminal.locator('#btn-voice-toggle').click();await terminal.locator('#btn-iniciar').click();await terminal.locator('[data-fuel="Premium"]').click();await terminal.locator('#btn-prepago').click();await terminal.locator('[data-monto="100"]').click();await terminal.locator('#btn-confirmar-monto').click();await terminal.locator('#btn-boleta').click();await terminal.locator('#input-dni').fill(dni);await terminal.locator('#prep-input-placa').fill(plate);await terminal.locator('#btn-continuar-datos').click();await terminal.locator('[data-metodo="TARJETA"]').click();
    const submitted=terminal.waitForResponse(r=>r.url().endsWith('/transactions')&&r.request().method()==='POST');await terminal.locator('#btn-nfc-tap').click();await terminal.locator('#modal-ok').click();const response=await submitted;expect(response.status()).toBe(201);const tx=(await response.json()).transaction;
    expect(tx.membership.number).toBe(stored.membership.number);expect(tx.vehicle.plate).toBe(plate);
    await member.reload();await member.getByRole('navigation').getByRole('link',{name:'Consumos',exact:true}).click();await expect(member.locator(`[data-detail="${tx.id}"]`)).toBeVisible();
    const profile=await member.evaluate(async()=>{const {memberService}=await import('/js/services/index.js');return memberService.get();});expect(profile.points).toBe(11);expect(profile.number).toBe(stored.membership.number);
    expect(await db.transaction.count({where:{id:tx.id,membershipId:stored.membership.id}})).toBe(1);
    fs.mkdirSync(path.join(__dirname,'evidence'),{recursive:true});fs.writeFileSync(path.join(__dirname,'evidence/registration.json'),JSON.stringify({email,userId:stored.id,membershipId:stored.membership.id,number:stored.membership.number,plate,transactionId:tx.id,points:11},null,2));
  }finally{await context.close();await db.$disconnect();}
});
