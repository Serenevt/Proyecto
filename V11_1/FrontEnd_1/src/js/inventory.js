import {apiClient} from './apiClient.js';
export function mountInventory(getCatalog) {
 let revision=0;
 async function refresh(){
  const current=getCatalog();if(!current)return;
  const request=++revision;
  const cards=[...document.querySelectorAll('.fuel-card')];
  for(const card of cards){let line=card.querySelector('.availability');if(!line){line=document.createElement('span');line.className='availability';line.setAttribute('role','status');card.querySelector('.price').after(line);}line.textContent='Consultando disponibilidad…';}
  try{
   const rows=await apiClient('/fuels/inventory');if(request!==revision)return;
   for(const card of cards){const fuel=current.fuels.find(f=>f.name===card.dataset.fuel);const row=rows.find(row=>row.stationId===current.station.id&&row.fuelId===fuel?.id);
    card.querySelector('.availability').textContent=row&&Number.isFinite(Number(row.liters))?'Disponible: '+Number(row.liters).toLocaleString('es-PE',{maximumFractionDigits:2})+' L':'Disponibilidad no disponible';}
  }catch{if(request===revision)cards.forEach(card=>{card.querySelector('.availability').textContent='Disponibilidad no disponible';});}
 }
 window.addEventListener('focus',()=>{if(document.querySelector('#pantalla-combustible.active'))void refresh();});
 return refresh;
}
