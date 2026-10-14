import {guard} from './auth.js';
import {getClient} from './supabase-client.js';
import {createCompetitionService} from './competition-service.js';
import {competitionErrorMessage} from './competition-validation.js';
import {studentPuzzles} from './student-puzzles.js';
import {leaderboardSection} from './leaderboard-ui.js';
import {errorNotice,formatDate} from './admin-ui.js';
import {createArenaService} from './arena-service.js';
import {studentArena} from './student-arena.js';

const service=createCompetitionService({rpc:async(...args)=>(await getClient()).rpc(...args)});
let active='puzzles',overviewGeneration=0;
function accessDenied(error) {if(error?.message==='student_not_eligible'||error?.message==='authentication_required'||error?.code==='42501'||['PGRST301','PGRST303'].includes(error?.code))document.getElementById('retry-access').click();}
async function overview(){const request=++overviewGeneration;const feedback=document.getElementById('progress-feedback');
  document.getElementById('student-stats').hidden=true;errorNotice(feedback,'');document.getElementById('progress-loading').hidden=false;
  try{const data=await service.overview();if(request!==overviewGeneration)return;document.querySelectorAll('[data-student-stat]').forEach(node=>{node.textContent=Number(data[node.dataset.studentStat]).toLocaleString();});document.getElementById('student-stats').hidden=false;}
  catch(error){if(request===overviewGeneration)errorNotice(feedback,competitionErrorMessage(error));accessDenied(error);}
  finally{if(request===overviewGeneration)document.getElementById('progress-loading').hidden=true;}
}
const board=leaderboardSection(document.getElementById('student-leaderboard'),service.leaderboard,{onError:accessDenied});
const puzzles=studentPuzzles(document.getElementById('student-puzzles'),service,{onChanged(){overview();board.load();arena.load();},onAccessDenied:accessDenied});
const arena=studentArena(document.getElementById('student-arena'),createArenaService({rpc:async(...args)=>(await getClient()).rpc(...args)}),{onQuestion:puzzles.open,onChanged(){overview();board.load();},onAccessDenied:accessDenied});
const sections={puzzles:{load(){puzzles.load();arena.load();}},profile:{load(){}},leaderboard:board};
function navigate(name){if(!sections[name])name='puzzles';active=name;
  document.getElementById('student-arena').hidden=name!=='puzzles';
  document.querySelectorAll('[data-student-section]').forEach(node=>{node.hidden=node.dataset.studentSection!==name;});
  document.querySelectorAll('[data-student-link]').forEach(link=>{const current=link.dataset.studentLink===name;link.classList.toggle('active',current);if(current)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});sections[name].load();}
document.querySelectorAll('[data-student-link]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();history.replaceState(null,'',`#${link.dataset.studentLink}`);navigate(link.dataset.studentLink);}));
document.getElementById('refresh-progress').addEventListener('click',()=>{overview();arena.load();});
document.addEventListener('access:checking',()=>{overviewGeneration++;board.invalidate();});
document.addEventListener('access:blocked',()=>{overviewGeneration++;board.invalidate();});
active=Object.hasOwn(sections,location.hash.slice(1))?location.hash.slice(1):'puzzles';
await guard('student.html',profile=>{
  document.getElementById('welcome-name').textContent=profile.full_name;
  for(const field of ['full_name','email','registration_number','department','semester','status','created_at'])document.querySelector(`[data-profile-field=${field}]`).textContent=field==='created_at'?formatDate(profile[field]):String(profile[field]);
  overview();navigate(active);if(active!=='puzzles')arena.load();
});
