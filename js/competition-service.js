export function createCompetitionService(client) {
  async function rpc(name,args={}){const {data,error}=await client.rpc(name,args);if(error)throw error;return data;}
  return {
    overview:()=>rpc('student_overview'),
    puzzles:({page=1,pageSize=20}={})=>rpc('student_puzzles',{p_page:page,p_page_size:pageSize}),
    submitAnswer:(puzzleId,answer)=>rpc('submit_answer',{p_puzzle_id:puzzleId,p_answer:answer}),
    leaderboard:({page=1,pageSize=20}={})=>rpc('public_leaderboard',{p_page:page,p_page_size:pageSize}),
    adminRankings:({page=1,pageSize=20}={})=>rpc('admin_rankings',{p_page:page,p_page_size:pageSize}),
  };
}
