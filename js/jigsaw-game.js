import {element} from './common.js';

export function jigsawGame(root,{settings,onMove,aspect=1}) {
  const {rows,cols,image}=settings;
  const instruction=element('p','Select a piece, then select its board cell. You can also drag pieces. Placing on an occupied cell exchanges the pieces.','small muted');
  const layout=element('div',undefined,'jigsaw-layout'),board=element('div',undefined,'jigsaw-board'),tray=element('div',undefined,'jigsaw-tray');
  board.style.setProperty('--columns',cols);board.style.aspectRatio=String(aspect);board.setAttribute('aria-label','Jigsaw board');
  tray.style.setProperty('--columns',cols);tray.style.setProperty('--tile-ratio',String(aspect*rows/cols));tray.setAttribute('aria-label','Shuffled pieces');
  const reference=element('figure',undefined,'jigsaw-reference'),referenceImage=element('img');
  referenceImage.src=image;referenceImage.alt='Complete picture to match for this jigsaw';referenceImage.decoding='async';
  const caption=element('figcaption','Reference picture'),fullSize=element('a','Open full-size reference','small');
  fullSize.href=image;fullSize.target='_blank';fullSize.rel='noopener noreferrer';reference.append(caption,referenceImage,fullSize);
  const trayBox=element('div',undefined,'jigsaw-tray-box');trayBox.append(reference,element('h3','Shuffled pieces'),tray);
  layout.append(board,trayBox);root.replaceChildren(instruction,layout);
  let selected=null,state=null,disabled=false,focusKey=null;
  function paint(node,piece) {
    node.style.backgroundImage=`url("${image}")`;node.style.backgroundSize=`${cols*100}% ${rows*100}%`;
    node.style.backgroundPosition=`${(piece%cols)/(cols-1)*100}% ${Math.floor(piece/cols)/(rows-1)*100}%`;
  }
  function choose(piece) {if(disabled)return;selected=selected===piece?null:piece;render(state,disabled);}
  function render(next,locked=false) {
    state=next;disabled=locked;
    const focused=document.activeElement;
    if(root.contains(focused)&&focused.dataset.gameKey)focusKey=focused.dataset.gameKey;
    const restoreFocus=root.contains(focused)||focused===document.body||focused?.tagName==='DIALOG';
    board.replaceChildren(...state.board.map((piece,slot)=>{
      const cell=element('button',piece===null?String(slot+1):undefined,'jigsaw-cell');cell.type='button';cell.disabled=disabled;
      cell.dataset.slot=slot;cell.dataset.gameKey=`slot-${slot}`;
      cell.setAttribute('aria-label',`Board cell ${slot+1}${piece===null?', empty':', occupied'}${piece===selected?', selected':''}`);
      if(piece!==null){paint(cell,piece);cell.draggable=!disabled;cell.dataset.piece=piece;cell.classList.toggle('piece-selected',piece===selected);}
      cell.addEventListener('click',()=>{if(selected!==null){const move={piece:selected,slot};selected=null;onMove(move);}else if(piece!==null)choose(piece);});
      cell.addEventListener('dragstart',event=>{if(disabled){event.preventDefault();return;}selected=piece;event.dataTransfer.setData('text/plain',String(piece));event.dataTransfer.effectAllowed='move';});
      cell.addEventListener('dragover',event=>{if(!disabled&&selected!==null){event.preventDefault();event.dataTransfer.dropEffect='move';}});
      cell.addEventListener('drop',event=>{event.preventDefault();if(!disabled&&selected!==null){const move={piece:selected,slot};selected=null;onMove(move);}});
      return cell;
    }));
    tray.replaceChildren(...state.tray.map((piece,index)=>{
      const tile=element('button',undefined,'jigsaw-piece');tile.type='button';tile.disabled=disabled;tile.draggable=!disabled;
      tile.dataset.piece=piece;tile.dataset.gameKey=`piece-${piece}`;paint(tile,piece);
      tile.setAttribute('aria-label',`Shuffled piece ${index+1}`);tile.setAttribute('aria-pressed',String(piece===selected));tile.classList.toggle('piece-selected',piece===selected);
      tile.addEventListener('click',()=>choose(piece));tile.addEventListener('dragstart',event=>{if(disabled){event.preventDefault();return;}selected=piece;event.dataTransfer.setData('text/plain',String(piece));event.dataTransfer.effectAllowed='move';});
      return tile;
    }));
    if(!state.tray.length)tray.append(element('p','All pieces placed. You can still select and exchange pieces on the board.','small muted'));
    if(!disabled&&restoreFocus&&focusKey)root.querySelector(`[data-game-key="${focusKey}"]`)?.focus({preventScroll:true});
  }
  return {render,destroy(){root.replaceChildren();}};
}
