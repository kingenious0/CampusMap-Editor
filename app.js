const KEY='campusos-editor-v2';
const DEF={room:['Room',130,85],office:['Office',130,75],corridor:['Corridor',220,55],entrance:['Entrance',100,55],stair:['Stair',80,110],junction:['Junction',70,70],facility:['Facility',90,70],wall:['Wall',220,18],door:['Door',55,18]};
const KEYS={v:'select',r:'room',o:'office',c:'corridor',e:'entrance',s:'stair',j:'junction',f:'facility',w:'wall',d:'door',k:'connect'};
let project=load(), tool='select', selectedIds=new Set(), selected=null, selectedConn=null, connectStart=null;
let clipboard=null, marquee=null;
let toolsCollapsed=localStorage.getItem('campusos-collapse-tools')==='true';
let propsCollapsed=localStorage.getItem('campusos-collapse-props')==='true';
let zoom=1, viewRot=0, drag=null, pan=null, hist=[], hi=-1, showGraph=false, showLabels=true;
const $=id=>document.getElementById(id), floorSel=$('floorSelect'), canvas=$('canvas'), objects=$('objects'), lines=$('lines'), viewport=$('viewport'), stage=$('stage');
const installBtn=$('installBtn'), connectionStatus=$('connectionStatus');
let deferredPrompt=null;

function updateSidebarCollapses(){
  const main=document.querySelector('main');
  if(!main)return;
  main.classList.toggle('collapse-tools',toolsCollapsed);
  main.classList.toggle('collapse-props',propsCollapsed);

  $('toggleToolsBar')?.classList.toggle('active',!toolsCollapsed);
  $('togglePropsBar')?.classList.toggle('active',!propsCollapsed);
  $('btnHeaderTools')?.classList.toggle('active',!toolsCollapsed);
  $('btnHeaderProps')?.classList.toggle('active',!propsCollapsed);

  const flTools=$('expandToolsFloating');
  const flProps=$('expandPropsFloating');
  if(flTools)flTools.hidden=!toolsCollapsed;
  if(flProps)flProps.hidden=!propsCollapsed;

  localStorage.setItem('campusos-collapse-tools',toolsCollapsed);
  localStorage.setItem('campusos-collapse-props',propsCollapsed);
}

function toggleToolsSidebar(){
  toolsCollapsed=!toolsCollapsed;
  updateSidebarCollapses();
  status(toolsCollapsed?'Tools sidebar collapsed — more canvas space':'Tools sidebar expanded');
}

function togglePropsSidebar(){
  propsCollapsed=!propsCollapsed;
  updateSidebarCollapses();
  status(propsCollapsed?'Properties sidebar collapsed — more canvas space':'Properties sidebar expanded');
}

function setSelected(val){
  if(!val){
    selectedIds.clear();
    selected=null;
  } else if(typeof val==='string'){
    selectedIds=new Set([val]);
    selected=val;
  } else if(Array.isArray(val)||val instanceof Set){
    selectedIds=new Set(val);
    selected=selectedIds.size?Array.from(selectedIds)[0]:null;
  }
  selectedConn=null;
}

function clearSelected(){
  selectedIds.clear();
  selected=null;
}

function isStandaloneMode(){
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function updateConnectionStatus(){
  const online=navigator.onLine;
  const standalone=isStandaloneMode();
  connectionStatus.textContent=online ? (standalone ? '● Installed app' : '● Online') : '● Offline';
  connectionStatus.classList.toggle('online',online);
  connectionStatus.classList.toggle('offline',!online);
  if(standalone){
    installBtn.hidden=true;
    status('Installed CampusOS app mode — offline editing is active');
    return;
  }
  status(online ? 'Ready — choose a tool, then click empty canvas' : 'Offline mode — local changes remain saved');
}

function registerServiceWorker(){
  if(!('serviceWorker' in navigator))return;
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('./service-worker.js').then(() => {
      console.log('Service worker registered');
    }).catch(err => {
      console.error('Service worker registration failed:', err);
    });
  });
}

