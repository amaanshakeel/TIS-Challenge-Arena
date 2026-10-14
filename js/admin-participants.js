import {element} from './common.js';
import {statusBadge,formatDate,tableMessage,pager,errorNotice,confirmAction} from './admin-ui.js';
import {adminErrorMessage} from './admin-validation.js';

export function participantSection(root,service,{registrations=false,onChanged,onAccessDenied}) {
  const form=root.querySelector('form');const body=root.querySelector('tbody');const pagination=root.querySelector('[data-pagination]');
  const feedback=root.querySelector('[data-feedback]');const refresh=root.querySelector('[data-refresh]');
  let page=1,generation=0,changing=false;
  async function load() {
    const request=++generation;const data=Object.fromEntries(new FormData(form));
    tableMessage(body,8,'Loading participants…');pagination.replaceChildren();refresh.disabled=true;
    try {
      const result=await service.participants({search:data.search.trim(),status:data.status,sort:data.sort,page});
      if(request!==generation)return;
      const last=Math.max(1,Math.ceil(result.total/result.page_size));if(page>last){page=last;return await load();}
      if(!result.rows.length)tableMessage(body,8,registrations?'No registrations match these filters.':'No participants match these filters.');
      else {
        const rows=result.rows.map(profile=>{
          const tr=element('tr');
          for(const value of [profile.full_name,profile.email,profile.registration_number,profile.department,`Semester ${profile.semester}`,formatDate(profile.created_at)])tr.append(element('td',value));
          const status=element('td');status.append(statusBadge(profile.status));tr.append(status);
          const actions=element('td');const buttons=element('div',undefined,'table-actions');
          let choices=[];
          if(profile.status==='pending')choices=['approve','reject'];
          if(profile.status==='rejected')choices=['approve'];
          if(!registrations)choices.push(profile.status==='terminated'?'restore':'terminate');
          for(const action of choices) {
            const label=action[0].toUpperCase()+action.slice(1);
            const button=element('button',label,`table-button ${action==='terminate'||action==='reject'?'danger-text':''}`);
            button.type='button';button.setAttribute('aria-label',`${label} ${profile.full_name}`);
            button.addEventListener('click',()=>change(profile,action,button));buttons.append(button);
          }
          if(!choices.length)buttons.append(element('span','Use Participants to manage access','muted small'));
          actions.append(buttons);tr.append(actions);return tr;
        });body.replaceChildren(...rows);
      }
      pager(pagination,result,next=>{page=next;load();});
    }catch(error){if(request!==generation)return;tableMessage(body,8,'Participant data could not be loaded. Try refreshing.');errorNotice(feedback,adminErrorMessage(error));onAccessDenied(error);}
    finally{if(request===generation)refresh.disabled=false;}
  }
  async function change(profile,action,button) {
    if(changing)return;changing=true;
    const label=action[0].toUpperCase()+action.slice(1);
    const descriptions={approve:'This makes the student eligible for competition access.',reject:'This rejects the pending registration. The account and historical records are preserved.',terminate:'This blocks competition access and preserves history. Restoration will return the student to their current status.',restore:`This restores the saved status (${profile.status_before_termination??'unavailable'}). It does not automatically approve the student.`};
    try {
      if(!await confirmAction({title:`${label} participant?`,message:`${profile.full_name} · ${profile.registration_number}. ${descriptions[action]}`,label}))return;
      button.disabled=true;errorNotice(feedback,'');
      const result=await service.changeStatus(profile,action);
      errorNotice(feedback,`${profile.full_name}: status changed to ${result.status}.`,'success');
      await load();onChanged();
    }catch(error){errorNotice(feedback,adminErrorMessage(error));onAccessDenied(error);}
    finally{changing=false;button.disabled=false;}
  }
  form.addEventListener('submit',event=>{event.preventDefault();page=1;errorNotice(feedback,'');load();});
  for(const select of form.querySelectorAll('select'))select.addEventListener('change',()=>{page=1;errorNotice(feedback,'');load();});
  refresh.addEventListener('click',()=>{errorNotice(feedback,'');load();});
  return {load};
}
