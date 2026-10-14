export function createArenaService(client) {
  async function rpc(name,args={}) {const {data,error}=await client.rpc(name,args);if(error)throw error;return data;}
  return {
    progress:()=>rpc('arena_progress'),
    start:level=>rpc('arena_start',{p_level:level}),
    move:(level,move,revision)=>rpc('arena_move',{p_level:level,p_move:move,p_revision:revision}),
    settings:()=>rpc('admin_arena'),
    save:(config,version)=>rpc('admin_save_arena',{p_config:config,p_expected_updated_at:version}),
  };
}