function setupInstallPrompt(){
  const mediaQuery=window.matchMedia('(display-mode: standalone)');
  const updateStandaloneState=()=>{
    if(isStandaloneMode()){
      installBtn.hidden=true;
      status('CampusOS is running as an installed app');
    }
  };
  if(mediaQuery.addEventListener){
    mediaQuery.addEventListener('change', updateStandaloneState);
  } else if(mediaQuery.addListener){
    mediaQuery.addListener(updateStandaloneState);
  }

  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    deferredPrompt=event;
    installBtn.hidden=false;
    installBtn.textContent='Install CampusOS';
    status('Install available — save CampusOS to your Applications or app launcher');
  });

  window.addEventListener('appinstalled',()=>{
    deferredPrompt=null;
    installBtn.hidden=true;
    status('CampusOS installed successfully');
  });

  installBtn.addEventListener('click', async ()=>{
    if(!deferredPrompt){
      status('This browser is not offering an install prompt yet. Try Chrome or Edge on desktop.');
      return;
    }
    deferredPrompt.prompt();
    const choice=await deferredPrompt.userChoice;
    if(choice.outcome==='accepted'){
      status('Install accepted — CampusOS will be added to your app launcher');
    } else {
      status('Install dismissed');
    }
    deferredPrompt=null;
    installBtn.hidden=true;
  });
}

function uid(p='id'){return p+'_'+Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-3)}
function base(){return {version:2,building:{id:'ROB',name:'Reynolds Okai Building'},floors:[{id:'ground',name:'Ground Floor',level:0,objects:[],connections:[]}]}}
function load(){try{return JSON.parse(localStorage.getItem(KEY))||base()}catch{return base()}}
function floor(){return project.floors.find(f=>f.id===floorSel.value)||project.floors[0]}
function cp(x){return JSON.parse(JSON.stringify(x))}
function snap(n){return Math.round(n/10)*10}
function center(o){return{x:o.x+o.width/2,y:o.y+o.height/2}}
function dist(a,b){let p=center(a),q=center(b);return Math.round(Math.hypot(q.x-p.x,q.y-p.y)*10)/10}
function save(){localStorage.setItem(KEY,JSON.stringify(project));$('saved').textContent='Saved locally • '+new Date().toLocaleTimeString();status('Saved')}
function status(t){$('status').textContent=t}
function push(){hist=hist.slice(0,hi+1);hist.push(cp(project));hi++;if(hist.length>50){hist.shift();hi--}}
function undo(){if(hi<=0)return;hi--;project=cp(hist[hi]);refresh();status('Undo')}
function redo(){if(hi>=hist.length-1)return;hi++;project=cp(hist[hi]);refresh();status('Redo')}

function refresh(){
 floorSel.innerHTML='';
 project.floors.forEach(f=>floorSel.add(new Option(`${f.name} (Level ${f.level})`,f.id)));
 if(!project.floors.some(f=>f.id===floorSel.value))floorSel.value=project.floors[0].id;
 render();props();
}

function updateLines(){
 lines.innerHTML='';
 if(!showGraph)return;
 let f=floor();
 f.connections.forEach(c=>{
   let a=f.objects.find(o=>o.id===c.from),b=f.objects.find(o=>o.id===c.to);if(!a||!b)return;
   let l=document.createElementNS('http://www.w3.org/2000/svg','line'),p=center(a),q=center(b);
   l.setAttribute('x1',p.x);l.setAttribute('y1',p.y);l.setAttribute('x2',q.x);l.setAttribute('y2',q.y);
   l.classList.add('line');if(c.id===selectedConn)l.classList.add('selected');
   l.onclick=e=>{e.stopPropagation();selectedConn=c.id;clearSelected();props();updateLines();render()};
   lines.appendChild(l);
 });
}

function applyView(){
 canvas.style.transform=`rotate(${viewRot}deg) scale(${zoom})`;
 $('zoomText').textContent=Math.round(zoom*100)+'%';
}

function centerViewport(){
 const cx=canvas.offsetLeft+canvas.offsetWidth/2;
 const cy=canvas.offsetTop+canvas.offsetHeight/2;
 viewport.scrollLeft=Math.max(0,cx-viewport.clientWidth/2);
 viewport.scrollTop=Math.max(0,cy-viewport.clientHeight/2);
}

