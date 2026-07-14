import { inject } from '@vercel/analytics';
import { getCurrentSession, getUserProfile, onAuthChange, signIn, signOut } from './src/authRepository.js';
import { deleteCirugia, getCirugias, saveCirugia } from './src/cirugiasRepository.js';
import { getDirectory } from './src/directoryRepository.js';
import { deleteTurno, getTurnos, saveTurno } from './src/turnosRepository.js';

// Initialize Vercel Analytics
inject();

let turnos = [];
let cirugias = [];
let selectedDate = new Date();
let visibleMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
let editingId = null;
let editingCirugiaId = null;
let currentEstado = 'pendiente';
let currentCirugiaEstado = 'programada';
let unsubscribeAuth = null;
let currentUserProfile = null;
let directory = { clientes: [], mascotas: [] };
let expandedTurnoId = null;
let expandedCirugiaId = null;
let compactMode = localStorage.getItem('galata-compact-mode') === '1';
let activePage = 'unified';
let viewMode = localStorage.getItem('galata-view-mode') === 'month' ? 'month' : 'today';
let undoTimer = null;
let pendingUndo = null;
const ONBOARDING_STORAGE_KEY = 'galata-onboarding-completed-v1';
let onboardingStep = 0;

const ONBOARDING_STEPS = [
  {
    kicker: 'Bienvenida',
    title: 'Tu agenda, de un vistazo',
    text: 'Acá vas a ver juntos los turnos de peluquería y las cirugías de cada día.',
    icon: '🐾'
  },
  {
    kicker: 'Navegación',
    title: 'Elegí el día o mirá el mes',
    text: 'Tocá un día de la semana para abrir su agenda. Usá “Hoy” para volver rápido o “Mes” para planificar más adelante.',
    icon: '📅'
  },
  {
    kicker: 'Búsqueda',
    title: 'Encontrá un paciente rápido',
    text: 'Buscá por el nombre del dueño o de la mascota. También podés tocar una ficha para ver sus datos y acciones.',
    icon: '🔎'
  },
  {
    kicker: 'Nuevo registro',
    title: 'Creá turnos y cirugías',
    text: 'Usá el botón “+” para un turno de peluquería o “+ Cirugía”. El formulario te guía paso a paso.',
    icon: '＋'
  },
  {
    kicker: 'Seguimiento',
    title: 'Mantené cada cita al día',
    text: 'Desde cada ficha podés confirmar, completar o cancelar una cita y acceder a las opciones de contacto.',
    icon: '✓'
  }
];

