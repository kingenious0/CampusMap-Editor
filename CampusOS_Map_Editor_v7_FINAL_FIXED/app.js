const KEY='campusos-editor-v2';
const DEF={room:['Room',130,85],office:['Office',130,75],corridor:['Corridor',220,55],entrance:['Entrance',100,55],stair:['Stair',80,110],junction:['Junction',70,70],facility:['Facility',90,70],wall:['Wall',220,18],door:['Door',55,18]};
const KEYS={v:'select',r:'room',o:'office',c:'corridor',e:'entrance',s:'stair',j:'junction',f:'facility',w:'wall',d:'door',k:'connect'};
let project=load(), tool='select', selected=null, selectedConn=null, connectStart=null;
let zoom=1, viewRot=0, drag=null, pan=null, hist=[], hi=-1, showGraph=false, showLabels=true;
const $=id=>document.getElementById(id), floorSel=$('floorSelect'), canvas=$('canvas'), objects=$('objects'), lines=$('lines'), viewport=$('viewport'), stage=$('stage');

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
 render();props();centerViewport();
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
   l.onclick=e=>{e.stopPropagation();selectedConn=c.id;selected=null;props();updateLines()};
   lines.appendChild(l);
 });
}
function applyView(){
 canvas.style.transform=`rotate(${viewRot}deg) scale(${zoom})`;
 $('zoomText').textContent=Math.round(zoom*100)+'%';
}
function centerViewport(){
 let maxLeft=Math.max(0,(stage.scrollWidth||stage.clientWidth)-viewport.clientWidth);
 let maxTop=Math.max(0,(stage.scrollHeight||stage.clientHeight)-viewport.clientHeight);
 viewport.scrollLeft=Math.max(0,Math.min(maxLeft,(maxLeft)/2));
 viewport.scrollTop=Math.max(0,Math.min(maxTop,(maxTop)/2));
}
function render(){
 let f=floor();$('title').textContent=project.building.id+' — '+f.name;
 objects.innerHTML='';
 document.body.classList.toggle('graph-hidden',!showGraph);
 document.body.classList.toggle('labels-hidden',!showLabels);
 f.objects.forEach(o=>{
   let el=document.createElement('div');
   el.className='object '+o.type+(o.id===selected?' selected':'');
   Object.assign(el.style,{left:o.x+'px',top:o.y+'px',width:o.width+'px',height:o.height+'px',transform:`rotate(${o.rotation||0}deg)`});
   let lab=document.createElement('div');lab.className='label';lab.textContent=o.name;lab.title=o.name;el.appendChild(lab);
   if(o.id===selected){
     let h=document.createElement('div');h.className='handle';h.textContent='↻';h.title='Free rotate';h.onpointerdown=e=>rotateFree(e,o,el);el.appendChild(h);
     let r=document.createElement('div');r.className='resize-handle';r.title='Resize';r.onpointerdown=e=>resizeFree(e,o,el);el.appendChild(r);
   }
   el.onpointerdown=e=>{
     if(e.button!==0)return;
     if(tool==='connect'){e.stopPropagation();connect(o.id);return}
     if(tool!=='select')return;
     e.stopPropagation();selected=o.id;selectedConn=null;props();updateLines();
     drag={id:o.id,sx:e.clientX,sy:e.clientY,ox:o.x,oy:o.y,pid:e.pointerId,el};
     el.setPointerCapture(e.pointerId);
   };
   el.onpointermove=e=>{
     if(!drag||drag.id!==o.id||drag.pid!==e.pointerId)return;
     let dx=(e.clientX-drag.sx)/zoom,dy=(e.clientY-drag.sy)/zoom;
     // Convert screen movement into map movement when the canvas is rotated.
     let a=-viewRot*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
     let mx=dx*c-dy*s,my=dx*s+dy*c;
     o.x=snap(drag.ox+mx);o.y=snap(drag.oy+my);
     el.style.left=o.x+'px';el.style.top=o.y+'px';
     updateLines();
   };
   el.onpointerup=e=>{
     if(!drag||drag.id!==o.id||drag.pid!==e.pointerId)return;
     let changed=o.x!==drag.ox||o.y!==drag.oy;drag=null;
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
 f.objects.push(o);selected=o.id;selectedConn=null;push();render();props();save();status('✓ Added '+o.name+' to canvas');
}
// Public diagnostic hooks used by the Test Room button.
window.CampusOS = {
  setTool: t => setTool(t),
  add: (t,x,y) => add(t,x,y)
};

function point(e){
 // Invert the canvas view transform to get map coordinates.
 let r=canvas.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
 let sx=e.clientX-cx,sy=e.clientY-cy;
 let a=-viewRot*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 let ux=sx*c-sy*s,uy=sx*s+sy*c;
 return{x:(ux/zoom)+700,y:(uy/zoom)+450};
}
// FINAL PLACEMENT HANDLER.
// Creation happens on pointerup in capture phase. This deliberately avoids the
// browser's click synthesis, which can be suppressed by pointer capture,
// transforms, or drag handlers. Empty viewport releases create objects.
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
viewport.addEventListener('pointerdown',e=>{
 if(e.button===1 || (spaceDown && e.button===0)){
   startPan(e);
 }
});
viewport.addEventListener('pointermove',e=>{
 if(!pan)return;
 viewport.scrollLeft=pan.sl-(e.clientX-pan.sx);
 viewport.scrollTop=pan.st-(e.clientY-pan.sy);
});
viewport.addEventListener('pointerup',()=>pan=null);
viewport.addEventListener('pointercancel',()=>pan=null);
let spaceDown=false;
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!['input','textarea','select'].includes(document.activeElement?.tagName?.toLowerCase())){spaceDown=true;e.preventDefault();}});
document.addEventListener('keyup',e=>{if(e.code==='Space')spaceDown=false});