function render(){
 let f=floor();$('title').textContent=project.building.id+' — '+f.name;
 objects.innerHTML='';
 document.body.classList.toggle('graph-hidden',!showGraph);
 document.body.classList.toggle('labels-hidden',!showLabels);
 f.objects.forEach(o=>{
   let isSelected=selectedIds.has(o.id);
   let el=document.createElement('div');
   el.className='object '+o.type+(isSelected?' selected':'');
   el.dataset.id=o.id;
   Object.assign(el.style,{left:o.x+'px',top:o.y+'px',width:o.width+'px',height:o.height+'px',transform:`rotate(${o.rotation||0}deg)`});
   let lab=document.createElement('div');lab.className='label';lab.textContent=o.name;lab.title=o.name;el.appendChild(lab);
   
   if(isSelected && selectedIds.size===1){
     let h=document.createElement('div');h.className='handle';h.textContent='↻';h.title='Free rotate';h.onpointerdown=e=>rotateFree(e,o,el);el.appendChild(h);
     ['n','s','e','w','nw','ne','sw','se'].forEach(dir=>{
       let r=document.createElement('div');
       r.className='resize-handle '+dir;
       r.title='Resize ('+dir.toUpperCase()+')';
       r.onpointerdown=e=>resizeDirectional(e,o,el,dir);
       el.appendChild(r);
     });
   }

   el.onpointerdown=e=>{
     if(e.button!==0)return;
     if(tool==='connect'){e.stopPropagation();connect(o.id);return}
     if(tool!=='select')return;
     e.stopPropagation();

     const isModifier=e.shiftKey||e.ctrlKey||e.metaKey;
     if(isModifier){
       if(selectedIds.has(o.id)){
         selectedIds.delete(o.id);
         selected=selectedIds.size?Array.from(selectedIds)[0]:null;
       } else {
         selectedIds.add(o.id);
         selected=o.id;
       }
     } else {
       if(!selectedIds.has(o.id)){
         setSelected(o.id);
       }
     }
     selectedConn=null;
     props();
     updateLines();
     render();

     let f=floor();
     let items=Array.from(selectedIds).map(id=>{
       let obj=f.objects.find(x=>x.id===id);
       let dom=document.querySelector(`#objects .object[data-id="${id}"]`);
       return obj?{id,ox:obj.x,oy:obj.y,obj,dom}:null;
     }).filter(Boolean);

     drag={items,sx:e.clientX,sy:e.clientY,pid:e.pointerId,el};
     el.setPointerCapture(e.pointerId);
   };

   el.onpointermove=e=>{
     if(!drag||drag.pid!==e.pointerId)return;
     let dx=(e.clientX-drag.sx)/zoom,dy=(e.clientY-drag.sy)/zoom;
     let a=-viewRot*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
     let mx=dx*c-dy*s,my=dx*s+dy*c;
     drag.items.forEach(it=>{
       it.obj.x=snap(it.ox+mx);
       it.obj.y=snap(it.oy+my);
       if(it.dom){
         it.dom.style.left=it.obj.x+'px';
         it.dom.style.top=it.obj.y+'px';
       }
     });
     updateLines();
   };

   el.onpointerup=e=>{
     if(!drag||drag.pid!==e.pointerId)return;
     let changed=drag.items.some(it=>it.obj.x!==it.ox||it.obj.y!==it.oy);
     drag=null;
     if(changed){push();save();props();updateLines()}
   };

   el.onpointercancel=()=>{drag=null};
   objects.appendChild(el);
 });
 updateLines();applyView();
}

function add(type,x=250,y=180){
 let d=DEF[type],f=floor();if(!d)return;
 let o={id:uid(type),name:d[0],type,description:'',locationNote:'',x:snap(x),y:snap(y),width:d[1],height:d[2],rotation:0,floorId:f.id};
 f.objects.push(o);
 setSelected(o.id);
 selectedConn=null;
 push();render();props();save();
 status('✓ Added '+o.name+' to canvas');
}

window.CampusOS = {
  setTool: t => setTool(t),
  add: (t,x,y) => add(t,x,y),
  copy: () => copy(),
  paste: (offset) => paste(offset),
  duplicate: () => duplicate(),
  toggleGraph: () => toggleGraph(),
  toggleTools: () => toggleToolsSidebar(),
  toggleProps: () => togglePropsSidebar()
};

function point(e){
 let r=canvas.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
 let sx=e.clientX-cx,sy=e.clientY-cy;
 let a=-viewRot*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 let ux=sx*c-sy*s,uy=sx*s+sy*c;
 return{x:(ux/zoom)+700,y:(uy/zoom)+450};
}

viewport.addEventListener('pointerup',e=>{
 if(e.button!==0)return;
 if(tool==='select'||tool==='connect'||spaceDown)return;
 if(e.target.closest && e.target.closest('.object'))return;
 let p=point(e),d=DEF[tool];
 if(!d)return;
 add(tool, p.x-d[1]/2, p.y-d[2]/2);
},true);

