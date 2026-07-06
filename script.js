import { getCurrentSession, getUserProfile, onAuthChange, signIn, signOut } from './src/authRepository.js';
import { getDirectory } from './src/directoryRepository.js';
import { deleteTurno, getTurnos, saveTurno } from './src/turnosRepository.js';

let turnos = [];
let selectedDate = new Date();
let visibleMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
let editingId = null;
let currentEstado = 'pendiente';
let unsubscribeAuth = null;
let currentUserProfile = null;
let directory = { clientes: [], mascotas: [] };
let expandedTurnoId = null;

function fmtISO(d){
  const yr=d.getFullYear(), mo=String(d.getMonth()+1).padStart(2,'0'), da=String(d.getDate()).padStart(2,'0');
  return `${yr}-${mo}-${da}`;
}
function todayISO(){ return fmtISO(new Date()); }
function syncVisibleMonth(){
  visibleMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
}

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

const ESTADOS = ['pendiente','confirmado','realizado','cancelado'];
const ESTADO_LABEL = {
  todos: 'Todos',
  pendiente: 'Pendientes',
  confirmado: 'Confirmados',
  realizado: 'Realizados',
  cancelado: 'Cancelados'
};
const SUGGESTED_TIMES = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','15:00','15:30','16:00','16:30','17:00','17:30','18:00'];

async function loadTurnos(){
  try{
    turnos = await getTurnos();
    directory = await getDirectory(turnos);
    renderDirectorySuggestions();
  }catch(e){
    console.error(e);
    turnos = [];
    showToast('No se pudieron cargar los turnos.');
  }
  render();
}

