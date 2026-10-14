import {getClient} from './supabase-client.js';
import {createCompetitionService} from './competition-service.js';
import {leaderboardSection} from './leaderboard-ui.js';
export function adminRankings(root,onError) {
  const service=createCompetitionService({rpc:async(...args)=>(await getClient()).rpc(...args)});
  return leaderboardSection(root,service.adminRankings,{admin:true,onError});
}