function startPan(e){
 e.preventDefault();pan={sx:e.clientX,sy:e.clientY,sl:viewport.scrollLeft,st:viewport.scrollTop,pid:e.pointerId};
 if(e.currentTarget?.setPointerCapture)try{e.currentTarget.setPointerCapture(e.pointerId)}catch{}
}

function startMarquee(e){
 let p=point(e);
 let isModifier=e.shiftKey||e.ctrlKey||e.metaKey;
 marquee={
   startX:p.x,
   startY:p.y,
   shift:isModifier,
   initialSelected:new Set(selectedIds),
   pid:e.pointerId
 };
 const selBox=$('selectionBox');
 if(selBox){
   selBox.hidden=false;
   selBox.style.left=p.x+'px';
   selBox.style.top=p.y+'px';
   selBox.style.width='0px';
   selBox.style.height='0px';
 }
 if(!isModifier){
   clearSelected();
   selectedConn=null;
   render();
   props();
   updateLines();
 }
 try{viewport.setPointerCapture(e.pointerId)}catch{}
}

viewport.addEventListener('pointerdown',e=>{
 if(e.button===1 || (spaceDown && e.button===0)){
   startPan(e);
   return;
 }
 if(tool==='select' && e.button===0){
   if(!e.target.closest('.object') && !e.target.closest('.handle') && !e.target.closest('.resize-handle')){
     startMarquee(e);
   }
 }
});

viewport.addEventListener('pointermove',e=>{
 if(pan){
   viewport.scrollLeft=pan.sl-(e.clientX-pan.sx);
   viewport.scrollTop=pan.st-(e.clientY-pan.sy);
   return;
 }
 if(marquee && marquee.pid===e.pointerId){
   let p=point(e);
   let minX=Math.min(marquee.startX,p.x);
   let maxX=Math.max(marquee.startX,p.x);
   let minY=Math.min(marquee.startY,p.y);
   let maxY=Math.max(marquee.startY,p.y);
   
   const selBox=$('selectionBox');
   if(selBox){
     selBox.style.left=minX+'px';
     selBox.style.top=minY+'px';
     selBox.style.width=(maxX-minX)+'px';
     selBox.style.height=(maxY-minY)+'px';
   }
   
   let f=floor();
   let currentSet=new Set(marquee.shift ? marquee.initialSelected : []);
   f.objects.forEach(o=>{
     let r=o.x+o.width, b=o.y+o.height;
     if(o.x<=maxX && r>=minX && o.y<=maxY && b>=minY){
       currentSet.add(o.id);
     }
   });
   selectedIds=currentSet;
   selected=selectedIds.size?Array.from(selectedIds)[0]:null;
   
   document.querySelectorAll('#objects .object').forEach(el=>{
     el.classList.toggle('selected',selectedIds.has(el.dataset.id));
   });
 }
});

viewport.addEventListener('pointerup',e=>{
 if(pan)pan=null;
 if(marquee && marquee.pid===e.pointerId){
   const selBox=$('selectionBox');
   if(selBox)selBox.hidden=true;
   marquee=null;
   render();
   props();
   updateLines();
 }
});

viewport.addEventListener('pointercancel',()=>{
 pan=null;
 if(marquee){
   const selBox=$('selectionBox');
   if(selBox)selBox.hidden=true;
   marquee=null;
   render();
 }
});

let spaceDown=false;
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!['input','textarea','select'].includes(document.activeElement?.tagName?.toLowerCase())){spaceDown=true;e.preventDefault();}});
document.addEventListener('keyup',e=>{if(e.code==='Space')spaceDown=false});

function connect(id){
 if(!connectStart){connectStart=id;setSelected(id);status('Now click destination object');render();return}
 if(connectStart===id){connectStart=null;status('Cancelled');return}
 let f=floor(),exists=f.connections.some(c=>(c.from===connectStart&&c.to===id)||(c.from===id&&c.to===connectStart));
 if(!exists){let c={id:uid('conn'),from:connectStart,to:id,type:'corridor',distance:dist(f.objects.find(o=>o.id===connectStart),f.objects.find(o=>o.id===id))};f.connections.push(c);selectedConn=c.id;clearSelected();push();save();status('Connection created')}
 connectStart=null;render();props();
}

function rotate(delta){
 let f=floor();
 let targets=f.objects.filter(o=>selectedIds.has(o.id));
 if(!targets.length)return;
 targets.forEach(o=>{
   o.rotation=((o.rotation||0)+delta+360)%360;
 });
 push();render();props();save();
 status(targets.length===1 ? `Rotated ${targets[0].name} to ${targets[0].rotation}°` : `Rotated ${targets.length} objects`);
}

