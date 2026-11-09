(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const ui = { start: $('startScreen'), result: $('resultScreen'), startBtn: $('startButton'), again: $('againButton'), hud: $('hud'), position: $('position'), lap: $('lap'), lapProgress: $('lapProgress'), timer: $('timer'), coins: $('coins'), item: $('itemBox'), speed: $('speed'), speedArc: $('speedArc'), countdown: $('countdown'), message: $('centerMessage'), toast: $('toast') };
  const TAU = Math.PI * 2, LAP_LENGTH = 11500, TOTAL_LAPS = 3, MAX_SPEED = 245;
  let W = 1280, H = 720, dpr = 1, last = 0, running = false, startedAt = 0, elapsed = 0, raf = 0;
  let player, racers, objects, keys = {}, touch = {}, audio = null, soundOn = false, toastTime = 0;
  const racerNames = ['Luna', 'Tito', 'Nina', 'Bento', 'Zeca', 'Maya', 'Ravi'];
  const palette = ['#f25a48','#56a7f2','#f3bf36','#a374e8','#45c995','#ef80ba','#e3edf0'];
  function resize(){
    const r = canvas.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 1.7); W = r.width; H = r.height;
    canvas.width = Math.round(W*dpr); canvas.height = Math.round(H*dpr); ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  window.addEventListener('resize', resize); resize();
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const mix=(a,b,t)=>a+(b-a)*t;
  const hash=(n)=>{let x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)};
  function reset(){
    player={distance:0,lane:0,speed:0,coins:0,item:null,drift:0,boost:0,invuln:0,finished:false};
    racers=Array.from({length:7},(_,i)=>({name:racerNames[i],color:palette[i],distance:-i*28-30, lane:(i%2?-.32:.32), speed:0,phase:hash(i+3)*TAU, finished:false}));
    objects=[];
    for(let n=0;n<68;n++){
      const base=220+n*495;
      if(n%3!==1) objects.push({type:'coin',distance:base+90,lane:(hash(n+70)-.5)*1.25,used:false});
      if(n%4===0) objects.push({type:'box',distance:base+305,lane:(hash(n+20)-.5)*1.25,used:false});
    }
    elapsed=0;startedAt=0;last=0;running=false;toastTime=0;
    ui.position.innerHTML='1<span>º</span>';ui.lap.innerHTML='1<span> / 3</span>';ui.lapProgress.style.width='0%';ui.coins.textContent='00';ui.speed.textContent='000';ui.speedArc.style.width='0%';ui.item.querySelector('.item-icon').textContent='?';
    ui.countdown.textContent='';ui.message.textContent='';ui.result.classList.add('hidden');ui.start.classList.remove('hidden');
    draw(0);
  }
  function curve(s){return Math.sin(s/1650)*155 + Math.sin(s/610)*58 + Math.sin(s/3550)*120;}
  function roadCenter(ahead){return W*.5 + (curve(player.distance+ahead)-curve(player.distance)) * (W/1280);}
  function project(depth){const horizon=H*.405;const t=1/(1+Math.max(0,depth)/760);return {y:horizon+(H-horizon)*t,scale:t};}
  function sky(){
    const g=ctx.createLinearGradient(0,0,0,H*.57);g.addColorStop(0,'#68cce5');g.addColorStop(.58,'#b7edf0');g.addColorStop(1,'#ffe9bd');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    // warm sun and hazy island horizon
    const sunX=W*.77,sunY=H*.22,sunR=Math.min(W,H)*.055;
    let glow=ctx.createRadialGradient(sunX,sunY,2,sunX,sunY,sunR*2.7);glow.addColorStop(0,'#fff4bfaa');glow.addColorStop(1,'#fff4bf00');ctx.fillStyle=glow;ctx.fillRect(sunX-sunR*3,sunY-sunR*3,sunR*6,sunR*6);ctx.fillStyle='#fff4c9';ctx.beginPath();ctx.arc(sunX,sunY,sunR,0,TAU);ctx.fill();
    // distant ocean
    ctx.fillStyle='#4dbdca';ctx.fillRect(0,H*.35,W,H*.16);
    ctx.fillStyle='#8cdbd7';ctx.fillRect(0,H*.35,W,H*.028);
    for(let i=0;i<5;i++){let x=((i*317+player.distance*.027)%(W+120))-60,y=H*(.16+(i%3)*.06);cloud(x,y,.8+(i%2)*.35)}
    // layered tropical hills
    hill('#82cdb0',.385,145,260,player.distance*.012);hill('#479f89',.418,110,220,player.distance*.018);hill('#25786e',.447,74,175,player.distance*.024);
  }
  function cloud(x,y,s){ctx.save();ctx.globalAlpha=.6;ctx.fillStyle='#fff9e9';ctx.beginPath();ctx.ellipse(x,y,34*s,10*s,0,0,TAU);ctx.ellipse(x-15*s,y+1*s,15*s,10*s,0,0,TAU);ctx.ellipse(x+8*s,y-6*s,18*s,14*s,0,0,TAU);ctx.ellipse(x+24*s,y,15*s,9*s,0,0,TAU);ctx.fill();ctx.restore()}
  function hill(color,base,amp,period,offset){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,H*base);for(let x=0;x<=W+10;x+=12){let y=H*base-Math.sin((x+offset)/period)*amp*(H/720);ctx.lineTo(x,y)}ctx.lineTo(W,H*.54);ctx.lineTo(0,H*.54);ctx.closePath();ctx.fill()}
  function drawRoad(){
    const horizon=H*.405;ctx.fillStyle='#64bd83';ctx.fillRect(0,horizon,W,H-horizon);
    const depths=[];for(let i=0;i<=70;i++){let t=i/70;depths.push(5600*(1-t)*(1-t))}
    for(let i=0;i<depths.length-1;i++){
      const far=depths[i],near=depths[i+1],pf=project(far),pn=project(near),cf=roadCenter(far),cn=roadCenter(near);
      const wf=(W*.47)*pf.scale,wn=(W*.47)*pn.scale;
      const stripe=Math.floor((player.distance+near)/170)%2;
      ctx.fillStyle=stripe?'#60ba7d':'#68c583';ctx.fillRect(0,pn.y,W,pf.y-pn.y+1);
      // shoulder and candy curbs
      ctx.fillStyle='#f7f0d7';ctx.beginPath();ctx.moveTo(cf-wf*1.12,pf.y);ctx.lineTo(cf+wf*1.12,pf.y);ctx.lineTo(cn+wn*1.12,pn.y);ctx.lineTo(cn-wn*1.12,pn.y);ctx.closePath();ctx.fill();
      ctx.fillStyle=stripe?'#f05f50':'#fff0cc';ctx.beginPath();ctx.moveTo(cf-wf*1.08,pf.y);ctx.lineTo(cf-wf*.99,pf.y);ctx.lineTo(cn-wn*.99,pn.y);ctx.lineTo(cn-wn*1.08,pn.y);ctx.closePath();ctx.fill();
      ctx.beginPath();ctx.moveTo(cf+wf*.99,pf.y);ctx.lineTo(cf+wf*1.08,pf.y);ctx.lineTo(cn+wn*1.08,pn.y);ctx.lineTo(cn+wn*.99,pn.y);ctx.closePath();ctx.fill();
      ctx.fillStyle='#898f84';ctx.beginPath();ctx.moveTo(cf-wf*.99,pf.y);ctx.lineTo(cf+wf*.99,pf.y);ctx.lineTo(cn+wn*.99,pn.y);ctx.lineTo(cn-wn*.99,pn.y);ctx.closePath();ctx.fill();
    }
    // short painted center dashes are spaced in world distance, not screen pixels
    let dash=((220-player.distance%220)%220);
    for(;dash<5200;dash+=220){const a=project(dash),b=project(dash+105),ca=roadCenter(dash),cb=roadCenter(dash+105),wa=W*.47*a.scale*.009,wb=W*.47*b.scale*.009;ctx.fillStyle='#fff3d4';ctx.beginPath();ctx.moveTo(ca-wa,a.y);ctx.lineTo(ca+wa,a.y);ctx.lineTo(cb+wb,b.y);ctx.lineTo(cb-wb,b.y);ctx.closePath();ctx.fill()}
    drawScenery();drawTrackObjects();drawRacers();
  }
  function drawScenery(){
    const horizon=H*.405;
    for(let i=0;i<17;i++){
      const absolute=Math.floor(player.distance/230)*230 + i*230;
      const ahead=absolute-player.distance;if(ahead<0||ahead>5200)continue;
      const p=project(ahead),side=i%2?-1:1,variation=hash(Math.floor(absolute/230));
      const center=roadCenter(ahead),roadW=W*.47*p.scale;
      const x=center+side*(roadW*(1.22+variation*.35)+48*p.scale),y=p.y;
      if(y<horizon||y>H+30)continue;
      drawPalm(x,y,p.scale,hash(i+81)>.5?0:1);
    }
    // occasional flags and spectator patches nearer the track
    for(let i=0;i<6;i++){
      const ahead=((i*800+520-player.distance%4800+4800)%4800);if(ahead<80||ahead>2100)continue;
      const p=project(ahead),c=roadCenter(ahead),rw=W*.47*p.scale,side=i%2?1:-1,x=c+side*rw*1.18;
      ctx.fillStyle='#f9e9be';ctx.fillRect(x-18*p.scale,p.y-13*p.scale,36*p.scale,8*p.scale);
      ctx.fillStyle=i%2?'#f47755':'#5cbbaa';ctx.fillRect(x-18*p.scale,p.y-13*p.scale,12*p.scale,8*p.scale);
    }
  }
  function drawPalm(x,y,s,kind){
    const size=clamp(s,0,1.35),trunk=76*size;
    ctx.save();ctx.translate(x,y);ctx.strokeStyle='#795843';ctx.lineWidth=Math.max(1,7*size);ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(-3*size,-trunk*.55,4*size,-trunk);ctx.stroke();
    const crownY=-trunk,leaf=26*size;
    for(let i=0;i<6;i++){const a=i*TAU/6+kind*.3;ctx.strokeStyle=['#15765f','#21876a','#30956c'][i%3];ctx.lineWidth=Math.max(1,5*size);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(4*size,crownY);ctx.quadraticCurveTo(Math.cos(a)*leaf*.55,crownY+Math.sin(a)*leaf*.25,Math.cos(a)*leaf*1.9,crownY+Math.sin(a)*leaf*.9+9*size);ctx.stroke()}
    ctx.fillStyle='#f1a94d';ctx.beginPath();ctx.arc(4*size,crownY+3*size,4*size,0,TAU);ctx.fill();ctx.restore();
  }
  function drawTrackObjects(){
    for(const o of objects){if(o.used)continue;const ahead=o.distance-player.distance;if(ahead<35||ahead>5200)continue;const p=project(ahead),c=roadCenter(ahead),rw=W*.47*p.scale,x=c+o.lane*rw*.72,y=p.y-14*p.scale;
      if(o.type==='coin'){
        const pulse=1+Math.sin(elapsed*5+o.distance)*.1,r=Math.max(2,9*p.scale*pulse);ctx.fillStyle='#e99c2a';ctx.beginPath();ctx.ellipse(x,y+2*p.scale,r*1.1,r,0,0,TAU);ctx.fill();ctx.fillStyle='#ffe272';ctx.beginPath();ctx.ellipse(x,y,r*.75,r*.9,0,0,TAU);ctx.fill();ctx.fillStyle='#fff5bc';ctx.fillRect(x-r*.16,y-r*.55,r*.3,r*1.1);
      }else{
        const w=Math.max(8,29*p.scale),h=w;ctx.save();ctx.translate(x,y);ctx.rotate(elapsed*1.25);ctx.fillStyle='#fff1ab';ctx.strokeStyle='#ffffff';ctx.lineWidth=Math.max(1,2*p.scale);ctx.beginPath();ctx.roundRect(-w/2,-h/2,w,h,4*p.scale);ctx.fill();ctx.stroke();ctx.fillStyle='#ea70af';ctx.font=`900 ${Math.max(8,w*.65)}px Outfit`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('?',0,1);ctx.restore();
      }
    }
  }
  function drawRacers(){
    const visible=racers.filter(r=>!r.finished).map(r=>({r,depth:r.distance-player.distance})).filter(o=>o.depth>45&&o.depth<2600).sort((a,b)=>b.depth-a.depth);
    for(const o of visible){const p=project(o.depth),center=roadCenter(o.depth),rw=W*.47*p.scale,x=center+o.r.lane*rw*.72;drawKart(x,p.y,o.r.color,clamp(p.scale*1.1,.08,.72),o.r.phase,false)}
    const pY=H*.84,nearCenter=roadCenter(0),nearWidth=W*.47;
    drawKart(nearCenter+player.lane*nearWidth*.65,pY,'#f46b45',1.05,player.drift,true);
  }
  function drawKart(x,y,color,s,lean=0,isPlayer=false){
    if(s<=.02)return;ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.rotate(isPlayer?clamp(lean,-1,1)*-.09:Math.sin(lean)*.025);
    // soft contact shadow
    ctx.fillStyle='#183b3a5c';ctx.beginPath();ctx.ellipse(0,0,36,9,0,0,TAU);ctx.fill();
    // tires
    ctx.fillStyle='#17282d';roundRect(-34,-26,15,30,5);roundRect(19,-26,15,30,5);roundRect(-30,-5,12,22,4);roundRect(18,-5,12,22,4);
    // rear chassis and fenders
    ctx.fillStyle='#d9e3da';ctx.beginPath();ctx.moveTo(-26,-31);ctx.quadraticCurveTo(-31,-22,-25,-7);ctx.lineTo(25,-7);ctx.quadraticCurveTo(31,-22,26,-31);ctx.closePath();ctx.fill();
    ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(-22,-45);ctx.quadraticCurveTo(-29,-35,-26,-17);ctx.lineTo(-22,-6);ctx.quadraticCurveTo(0,1,22,-6);ctx.lineTo(26,-17);ctx.quadraticCurveTo(29,-35,22,-45);ctx.lineTo(13,-52);ctx.lineTo(-13,-52);ctx.closePath();ctx.fill();
    // spoiler
    ctx.fillStyle='#263a3f';roundRect(-25,-56,50,7,3);ctx.fillStyle=color;roundRect(-22,-63,44,8,3);
    // tail lights
    ctx.fillStyle='#fff0c8';roundRect(-20,-17,9,7,2);roundRect(11,-17,9,7,2);ctx.fillStyle='#fb5846';roundRect(-18,-16,5,4,1);roundRect(13,-16,5,4,1);
    // driver helmet and suit
    ctx.fillStyle='#ffe0b0';ctx.beginPath();ctx.ellipse(0,-46,13,12,0,0,TAU);ctx.fill();ctx.fillStyle=isPlayer?'#f5cb50':'#f1d6ac';ctx.beginPath();ctx.ellipse(0,-48,14,12,0,0,TAU);ctx.fill();ctx.fillStyle='#25434a';ctx.beginPath();ctx.roundRect(-9,-50,18,6,3);ctx.fill();ctx.fillStyle='#fff';ctx.fillRect(-6,-49,3,2);ctx.fillRect(3,-49,3,2);
    // bright engine glow while boosting
    if(isPlayer&&player.boost>0){ctx.globalAlpha=.7;ctx.fillStyle='#9ff8ff';ctx.beginPath();ctx.moveTo(-8,-5);ctx.lineTo(-4,12+Math.random()*5);ctx.lineTo(0,-4);ctx.lineTo(6,13+Math.random()*5);ctx.lineTo(8,-5);ctx.fill()}
    ctx.restore();
  }
  function roundRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
  function update(dt){
    if(!running)return;
    elapsed=(performance.now()-startedAt)/1000;
    const accelerating=keys.ArrowUp||keys.KeyW||touch.accelerate;
    const braking=keys.ArrowDown||keys.KeyS;
    const left=keys.ArrowLeft||keys.KeyA||touch.left,right=keys.ArrowRight||keys.KeyD||touch.right;
    const drifting=keys.Space||touch.drift;
    const turn=(right?1:0)-(left?1:0);
    const max=MAX_SPEED+(player.boost>0?60:0);
    player.speed += (accelerating?105:45)*dt;
    if(braking)player.speed-=150*dt;
    player.speed=clamp(player.speed,0,max);
    player.boost=Math.max(0,player.boost-dt);player.invuln=Math.max(0,player.invuln-dt);
    const handling=drifting?1.55:1;
    player.lane=clamp(player.lane+turn*dt*(player.speed/150)*handling,-1.34,1.34);
    if(drifting&&Math.abs(turn)>.1&&player.speed>75)player.drift=clamp(player.drift+dt*turn*1.65,-1,1);
    else player.drift*=Math.max(0,1-dt*3.5);
    if(Math.abs(player.lane)>1.02){player.speed=Math.max(72,player.speed-95*dt);player.lane=clamp(player.lane,-1.25,1.25)}
    player.distance+=player.speed*dt*1.75;
    // Smooth rival drivers follow the racing line and occasionally duel.
    racers.forEach((r,i)=>{
      if(r.finished)return;
      const target=176+Math.sin(elapsed*.47+r.phase)*18+Math.sin(elapsed*.19+i)*10;
      r.speed=mix(r.speed||target,target,dt*.65);
      r.distance+=r.speed*dt*1.75;
      r.lane=clamp(Math.sin(elapsed*.45+r.phase)*.45,-.72,.72);
      if(r.distance>=LAP_LENGTH*TOTAL_LAPS){r.distance=LAP_LENGTH*TOTAL_LAPS;r.finished=true}
    });
    // Collectibles only trigger as the kart passes through their lane.
    for(const o of objects){if(o.used)continue;if(Math.abs(o.distance-player.distance)<Math.max(22,player.speed*dt*1.9)&&Math.abs(o.lane-player.lane)<(o.type==='box'?.24:.2)){
      o.used=true;if(o.type==='coin'){player.coins=Math.min(99,player.coins+1);player.speed=Math.min(MAX_SPEED+45,player.speed+3);showToast('+1 MOEDA')}
      else{player.item=['turbo','turbo','shield'][Math.floor(Math.random()*3)];ui.item.querySelector('.item-icon').textContent=player.item==='turbo'?'⚡':'◉';showToast('ITEM PRONTO!')}
    }}
    // A little bump if you squeeze into a rival.
    for(const r of racers){if(!r.finished&&Math.abs(r.distance-player.distance)<56&&Math.abs(r.lane-player.lane)<.17&&player.invuln<=0){player.speed=Math.max(75,player.speed-34);r.distance+=24;player.invuln=.75;showToast('TOQUE!')}}
    const lap=Math.min(TOTAL_LAPS,Math.floor(player.distance/LAP_LENGTH)+1);
    if(lap!==player._lap){player._lap=lap;if(lap>1&&lap<=TOTAL_LAPS)showCenter(`VOLTA ${lap}`)}
    if(player.distance>=LAP_LENGTH*TOTAL_LAPS){player.distance=LAP_LENGTH*TOTAL_LAPS;finishRace()}
    const all=[{distance:player.distance},...racers];const rank=1+all.filter(r=>r!==all[0]&&r.distance>player.distance).length;
    ui.position.innerHTML=`${rank}<span>º</span>`;ui.lap.innerHTML=`${lap}<span> / ${TOTAL_LAPS}</span>`;
    ui.lapProgress.style.width=`${(player.distance%LAP_LENGTH)/LAP_LENGTH*100}%`;
    ui.timer.textContent=formatTime(elapsed);ui.coins.textContent=String(player.coins).padStart(2,'0');
    ui.speed.textContent=String(Math.round(player.speed)).padStart(3,'0');ui.speedArc.style.width=`${clamp(player.speed/MAX_SPEED*100,0,100)}%`;
    ui.item.querySelector('.item-icon').textContent=player.item?(player.item==='turbo'?'⚡':'◉'):'?';
    if(toastTime>0){toastTime-=dt;if(toastTime<=0)ui.toast.classList.remove('show')}
  }
  function formatTime(s){const m=Math.floor(s/60),sec=Math.floor(s%60),d=Math.floor((s%1)*10);return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${d}`}
  function showToast(text){ui.toast.textContent=text;ui.toast.classList.add('show');toastTime=1.1}
  function showCenter(text){ui.message.textContent=text;setTimeout(()=>{if(ui.message.textContent===text)ui.message.textContent=''},1200)}
  function useItem(){if(!running||!player.item)return;if(player.item==='turbo'){player.boost=2.5;player.speed=Math.min(MAX_SPEED+55,player.speed+65);showToast('TURBO!')}else{player.invuln=2;showToast('ESCUDO!')}player.item=null;ui.item.querySelector('.item-icon').textContent='?'}
  function finishRace(){running=false;player.finished=true;const rank=1+racers.filter(r=>r.distance>player.distance).length;ui.resultPosition.textContent=`${rank}º`;ui.resultTime.textContent=formatTime(elapsed);ui.resultCoins.textContent=String(player.coins).padStart(2,'0');ui.resultTitle.textContent=rank===1?'CAMPEÃO!':rank<=3?'NO PÓDIO!':'QUE CORRIDA!';ui.resultCopy.textContent=rank===1?'A ilha inteira ouviu seu motor.':'A linha de chegada é só o começo da próxima aventura.';setTimeout(()=>ui.result.classList.remove('hidden'),700)}
  function render(now){const dt=Math.min(.04,(now-last)/1000||0);last=now;if(running)update(dt);draw(now/1000);raf=requestAnimationFrame(render)}
  function draw(time){
    ctx.clearRect(0,0,W,H);sky();drawRoad();
    // atmospheric vignette at screen edges
    const v=ctx.createLinearGradient(0,0,W,0);v.addColorStop(0,'#173c3d12');v.addColorStop(.12,'transparent');v.addColorStop(.88,'transparent');v.addColorStop(1,'#173c3d12');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
    if(player&&player.boost>0){ctx.strokeStyle='#e7ffff55';ctx.lineWidth=2;for(let i=0;i<7;i++){const x=((i*173+time*310)%W),y=H*.55+((i*71)%H*.35);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-25,y+42);ctx.stroke()}}
  }
  function beginRace(){
    if(running)return;ui.start.classList.add('hidden');ui.result.classList.add('hidden');player.distance=0;player.lane=0;player.speed=0;player.coins=0;player.item=null;player.boost=0;player.finished=false;racers.forEach((r,i)=>{r.distance=-i*25-25;r.finished=false;r.speed=0});objects.forEach(o=>o.used=false);
    const sequence=['3','2','1','VAI!'];let i=0;ui.countdown.textContent=sequence[0];
    const tick=()=>{i++;if(i<sequence.length){ui.countdown.textContent=sequence[i];setTimeout(tick,i===3?430:650)}else{ui.countdown.textContent='';running=true;startedAt=performance.now();last=startedAt}};
    setTimeout(tick,650);
  }
  function setAudio(){
    soundOn=!soundOn;const btn=$('soundButton');btn.style.background=soundOn?'#ffdf756e':'';
    if(soundOn&&!audio){try{const AC=window.AudioContext||window.webkitAudioContext;if(AC){audio=new AC();const osc=audio.createOscillator(),gain=audio.createGain();osc.type='triangle';osc.frequency.value=72;gain.gain.value=.018;osc.connect(gain);gain.connect(audio.destination);osc.start();audio.osc=osc;audio.gain=gain}}catch(e){}}
    if(audio){if(soundOn)audio.resume();else audio.suspend()}
  }
  ui.startBtn.addEventListener('click',beginRace);ui.again.addEventListener('click',()=>{reset();beginRace()});$('soundButton').addEventListener('click',setAudio);
  ui.item.addEventListener('click',useItem);
  window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();keys[e.code]=true;if(e.code==='KeyX'||e.code==='ShiftRight'||e.code==='ShiftLeft')useItem();if(e.code==='Enter'&&!running&&!ui.start.classList.contains('hidden'))beginRace()});
  window.addEventListener('keyup',e=>{keys[e.code]=false});
  document.querySelectorAll('[data-control]').forEach(btn=>{
    const name=btn.dataset.control;
    const down=e=>{e.preventDefault();touch[name]=true;btn.classList.add('active');try{btn.setPointerCapture(e.pointerId)}catch(_){}if(name==='item')useItem()};
    const up=e=>{e.preventDefault();touch[name]=false;btn.classList.remove('active')};
    btn.addEventListener('pointerdown',down);btn.addEventListener('pointerup',up);btn.addEventListener('pointercancel',up);btn.addEventListener('lostpointercapture',up);
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){keys={};touch={}}});
  reset();raf=requestAnimationFrame(render);
})();
