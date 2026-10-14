import {getClient} from './supabase-client.js';
import {createCompetitionService} from './competition-service.js';
import {leaderboardSection} from './leaderboard-ui.js';
const service=createCompetitionService({rpc:async(...args)=>(await getClient()).rpc(...args)});
const root=document.querySelector('[data-public-leaderboard]');
if(root){const board=leaderboardSection(root,service.leaderboard,{pageSize:Number(root.dataset.pageSize)||20});await board.load();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')board.load();});}