function rotateFree(e,o,el){
 e.stopPropagation();e.preventDefault();
 let r=canvas.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
 let lc={x:(o.x+o.width/2-700)*zoom,y:(o.y+o.height/2-450)*zoom},vr=viewRot*Math.PI/180;
 let sx=lc.x*Math.cos(vr)-lc.y*Math.sin(vr)+cx,sy=lc.x*Math.sin(vr)+lc.y*Math.cos(vr)+cy;
 let start=Math.atan2(e.clientY-sy,e.clientX-sx),orig=o.rotation||0;
 const move=ev=>{let a=Math.atan2(ev.clientY-sy,ev.clientX-sx);o.rotation=Math.round((orig+(a-start)*180/Math.PI)/5)*5;if(el)el.style.transform=`rotate(${o.rotation}deg)`};
 const up=()=>{removeEventListener('pointermove',move);removeEventListener('pointerup',up);push();save();render();props()};
 addEventListener('pointermove',move);addEventListener('pointerup',up);
}

function resizeDirectional(e,o,el,dir){
 e.stopPropagation();
 e.preventDefault();

 const rot=(o.rotation||0)*Math.PI/180;
 const cosR=Math.cos(rot), sinR=Math.sin(rot);
 const W0=o.width, H0=o.height;
 const C0={x:o.x+W0/2, y:o.y+H0/2};

 let localPin={x:0,y:0};
 if(dir==='e')       localPin={x:-W0/2,y:0};
 else if(dir==='w')  localPin={x:W0/2,y:0};
 else if(dir==='s')  localPin={x:0,y:-H0/2};
 else if(dir==='n')  localPin={x:0,y:H0/2};
 else if(dir==='se') localPin={x:-W0/2,y:-H0/2};
 else if(dir==='sw') localPin={x:W0/2,y:-H0/2};
 else if(dir==='ne') localPin={x:-W0/2,y:H0/2};
 else if(dir==='nw') localPin={x:W0/2,y:H0/2};

 const pinWorld={
   x:C0.x+localPin.x*cosR-localPin.y*sinR,
   y:C0.y+localPin.x*sinR+localPin.y*cosR
 };

 const move=ev=>{
   const p=point(ev);
   const relX=p.x-pinWorld.x;
   const relY=p.y-pinWorld.y;

   const localX=relX*cosR+relY*sinR;
   const localY=-relX*sinR+relY*cosR;

   let newW=W0, newH=H0;
   let newCenterLocal={x:0,y:0};

   if(dir==='e'){
     newW=Math.max(10,snap(localX));
     newCenterLocal={x:newW/2,y:0};
   } else if(dir==='w'){
     newW=Math.max(10,snap(-localX));
     newCenterLocal={x:-newW/2,y:0};
   } else if(dir==='s'){
     newH=Math.max(10,snap(localY));
     newCenterLocal={x:0,y:newH/2};
   } else if(dir==='n'){
     newH=Math.max(10,snap(-localY));
     newCenterLocal={x:0,y:-newH/2};
   } else if(dir==='se'){
     newW=Math.max(10,snap(localX));
     newH=Math.max(10,snap(localY));
     newCenterLocal={x:newW/2,y:newH/2};
   } else if(dir==='sw'){
     newW=Math.max(10,snap(-localX));
     newH=Math.max(10,snap(localY));
     newCenterLocal={x:-newW/2,y:newH/2};
   } else if(dir==='ne'){
     newW=Math.max(10,snap(localX));
     newH=Math.max(10,snap(-localY));
     newCenterLocal={x:newW/2,y:-newH/2};
   } else if(dir==='nw'){
     newW=Math.max(10,snap(-localX));
     newH=Math.max(10,snap(-localY));
     newCenterLocal={x:-newW/2,y:-newH/2};
   }

   const newCenterX=pinWorld.x+newCenterLocal.x*cosR-newCenterLocal.y*sinR;
   const newCenterY=pinWorld.y+newCenterLocal.x*sinR+newCenterLocal.y*cosR;

   o.width=newW;
   o.height=newH;
   o.x=snap(newCenterX-newW/2);
   o.y=snap(newCenterY-newH/2);

   if(el){
     el.style.left=o.x+'px';
     el.style.top=o.y+'px';
     el.style.width=o.width+'px';
     el.style.height=o.height+'px';
   }
   updateLines();
 };

 const up=()=>{
   removeEventListener('pointermove',move);
   removeEventListener('pointerup',up);
   push();
   save();
   render();
   props();
   updateLines();
 };

 addEventListener('pointermove',move);
 addEventListener('pointerup',up);
}

