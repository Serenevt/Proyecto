import {apiClient} from './apiClient.js';
export function mountInventory() {
 const panel=document.createElement('aside'); panel.className='fuel-stock'; panel.setAttribute('aria-label','Stock de combustible'); document.body.append(panel);
 let busy=false;
 async function refresh(){if(busy||document.hidden)return;busy=true;try{
  const rows=await apiClient('/fuels/inventory'); panel.replaceChildren();
  const title=document.createElement('h3');title.textContent='Stock de combustible';panel.append(title);
  for(const row of rows){const line=document.createElement('p');line.textContent=`${row.station.name} ? ${row.fuel.name}: ${Number(row.liters).toLocaleString('es-PE',{maximumFractionDigits:1})} L`;panel.append(line);}
 }catch{panel.textContent='Stock no disponible. Reintenta la consulta.';}finally{busy=false;}}
 void refresh();setInterval(refresh,5000);window.addEventListener('focus',refresh);
}
