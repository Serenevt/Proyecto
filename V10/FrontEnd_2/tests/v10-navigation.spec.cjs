const {test,expect}=require('@playwright/test');
test('V10: barra Primax, activo blanco, contraste y límites de pantalla',async({page},info)=>{
  await page.goto('/');
  await page.getByLabel('Correo',{exact:true}).fill('demo@primaxprime.pe');
  await page.getByLabel('Contraseña',{exact:true}).fill('FixtureOnly123');
  await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await expect(page.locator('#navigation')).toBeVisible();
  for(const link of await page.locator('#navigation a').all()){
    await link.click();
    await expect(link).toHaveAttribute('aria-current','page');
    expect(await link.evaluate(a=>getComputedStyle(a).color)).toBe('rgb(255, 255, 255)');
    expect(await link.locator('svg').evaluate(a=>getComputedStyle(a).color)).toBe('rgb(255, 255, 255)');
    expect(await page.locator('#navigation').evaluate(a=>getComputedStyle(a).backgroundColor)).toBe('rgb(184, 60, 0)');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    for(const item of await page.locator('#navigation a').all()){
      const b=await item.boundingBox();
      expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(page.viewportSize().width);
      expect(b.y+b.height).toBeLessThanOrEqual(page.viewportSize().height);expect(b.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.getByRole('link',{name:'Inicio',exact:true}).click();
  await expect(page.locator('.promo')).toContainText('S/ 9.00');
  await page.screenshot({path:info.outputPath('v10-navigation.png'),fullPage:true});
});

test.beforeEach(async({context})=>require('./api-fixture.cjs').installApi(context));