function hasCompletedOnboarding(){
  try{ return localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1'; }
  catch(_err){ return false; }
}

function renderOnboardingStep(){
  const step = ONBOARDING_STEPS[onboardingStep];
  document.getElementById('onboardingKicker').textContent = `${step.kicker} · ${onboardingStep + 1} de ${ONBOARDING_STEPS.length}`;
  document.getElementById('onboardingTitle').textContent = step.title;
  document.getElementById('onboardingText').textContent = step.text;
  document.getElementById('onboardingVisual').textContent = step.icon;
  document.getElementById('onboardingBack').disabled = onboardingStep === 0;
  document.getElementById('onboardingNext').textContent = onboardingStep === ONBOARDING_STEPS.length - 1 ? 'Empezar' : 'Siguiente';
  document.getElementById('onboardingProgress').innerHTML = ONBOARDING_STEPS.map((_, index) =>
    `<span class="${index === onboardingStep ? 'active' : ''}" aria-hidden="true"></span>`
  ).join('');
}

function openOnboarding(){
  if(hasCompletedOnboarding()) return;
  onboardingStep = 0;
  renderOnboardingStep();
  const onboarding = document.getElementById('onboarding');
  onboarding.hidden = false;
  document.body.classList.add('onboarding-open');
  requestAnimationFrame(() => document.getElementById('onboardingNext').focus());
}

function completeOnboarding(){
  try{ localStorage.setItem(ONBOARDING_STORAGE_KEY, '1'); }catch(_err){}
  document.getElementById('onboarding').hidden = true;
  document.body.classList.remove('onboarding-open');
}

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

const SERVICIO_CLASS = {
  'Baño': 'servicio-bano',
  'Corte': 'servicio-corte',
  'Baño y corte': 'servicio-bano-corte',
  'Deslanado': 'servicio-deslanado',
  'Otro': 'servicio-otro'
};

const ESTADOS = ['pendiente','confirmado','realizado','cancelado'];
const ESTADO_LABEL = {
  todos: 'Todos',
  pendiente: 'Pendientes',
  confirmado: 'Confirmados',
  realizado: 'Realizados',
  cancelado: 'Cancelados'
};
const CIRUGIA_ESTADOS = ['programada','confirmada','realizada','cancelada'];
const CIRUGIA_ESTADO_LABEL = {
  programada: 'Programadas',
  confirmada: 'Confirmadas',
  realizada: 'Realizadas',
  cancelada: 'Canceladas'
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

async function loadCirugias(){
  try{
    cirugias = await getCirugias();
  }catch(e){
    console.error(e);
    cirugias = [];
    showToast('No se pudieron cargar las cirugias.');
  }
}

async function loadData(){
  await loadCirugias();
  await loadTurnos();
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

function timeToMinutes(value){
  if(!value) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if(Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function surgeryTimeHtml(cirugia){
  return `<span>${escapeHtml(cirugia.horaInicio)}</span><span>${escapeHtml(cirugia.horaFin)}</span>`;
}

function findSurgeryOverlaps(data){
  if(data.estado === 'cancelada') return [];
  const start = timeToMinutes(data.horaInicio);
  const end = timeToMinutes(data.horaFin);
  if(!data.fecha || start === null || end === null || end <= start) return [];

  return turnos
    .filter(t=>{
      if(t.fecha !== data.fecha || t.estado === 'cancelado') return false;
      const minutes = timeToMinutes(t.hora);
      return minutes !== null && minutes >= start && minutes < end;
    })
    .sort((a,b)=> a.hora.localeCompare(b.hora));
}

function currentSurgeryFormData(){
  return {
    id: editingCirugiaId || '',
    fecha: fieldValue('c_fecha'),
    horaInicio: fieldValue('c_horaInicio'),
    horaFin: fieldValue('c_horaFin'),
    estado: currentCirugiaEstado,
  };
}

function renderSurgeryOverlaps(){
  const container = document.getElementById('surgeryOverlaps');
  if(!container) return;
  const data = currentSurgeryFormData();
  const overlaps = findSurgeryOverlaps(data);
  const start = timeToMinutes(data.horaInicio);
  const end = timeToMinutes(data.horaFin);

  if(start !== null && end !== null && end <= start){
    container.classList.add('show');
    container.innerHTML = '<div class="overlap-title">Revisar horario</div><strong>La hora de fin tiene que ser posterior al inicio.</strong>';
    return;
  }

  if(overlaps.length === 0){
    container.classList.remove('show');
    container.innerHTML = '';
    return;
  }

  container.classList.add('show');
  container.innerHTML = `
    <div class="overlap-title">Se cruza con ${overlaps.length} turno${overlaps.length!==1?'s':''}</div>
    ${overlaps.map(t=>`
      <div class="overlap-item">
        <strong>${escapeHtml(t.hora)} · ${escapeHtml(t.mascota)} (${escapeHtml(t.dueno)})</strong>
        <span>${escapeHtml(t.servicio)}${t.cargadoPor ? ` · ${escapeHtml(t.cargadoPor)}` : ''}</span>
      </div>`).join('')}`;
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

function renderSurgeryTimeSlots(){
  const startContainer = document.getElementById('surgeryStartSlots');
  const endContainer = document.getElementById('surgeryEndSlots');
  if(!startContainer || !endContainer) return;

  const start = fieldValue('c_horaInicio');
  const end = fieldValue('c_horaFin');
  const endTimes = [...SUGGESTED_TIMES, '18:30', '19:00'];

  startContainer.innerHTML = SUGGESTED_TIMES.map(time=>{
    const classes = 'time-slot' + (start === time ? ' selected' : '');
    return `<button type="button" class="${classes}" data-time="${time}" data-target="c_horaInicio">${time}</button>`;
  }).join('');

  endContainer.innerHTML = endTimes.map(time=>{
    const classes = 'time-slot' + (end === time ? ' selected' : '');
    return `<button type="button" class="${classes}" data-time="${time}" data-target="c_horaFin">${time}</button>`;
  }).join('');

  document.querySelectorAll('.surgery-time-slots .time-slot').forEach(button=>{
    button.onclick = ()=>{
      document.getElementById(button.dataset.target).value = button.dataset.time;
      if(button.dataset.target === 'c_horaInicio'){
        const selectedStart = timeToMinutes(button.dataset.time);
        const selectedEnd = timeToMinutes(fieldValue('c_horaFin'));
        if(selectedStart !== null && selectedEnd !== null && selectedEnd <= selectedStart){
          const next = endTimes.find(time => timeToMinutes(time) > selectedStart);
          if(next) document.getElementById('c_horaFin').value = next;
        }
      }
      renderSurgeryTimeSlots();
      renderSurgeryOverlaps();
    };
  });
}

function syncSurgeryTimeControls(){
  renderSurgeryTimeSlots();
  renderSurgeryOverlaps();
}

function turnoMatchesQuery(turno, q){
  return ['dueno','mascota','telefono','instagram','servicio','tipoMascota','notas','cargadoPor']
    .some(key => turno[key] && turno[key].toLowerCase().includes(q));
}

function cirugiaMatchesQuery(cirugia, q){
  return ['dueno','mascota','telefono','procedimiento','tipoMascota','notas','cargadoPor']
    .some(key => cirugia[key] && cirugia[key].toLowerCase().includes(q));
}

function servicioClass(servicio){
  return SERVICIO_CLASS[servicio] || 'servicio-otro';
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

function surgeryStatusCounts(items){
  return CIRUGIA_ESTADOS.reduce((acc, estado)=>{
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

function renderCompactToggle(){
  const button = document.getElementById('compactToggle');
  if(!button) return;
  button.classList.toggle('active', compactMode);
}

function renderPageTabs(){
  document.querySelectorAll('[data-view]').forEach(tab=>tab.classList.toggle('active', tab.dataset.view === viewMode));
  document.getElementById('searchInput').placeholder = 'Buscar por dueño/a, mascota o servicio...';
}

function renderNextTurnoPanel(dayTurnos){
  const panel = document.getElementById('nextTurnoPanel');
  if(!panel) return;
  const isToday = fmtISO(selectedDate) === todayISO();
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const next = dayTurnos.find(t => t.estado !== 'cancelado' && (!isToday || t.hora >= currentTime));
  if(!next){
    panel.classList.remove('show');
    panel.innerHTML = '';
    return;
  }
  panel.classList.add('show');
  panel.innerHTML = `
    <div>
      <span>${isToday ? 'Próximo turno' : 'Primer turno del día'}</span>
      <strong>${escapeHtml(next.hora)} · ${escapeHtml(next.mascota)}</strong>
      <small>${escapeHtml(next.dueno)} · ${escapeHtml(next.servicio)}</small>
    </div>
    <button type="button" data-next-id="${next.id}">Ver</button>`;
  panel.querySelector('button').onclick = ()=>{
    expandedTurnoId = next.id;
    render();
    Array.from(document.querySelectorAll('.turno-row'))
      .find(row => row.dataset.id === next.id)
      ?.scrollIntoView({ behavior:'smooth', block:'center' });
  };
}

function selectedDayTitle(){
  return `${DIAS[selectedDate.getDay()]} ${selectedDate.getDate()} de ${MESES[selectedDate.getMonth()]}`;
}

function renderUpcomingPanel(){
  const panel = document.getElementById('upcomingPanel');
  if(!panel) return;
  if(activePage === 'cirugias'){
    panel.innerHTML = '';
    panel.classList.remove('show');
    return;
  }
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
  document.querySelectorAll('.edit-turno-btn[data-edit-id]').forEach(button=>{
    button.onclick = (event)=>{
      event.stopPropagation();
      openEdit(button.dataset.editId);
    };
  });
}

function attachCirugiaExpandedActions(){
  document.querySelectorAll('.edit-cirugia-btn').forEach(button=>{
    button.onclick = (event)=>{
      event.stopPropagation();
      openEditCirugia(button.dataset.editCirugiaId);
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
    if(estado==='cancelado'){
      offerUndo('Turno cancelado', async ()=>{ await saveTurno(current); turnos=turnos.map(t=>t.id===id?current:t); render(); showToast('Cancelación deshecha'); });
    } else showToast(`Turno ${capitalize(estado)}`);
  }catch(err){
    console.error(err);
    showToast('No se pudo cambiar el estado.');
  }
}

function attachQuickActions(){
  document.querySelectorAll('.turno-row button[data-action], .clinical-card button[data-action]').forEach(button=>{
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
}

function autofillPet(){
  const pet = selectedPet();
  if(pet && pet.tipoMascota && !document.getElementById('f_tipoMascota').value.trim()){
    document.getElementById('f_tipoMascota').value = pet.tipoMascota;
  }
}

function selectedClientFromFields(ownerId){
  const value = normalizeLookup(document.getElementById(ownerId).value);
  return directory.clientes.find(cliente => cliente.nombreNormalizado === value) || null;
}

function selectedPetFromFields(ownerId, petId){
  const client = selectedClientFromFields(ownerId);
  const petValue = normalizeLookup(document.getElementById(petId).value);
  return directory.mascotas.find(mascota =>
    mascota.nombreNormalizado === petValue &&
    (!client || mascota.clienteNormalizado === client.nombreNormalizado)
  ) || null;
}

function autofillSurgeryClient(){
  const client = selectedClientFromFields('c_dueno');
  if(client && client.telefono && !document.getElementById('c_telefono').value.trim()){
    document.getElementById('c_telefono').value = client.telefono;
  }
}

function autofillSurgeryPet(){
  const pet = selectedPetFromFields('c_dueno', 'c_mascota');
  if(pet && pet.tipoMascota && !document.getElementById('c_tipoMascota').value.trim()){
    document.getElementById('c_tipoMascota').value = pet.tipoMascota;
  }
}

function renderSessionBadge(user, profile){
  const badge = document.getElementById('sessionBadge');
  const displayName = profile && profile.displayName ? profile.displayName : user.email;
  badge.textContent = `${displayName} · ${roleLabel(profile && profile.role)}`;
  badge.classList.add('show');
}

async function showAppForUser(user, profile = null){
  if(document.activeElement && typeof document.activeElement.blur === 'function'){
    document.activeElement.blur();
  }
  window.scrollTo(0, 0);
  currentUserProfile = profile || await getUserProfile(user);
  document.body.classList.add('authenticated');
  document.getElementById('loginError').textContent = '';
  if(user) renderSessionBadge(user, currentUserProfile);
  await loadData();
  openOnboarding();
}

function showLogin(){
  turnos = [];
  cirugias = [];
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
  document.getElementById('toastMessage').textContent = msg;
  document.getElementById('toastUndo').classList.remove('show');
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2200);
}

function offerUndo(message, action){
  clearTimeout(undoTimer);
  pendingUndo = action;
  const toast = document.getElementById('toast');
  document.getElementById('toastMessage').textContent = message;
  document.getElementById('toastUndo').classList.add('show');
  toast.classList.add('show');
  undoTimer = setTimeout(()=>{ pendingUndo=null; toast.classList.remove('show'); }, 6000);
}

document.getElementById('toastUndo').onclick = async ()=>{
  if(!pendingUndo) return;
  const restore = pendingUndo;
  pendingUndo = null;
  clearTimeout(undoTimer);
  document.getElementById('toast').classList.remove('show');
  await restore();
};

function renderMonthView(){
  const grid = document.getElementById('monthGrid');
  const title = document.getElementById('monthTitle');
  grid.innerHTML = '';
  title.textContent = `${MESES[visibleMonth.getMonth()]} ${visibleMonth.getFullYear()}`;
  document.getElementById('subtitle').textContent = 'Agenda clínica unificada';

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
    const dayTurnos = turnos.filter(t=>t.fecha===iso && t.estado!=='cancelado');
    const dayCirugias = cirugias.filter(t=>t.fecha===iso && t.estado!=='cancelada');
    const count = dayTurnos.length + dayCirugias.length;
    const occupancy = Math.min(count / 8, 1);
    const level = occupancy >= .75 ? 'high' : occupancy >= .4 ? 'medium' : 'low';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'month-day'
      + (iso===selectedISO ? ' is-selected' : '')
      + (iso===today ? ' is-today' : '')
      + (count>0 ? ' has-turnos' : '');
    btn.innerHTML = `<span class="month-num">${day}</span><span class="occupancy-track"><span class="occupancy-bar ${level}" style="width:${Math.max(occupancy*100, count?25:0)}%"></span></span>`;
    btn.onclick = ()=>{
      selectedDate = d;
      syncVisibleMonth();
      document.getElementById('searchInput').value = '';
      document.getElementById('clearSearch').classList.remove('show');
      viewMode = 'today';
      localStorage.setItem('galata-view-mode', viewMode);
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
  renderNextTurnoPanel(allDayTurnos);
  renderCompactToggle();
  document.getElementById('dayCount').textContent = `${dayTurnos.length} turno${dayTurnos.length!==1?'s':''}`;

  const ledger = document.getElementById('ledger');
  if(dayTurnos.length===0){
    ledger.innerHTML = `<div class="empty-state">
      <div class="paw">${PAW_SVG('#6B6355')}</div>
      <p>No hay turnos cargados para este día.<br>Tocá el botón + para agendar uno.</p>
    </div>`;
    return;
  }
  ledger.classList.toggle('compact-ledger', compactMode);
  ledger.innerHTML = dayTurnos.map(t=>`
    <div class="turno-row estado-${t.estado} ${servicioClass(t.servicio)}" data-id="${t.id}">
      <div class="turno-hora">${t.hora}</div>
      <div class="turno-body">
        <div class="turno-nombres">${escapeHtml(t.dueno)} · <span class="mascota">${escapeHtml(t.mascota)}</span></div>
        <div class="turno-meta">
          <span class="badge badge-${t.estado}">${capitalize(t.estado)}</span>
          <span class="service-pill">${escapeHtml(t.servicio)}</span>
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

function renderSurgeryDaySummary(dayCirugias){
  const summary = document.getElementById('daySummary');
  const counts = surgeryStatusCounts(dayCirugias);
  summary.innerHTML = CIRUGIA_ESTADOS
    .filter(estado => counts[estado] > 0)
    .map(estado => `<span class="summary-pill summary-${estado}">${counts[estado]} ${CIRUGIA_ESTADO_LABEL[estado].toLowerCase()}</span>`)
    .join('');
}

function expandedCirugiaDetails(cirugia){
  if(expandedCirugiaId !== cirugia.id) return '';
  const overlaps = findSurgeryOverlaps(cirugia);
  return `
    <div class="turno-details">
      <div class="detail-grid">
        ${cirugia.telefono ? `<div><span>Telefono</span><strong>${escapeHtml(cirugia.telefono)}</strong></div>` : ''}
        ${cirugia.tipoMascota ? `<div><span>Tipo / raza</span><strong>${escapeHtml(cirugia.tipoMascota)}</strong></div>` : ''}
        <div><span>Cargado por</span><strong>${escapeHtml(cirugia.cargadoPor || '-')}</strong></div>
        <div><span>Cruces</span><strong>${overlaps.length} turno${overlaps.length!==1?'s':''}</strong></div>
        ${cirugia.notas ? `<div class="detail-full"><span>Notas</span><strong>${escapeHtml(cirugia.notas)}</strong></div>` : ''}
      </div>
      ${overlaps.length ? `
        <div class="surgery-overlap-list">
          ${overlaps.map(t=>`
            <div class="surgery-overlap-pill">
              <strong>${escapeHtml(t.hora)}</strong> ${escapeHtml(t.mascota)} <span>${escapeHtml(t.servicio)} · ${escapeHtml(t.dueno)}</span>
            </div>`).join('')}
        </div>` : ''}
      <button type="button" class="edit-turno-btn edit-cirugia-btn" data-edit-cirugia-id="${cirugia.id}">Editar cirugia</button>
    </div>`;
}

function renderCirugiasDay(){
  const iso = fmtISO(selectedDate);
  const label = document.getElementById('dayLabel');
  label.textContent = selectedDayTitle();

  const dayCirugias = cirugias
    .filter(t=>t.fecha===iso)
    .sort((a,b)=> a.horaInicio.localeCompare(b.horaInicio));
  renderSurgeryDaySummary(dayCirugias);
  document.getElementById('nextTurnoPanel').classList.remove('show');
  document.getElementById('nextTurnoPanel').innerHTML = '';
  renderCompactToggle();
  document.getElementById('dayCount').textContent = `${dayCirugias.length} cirugia${dayCirugias.length!==1?'s':''}`;

  const ledger = document.getElementById('ledger');
  ledger.classList.toggle('compact-ledger', compactMode);
  if(dayCirugias.length===0){
    ledger.innerHTML = `<div class="empty-state">
      <div class="paw">${PAW_SVG('#6B6355')}</div>
      <p>No hay cirugias cargadas para este dia.<br>Toca el boton + para programar una.</p>
    </div>`;
    return;
  }

  ledger.innerHTML = dayCirugias.map(cirugia=>{
    const overlaps = findSurgeryOverlaps(cirugia);
    return `
      <div class="turno-row surgery-row estado-${cirugia.estado}" data-id="${cirugia.id}">
        <div class="turno-hora surgery-time">${surgeryTimeHtml(cirugia)}</div>
        <div class="turno-body">
          <div class="turno-nombres">${escapeHtml(cirugia.dueno)} · <span class="mascota">${escapeHtml(cirugia.mascota)}</span></div>
          <div class="turno-meta">
            <span class="badge badge-${cirugia.estado}">${capitalize(cirugia.estado)}</span>
            <span class="service-pill">${escapeHtml(cirugia.procedimiento)}</span>
            ${cirugia.tipoMascota ? `<span>· ${escapeHtml(cirugia.tipoMascota)}</span>` : ''}
          </div>
          ${overlaps.length ? `
            <div class="notas-preview">${overlaps.length} cruce${overlaps.length!==1?'s':''}: ${overlaps.map(t=>`${escapeHtml(t.hora)} ${escapeHtml(t.mascota)}`).join(', ')}</div>
          ` : ''}
          ${cirugia.notas ? `<div class="notas-preview">${escapeHtml(cirugia.notas)}</div>` : ''}
          ${expandedCirugiaDetails(cirugia)}
        </div>
      </div>`;
  }).join('');

  ledger.querySelectorAll('.surgery-row').forEach(row=>{
    row.onclick = ()=>{
      expandedCirugiaId = expandedCirugiaId === row.dataset.id ? null : row.dataset.id;
      render();
    };
  });
  attachCirugiaExpandedActions();
}

function statusStamp(estado, isSurgery=false){
  const normalized = ({confirmada:'confirmado', realizada:'realizado', cancelada:'cancelado'})[estado] || estado;
  if(normalized === 'pendiente' || normalized === 'programada') return '';
  return `<span class="status-stamp stamp-${normalized}">${normalized}</span>`;
}

function renderWeekStrip(){
  const strip = document.getElementById('weekStrip');
  const quickToday=document.getElementById('quickTodayButton');
  const isToday=fmtISO(selectedDate)===todayISO();
  quickToday.disabled=isToday;
  quickToday.classList.toggle('is-current',isToday);
  const center = new Date(selectedDate);
  const mondayOffset = (center.getDay()+6)%7;
  const monday = new Date(center); monday.setDate(center.getDate()-mondayOffset);
  strip.innerHTML = Array.from({length:7}, (_,i)=>{
    const d = new Date(monday); d.setDate(monday.getDate()+i);
    const iso = fmtISO(d);
    const hasGrooming = turnos.some(t=>t.fecha===iso && t.estado!=='cancelado');
    const hasSurgery = cirugias.some(c=>c.fecha===iso && c.estado!=='cancelada');
    return `<button type="button" class="week-day ${iso===fmtISO(selectedDate)?'active':''} ${iso===todayISO()?'today':''}" data-date="${iso}"><span>${DIAS_CORTAS[d.getDay()].slice(0,2)}</span><strong>${d.getDate()}</strong><i>${hasGrooming?'<b class="groom-dot"></b>':''}${hasSurgery?'<b class="surgery-dot"></b>':''}</i></button>`;
  }).join('');
  strip.querySelectorAll('[data-date]').forEach(btn=>btn.onclick=()=>{ selectedDate=new Date(btn.dataset.date+'T00:00:00'); syncVisibleMonth(); render(); });
}

function setupWeekSwipe(){
  const strip=document.getElementById('weekStrip');
  let startX=0;
  let startY=0;
  let tracking=false;
  let swipeConsumed=false;

  strip.addEventListener('pointerdown',event=>{
    startX=event.clientX;
    startY=event.clientY;
    tracking=true;
    strip.classList.add('is-dragging');
  });
  strip.addEventListener('pointerup',event=>{
    if(!tracking) return;
    tracking=false;
    strip.classList.remove('is-dragging');
    const deltaX=event.clientX-startX;
    const deltaY=event.clientY-startY;
    if(Math.abs(deltaX)<45 || Math.abs(deltaX)<=Math.abs(deltaY)) return;
    swipeConsumed=true;
    selectedDate.setDate(selectedDate.getDate()+(deltaX<0?7:-7));
    syncVisibleMonth();
    strip.classList.add(deltaX<0?'slide-next':'slide-prev');
    render();
    setTimeout(()=>{
      strip.classList.remove('slide-next','slide-prev');
      swipeConsumed=false;
    },220);
  });
  strip.addEventListener('pointercancel',()=>{
    tracking=false;
    strip.classList.remove('is-dragging');
  });
  strip.addEventListener('click',event=>{
    if(!swipeConsumed) return;
    event.preventDefault();
    event.stopPropagation();
  },true);
}

function renderTimeRuler(){
  const iso=fmtISO(selectedDate), ruler=document.getElementById('timeRuler');
  const activeTurnos=turnos.filter(t=>t.fecha===iso && t.estado!=='cancelado');
  const activeSurgeries=cirugias.filter(c=>c.fecha===iso && c.estado!=='cancelada');
  const slots=[];
  for(let mins=9*60; mins<19*60; mins+=30){
    const time=`${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`;
    const turno=activeTurnos.find(t=>timeToMinutes(t.hora)===mins);
    const surgery=activeSurgeries.find(c=>mins>=timeToMinutes(c.horaInicio) && mins<timeToMinutes(c.horaFin));
    const item=surgery||turno, type=surgery?'surgery':turno?'grooming':'free';
    slots.push(`<button type="button" class="ruler-slot ${type}" data-time="${time}" ${item?'disabled':''}><time>${time}</time><span>${item?escapeHtml(item.mascota)+' · '+escapeHtml(item.procedimiento||item.servicio):'+ Dar turno'}</span></button>`);
  }
  ruler.innerHTML=`<div class="ruler-heading"><strong>Disponibilidad</strong><span>09:00—19:00</span></div><div class="ruler-scroll">${slots.join('')}</div>`;
  ruler.querySelectorAll('.ruler-slot.free').forEach(btn=>btn.onclick=()=>{ openNew(); document.getElementById('f_hora').value=btn.dataset.time; renderTimeSlots(); renderSlotWarning(); });
}

function renderUnifiedDay(){
  const iso=fmtISO(selectedDate), ledger=document.getElementById('ledger');
  const items=[
    ...turnos.filter(t=>t.fecha===iso).map(data=>({type:'grooming',time:data.hora,data})),
    ...cirugias.filter(c=>c.fecha===iso).map(data=>({type:'surgery',time:data.horaInicio,data}))
  ].sort((a,b)=>a.time.localeCompare(b.time));
  document.getElementById('dayLabel').textContent=selectedDayTitle();
  document.getElementById('dayCount').textContent=`${items.length} cita${items.length!==1?'s':''}`;
  document.getElementById('daySummary').innerHTML=`<span class="summary-pill summary-confirmado">${items.filter(i=>i.type==='grooming').length} peluquería</span><span class="summary-pill summary-confirmada">${items.filter(i=>i.type==='surgery').length} cirugía</span>`;
  document.getElementById('nextTurnoPanel').classList.remove('show');
  document.getElementById('upcomingPanel').innerHTML='';
  if(!items.length){ ledger.innerHTML='<div class="empty-state"><p>El día está libre. Elegí un hueco para dar un turno.</p></div>'; return; }
  ledger.innerHTML=items.map(({type,time,data})=>{
    const surgery=type==='surgery';
    return `<article class="clinical-card ${type}" data-kind="${type}" data-id="${data.id}"><div class="timeline-node"></div><time class="clinical-time">${time}</time><div class="clinical-body"><h3>${escapeHtml(data.mascota)} <small>· ${escapeHtml(data.dueno)}</small></h3><span class="service-tag">${escapeHtml(data.procedimiento||data.servicio)}</span>${data.tipoMascota?`<span class="pet-type">${escapeHtml(data.tipoMascota)}</span>`:''}${data.notas?`<p class="clinical-note">⚠ ${escapeHtml(data.notas)}</p>`:''}${surgery?expandedCirugiaDetails(data):`<div class="quick-actions"><div class="status-actions"><button data-action="confirmado" data-id="${data.id}">Confirmar</button><button data-action="realizado" data-id="${data.id}">Realizado</button><button data-action="cancelado" data-id="${data.id}">Cancelar</button></div></div>${expandedTurnoDetails(data)}`}</div>${statusStamp(data.estado,surgery)}${!surgery?contactRail(data):''}</article>`;
  }).join('');
  ledger.querySelectorAll('.clinical-card').forEach(row=>row.onclick=()=>{ if(row.dataset.kind==='surgery') expandedCirugiaId=expandedCirugiaId===row.dataset.id?null:row.dataset.id; else expandedTurnoId=expandedTurnoId===row.dataset.id?null:row.dataset.id; render(); });
  attachQuickActions(); attachExpandedActions(); attachCirugiaExpandedActions();
}

function render(){
  renderPageTabs();
  renderAlertBanner();
  renderMonthView();
  renderWeekStrip();
  document.querySelector('.month-card').classList.toggle('visible', viewMode==='month');
  document.getElementById('weekStrip').classList.toggle('hidden', viewMode==='month');
  document.querySelector('.week-navigation').classList.toggle('hidden', viewMode==='month');
  document.getElementById('timeRuler').classList.toggle('hidden', viewMode==='month');
  document.querySelector('.day-label').classList.toggle('hidden', viewMode==='month');
  document.getElementById('daySummary').classList.toggle('hidden', viewMode==='month');
  document.getElementById('nextTurnoPanel').classList.toggle('hidden', viewMode==='month');
  document.getElementById('upcomingPanel').classList.toggle('hidden', viewMode==='month');
  document.getElementById('ledger').classList.toggle('hidden', viewMode==='month');
  const query = document.getElementById('searchInput').value.trim();
  if(query.length > 0){
    renderSearchResults(query);
  } else if(viewMode==='today') {
    renderTimeRuler();
    renderUnifiedDay();
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
  const matches = activePage === 'cirugias'
    ? cirugias
      .filter(t => cirugiaMatchesQuery(t, q))
      .sort((a,b)=> (a.fecha+a.horaInicio).localeCompare(b.fecha+b.horaInicio))
    : turnos
      .filter(t => turnoMatchesQuery(t, q))
      .sort((a,b)=> (a.fecha+a.hora).localeCompare(b.fecha+b.hora));

  document.getElementById('dayCount').textContent = `${matches.length} resultado${matches.length!==1?'s':''}`;
  document.getElementById('daySummary').innerHTML = '';
  document.getElementById('nextTurnoPanel').classList.remove('show');
  document.getElementById('nextTurnoPanel').innerHTML = '';
  renderCompactToggle();
  const ledger = document.getElementById('ledger');
  if(matches.length===0){
    ledger.innerHTML = `<div class="empty-state">
      <div class="paw">${PAW_SVG('#6B6355')}</div>
      <p>No encontramos ningún turno con ese nombre.</p>
    </div>`;
    return;
  }
  if(activePage === 'cirugias'){
    ledger.innerHTML = matches.map(cirugia=>{
      const d = new Date(cirugia.fecha+'T00:00:00');
      const fechaLegible = `${DIAS_CORTAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()].slice(0,3)}`;
      const overlaps = findSurgeryOverlaps(cirugia);
      return `
      <div class="turno-row surgery-row estado-${cirugia.estado}" data-id="${cirugia.id}">
        <div class="turno-hora surgery-time">${surgeryTimeHtml(cirugia)}<div class="search-result-date">${fechaLegible}</div></div>
        <div class="turno-body">
          <div class="turno-nombres">${escapeHtml(cirugia.dueno)} · <span class="mascota">${escapeHtml(cirugia.mascota)}</span></div>
          <div class="turno-meta">
            <span class="badge badge-${cirugia.estado}">${capitalize(cirugia.estado)}</span>
            <span class="service-pill">${escapeHtml(cirugia.procedimiento)}</span>
          </div>
          ${overlaps.length ? `<div class="notas-preview">${overlaps.length} cruce${overlaps.length!==1?'s':''} con turnos</div>` : ''}
          ${expandedCirugiaDetails(cirugia)}
        </div>
      </div>`;
    }).join('');
    ledger.querySelectorAll('.surgery-row').forEach(row=>{
      row.onclick = ()=>{
        expandedCirugiaId = expandedCirugiaId === row.dataset.id ? null : row.dataset.id;
        render();
      };
    });
    attachCirugiaExpandedActions();
    return;
  }

  ledger.innerHTML = matches.map(t=>{
    const d = new Date(t.fecha+'T00:00:00');
    const fechaLegible = `${DIAS_CORTAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()].slice(0,3)}`;
    return `
    <div class="turno-row estado-${t.estado} ${servicioClass(t.servicio)}" data-id="${t.id}">
      <div class="turno-hora">${t.hora}<div class="search-result-date">${fechaLegible}</div></div>
      <div class="turno-body">
        <div class="turno-nombres">${escapeHtml(t.dueno)} · <span class="mascota">${escapeHtml(t.mascota)}</span></div>
        <div class="turno-meta">
          <span class="badge badge-${t.estado}">${capitalize(t.estado)}</span>
          <span class="service-pill">${escapeHtml(t.servicio)}</span>
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

document.getElementById('compactToggle').onclick = ()=>{
  compactMode = !compactMode;
  localStorage.setItem('galata-compact-mode', compactMode ? '1' : '0');
  render();
};

document.getElementById('searchInput').addEventListener('input', (e)=>{
  document.getElementById('clearSearch').classList.toggle('show', e.target.value.trim().length>0);
  render();
});
document.getElementById('clearSearch').onclick = ()=>{
  document.getElementById('searchInput').value = '';
  document.getElementById('clearSearch').classList.remove('show');
  render();
};
document.querySelectorAll('[data-view]').forEach(tab=>{
  tab.onclick = ()=>{
    viewMode = tab.dataset.view;
    localStorage.setItem('galata-view-mode', viewMode);
    expandedTurnoId = null;
    expandedCirugiaId = null;
    document.getElementById('searchInput').value = '';
    document.getElementById('clearSearch').classList.remove('show');
    render();
  };
});

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
document.getElementById('c_dueno').addEventListener('input', autofillSurgeryClient);
document.getElementById('c_mascota').addEventListener('input', autofillSurgeryPet);
['c_fecha','c_horaInicio','c_horaFin'].forEach(id=>{
  document.getElementById(id).addEventListener('input', syncSurgeryTimeControls);
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
document.getElementById('quickTodayButton').onclick = goToday;

function setEstadoChip(estado){
  currentEstado = estado;
  document.querySelectorAll('#estadoChoices .estado-chip').forEach(chip=>{
    chip.classList.remove('active-pendiente','active-confirmado','active-realizado','active-cancelado');
    if(chip.dataset.estado === estado){
      chip.classList.add('active-'+estado);
    }
  });
  renderTimeSlots();
  renderSlotWarning();
}
document.querySelectorAll('#estadoChoices .estado-chip').forEach(chip=>{
  chip.onclick = ()=> setEstadoChip(chip.dataset.estado);
});
document.querySelectorAll('.surgery-chip').forEach(chip=>{
  chip.onclick = ()=> setCirugiaEstadoChip(chip.dataset.estado);
});

function openNew(){
  setWizardStep('turnoForm',1);
  editingId = null;
  document.getElementById('formTitle').textContent = 'Nuevo turno';
  document.getElementById('formSub').textContent = 'Completá los datos y guardá el turno.';
  document.getElementById('turnoForm').reset();
  renderDirectorySuggestions();
  document.getElementById('f_fecha').value = fmtISO(selectedDate);
  document.getElementById('f_hora').value = '10:00';
  document.getElementById('btnDelete').style.display = 'none';
  setEstadoChip('pendiente');
  renderTimeSlots();
  renderSlotWarning();
  document.getElementById('overlay').classList.add('open');
}

function openEdit(id){
  const t = turnos.find(x=>x.id===id);
  if(!t) return;
  setWizardStep('turnoForm',1);
  editingId = id;
  document.getElementById('formTitle').textContent = 'Editar turno';
  document.getElementById('formSub').textContent = 'Modificá los datos necesarios y guardá los cambios.';
  document.getElementById('f_fecha').value = t.fecha;
  document.getElementById('f_hora').value = t.hora;
  document.getElementById('f_dueno').value = t.dueno;
  document.getElementById('f_mascota').value = t.mascota;
  document.getElementById('f_tipoMascota').value = t.tipoMascota||'';
  document.getElementById('f_servicio').value = t.servicio;
  document.getElementById('f_telefono').value = t.telefono||'';
  document.getElementById('f_instagram').value = t.instagram||'';
  document.getElementById('f_notas').value = t.notas||'';
  document.getElementById('btnDelete').style.display = canDeleteTurnos() ? 'grid' : 'none';
  setEstadoChip(t.estado||'pendiente');
  renderTimeSlots();
  renderSlotWarning();
  renderPetSuggestions();
  document.getElementById('overlay').classList.add('open');
}

function setCirugiaEstadoChip(estado){
  currentCirugiaEstado = estado;
  document.querySelectorAll('.surgery-chip').forEach(chip=>{
    chip.classList.remove('active-programada','active-confirmada','active-realizada','active-cancelada');
    if(chip.dataset.estado === estado){
      chip.classList.add('active-'+estado);
    }
  });
  renderSurgeryOverlaps();
}

function openNewCirugia(){
  setWizardStep('cirugiaForm',1);
  editingCirugiaId = null;
  document.getElementById('cirugiaFormTitle').textContent = 'Nueva cirugia';
  document.getElementById('cirugiaFormSub').textContent = 'Programa la cirugia y revisa los turnos que se cruzan.';
  document.getElementById('cirugiaForm').reset();
  renderDirectorySuggestions();
  document.getElementById('c_fecha').value = fmtISO(selectedDate);
  document.getElementById('c_horaInicio').value = '10:00';
  document.getElementById('c_horaFin').value = '12:00';
  document.getElementById('btnDeleteCirugia').style.display = 'none';
  setCirugiaEstadoChip('programada');
  syncSurgeryTimeControls();
  document.getElementById('cirugiaOverlay').classList.add('open');
}

function openEditCirugia(id){
  const cirugia = cirugias.find(x=>x.id===id);
  if(!cirugia) return;
  setWizardStep('cirugiaForm',1);
  editingCirugiaId = id;
  document.getElementById('cirugiaFormTitle').textContent = 'Editar cirugia';
  document.getElementById('cirugiaFormSub').textContent = 'Modificá los datos necesarios y guardá los cambios.';
  document.getElementById('c_fecha').value = cirugia.fecha;
  document.getElementById('c_horaInicio').value = cirugia.horaInicio;
  document.getElementById('c_horaFin').value = cirugia.horaFin;
  document.getElementById('c_procedimiento').value = cirugia.procedimiento;
  document.getElementById('c_dueno').value = cirugia.dueno;
  document.getElementById('c_mascota').value = cirugia.mascota;
  document.getElementById('c_tipoMascota').value = cirugia.tipoMascota||'';
  document.getElementById('c_telefono').value = cirugia.telefono||'';
  document.getElementById('c_notas').value = cirugia.notas||'';
  document.getElementById('btnDeleteCirugia').style.display = canDeleteTurnos() ? 'grid' : 'none';
  setCirugiaEstadoChip(cirugia.estado||'programada');
  syncSurgeryTimeControls();
  document.getElementById('cirugiaOverlay').classList.add('open');
}

document.getElementById('fabAdd').onclick = openNew;
document.getElementById('fabSurgery').onclick = openNewCirugia;
document.getElementById('btnCancel').onclick = ()=> document.getElementById('overlay').classList.remove('open');
document.getElementById('overlay').onclick = (e)=>{ if(e.target.id==='overlay') e.currentTarget.classList.remove('open'); };
document.getElementById('btnCancelCirugia').onclick = ()=> document.getElementById('cirugiaOverlay').classList.remove('open');
document.getElementById('cirugiaOverlay').onclick = (e)=>{ if(e.target.id==='cirugiaOverlay') e.currentTarget.classList.remove('open'); };

document.getElementById('btnDelete').onclick = async ()=>{
  if(!editingId) return;
  if(!canDeleteTurnos()){
    showToast('Solo admin puede eliminar turnos.');
    return;
  }
  if(!confirm('¿Eliminar este turno?')) return;
  const deletedId = editingId;
  const deleted = turnos.find(t=>t.id===deletedId);
  turnos = turnos.filter(t=>t.id!==editingId);
  try{
    await deleteTurno(deletedId);
    document.getElementById('overlay').classList.remove('open');
    render();
    offerUndo('Turno eliminado', async ()=>{ await saveTurno(deleted); turnos.push(deleted); render(); showToast('Turno restaurado'); });
  }catch(err){
    console.error(err);
    await loadTurnos();
    showToast('No se pudo eliminar. Probá de nuevo.');
  }
};

document.getElementById('btnDeleteCirugia').onclick = async ()=>{
  if(!editingCirugiaId) return;
  if(!canDeleteTurnos()){
    showToast('Solo admin puede eliminar cirugias.');
    return;
  }
  if(!confirm('Eliminar esta cirugia?')) return;
  const deletedId = editingCirugiaId;
  const deleted = cirugias.find(c=>c.id===deletedId);
  cirugias = cirugias.filter(t=>t.id!==editingCirugiaId);
  try{
    await deleteCirugia(deletedId);
    document.getElementById('cirugiaOverlay').classList.remove('open');
    render();
    offerUndo('Cirugía eliminada', async ()=>{ await saveCirugia(deleted); cirugias.push(deleted); render(); showToast('Cirugía restaurada'); });
  }catch(err){
    console.error(err);
    await loadCirugias();
    render();
    showToast('No se pudo eliminar. Proba de nuevo.');
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
    const previousTurno = editingId ? turnos.find(t=>t.id===editingId) : null;
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
      cargadoPor: previousTurno?.cargadoPor || currentUserProfile?.displayName || currentUserProfile?.email || 'Usuario'
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
    if(previousTurno && data.estado==='cancelado' && previousTurno.estado!=='cancelado'){
      offerUndo('Turno cancelado', async ()=>{ await saveTurno(previousTurno); turnos=turnos.map(t=>t.id===previousTurno.id?previousTurno:t); render(); showToast('Cancelación deshecha'); });
    } else showToast(editingId ? 'Turno actualizado' : 'Turno guardado');
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

document.getElementById('cirugiaForm').onsubmit = async (e)=>{
  e.preventDefault();
  try{
    const previousCirugia = editingCirugiaId ? cirugias.find(c=>c.id===editingCirugiaId) : null;
    const fFecha = document.getElementById('c_fecha');
    const fInicio = document.getElementById('c_horaInicio');
    const fFin = document.getElementById('c_horaFin');
    const fProcedimiento = document.getElementById('c_procedimiento');
    const fDueno = document.getElementById('c_dueno');
    const fMascota = document.getElementById('c_mascota');

    let faltantes = [];
    if(!fFecha.value) faltantes.push(fFecha);
    if(!fInicio.value) faltantes.push(fInicio);
    if(!fFin.value) faltantes.push(fFin);
    if(!fProcedimiento.value.trim()) faltantes.push(fProcedimiento);
    if(!fDueno.value.trim()) faltantes.push(fDueno);
    if(!fMascota.value.trim()) faltantes.push(fMascota);

    if(faltantes.length > 0){
      faltantes.forEach(marcarInvalido);
      showToast('Faltan completar campos obligatorios (marcados en rojo)');
      faltantes[0].focus();
      return;
    }

    if(timeToMinutes(fFin.value) <= timeToMinutes(fInicio.value)){
      marcarInvalido(fFin);
      showToast('La hora de fin tiene que ser posterior al inicio.');
      fFin.focus();
      return;
    }

    const data = {
      id: editingCirugiaId || ('c_'+Date.now()+'_'+Math.random().toString(36).slice(2,7)),
      fecha: fFecha.value,
      horaInicio: fInicio.value,
      horaFin: fFin.value,
      procedimiento: fProcedimiento.value.trim(),
      dueno: fDueno.value.trim(),
      mascota: fMascota.value.trim(),
      tipoMascota: document.getElementById('c_tipoMascota').value.trim(),
      telefono: document.getElementById('c_telefono').value.trim(),
      notas: document.getElementById('c_notas').value.trim(),
      estado: currentCirugiaEstado,
      cargadoPor: previousCirugia?.cargadoPor || currentUserProfile?.displayName || currentUserProfile?.email || 'Usuario'
    };

    await saveCirugia(data);
    if(editingCirugiaId){
      const idx = cirugias.findIndex(t=>t.id===editingCirugiaId);
      cirugias[idx] = data;
    } else {
      cirugias.push(data);
    }
    document.getElementById('cirugiaOverlay').classList.remove('open');
    selectedDate = new Date(data.fecha+'T00:00:00');
    syncVisibleMonth();
    render();
    if(previousCirugia && data.estado==='cancelada' && previousCirugia.estado!=='cancelada'){
      offerUndo('Cirugía cancelada', async ()=>{ await saveCirugia(previousCirugia); cirugias=cirugias.map(c=>c.id===previousCirugia.id?previousCirugia:c); render(); showToast('Cancelación deshecha'); });
    } else showToast(editingCirugiaId ? 'Cirugia actualizada' : 'Cirugia guardada');
  }catch(err){
    console.error(err);
    showToast('Algo fallo al guardar la cirugia. Proba de nuevo.');
  }
};

document.getElementById('onboardingSkip').onclick = completeOnboarding;
document.getElementById('onboardingBack').onclick = ()=>{
  if(onboardingStep > 0){
    onboardingStep--;
    renderOnboardingStep();
  }
};
document.getElementById('onboardingNext').onclick = ()=>{
  if(onboardingStep === ONBOARDING_STEPS.length - 1){
    completeOnboarding();
    return;
  }
  onboardingStep++;
  renderOnboardingStep();
};

function buildFormWizard({ formId, firstStepIds, splitFieldId, splitSiblingBeforeId, nextLabel }){
  const form = document.getElementById(formId);
  const stepOne = document.createElement('div');
  const stepTwo = document.createElement('div');
  stepOne.className = 'wizard-step wizard-step-one';
  stepTwo.className = 'wizard-step wizard-step-two';

  const nodes = Array.from(form.children);
  const firstNodes = firstStepIds.map(id=>document.getElementById(id)).filter(Boolean);
  const topLevelNode = node=>{
    let current=node;
    while(current.parentElement && current.parentElement!==form) current=current.parentElement;
    return current;
  };
  const firstContainers = new Set(firstNodes.map(topLevelNode));
  if(nodes[0]) firstContainers.add(nodes[0]);
  nodes.forEach(node=>(firstContainers.has(node) ? stepOne : stepTwo).appendChild(node));

  if(splitFieldId){
    const splitField = document.getElementById(splitFieldId)?.closest('.field');
    if(splitField){
      const sourceRow=splitField.parentElement;
      stepOne.appendChild(splitField);
      if(sourceRow?.children.length){
        const before=splitSiblingBeforeId ? document.getElementById(splitSiblingBeforeId)?.closest('.field, .row2') : null;
        const siblings=Array.from(sourceRow.children);
        siblings.forEach(sibling=>before && before.parentElement===stepTwo ? stepTwo.insertBefore(sibling,before) : stepTwo.appendChild(sibling));
        sourceRow.remove();
      }
    }
  }

  const progress = document.createElement('div');
  progress.className = 'wizard-progress';
  progress.innerHTML = '<span class="active"><b>1</b> Turno</span><i></i><span><b>2</b> Paciente</span>';

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn btn-primary wizard-next';
  next.textContent = nextLabel;
  stepOne.appendChild(next);

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'btn btn-secondary wizard-back';
  back.textContent = '← Volver';
  const actions = stepTwo.querySelector('.form-actions');
  if(actions) actions.prepend(back);

  form.append(progress, stepOne, stepTwo);
  const deleteButton=form.querySelector('.btn-delete');
  if(deleteButton){
    deleteButton.classList.add('form-delete-top');
    form.insertBefore(deleteButton,progress);
  }
  next.onclick = ()=>{
    const required = firstStepIds
      .map(id=>document.getElementById(id))
      .filter(element=>element && element.matches('input, select, textarea'));
    const invalid = required.find(input=>!input.value || !input.value.trim());
    if(invalid){
      marcarInvalido(invalid);
      invalid.focus();
      showToast('Completá los datos del turno para continuar');
      return;
    }
    if(formId==='cirugiaForm' && timeToMinutes(fieldValue('c_horaFin'))<=timeToMinutes(fieldValue('c_horaInicio'))){
      const end=document.getElementById('c_horaFin');
      marcarInvalido(end); end.focus(); showToast('La hora de fin debe ser posterior al inicio'); return;
    }
    setWizardStep(formId, 2);
  };
  back.onclick = ()=>setWizardStep(formId, 1);
}

function setWizardStep(formId, step){
  const form=document.getElementById(formId);
  form.dataset.step=String(step);
  form.querySelector('.wizard-step-one').classList.toggle('active',step===1);
  form.querySelector('.wizard-step-two').classList.toggle('active',step===2);
  const markers=form.querySelectorAll('.wizard-progress span');
  markers.forEach((marker,index)=>marker.classList.toggle('active',index<step));
  form.closest('.card-form')?.scrollTo({top:0,behavior:'smooth'});
}

buildFormWizard({
  formId:'turnoForm',
  firstStepIds:['f_fecha','f_hora','f_servicio','slotWarning','timeSlots'],
  splitFieldId:'f_servicio',
  splitSiblingBeforeId:'f_instagram',
  nextLabel:'Continuar con paciente →'
});
{
  const phoneField=document.getElementById('f_telefono').closest('.field');
  const oldPhoneRow=phoneField.parentElement;
  const instagramField=document.getElementById('f_instagram').closest('.field');
  instagramField.parentElement.insertBefore(phoneField,instagramField);
  if(oldPhoneRow.classList.contains('row2') && !oldPhoneRow.children.length) oldPhoneRow.remove();
}
buildFormWizard({
  formId:'cirugiaForm',
  firstStepIds:['c_fecha','c_procedimiento','c_horaInicio','c_horaFin','surgeryStartSlots','surgeryEndSlots','surgeryOverlaps'],
  nextLabel:'Continuar con paciente →'
});
setWizardStep('turnoForm',1);
setWizardStep('cirugiaForm',1);
setupWeekSwipe();

function updateConnectionStatus(){
  const status=document.getElementById('connectionStatus');
  const online=navigator.onLine;
  status.classList.toggle('offline',!online);
  document.getElementById('connectionText').textContent=online?'Conectado':'Sin conexión';
}
window.addEventListener('online',updateConnectionStatus);
window.addEventListener('offline',updateConnectionStatus);
updateConnectionStatus();
initAuth();
