import {element} from './common.js';

export function statusBadge(status) { return element('span',status,`status-badge status-${status}`); }
export function formatDate(value) {if(!value)return 'Not set';const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'Not set';}
export function tableMessage(body,columns,message) {const tr=element('tr');const td=element('td',message,'table-message');td.colSpan=columns;tr.append(td);body.replaceChildren(tr);}
export function pager(node,data,onPage) {
  const pages=Math.max(1,Math.ceil(data.total/data.page_size));
  const label=element('span',`${data.total} ${data.total===1?'record':'records'} · Page ${data.page} of ${pages}`,'muted small');
  const buttons=element('div',undefined,'button-row');
  for(const [text,next,disabled] of [['Previous',data.page-1,data.page<=1],['Next',data.page+1,data.page>=pages]]) {
    const button=element('button',text,'button button-secondary button-small');button.type='button';button.disabled=disabled;button.addEventListener('click',()=>onPage(next));buttons.append(button);
  }
  node.replaceChildren(label,buttons);
}
export function errorNotice(node,message,tone='error') {node.textContent=message;node.className=`notice ${tone}`;node.hidden=!message;}

export function confirmAction({title,message,label}) {
  const dialog=document.getElementById('confirm-dialog');
  if(dialog.open)return Promise.resolve(false);
  dialog.querySelector('h2').textContent=title;
  dialog.querySelector('p').textContent=message;
  const submit=dialog.querySelector('[data-confirm]');submit.textContent=label;
  return new Promise(resolve=>{
    function closed(){dialog.removeEventListener('close',closed);resolve(dialog.returnValue==='confirm');}
    dialog.addEventListener('close',closed);dialog.returnValue='cancel';dialog.showModal();
    dialog.querySelector('[value=cancel]').focus();
  });
}
