import {element} from './common.js';
import {pager,tableMessage,errorNotice,formatDate} from './admin-ui.js';
import {competitionErrorMessage} from './competition-validation.js';

export function leaderboardSection(root,fetchBoard,{admin=false,pageSize=20,onError=()=>{}}={}) {
  const body=root.querySelector('tbody'),pagination=root.querySelector('[data-pagination]'),feedback=root.querySelector('[data-feedback]');
  const refresh=root.querySelector('[data-refresh]');let page=1,generation=0;
  const columns=admin?8:4;
  async function load() {
    const request=++generation;tableMessage(body,columns,'Loading rankings…');errorNotice(feedback,'');if(pagination)pagination.replaceChildren();if(refresh)refresh.disabled=true;
    try {
      const result=await fetchBoard({page,pageSize});if(request!==generation)return;
      const last=Math.max(1,Math.ceil(result.total/result.page_size));if(page>last){page=last;return await load();}
      if(!result.rows.length)tableMessage(body,columns,'No approved participants are ranked yet. Register and get verified to join the challenge.');
      else body.replaceChildren(...result.rows.map(row=>{
        const tr=element('tr');
        const values=admin?[row.rank,row.display_name,row.registration_number,row.department,`Semester ${row.semester}`,row.points,row.solved_count,formatDate(row.last_solve)]:[row.rank,row.display_name,row.points,row.solved_count];
        for(const value of values)tr.append(element('td',String(value)));return tr;
      }));
      if(pagination)pager(pagination,result,next=>{page=next;load();});
    }catch(error){if(request!==generation)return;tableMessage(body,columns,'Rankings could not be loaded. Please try refreshing.');errorNotice(feedback,competitionErrorMessage(error));onError(error);}
    finally{if(request===generation&&refresh)refresh.disabled=false;}
  }
  refresh?.addEventListener('click',load);
  return {load,invalidate(){generation++;}};
}