function del(){
 let f=floor();
 if(selectedIds.size){
   let count=selectedIds.size;
   f.objects=f.objects.filter(o=>!selectedIds.has(o.id));
   f.connections=f.connections.filter(c=>!selectedIds.has(c.from)&&!selectedIds.has(c.to));
   clearSelected();
   push();save();render();props();
   status(count===1?'Object deleted':`${count} objects deleted`);
 } else if(selectedConn){
   f.connections=f.connections.filter(c=>c.id!==selectedConn);
   selectedConn=null;
   push();save();render();props();
   status('Connection deleted');
 }
}

function copy(){
 if(!selectedIds.size){
   status('No objects selected to copy');
   return;
 }
 let f=floor();
 let objs=f.objects.filter(o=>selectedIds.has(o.id));
 let conns=f.connections.filter(c=>selectedIds.has(c.from)&&selectedIds.has(c.to));
 clipboard={
   objects:cp(objs),
   connections:cp(conns)
 };
 status(`Copied ${objs.length} element(s) to clipboard`);
}

function paste(offset={x:30,y:30}){
 if(!clipboard||!clipboard.objects||!clipboard.objects.length){
   status('Clipboard is empty — select and copy elements first');
   return;
 }
 let f=floor();
 let idMap={};
 let newObjs=clipboard.objects.map(o=>{
   let newId=uid(o.type);
   idMap[o.id]=newId;
   return {
     ...cp(o),
     id:newId,
     floorId:f.id,
     x:snap(o.x+offset.x),
     y:snap(o.y+offset.y)
   };
 });
 let newConns=(clipboard.connections||[]).map(c=>({
   ...cp(c),
   id:uid('conn'),
   from:idMap[c.from],
   to:idMap[c.to]
 }));
 f.objects.push(...newObjs);
 f.connections.push(...newConns);
 setSelected(newObjs.map(o=>o.id));
 push();save();render();props();updateLines();
 status(`Pasted ${newObjs.length} element(s)`);
}

function duplicate(){
 if(!selectedIds.size){
   status('No objects selected to duplicate');
   return;
 }
 copy();
 paste({x:30,y:30});
}

function toggleGraph(){
 showGraph=!showGraph;
 render();
 status(showGraph?'Graph shown':'Graph hidden');
}

function props(){
 let count=selectedIds.size;
 $('empty').hidden=!!(count>0||selectedConn);
 $('form').hidden=!(count===1&&selected);
 $('connBox').hidden=!selectedConn;

 if(count>1){
   $('empty').textContent=`${count} objects selected. Drag to move, or use Copy / Rotate / Delete.`;
 } else if(count===0 && !selectedConn){
   $('empty').textContent='Select an object to edit it.';
 }

 if(count===1 && selected){
   let o=floor().objects.find(o=>o.id===selected);
   if(!o)return;
   $('pid').value=o.id;$('pname').value=o.name;$('ptype').value=o.type;$('pdesc').value=o.description||'';$('pnote').value=o.locationNote||'';
   $('px').value=o.x;$('py').value=o.y;$('pw').value=o.width;$('ph').value=o.height;$('prot').value=o.rotation||0;$('pfloor').value=floor().name;
 }
 if(selectedConn){
   let c=floor().connections.find(c=>c.id===selectedConn);
   if(!c)return;
   let f=floor(),a=$('from'),b=$('to');
   a.innerHTML='';b.innerHTML='';
   f.objects.forEach(o=>{a.add(new Option(o.name,o.id));b.add(new Option(o.name,o.id))});
   a.value=c.from;b.value=c.to;$('ctype').value=c.type;
   $('dist').textContent='Auto distance: '+dist(f.objects.find(o=>o.id===c.from),f.objects.find(o=>o.id===c.to))+' editor units';
 }
}

$('form').onsubmit=e=>{
 e.preventDefault();
 if(!selected)return;
 let o=floor().objects.find(o=>o.id===selected);
 if(!o)return;
 o.name=$('pname').value.trim()||o.name;o.description=$('pdesc').value;o.locationNote=$('pnote').value;
 o.x=+$('px').value;o.y=+$('py').value;o.width=Math.max(10,+$('pw').value);o.height=Math.max(10,+$('ph').value);o.rotation=+$('prot').value||0;
 push();save();render();props();status('Properties updated');
};

