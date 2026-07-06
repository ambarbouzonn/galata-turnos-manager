import { deleteTurno, getTurnos, saveTurno } from './src/turnosRepository.js';

let turnos = [];
let selectedDate = new Date();
let weekStart = getMonday(new Date());
let editingId = null;
let currentEstado = 'pendiente';

function getMonday(d){
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  monday.setHours(0,0,0,0);
  return monday;
}
function fmtISO(d){
  const yr=d.getFullYear(), mo=String(d.getMonth()+1).padStart(2,'0'), da=String(d.getDate()).padStart(2,'0');
  return `${yr}-${mo}-${da}`;
}
function todayISO(){ return fmtISO(new Date()); }

const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const DIAS_CORTAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

const PAW_SVG = (color) => `
<svg viewBox="0 0 24 24" width="20" height="20" fill="${color}">
  <circle cx="7" cy="7" r="2.3"/><circle cx="12.2" cy="5.2" r="2.3"/><circle cx="17.4" cy="7" r="2.3"/>
  <path d="M12 10.5c3.2 0 6 2.6 6 5.5 0 2-1.6 3.2-3.5 3.2-1 0-1.7-.5-2.5-.5s-1.5.5-2.5.5C7.6 19.2 6 18 6 16c0-2.9 2.8-5.5 6-5.5z"/>
</svg>`;
const SERVICIO_COLOR = {
  'Baño':'#2B5D52','Corte':'#E8A33D','Baño y corte':'#D96A5C','Deslanado':'#7A8B6F','Otro':'#8A7E6A'
};

async function loadTurnos(){
  try{
    turnos = await getTurnos();
  }catch(e){
    turnos = [];
  }
  render();
}
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2200);
}