function normalizeLookup(value){
  return (value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function roleLabel(role){
  const labels = {
    admin: 'Admin',
    peluquera: 'Peluquera',
    recepcion: 'Recepcion',
    staff: 'Equipo',
  };
  return labels[role] || 'Equipo';
}

function canDeleteTurnos(){
  return currentUserProfile && currentUserProfile.role === 'admin';
}

function findSlotConflict(data){
  if(data.estado === 'cancelado') return null;
  return turnos.find(t =>
    t.id !== data.id &&
    t.fecha === data.fecha &&
    t.hora === data.hora &&
    t.estado !== 'cancelado'
  );
}

function fieldValue(id){
  return document.getElementById(id).value;
}

function currentFormSlotData(){
  return {
    id: editingId || '',
    fecha: fieldValue('f_fecha'),
    hora: fieldValue('f_hora'),
    estado: currentEstado,
  };
}

function renderSlotWarning(){
  const warning = document.getElementById('slotWarning');
  if(!warning) return;
  const data = currentFormSlotData();
  if(!data.fecha || !data.hora){
    warning.classList.remove('show');
    warning.textContent = '';
    return;
  }

  const conflict = findSlotConflict(data);
  if(conflict){
    warning.classList.add('show');
    warning.textContent = `Horario ocupado por ${conflict.mascota} (${conflict.dueno})`;
  } else {
    warning.classList.remove('show');
    warning.textContent = '';
  }
}

function renderTimeSlots(){
  const container = document.getElementById('timeSlots');
  if(!container) return;
  const fecha = fieldValue('f_fecha') || fmtISO(selectedDate);
  const selected = fieldValue('f_hora');
  container.innerHTML = SUGGESTED_TIMES.map(time=>{
    const conflict = findSlotConflict({ id: editingId || '', fecha, hora: time, estado: currentEstado });
    const classes = 'time-slot'
      + (selected === time ? ' selected' : '')
      + (conflict ? ' occupied' : '');
    return `<button type="button" class="${classes}" data-time="${time}" title="${conflict ? `Ocupado por ${escapeHtml(conflict.mascota)}` : 'Disponible'}">${time}</button>`;
  }).join('');

  container.querySelectorAll('.time-slot').forEach(button=>{
    button.onclick = ()=>{
      document.getElementById('f_hora').value = button.dataset.time;
      renderTimeSlots();
      renderSlotWarning();
    };
  });
}

function turnoMatchesQuery(turno, q){
  return ['dueno','mascota','telefono','instagram','servicio','tipoMascota','notas','cargadoPor']
    .some(key => turno[key] && turno[key].toLowerCase().includes(q));
}

function isMissingInstagramColumnError(err){
  const message = `${err && err.message ? err.message : ''} ${err && err.details ? err.details : ''}`.toLowerCase();
  return message.includes('instagram')
    && (message.includes('column') || message.includes('schema cache'));
}

function statusCounts(items){
  return ESTADOS.reduce((acc, estado)=>{
    acc[estado] = items.filter(t=>t.estado===estado).length;
    return acc;
  }, {});
}

function renderDaySummary(dayTurnos){
  const summary = document.getElementById('daySummary');
  const counts = statusCounts(dayTurnos);
  summary.innerHTML = ESTADOS
    .filter(estado => counts[estado] > 0)
    .map(estado => `<span class="summary-pill summary-${estado}">${counts[estado]} ${ESTADO_LABEL[estado].toLowerCase()}</span>`)
    .join('');
}

function selectedDayTitle(){
  return `${DIAS[selectedDate.getDay()]} ${selectedDate.getDate()} de ${MESES[selectedDate.getMonth()]}`;
}

function renderUpcomingPanel(){
  const panel = document.getElementById('upcomingPanel');
  if(!panel) return;
  const start = new Date();
  start.setHours(0,0,0,0);
  const end = new Date(start);
  end.setDate(end.getDate()+7);

  const upcoming = turnos
    .filter(t=>{
      const date = new Date(t.fecha+'T00:00:00');
      return date >= start && date < end && t.estado !== 'cancelado';
    })
    .sort((a,b)=> (a.fecha+a.hora).localeCompare(b.fecha+b.hora))
    .slice(0, 6);

  if(upcoming.length === 0){
    panel.innerHTML = '';
    panel.classList.remove('show');
    return;
  }

  panel.classList.add('show');
  panel.innerHTML = `
    <div class="upcoming-title">Próximos 7 días</div>
    <div class="upcoming-list">
      ${upcoming.map(t=>{
        const d = new Date(t.fecha+'T00:00:00');
        const label = `${DIAS_CORTAS[d.getDay()]} ${d.getDate()}/${d.getMonth()+1}`;
        return `<button type="button" class="upcoming-item" data-date="${t.fecha}" data-id="${t.id}">
          <span>${label}</span><strong>${escapeHtml(t.hora)}</strong><span>${escapeHtml(t.mascota)}</span>
        </button>`;
      }).join('')}
    </div>`;

  panel.querySelectorAll('.upcoming-item').forEach(button=>{
    button.onclick = ()=>{
      selectedDate = new Date(button.dataset.date+'T00:00:00');
      syncVisibleMonth();
      expandedTurnoId = button.dataset.id;
      document.getElementById('searchInput').value = '';
      document.getElementById('clearSearch').classList.remove('show');
      render();
    };
  });
}

function goToday(){
  selectedDate = new Date();
  syncVisibleMonth();
  document.getElementById('searchInput').value = '';
  document.getElementById('clearSearch').classList.remove('show');
  render();
}

function contactRail(t){
  return `
    <div class="contact-rail" aria-label="Contacto">
      <button type="button" class="contact-icon-btn call-action" data-action="call" data-id="${t.id}" ${t.telefono?'':'disabled'} aria-label="Llamar">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.8-.4 1.2-.3 1.3.4 2.6.6 4 .6.7 0 1.2.5 1.2 1.2v3.5c0 .7-.5 1.2-1.2 1.2C10.7 21.4 2.6 13.3 2.6 3.4c0-.7.5-1.2 1.2-1.2h3.5c.7 0 1.2.5 1.2 1.2 0 1.4.2 2.7.6 4 .1.4 0 .9-.3 1.2l-2.2 2.2z"/></svg>
      </button>
      <button type="button" class="contact-icon-btn whatsapp-action" data-action="whatsapp" data-id="${t.id}" ${t.telefono?'':'disabled'} aria-label="WhatsApp">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.1 2.2a9.7 9.7 0 0 0-8.4 14.6L2.6 21.8l5.1-1.3a9.6 9.6 0 0 0 4.4 1.1 9.7 9.7 0 1 0 0-19.4zm0 17.7a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3a8 8 0 1 1 6.8 3.7zm4.4-5.9c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.2-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9.6.3 1.1.4 1.5.5.6.2 1.2.2 1.6.1.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1-.1-.2-.3-.3-.5-.4z"/></svg>
      </button>
      <button type="button" class="contact-icon-btn instagram-action" data-action="instagram" data-id="${t.id}" ${t.instagram?'':'disabled'} aria-label="Instagram">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.4 2.8h9.2c2.6 0 4.6 2 4.6 4.6v9.2c0 2.6-2 4.6-4.6 4.6H7.4c-2.6 0-4.6-2-4.6-4.6V7.4c0-2.6 2-4.6 4.6-4.6zm0 1.8c-1.6 0-2.8 1.2-2.8 2.8v9.2c0 1.6 1.2 2.8 2.8 2.8h9.2c1.6 0 2.8-1.2 2.8-2.8V7.4c0-1.6-1.2-2.8-2.8-2.8H7.4zm4.6 3.2a4.2 4.2 0 1 1 0 8.4 4.2 4.2 0 0 1 0-8.4zm0 1.8a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8zm4.6-2.5a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z"/></svg>
      </button>
    </div>`;
}

function expandedTurnoDetails(t){
  if(expandedTurnoId !== t.id) return '';
  return `
    <div class="turno-details">
      <div class="detail-grid">
        ${t.telefono ? `<div><span>Teléfono</span><strong>${escapeHtml(t.telefono)}</strong></div>` : ''}
        ${t.instagram ? `<div><span>Instagram</span><strong>${escapeHtml(t.instagram)}</strong></div>` : ''}
        ${t.tipoMascota ? `<div><span>Tipo / raza</span><strong>${escapeHtml(t.tipoMascota)}</strong></div>` : ''}
        <div><span>Cargado por</span><strong>${escapeHtml(t.cargadoPor || '—')}</strong></div>
        ${t.notas ? `<div class="detail-full"><span>Notas</span><strong>${escapeHtml(t.notas)}</strong></div>` : ''}
      </div>
      <button type="button" class="edit-turno-btn" data-edit-id="${t.id}">Editar turno</button>
    </div>`;
}

function attachExpandedActions(){
  document.querySelectorAll('.edit-turno-btn').forEach(button=>{
    button.onclick = (event)=>{
      event.stopPropagation();
      openEdit(button.dataset.editId);
    };
  });
}

function normalizeWhatsAppPhone(phone){
  let digits = (phone || '').replace(/\D/g, '');
  if(!digits) return '';
  if(digits.startsWith('00')) digits = digits.slice(2);
  if(digits.startsWith('0')) digits = digits.slice(1);

  if(digits.startsWith('549')) return digits;
  if(digits.startsWith('54')) return `549${digits.slice(2)}`;

  if(digits.startsWith('11') && digits.slice(2,4) === '15'){
    digits = `11${digits.slice(4)}`;
  }

  return `549${digits}`;
}

function phoneCallHref(phone){
  const digits = (phone || '').replace(/\D/g, '');
  return digits ? `tel:${digits}` : '';
}

function whatsappMessage(turno){
  const d = new Date(turno.fecha+'T00:00:00');
  const fecha = `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
  return `Hola! Te recordamos el turno de ${turno.mascota} para ${fecha} a las ${turno.hora}. Galata Turnos`;
}

function copyText(text, successMessage){
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(text)
      .then(()=> showToast(successMessage))
      .catch(()=> showToast('No se pudo copiar automáticamente.'));
    return;
  }
  showToast('Tu navegador no permitió copiar automáticamente.');
}

function openWhatsApp(id){
  const turno = turnos.find(t=>t.id===id);
  if(!turno) return;

  const phone = normalizeWhatsAppPhone(turno.telefono);
  if(!phone){
    showToast('Este turno no tiene telefono.');
    return;
  }

  const url = `https://wa.me/${phone}?text=${encodeURIComponent(whatsappMessage(turno))}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function callPhone(id){
  const turno = turnos.find(t=>t.id===id);
  if(!turno) return;

  const href = phoneCallHref(turno.telefono);
  if(!href){
    showToast('Este turno no tiene teléfono.');
    return;
  }

  window.location.href = href;
}

function normalizeInstagramTarget(value){
  const raw = (value || '').trim();
  if(!raw) return null;
  const threadMatch = raw.match(/instagram\.com\/direct\/t\/([^/?#]+)/i) || raw.match(/^direct\/t\/([^/?#]+)/i);
  if(threadMatch && threadMatch[1]){
    return {
      type: 'thread',
      url: `https://www.instagram.com/direct/t/${encodeURIComponent(threadMatch[1])}/`,
    };
  }
  if(/^\d{8,}$/.test(raw)){
    return {
      type: 'thread',
      url: `https://www.instagram.com/direct/t/${encodeURIComponent(raw)}/`,
    };
  }

  const cleaned = raw.replace(/^@+/, '');
  const instagramMatch = cleaned.match(/(?:instagram\.com|instagr\.am)\/([^/?#]+)/i);
  const username = instagramMatch ? instagramMatch[1] : cleaned.split(/[/?#]/)[0];
  const cleanUsername = username.replace(/^@+/, '');
  return cleanUsername
    ? {
      type: 'profile',
      url: `https://www.instagram.com/${encodeURIComponent(cleanUsername)}/`,
    }
    : null;
}

function openInstagram(id){
  const turno = turnos.find(t=>t.id===id);
  if(!turno) return;

  const target = normalizeInstagramTarget(turno.instagram);
  if(!target){
    showToast('Este turno no tiene Instagram.');
    return;
  }

  window.open(target.url, '_blank', 'noopener,noreferrer');

  copyText(
    whatsappMessage(turno),
    target.type === 'thread' ? 'Mensaje copiado. Pegalo en el chat.' : 'Mensaje copiado. Tocá Mensaje y pegalo.'
  );
}

function setLoadedByOption(displayName){
  const select = document.getElementById('f_cargadoPor');
  if(!displayName) return;
  let option = Array.from(select.options).find(opt => opt.value === displayName);
  if(!option){
    option = document.createElement('option');
    option.value = displayName;
    option.textContent = displayName;
    select.prepend(option);
  }
}

function selectedClient(){
  const value = normalizeLookup(document.getElementById('f_dueno').value);
  return directory.clientes.find(cliente => cliente.nombreNormalizado === value) || null;
}

function selectedPet(){
  const client = selectedClient();
  const petValue = normalizeLookup(document.getElementById('f_mascota').value);
  return directory.mascotas.find(mascota =>
    mascota.nombreNormalizado === petValue &&
    (!client || mascota.clienteNormalizado === client.nombreNormalizado)
  ) || null;
}

function petHistoryItems(){
  const owner = normalizeLookup(document.getElementById('f_dueno').value);
  const pet = normalizeLookup(document.getElementById('f_mascota').value);
  if(!owner || !pet) return [];

  return turnos
    .filter(turno =>
      turno.id !== editingId &&
      normalizeLookup(turno.dueno) === owner &&
      normalizeLookup(turno.mascota) === pet
    )
    .sort((a,b)=> (b.fecha+b.hora).localeCompare(a.fecha+a.hora))
    .slice(0, 5);
}

function renderPetHistory(){
  const container = document.getElementById('petHistory');
  if(!container) return;

  const items = petHistoryItems();
  if(items.length === 0){
    container.classList.remove('show');
    container.innerHTML = '';
    return;
  }

  container.classList.add('show');
  container.innerHTML = `
    <div class="pet-history-title">Historial de esta mascota</div>
    ${items.map(turno => {
      const d = new Date(turno.fecha+'T00:00:00');
      const fecha = `${d.getDate()} ${MESES[d.getMonth()].slice(0,3)} ${d.getFullYear()}`;
      return `
        <div class="history-item">
          <div class="history-main">
            <span>${fecha}</span>
            <span>${escapeHtml(turno.hora)}</span>
            <span>${escapeHtml(turno.servicio)}</span>
          </div>
          <div class="history-meta">
            <span class="badge badge-${turno.estado}">${capitalize(turno.estado)}</span>
            ${turno.tipoMascota ? `<span>${escapeHtml(turno.tipoMascota)}</span>` : ''}
            ${turno.notas ? `<span class="history-note">${escapeHtml(turno.notas)}</span>` : ''}
          </div>
        </div>`;
    }).join('')}
  `;
}

async function updateTurnoEstado(id, estado){
  const current = turnos.find(t=>t.id===id);
  if(!current || current.estado === estado) return;

  const updated = { ...current, estado };
  const conflict = findSlotConflict(updated);
  if(conflict){
    showToast(`Ya hay un turno a las ${updated.hora}: ${conflict.mascota}`);
    return;
  }

  try{
    await saveTurno(updated);
    turnos = turnos.map(t=>t.id===id ? updated : t);
    render();
    showToast(`Turno ${capitalize(estado)}`);
  }catch(err){
    console.error(err);
    showToast('No se pudo cambiar el estado.');
  }
}

function attachQuickActions(){
  document.querySelectorAll('.turno-row button[data-action]').forEach(button=>{
    button.onclick = (event)=>{
      event.stopPropagation();
      if(button.dataset.action === 'whatsapp'){
        openWhatsApp(button.dataset.id);
      } else if(button.dataset.action === 'instagram'){
        openInstagram(button.dataset.id);
      } else if(button.dataset.action === 'call'){
        callPhone(button.dataset.id);
      } else {
        updateTurnoEstado(button.dataset.id, button.dataset.action);
      }
    };
  });
}

function renderDirectorySuggestions(){
  const clientesList = document.getElementById('clientesList');
  const mascotasList = document.getElementById('mascotasList');
  if(!clientesList || !mascotasList) return;

  clientesList.innerHTML = directory.clientes
    .map(cliente => `<option value="${escapeHtml(cliente.nombre)}"></option>`)
    .join('');

  renderPetSuggestions();
}

function renderPetSuggestions(){
  const mascotasList = document.getElementById('mascotasList');
  if(!mascotasList) return;

  const client = selectedClient();
  const mascotas = client
    ? directory.mascotas.filter(mascota => mascota.clienteNormalizado === client.nombreNormalizado)
    : directory.mascotas;

  mascotasList.innerHTML = mascotas
    .map(mascota => `<option value="${escapeHtml(mascota.nombre)}"></option>`)
    .join('');
}

function autofillClient(){
  const client = selectedClient();
  renderPetSuggestions();
  if(client && client.telefono && !document.getElementById('f_telefono').value.trim()){
    document.getElementById('f_telefono').value = client.telefono;
  }
  if(client && client.instagram && !document.getElementById('f_instagram').value.trim()){
    document.getElementById('f_instagram').value = client.instagram;
  }
  renderPetHistory();
}

function autofillPet(){
  const pet = selectedPet();
  if(pet && pet.tipoMascota && !document.getElementById('f_tipoMascota').value.trim()){
    document.getElementById('f_tipoMascota').value = pet.tipoMascota;
  }
  renderPetHistory();
}

function renderSessionBadge(user, profile){
  const badge = document.getElementById('sessionBadge');
  const displayName = profile && profile.displayName ? profile.displayName : user.email;
  badge.textContent = `${displayName} · ${roleLabel(profile && profile.role)}`;
  badge.classList.add('show');
}

async function showAppForUser(user, profile = null){
  currentUserProfile = profile || await getUserProfile(user);
  document.body.classList.add('authenticated');
  document.getElementById('loginError').textContent = '';
  if(user) renderSessionBadge(user, currentUserProfile);
  setLoadedByOption(currentUserProfile && currentUserProfile.displayName);
  await loadTurnos();
}

function showLogin(){
  turnos = [];
  currentUserProfile = null;
  document.body.classList.remove('authenticated');
  document.getElementById('loginPassword').value = '';
  document.getElementById('sessionBadge').classList.remove('show');
}

async function initAuth(){
  try{
    const { user, profile } = await getCurrentSession();
    if(user){
      await showAppForUser(user, profile);
    } else {
      showLogin();
    }

    unsubscribeAuth = await onAuthChange(async (user) => {
      if(user){
        await showAppForUser(user);
      } else {
        showLogin();
      }
    });
  }catch(err){
    console.error(err);
    showLogin();
    document.getElementById('loginError').textContent = 'No se pudo iniciar la sesion.';
  }
}
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2200);
}

function renderMonthView(){
  const grid = document.getElementById('monthGrid');
  const title = document.getElementById('monthTitle');
  grid.innerHTML = '';
  title.textContent = `${MESES[visibleMonth.getMonth()]} ${visibleMonth.getFullYear()}`;
  document.getElementById('subtitle').textContent = 'Calendario de turnos';

  const first = new Date(visibleMonth);
  const firstWeekday = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth()+1, 0).getDate();
  const selectedISO = fmtISO(selectedDate);
  const today = todayISO();

  for(let i=0;i<firstWeekday;i++){
    const empty = document.createElement('button');
    empty.type = 'button';
    empty.className = 'month-day is-empty';
    grid.appendChild(empty);
  }

  for(let day=1;day<=daysInMonth;day++){
    const d = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day);
    const iso = fmtISO(d);
    const dayItems = turnos.filter(t=>t.fecha===iso);
    const counts = statusCounts(dayItems);
    const count = dayItems.filter(t=>t.estado!=='cancelado').length;
    const dots = ESTADOS
      .filter(estado => counts[estado] > 0)
      .map(estado => `<span class="month-dot dot-${estado}"></span>`)
      .join('');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'month-day'
      + (iso===selectedISO ? ' is-selected' : '')
      + (iso===today ? ' is-today' : '')
      + (count>0 ? ' has-turnos' : '');
    btn.innerHTML = `<span class="month-num">${day}</span><span class="month-dots">${dots}</span>`;
    btn.onclick = ()=>{
      selectedDate = d;
      syncVisibleMonth();
      document.getElementById('searchInput').value = '';
      document.getElementById('clearSearch').classList.remove('show');
      render();
    };
    grid.appendChild(btn);
  }
}

function renderDay(){
  const iso = fmtISO(selectedDate);
  const label = document.getElementById('dayLabel');
  label.textContent = selectedDayTitle();

  const allDayTurnos = turnos.filter(t=>t.fecha===iso).sort((a,b)=> a.hora.localeCompare(b.hora));
  const dayTurnos = allDayTurnos;
  renderDaySummary(allDayTurnos);
  document.getElementById('dayCount').textContent = `${dayTurnos.length} turno${dayTurnos.length!==1?'s':''}`;

  const ledger = document.getElementById('ledger');
  if(dayTurnos.length===0){
    ledger.innerHTML = `<div class="empty-state">
      <div class="paw">${PAW_SVG('#6B6355')}</div>
      <p>No hay turnos cargados para este día.<br>Tocá el botón + para agendar uno.</p>
    </div>`;
    return;
  }
  ledger.innerHTML = dayTurnos.map(t=>`
    <div class="turno-row estado-${t.estado}" data-id="${t.id}">
      <div class="turno-hora">${t.hora}</div>
      <div class="turno-body">
        <div class="turno-nombres">${escapeHtml(t.dueno)} · <span class="mascota">${escapeHtml(t.mascota)}</span></div>
        <div class="turno-meta">
          <span class="badge badge-${t.estado}">${capitalize(t.estado)}</span>
          <span>${escapeHtml(t.servicio)}</span>
          ${t.tipoMascota ? `<span>· ${escapeHtml(t.tipoMascota)}</span>` : ''}
        </div>
        ${t.notas ? `<div class="notas-preview">⚠ ${escapeHtml(t.notas)}</div>` : ''}
        <div class="quick-actions">
          <div class="status-actions" aria-label="Estado del turno">
            <button type="button" data-action="confirmado" data-id="${t.id}" ${t.estado==='confirmado'?'disabled':''}>Confirmar</button>
            <button type="button" data-action="realizado" data-id="${t.id}" ${t.estado==='realizado'?'disabled':''}>Realizado</button>
            <button type="button" data-action="cancelado" data-id="${t.id}" ${t.estado==='cancelado'?'disabled':''}>Cancelar</button>
          </div>
        </div>
        ${expandedTurnoDetails(t)}
      </div>
      ${contactRail(t)}
    </div>`).join('');

  ledger.querySelectorAll('.turno-row').forEach(row=>{
    row.onclick = ()=>{
      expandedTurnoId = expandedTurnoId === row.dataset.id ? null : row.dataset.id;
      render();
    };
  });
  attachQuickActions();
  attachExpandedActions();
}

function render(){
  renderAlertBanner();
  renderMonthView();
  renderUpcomingPanel();
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
  goToday();
};

function renderSearchResults(query){
  document.getElementById('dayLabel').textContent = `Resultados para "${query}"`;
  const q = query.toLowerCase();
  const matches = turnos
    .filter(t => turnoMatchesQuery(t, q))
    .sort((a,b)=> (a.fecha+a.hora).localeCompare(b.fecha+b.hora));

  document.getElementById('dayCount').textContent = `${matches.length} resultado${matches.length!==1?'s':''}`;
  document.getElementById('daySummary').innerHTML = '';
  const ledger = document.getElementById('ledger');
  if(matches.length===0){
    ledger.innerHTML = `<div class="empty-state">
      <div class="paw">${PAW_SVG('#6B6355')}</div>
      <p>No encontramos ningún turno con ese nombre.</p>
    </div>`;
    return;
  }
  ledger.innerHTML = matches.map(t=>{
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
        </div>
        ${t.notas ? `<div class="notas-preview">⚠ ${escapeHtml(t.notas)}</div>` : ''}
        <div class="quick-actions">
          <div class="status-actions" aria-label="Estado del turno">
            <button type="button" data-action="confirmado" data-id="${t.id}" ${t.estado==='confirmado'?'disabled':''}>Confirmar</button>
            <button type="button" data-action="realizado" data-id="${t.id}" ${t.estado==='realizado'?'disabled':''}>Realizado</button>
            <button type="button" data-action="cancelado" data-id="${t.id}" ${t.estado==='cancelado'?'disabled':''}>Cancelar</button>
          </div>
        </div>
        ${expandedTurnoDetails(t)}
      </div>
      ${contactRail(t)}
    </div>`;
  }).join('');
  ledger.querySelectorAll('.turno-row').forEach(row=>{
    row.onclick = ()=>{
      expandedTurnoId = expandedTurnoId === row.dataset.id ? null : row.dataset.id;
      render();
    };
  });
  attachQuickActions();
  attachExpandedActions();
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

document.getElementById('f_dueno').addEventListener('input', autofillClient);
document.getElementById('f_mascota').addEventListener('input', autofillPet);
document.getElementById('f_fecha').addEventListener('input', ()=>{
  renderTimeSlots();
  renderSlotWarning();
});
document.getElementById('f_hora').addEventListener('input', ()=>{
  renderTimeSlots();
  renderSlotWarning();
});
document.getElementById('loginForm').onsubmit = async (e)=>{
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const button = document.getElementById('loginButton');
  const error = document.getElementById('loginError');

  button.disabled = true;
  button.textContent = 'Ingresando...';
  error.textContent = '';
  try{
    const { user, profile } = await signIn(email, password);
    await showAppForUser(user, profile);
  }catch(err){
    console.error(err);
    error.textContent = 'Email o contrasena incorrectos.';
  }finally{
    button.disabled = false;
    button.textContent = 'Ingresar';
  }
};

document.getElementById('logoutButton').onclick = async ()=>{
  try{
    await signOut();
    showLogin();
  }catch(err){
    console.error(err);
    showToast('No se pudo cerrar sesion.');
  }
};

function escapeHtml(str){
  if(!str) return '';
  return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

document.getElementById('prevMonth').onclick = ()=>{
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth()-1, 1);
  selectedDate = new Date(visibleMonth);
  render();
};
document.getElementById('nextMonth').onclick = ()=>{
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth()+1, 1);
  selectedDate = new Date(visibleMonth);
  render();
};
document.getElementById('monthTitle').onclick = ()=>{
  goToday();
};
document.getElementById('todayButton').onclick = goToday;

function setEstadoChip(estado){
  currentEstado = estado;
  document.querySelectorAll('.estado-chip').forEach(chip=>{
    chip.classList.remove('active-pendiente','active-confirmado','active-realizado','active-cancelado');
    if(chip.dataset.estado === estado){
      chip.classList.add('active-'+estado);
    }
  });
  renderTimeSlots();
  renderSlotWarning();
}
document.querySelectorAll('.estado-chip').forEach(chip=>{
  chip.onclick = ()=> setEstadoChip(chip.dataset.estado);
});

function openNew(){
  editingId = null;
  document.getElementById('formTitle').textContent = 'Nuevo turno';
  document.getElementById('formSub').textContent = 'Completá los datos y guardá el turno.';
  document.getElementById('turnoForm').reset();
  renderDirectorySuggestions();
  renderPetHistory();
  document.getElementById('f_fecha').value = fmtISO(selectedDate);
  document.getElementById('f_hora').value = '10:00';
  if(currentUserProfile && currentUserProfile.displayName){
    setLoadedByOption(currentUserProfile.displayName);
    document.getElementById('f_cargadoPor').value = currentUserProfile.displayName;
  }
  document.getElementById('btnDelete').style.display = 'none';
  setEstadoChip('pendiente');
  renderTimeSlots();
  renderSlotWarning();
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
  document.getElementById('f_instagram').value = t.instagram||'';
  document.getElementById('f_notas').value = t.notas||'';
  setLoadedByOption(t.cargadoPor || 'Dueña');
  document.getElementById('f_cargadoPor').value = t.cargadoPor||'Dueña';
  document.getElementById('btnDelete').style.display = canDeleteTurnos() ? 'inline-block' : 'none';
  setEstadoChip(t.estado||'pendiente');
  renderTimeSlots();
  renderSlotWarning();
  renderPetSuggestions();
  renderPetHistory();
  document.getElementById('overlay').classList.add('open');
}

document.getElementById('fabAdd').onclick = openNew;
document.getElementById('btnCancel').onclick = ()=> document.getElementById('overlay').classList.remove('open');
document.getElementById('overlay').onclick = (e)=>{ if(e.target.id==='overlay') e.currentTarget.classList.remove('open'); };

document.getElementById('btnDelete').onclick = async ()=>{
  if(!editingId) return;
  if(!canDeleteTurnos()){
    showToast('Solo admin puede eliminar turnos.');
    return;
  }
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
      instagram: document.getElementById('f_instagram').value.trim(),
      notas: document.getElementById('f_notas').value.trim(),
      estado: currentEstado,
      cargadoPor: document.getElementById('f_cargadoPor').value
    };

    const conflict = findSlotConflict(data);
    if(conflict){
      showToast(`Ya hay un turno a las ${data.hora}: ${conflict.mascota}`);
      fHora.focus();
      return;
    }

    await saveTurno(data);
    if(editingId){
      const idx = turnos.findIndex(t=>t.id===editingId);
      turnos[idx] = data;
    } else {
      turnos.push(data);
    }
    directory = await getDirectory(turnos);
    renderDirectorySuggestions();
    document.getElementById('overlay').classList.remove('open');
    selectedDate = new Date(data.fecha+'T00:00:00');
    syncVisibleMonth();
    render();
    showToast(editingId ? 'Turno actualizado' : 'Turno guardado');
  }catch(err){
    console.error(err);
    const message = err && err.message ? err.message : '';
    if(message.includes('turnos_unique_active_slot') || message.includes('duplicate key')){
      showToast('Ese horario ya esta ocupado.');
    } else if(isMissingInstagramColumnError(err)){
      showToast('Falta agregar la columna Instagram en Supabase.');
    } else {
      showToast('Algo falló al guardar. Probá de nuevo.');
    }
  }
};

initAuth();