function connect(id){
 if(!connectStart){connectStart=id;selected=id;status('Now click destination object');render();return}
 if(connectStart===id){connectStart=null;status('Cancelled');return}
 let f=floor(),exists=f.connections.some(c=>(c.from===connectStart&&c.to===id)||(c.from===id&&c.to===connectStart));
 if(!exists){let c={id:uid('conn'),from:connectStart,to:id,type:'corridor',distance:dist(f.objects.find(o=>o.id===connectStart),f.objects.find(o=>o.id===id))};f.connections.push(c);selectedConn=c.id;selected=null;push();save();status('Connection created')}
 connectStart=null;render();props();
}
function rotate(delta){
 let o=floor().objects.find(o=>o.id===selected);if(!o)return;
 o.rotation=((o.rotation||0)+delta+360)%360;push();render();props();save();status('Rotated '+o.name+' to '+o.rotation+'°');
}
function rotateFree(e,o,el){
 e.stopPropagation();e.preventDefault();
 let r=canvas.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
 // Convert object center to screen using the same view transform.
 let lc={x:(o.x+o.width/2-700)*zoom,y:(o.y+o.height/2-450)*zoom},vr=viewRot*Math.PI/180;
 let sx=lc.x*Math.cos(vr)-lc.y*Math.sin(vr)+cx,sy=lc.x*Math.sin(vr)+lc.y*Math.cos(vr)+cy;
 let start=Math.atan2(e.clientY-sy,e.clientX-sx),orig=o.rotation||0;
 const move=ev=>{let a=Math.atan2(ev.clientY-sy,ev.clientX-sx);o.rotation=Math.round((orig+(a-start)*180/Math.PI)/5)*5;if(el)el.style.transform=`rotate(${o.rotation}deg)`};
 const up=()=>{removeEventListener('pointermove',move);removeEventListener('pointerup',up);push();save();render();props()};
 addEventListener('pointermove',move);addEventListener('pointerup',up);
}
function resizeFree(e,o,el){
 e.stopPropagation();e.preventDefault();
 let startX=e.clientX,startY=e.clientY,startW=o.width,startH=o.height;
 const move=ev=>{
   let dx=(ev.clientX-startX)/zoom,dy=(ev.clientY-startY)/zoom;
   let a=-viewRot*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
   let mx=dx*c-dy*s,my=dx*s+dy*c;
   o.width=Math.max(10,snap(startW+mx));
   o.height=Math.max(10,snap(startH+my));
   if(el){el.style.width=o.width+'px';el.style.height=o.height+'px';}
 };
 const up=()=>{removeEventListener('pointermove',move);removeEventListener('pointerup',up);push();save();render();props();updateLines()};
 addEventListener('pointermove',move);addEventListener('pointerup',up);
}
function del(){
 let f=floor();
 if(selected){f.objects=f.objects.filter(o=>o.id!==selected);f.connections=f.connections.filter(c=>c.from!==selected&&c.to!==selected);selected=null;push();save();render();props();status('Object deleted')}
 else if(selectedConn){f.connections=f.connections.filter(c=>c.id!==selectedConn);selectedConn=null;push();save();render();props();status('Connection deleted')}
}
function props(){
 $('empty').hidden=!!(selected||selectedConn);$('form').hidden=!selected;$('connBox').hidden=!selectedConn;
 if(selected){let o=floor().objects.find(o=>o.id===selected);if(!o)return;
   $('pid').value=o.id;$('pname').value=o.name;$('ptype').value=o.type;$('pdesc').value=o.description||'';$('pnote').value=o.locationNote||'';
   $('px').value=o.x;$('py').value=o.y;$('pw').value=o.width;$('ph').value=o.height;$('prot').value=o.rotation||0;$('pfloor').value=floor().name;
 }
 if(selectedConn){let c=floor().connections.find(c=>c.id===selectedConn);if(!c)return;let f=floor(),a=$('from'),b=$('to');a.innerHTML='';b.innerHTML='';
   f.objects.forEach(o=>{a.add(new Option(o.name,o.id));b.add(new Option(o.name,o.id))});a.value=c.from;b.value=c.to;$('ctype').value=c.type;
   $('dist').textContent='Auto distance: '+dist(f.objects.find(o=>o.id===c.from),f.objects.find(o=>o.id===c.to))+' editor units';
 }
}
$('form').onsubmit=e=>{e.preventDefault();let o=floor().objects.find(o=>o.id===selected);if(!o)return;
 o.name=$('pname').value.trim()||o.name;o.description=$('pdesc').value;o.locationNote=$('pnote').value;
 o.x=+$('px').value;o.y=+$('py').value;o.width=Math.max(10,+$('pw').value);o.height=Math.max(10,+$('ph').value);o.rotation=+$('prot').value||0;
 push();save();render();props();status('Properties updated')};