['from','to','ctype'].forEach(id=>$(id).onchange=()=>{
 let c=floor().connections.find(c=>c.id===selectedConn);
 if(!c)return;
 c.from=$('from').value;c.to=$('to').value;c.type=$('ctype').value;
 c.distance=dist(floor().objects.find(o=>o.id===c.from),floor().objects.find(o=>o.id===c.to));
 push();save();render();props();
});

$('delConn').onclick=del;
$('del').onclick=del;
$('rotL').onclick=()=>rotate(-90);
$('rotR').onclick=()=>rotate(90);
$('copyBtn').onclick=copy;
$('pasteBtn').onclick=()=>paste({x:30,y:30});
$('dupBtn').onclick=duplicate;
$('undo').onclick=undo;
$('redo').onclick=redo;
$('save').onclick=save;

document.querySelectorAll('.tool').forEach(b=>{
 b.onclick=e=>{e.preventDefault();e.stopPropagation();setTool(b.dataset.tool)};
});

function setTool(t){
 tool=t;
 connectStart=null;
 document.querySelectorAll('.tool').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));
 status(t==='connect'?'Connect mode: click two objects':'✓ '+t+' tool active — release mouse on empty canvas to place');
}

$('export').onclick=()=>{
 let a=document.createElement('a');
 a.href=URL.createObjectURL(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}));
 a.download='rob-campusos-map.json';
 a.click();
 setTimeout(()=>URL.revokeObjectURL(a.href),500);
 status('JSON exported');
};

$('import').onclick=()=>$('file').click();
$('file').onchange=e=>{
 let file=e.target.files[0];
 if(!file)return;
 let r=new FileReader();
 r.onload=()=>{
   try{
     let p=JSON.parse(r.result);
     if(!p.floors)throw Error('Invalid CampusOS JSON');
     push();project=p;clearSelected();selectedConn=null;refresh();fitView();save();status('JSON imported');
   }catch(x){alert(x.message)}
 };
 r.readAsText(file);
 e.target.value='';
};

floorSel.onchange=()=>{clearSelected();selectedConn=null;refresh();status('Floor changed')};

$('newFloor').onclick=()=>{
 let name=prompt('Floor name:','First Floor');if(!name)return;let level=+prompt('Level (Ground=0, First=1):','1');if(!Number.isFinite(level))return;
 let copyPrompt=confirm('Copy current floor as a starting point?'),src=floor(),nf={id:uid('floor'),name,level,objects:[],connections:[]};
 if(copyPrompt){
   let map={};
   nf.objects=cp(src.objects).map(o=>{let id=uid(o.type);map[o.id]=id;return {...o,id,floorId:nf.id}});
   nf.connections=src.connections.map(c=>({...cp(c),id:uid('conn'),from:map[c.from],to:map[c.to]}));
 }
 project.floors.push(nf);floorSel.value=nf.id;push();refresh();save();status(name+' created');
};

$('clear').onclick=()=>{
 if(!confirm('Clear this floor?'))return;
 floor().objects=[];floor().connections=[];clearSelected();selectedConn=null;push();refresh();save();status('Floor cleared');
};

$('validate').onclick=()=>{
 let f=floor(),w=[];
 f.objects.filter(o=>!['wall','door'].includes(o.type)).forEach(o=>{
   if(!f.connections.some(c=>c.from===o.id||c.to===o.id))w.push(o.name+' has no connection');
 });
 $('validation').innerHTML=w.length?'<div class="warn">⚠ '+w.length+' issue(s)</div>'+w.map(x=>'<div>• '+x+'</div>').join(''):'<div class="ok">✓ No basic connectivity issues found.</div>';
 status('Validation complete');
};

$('zoomIn').onclick=()=>{zoom=Math.min(2.5,zoom+.1);applyView()};
$('zoomOut').onclick=()=>{zoom=Math.max(.3,zoom-.1);applyView()};
$('viewport').onwheel=e=>{if(!e.ctrlKey)return;e.preventDefault();zoom=Math.max(.3,Math.min(2.5,zoom+(e.deltaY<0?.1:-.1)));applyView()};
$('viewL').onclick=()=>{viewRot=(viewRot+270)%360;applyView();status('Canvas rotated left: '+viewRot+'°')};
$('viewR').onclick=()=>{viewRot=(viewRot+90)%360;applyView();status('Canvas rotated right: '+viewRot+'°')};
$('viewReset').onclick=()=>{viewRot=0;zoom=1;applyView();centerViewport();status('Canvas view reset')};

