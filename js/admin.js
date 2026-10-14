import {guard} from './auth.js';
import {getClient} from './supabase-client.js';
import {createAdminService} from './admin-service.js';
import {participantSection} from './admin-participants.js';
import {puzzleSection} from './admin-puzzles.js';
import {adminErrorMessage} from './admin-validation.js';
import {errorNotice} from './admin-ui.js';
import {adminRankings} from './admin-rankings.js';
import {createArenaService} from './arena-service.js';
import {adminArena} from './admin-arena.js';

const service=createAdminService({rpc:async(...args)=>(await getClient()).rpc(...args)});
let active='overview',overviewRequest=0;
const sections={};
function accessDenied(error) {
  if(error?.message==='admin_required'||error?.code==='42501'||['PGRST301','PGRST303','bad_jwt','session_not_found'].includes(error?.code)||error?.status===401) {
    document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
    document.getElementById('retry-access').click();
  }
}
function changed(){loadOverview();}
async function loadOverview() {
  const request=++overviewRequest;const feedback=document.getElementById('overview-feedback');
  errorNotice(feedback,'');document.getElementById('overview-loading').hidden=false;
  document.getElementById('overview-stats').hidden=true;
  try {
    const data=await service.overview();if(request!==overviewRequest)return;
    document.querySelectorAll('[data-stat]').forEach(node=>{node.textContent=Number(data[node.dataset.stat]).toLocaleString();});
    document.getElementById('overview-stats').hidden=false;
  }catch(error){if(request===overviewRequest)errorNotice(feedback,adminErrorMessage(error));accessDenied(error);}
  finally{if(request===overviewRequest)document.getElementById('overview-loading').hidden=true;}
}
sections.overview={load:loadOverview};
sections.registrations=participantSection(document.getElementById('section-registrations'),service,{registrations:true,onChanged:changed,onAccessDenied:accessDenied});
sections.participants=participantSection(document.getElementById('section-participants'),service,{onChanged:changed,onAccessDenied:accessDenied});
sections.puzzles=puzzleSection(document.getElementById('section-puzzles'),service,{onChanged:changed,onAccessDenied:accessDenied});
sections.rankings=adminRankings(document.getElementById('section-rankings'),accessDenied);
sections.levels=adminArena(document.getElementById('section-levels'),createArenaService({rpc:async(...args)=>(await getClient()).rpc(...args)}),{onChanged:changed,onAccessDenied:accessDenied});

function navigate(name) {
  if(!sections[name])name='overview';active=name;
  document.querySelectorAll('[data-admin-section]').forEach(node=>{node.hidden=node.dataset.adminSection!==name;});
  document.querySelectorAll('[data-section-link]').forEach(link=>{
    const current=link.dataset.sectionLink===name;link.classList.toggle('active',current);
    if(current)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
  sections[name].load();
}
document.querySelectorAll('[data-section-link]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();history.replaceState(null,'',`#${link.dataset.sectionLink}`);navigate(link.dataset.sectionLink);}));
document.getElementById('refresh-overview').addEventListener('click',loadOverview);
document.addEventListener('access:blocked',()=>document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close()));
document.addEventListener('access:checking',()=>document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close()));
active=Object.hasOwn(sections,location.hash.slice(1))?location.hash.slice(1):'overview';
await guard('admin.html',profile=>{document.getElementById('welcome-name').textContent=profile.full_name;navigate(active);});