['from','to','ctype'].forEach(id=>$(id).onchange=()=>{let c=floor().connections.find(c=>c.id===selectedConn);if(!c)return;
 c.from=$('from').value;c.to=$('to').value;c.type=$('ctype').value;c.distance=dist(floor().objects.find(o=>o.id===c.from),floor().objects.find(o=>o.id===c.to));push();save();render();props()});
$('delConn').onclick=del;$('del').onclick=del;$('rotL').onclick=()=>rotate(-90);$('rotR').onclick=()=>rotate(90);
$('undo').onclick=undo;$('redo').onclick=redo;$('save').onclick=save;
document.querySelectorAll('.tool').forEach(b=>{
 b.onclick=e=>{e.preventDefault();e.stopPropagation();setTool(b.dataset.tool)};
});
function setTool(t){tool=t;connectStart=null;document.querySelectorAll('.tool').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));status(t==='connect'?'Connect mode: click two objects':'✓ '+t+' tool active — release mouse on empty canvas to place')}
$('export').onclick=()=>{let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}));a.download='rob-campusos-map.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);status('JSON exported')};
$('import').onclick=()=>$('file').click();
$('file').onchange=e=>{let file=e.target.files[0];if(!file)return;let r=new FileReader();r.onload=()=>{try{let p=JSON.parse(r.result);if(!p.floors)throw Error('Invalid CampusOS JSON');push();project=p;selected=null;selectedConn=null;refresh();fitView();save();status('JSON imported')}catch(x){alert(x.message)}};r.readAsText(file);e.target.value=''};
floorSel.onchange=()=>{selected=null;selectedConn=null;refresh();status('Floor changed')};
$('newFloor').onclick=()=>{let name=prompt('Floor name:','First Floor');if(!name)return;let level=+prompt('Level (Ground=0, First=1):','1');if(!Number.isFinite(level))return;
 let copy=confirm('Copy current floor as a starting point?'),src=floor(),nf={id:uid('floor'),name,level,objects:[],connections:[]};
 if(copy){let map={};nf.objects=cp(src.objects).map(o=>{let id=uid(o.type);map[o.id]=id;return {...o,id,floorId:nf.id}});nf.connections=src.connections.map(c=>({...cp(c),id:uid('conn'),from:map[c.from],to:map[c.to]}))}
 project.floors.push(nf);floorSel.value=nf.id;push();refresh();save();status(name+' created')};