function fitView(){
 let f=floor(),os=f.objects;
 if(!os.length){viewRot=0;zoom=1;applyView();centerViewport();status('Canvas view reset');return}
 let minX=Math.min(...os.map(o=>o.x)),maxX=Math.max(...os.map(o=>o.x+o.width)),minY=Math.min(...os.map(o=>o.y)),maxY=Math.max(...os.map(o=>o.y+o.height));
 let pad=80, w=maxX-minX+pad*2,h=maxY-minY+pad*2, z=Math.min((viewport.clientWidth-40)/w,(viewport.clientHeight-40)/h);
 zoom=Math.max(.3,Math.min(1.5,z));viewRot=0;applyView();
 const stageCenterX=(canvas.offsetLeft+700)+((minX+maxX)/2-700)*zoom;
 const stageCenterY=(canvas.offsetTop+450)+((minY+maxY)/2-450)*zoom;
 viewport.scrollLeft=Math.max(0,stageCenterX-viewport.clientWidth/2);
 viewport.scrollTop=Math.max(0,stageCenterY-viewport.clientHeight/2);
 status('Map fitted to view');
}

$('fit').onclick=fitView;
$('graphToggle').onclick=toggleGraph;
$('labelsToggle').onclick=()=>{showLabels=!showLabels;render();status(showLabels?'Labels shown':'Labels hidden')};

$('btnHeaderTools')?.addEventListener('click',toggleToolsSidebar);
$('toggleTools')?.addEventListener('click',toggleToolsSidebar);
$('toggleToolsBar')?.addEventListener('click',toggleToolsSidebar);
$('expandToolsFloating')?.addEventListener('click',toggleToolsSidebar);
$('btnHeaderProps')?.addEventListener('click',togglePropsSidebar);
$('toggleProps')?.addEventListener('click',togglePropsSidebar);
$('togglePropsBar')?.addEventListener('click',togglePropsSidebar);
$('expandPropsFloating')?.addEventListener('click',togglePropsSidebar);

document.onkeydown=e=>{
 let tag=document.activeElement?.tagName?.toLowerCase(),typing=['input','textarea','select'].includes(tag);
 if(e.ctrlKey||e.metaKey){
   let k=e.key.toLowerCase();
   if(k==='s'){e.preventDefault();save();return}
   if(k==='z'){e.preventDefault();undo();return}
   if(k==='y'){e.preventDefault();redo();return}
   if(k==='b'){
     e.preventDefault();
     if(!toolsCollapsed||!propsCollapsed){
       toolsCollapsed=true;
       propsCollapsed=true;
     } else {
       toolsCollapsed=false;
       propsCollapsed=false;
     }
     updateSidebarCollapses();
     status(toolsCollapsed?'Sidebars collapsed for full canvas':'Sidebars expanded');
     return;
   }
   if(k==='c'&&!typing){e.preventDefault();copy();return}
   if(k==='v'&&!typing){e.preventDefault();paste({x:30,y:30});return}
   if(k==='d'&&!typing){e.preventDefault();duplicate();return}
   if(k==='a'&&!typing){
     e.preventDefault();
     setSelected(floor().objects.map(o=>o.id));
     render();props();
     status(`Selected all ${selectedIds.size} objects`);
     return;
   }
 }
 if(typing)return;
 if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();del();return}
 if(e.key==='Escape'){setTool('select');clearSelected();selectedConn=null;props();render();return}
 if(e.key==='['){rotate(-90);return} if(e.key===']'){rotate(90);return}
 if(e.key.toLowerCase()==='q'){viewRot=(viewRot+270)%360;applyView();status('Canvas rotated left: '+viewRot+'°');return}
 if(e.key.toLowerCase()==='g'){e.preventDefault();toggleGraph();return}
 if(e.key.toLowerCase()==='t'){e.preventDefault();toggleToolsSidebar();return}
 if(e.key.toLowerCase()==='p'){e.preventDefault();togglePropsSidebar();return}
 let t=KEYS[e.key.toLowerCase()];if(t){e.preventDefault();setTool(t)}
};

registerServiceWorker();
setupInstallPrompt();
window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);
updateConnectionStatus();
updateSidebarCollapses();
push();refresh();centerViewport();
