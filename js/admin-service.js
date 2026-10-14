export function createAdminService(client) {
  async function rpc(name,args={}) { const {data,error}=await client.rpc(name,args);if(error)throw error;return data; }
  return {
    overview:()=>rpc('admin_overview'),
    participants:({search='',status='',sort='newest',page=1,pageSize=20}={})=>rpc('admin_participants',{p_search:search,p_status:status,p_sort:sort,p_page:page,p_page_size:pageSize}),
    changeStatus:(profile,action)=>rpc('admin_change_status',{p_student_id:profile.id,p_action:action,p_expected_status:profile.status}),
    puzzles:({search='',status='',page=1,pageSize=20}={})=>rpc('admin_puzzles',{p_search:search,p_status:status,p_page:page,p_page_size:pageSize}),
    puzzle:id=>rpc('admin_puzzle',{p_puzzle_id:id}),
    savePuzzle:(values,original=null)=>rpc('admin_save_puzzle',{
      p_puzzle_id:original?.id??null,p_title:values.title,p_description:values.description,p_answer:values.correct_answer,
      p_points:values.points,p_difficulty:values.difficulty,p_status:values.status,p_opens_at:values.opens_at,p_closes_at:values.closes_at,
      p_case_sensitive:values.case_sensitive,p_expected_updated_at:original?.updated_at??null,
    }),
    setPuzzleStatus:(puzzle,status)=>rpc('admin_set_puzzle_status',{p_puzzle_id:puzzle.id,p_status:status,p_expected_updated_at:puzzle.updated_at}),
  };
}