function renderWeekStrip(){
  const strip = document.getElementById('weekStrip');
  strip.innerHTML = '';
  const selISO = fmtISO(selectedDate);
  const tISO = todayISO();
  for(let i=0;i<7;i++){
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate()+i);
    const iso = fmtISO(d);
    const count = turnos.filter(t=>t.fecha===iso && t.estado!=='cancelado').length;
    const div = document.createElement('div');
    div.className = 'day-tab' + (iso===selISO?' selected':'') + (iso===tISO?' today':'') + (count>0?' has-turnos':'');
    div.innerHTML = `<div class="dname">${DIAS_CORTAS[d.getDay()]}</div><div class="dnum">${d.getDate()}</div><div class="dot"></div>`;
    div.onclick = ()=>{ selectedDate = d; render(); };
    strip.appendChild(div);
  }
  const monthLabel = `${MESES[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
  document.getElementById('subtitle').textContent = `Semana del ${weekStart.getDate()} de ${monthLabel}`;
}

function renderDay(){
  const iso = fmtISO(selectedDate);
  const label = document.getElementById('dayLabel');
  label.textContent = `${DIAS[selectedDate.getDay()]} ${selectedDate.getDate()} de ${MESES[selectedDate.getMonth()]}`;

  const dayTurnos = turnos.filter(t=>t.fecha===iso).sort((a,b)=> a.hora.localeCompare(b.hora));
  document.getElementById('dayCount').textContent = `${dayTurnos.length} turno${dayTurnos.length!==1?'s':''}`;

  const ledger = document.getElementById('ledger');
  if(dayTurnos.length===0){
    ledger.innerHTML = `<div class="empty-state">
      <div class="paw">${PAW_SVG('#6B6355')}</div>
      <p>No hay turnos cargados para este día.<br>Tocá el botón + para agendar uno.</p>
    </div>`;
    return;
  }
  ledger.innerHTML = dayTurnos.map(t=>{
    const color = SERVICIO_COLOR[t.servicio] || '#8A7E6A';
    return `
    <div class="turno-row estado-${t.estado}" data-id="${t.id}">
      <div class="turno-hora">${t.hora}</div>
      <div class="turno-body">
        <div class="turno-nombres">${escapeHtml(t.dueno)} · <span class="mascota">${escapeHtml(t.mascota)}</span></div>
        <div class="turno-meta">
          <span class="badge badge-${t.estado}">${capitalize(t.estado)}</span>
          <span>${escapeHtml(t.servicio)}</span>
          ${t.tipoMascota ? `<span>· ${escapeHtml(t.tipoMascota)}</span>` : ''}
          ${t.telefono ? `<span>· ${escapeHtml(t.telefono)}</span>` : ''}
        </div>
        ${t.notas ? `<div class="notas-preview">⚠ ${escapeHtml(t.notas)}</div>` : ''}
        <div class="who-badge">Cargó: ${t.cargadoPor||'—'}</div>
      </div>
      <div class="stamp">${PAW_SVG(color)}</div>
    </div>`;
  }).join('');

  ledger.querySelectorAll('.turno-row').forEach(row=>{
    row.onclick = ()=> openEdit(row.dataset.id);
  });
}

function render(){
  renderAlertBanner();
  renderWeekStrip();
  const query = document.getElementById('searchInput').value.trim();
  if(query.length > 0){
    renderSearchResults(query);
  } else {
    renderDay();
  }
}

function renderAlertBanner(){
  const tISO = todayISO();
  const pendientesHoy = turnos.filter(t => t.fecha === tISO && t.estado === 'pendiente');
  const banner = document.getElementById('alertBanner');
  const text = document.getElementById('alertText');
  document.getElementById('pawAlertIcon').innerHTML = PAW_SVG('#8A5A0F');
  if(pendientesHoy.length > 0){
    banner.classList.add('show');
    text.innerHTML = `${pendientesHoy.length} turno${pendientesHoy.length!==1?'s':''} de hoy sin confirmar<small>Tocá para ir al día de hoy</small>`;
  } else {
    banner.classList.remove('show');
  }
}
document.getElementById('alertBanner').onclick = ()=>{
  selectedDate = new Date();
  weekStart = getMonday(new Date());
  document.getElementById('searchInput').value = '';
  document.getElementById('clearSearch').classList.remove('show');
  render();
};

function renderSearchResults(query){
  document.getElementById('dayLabel').textContent = `Resultados para "${query}"`;
  const q = query.toLowerCase();
  const matches = turnos.filter(t =>
    (t.dueno && t.dueno.toLowerCase().includes(q)) ||
    (t.mascota && t.mascota.toLowerCase().includes(q))
  ).sort((a,b)=> (a.fecha+a.hora).localeCompare(b.fecha+b.hora));

  document.getElementById('dayCount').textContent = `${matches.length} resultado${matches.length!==1?'s':''}`;
  const ledger = document.getElementById('ledger');
  if(matches.length===0){
    ledger.innerHTML = `<div class="empty-state">
      <div class="paw">${PAW_SVG('#6B6355')}</div>
      <p>No encontramos ningún turno con ese nombre.</p>
    </div>`;
    return;
  }
  ledger.innerHTML = matches.map(t=>{
    const color = SERVICIO_COLOR[t.servicio] || '#8A7E6A';
    const d = new Date(t.fecha+'T00:00:00');
    const fechaLegible = `${DIAS_CORTAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()].slice(0,3)}`;
    return `
    <div class="turno-row estado-${t.estado}" data-id="${t.id}">
      <div class="turno-hora">${t.hora}<div class="search-result-date">${fechaLegible}</div></div>
      <div class="turno-body">
        <div class="turno-nombres">${escapeHtml(t.dueno)} · <span class="mascota">${escapeHtml(t.mascota)}</span></div>
        <div class="turno-meta">
          <span class="badge badge-${t.estado}">${capitalize(t.estado)}</span>
          <span>${escapeHtml(t.servicio)}</span>
          ${t.telefono ? `<span>· ${escapeHtml(t.telefono)}</span>` : ''}
        </div>
        ${t.notas ? `<div class="notas-preview">⚠ ${escapeHtml(t.notas)}</div>` : ''}
        <div class="who-badge">Cargó: ${t.cargadoPor||'—'}</div>
      </div>
      <div class="stamp">${PAW_SVG(color)}</div>
    </div>`;
  }).join('');
  ledger.querySelectorAll('.turno-row').forEach(row=>{
    row.onclick = ()=> openEdit(row.dataset.id);
  });
}

document.getElementById('searchInput').addEventListener('input', (e)=>{
  document.getElementById('clearSearch').classList.toggle('show', e.target.value.trim().length>0);
  render();
});
document.getElementById('clearSearch').onclick = ()=>{
  document.getElementById('searchInput').value = '';
  document.getElementById('clearSearch').classList.remove('show');
  render();
};

function escapeHtml(str){
  if(!str) return '';
  return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

document.getElementById('prevWeek').onclick = ()=>{
  weekStart.setDate(weekStart.getDate()-7);
  weekStart = new Date(weekStart);
  render();
};
document.getElementById('nextWeek').onclick = ()=>{
  weekStart.setDate(weekStart.getDate()+7);
  weekStart = new Date(weekStart);
  render();
};

function setEstadoChip(estado){
  currentEstado = estado;
  document.querySelectorAll('.estado-chip').forEach(chip=>{
    chip.classList.remove('active-pendiente','active-confirmado','active-realizado','active-cancelado');
    if(chip.dataset.estado === estado){
      chip.classList.add('active-'+estado);
    }
  });
}
document.querySelectorAll('.estado-chip').forEach(chip=>{
  chip.onclick = ()=> setEstadoChip(chip.dataset.estado);
});

function openNew(){
  editingId = null;
  document.getElementById('formTitle').textContent = 'Nuevo turno';
  document.getElementById('formSub').textContent = 'Completá los datos y guardá el turno.';
  document.getElementById('turnoForm').reset();
  document.getElementById('f_fecha').value = fmtISO(selectedDate);
  document.getElementById('f_hora').value = '10:00';
  document.getElementById('btnDelete').style.display = 'none';
  setEstadoChip('pendiente');
  document.getElementById('overlay').classList.add('open');
}

function openEdit(id){
  const t = turnos.find(x=>x.id===id);
  if(!t) return;
  editingId = id;
  document.getElementById('formTitle').textContent = 'Editar turno';
  document.getElementById('formSub').textContent = `Cargado por ${t.cargadoPor||'—'}`;
  document.getElementById('f_fecha').value = t.fecha;
  document.getElementById('f_hora').value = t.hora;
  document.getElementById('f_dueno').value = t.dueno;
  document.getElementById('f_mascota').value = t.mascota;
  document.getElementById('f_tipoMascota').value = t.tipoMascota||'';
  document.getElementById('f_servicio').value = t.servicio;
  document.getElementById('f_telefono').value = t.telefono||'';
  document.getElementById('f_notas').value = t.notas||'';
  document.getElementById('f_cargadoPor').value = t.cargadoPor||'Dueña';
  document.getElementById('btnDelete').style.display = 'inline-block';
  setEstadoChip(t.estado||'pendiente');
  document.getElementById('overlay').classList.add('open');
}

document.getElementById('fabAdd').onclick = openNew;
document.getElementById('btnCancel').onclick = ()=> document.getElementById('overlay').classList.remove('open');
document.getElementById('overlay').onclick = (e)=>{ if(e.target.id==='overlay') e.currentTarget.classList.remove('open'); };

document.getElementById('btnDelete').onclick = async ()=>{
  if(!editingId) return;
  if(!confirm('¿Eliminar este turno?')) return;
  const deletedId = editingId;
  turnos = turnos.filter(t=>t.id!==editingId);
  try{
    await deleteTurno(deletedId);
    document.getElementById('overlay').classList.remove('open');
    render();
    showToast('Turno eliminado');
  }catch(err){
    console.error(err);
    await loadTurnos();
    showToast('No se pudo eliminar. Probá de nuevo.');
  }
};

function marcarInvalido(input){
  input.style.borderColor = 'var(--coral)';
  input.style.borderWidth = '2px';
  input.addEventListener('input', function clear(){
    input.style.borderColor = '';
    input.style.borderWidth = '';
    input.removeEventListener('input', clear);
  }, {once:true});
}

document.getElementById('turnoForm').onsubmit = async (e)=>{
  e.preventDefault();
  try{
    const fFecha = document.getElementById('f_fecha');
    const fHora = document.getElementById('f_hora');
    const fDueno = document.getElementById('f_dueno');
    const fMascota = document.getElementById('f_mascota');

    // Validación manual: el popup nativo del navegador queda recortado
    // dentro de este formulario con scroll, así que chequeamos a mano.
    let faltantes = [];
    if(!fFecha.value) faltantes.push(fFecha);
    if(!fHora.value) faltantes.push(fHora);
    if(!fDueno.value.trim()) faltantes.push(fDueno);
    if(!fMascota.value.trim()) faltantes.push(fMascota);

    if(faltantes.length > 0){
      faltantes.forEach(marcarInvalido);
      showToast('Faltan completar campos obligatorios (marcados en rojo)');
      faltantes[0].focus();
      return;
    }

    const data = {
      id: editingId || ('t_'+Date.now()+'_'+Math.random().toString(36).slice(2,7)),
      fecha: fFecha.value,
      hora: fHora.value,
      dueno: fDueno.value.trim(),
      mascota: fMascota.value.trim(),
      tipoMascota: document.getElementById('f_tipoMascota').value.trim(),
      servicio: document.getElementById('f_servicio').value,
      telefono: document.getElementById('f_telefono').value.trim(),
      notas: document.getElementById('f_notas').value.trim(),
      estado: currentEstado,
      cargadoPor: document.getElementById('f_cargadoPor').value
    };
    if(editingId){
      const idx = turnos.findIndex(t=>t.id===editingId);
      turnos[idx] = data;
    } else {
      turnos.push(data);
    }
    await saveTurno(data);
    document.getElementById('overlay').classList.remove('open');
    selectedDate = new Date(data.fecha+'T00:00:00');
    weekStart = getMonday(selectedDate);
    render();
    showToast(editingId ? 'Turno actualizado' : 'Turno guardado');
  }catch(err){
    console.error(err);
    showToast('Algo falló al guardar. Probá de nuevo.');
  }
};

loadTurnos();