$('clear').onclick=()=>{if(!confirm('Clear this floor?'))return;floor().objects=[];floor().connections=[];selected=null;selectedConn=null;push();refresh();save();status('Floor cleared')};
$('validate').onclick=()=>{let f=floor(),w=[];f.objects.filter(o=>!['wall','door'].includes(o.type)).forEach(o=>{if(!f.connections.some(c=>c.from===o.id||c.to===o.id))w.push(o.name+' has no connection')});$('validation').innerHTML=w.length?'<div class="warn">⚠ '+w.length+' issue(s)</div>'+w.map(x=>'<div>• '+x+'</div>').join(''):'<div class="ok">✓ No basic connectivity issues found.</div>';status('Validation complete')};

$('zoomIn').onclick=()=>{zoom=Math.min(2.5,zoom+.1);applyView()};
$('zoomOut').onclick=()=>{zoom=Math.max(.3,zoom-.1);applyView()};
$('viewport').onwheel=e=>{if(!e.ctrlKey)return;e.preventDefault();zoom=Math.max(.3,Math.min(2.5,zoom+(e.deltaY<0?.1:-.1)));applyView()};
$('viewL').onclick=()=>{viewRot=(viewRot+270)%360;applyView();status('Canvas rotated left: '+viewRot+'°')};
$('viewR').onclick=()=>{viewRot=(viewRot+90)%360;applyView();status('Canvas rotated right: '+viewRot+'°')};
$('viewReset').onclick=()=>{viewRot=0;zoom=1;viewport.scrollLeft=0;viewport.scrollTop=0;applyView();status('Canvas view reset')};
function fitView(){
 let f=floor(),os=f.objects;if(!os.length){viewRot=0;zoom=1;applyView();return}
 let minX=Math.min(...os.map(o=>o.x)),maxX=Math.max(...os.map(o=>o.x+o.width)),minY=Math.min(...os.map(o=>o.y)),maxY=Math.max(...os.map(o=>o.y+o.height));
 let pad=80, w=maxX-minX+pad*2,h=maxY-minY+pad*2, z=Math.min((viewport.clientWidth-40)/w,(viewport.clientHeight-40)/h);
 zoom=Math.max(.3,Math.min(1.5,z));viewRot=0;applyView();
 viewport.scrollLeft=Math.max(0,(minX-pad)*zoom+80);viewport.scrollTop=Math.max(0,(minY-pad)*zoom+80);
 status('Map fitted to view');
}
$('fit').onclick=fitView;
$('graphToggle').onclick=()=>{showGraph=!showGraph;render();status(showGraph?'Graph shown':'Graph hidden')};
$('labelsToggle').onclick=()=>{showLabels=!showLabels;render();status(showLabels?'Labels shown':'Labels hidden')};

document.onkeydown=e=>{
 let tag=document.activeElement?.tagName?.toLowerCase(),typing=['input','textarea','select'].includes(tag);
 if(e.ctrlKey&&e.key.toLowerCase()==='s'){e.preventDefault();save();return}
 if(e.ctrlKey&&e.key.toLowerCase()==='z'){e.preventDefault();undo();return}
 if(e.ctrlKey&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return}
 if(typing)return;
 if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();del();return}
 if(e.key==='Escape'){setTool('select');selected=null;selectedConn=null;props();render();return}
 if(e.key==='['){rotate(-90);return} if(e.key===']'){rotate(90);return}
 if(e.key.toLowerCase()==='q'){viewRot=(viewRot+270)%360;applyView();status('Canvas rotated left: '+viewRot+'°');return}
 if(e.key.toLowerCase()==='g'){viewRot=(viewRot+90)%360;applyView();status('Canvas rotated right: '+viewRot+'°');return}
 let t=KEYS[e.key.toLowerCase()];if(t){e.preventDefault();setTool(t)}
};
push();refresh();
