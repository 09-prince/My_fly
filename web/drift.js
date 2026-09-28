const fs=require('fs'); global.window=global;
eval(fs.readFileSync('circuit.js','utf8'));
require('./tuning.js'); require('./fly.js'); require('./vision.js');
const P=window.ARENA_PARAMS, FACING=-Math.PI/2;
const W=1370, H=560, FLY_R=9, OBJ_R=19;
const HOME={x:W*0.74, y:H*0.50};

// A sustained barrage: a new bird every `every` steps, from random angles.
function barrage(steps, every, speed, rate){
  const fly=new Fly(window.CIRCUIT,P);
  const body={x:HOME.x,y:HOME.y,vx:0,vy:0,airborne:0};
  let shots=[], maxDrift=0, hits=0, escapes=0, seed=1;
  const rand=()=>{seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff;};

  for(let t=0;t<steps;t++){
    // The last stretch is quiet, so we measure where it settles once the
    // attack stops rather than catching it mid-dodge.
    if(t%every===0 && t < steps-260){
      const a=(rand()-0.5)*2.4 + FACING;
      const d=520;
      const o={x:HOME.x+Math.sin(a)*d, y:HOME.y-Math.cos(a)*d, r:OBJ_R};
      let vx=body.x-o.x, vy=body.y-o.y; const L=Math.hypot(vx,vy);
      o.vx=vx/L*speed; o.vy=vy/L*speed;
      shots.push(o);
    }
    shots.forEach(o=>{o.x+=o.vx;o.y+=o.vy;});
    shots=shots.filter(o=>o.x>-140&&o.x<W+140&&o.y>-140&&o.y<H+140);

    const view={L:0,R:0}; let closest=null,near=Infinity;
    for(const o of shots){const v=Vision.look(body,o,FACING);
      if(v.L>view.L)view.L=v.L; if(v.R>view.R)view.R=v.R;
      if(v.dist<near){near=v.dist;closest=o;}}
    fly.step(view);

    if(!body.airborne&&closest){const e=fly.escape();
      if(e){const ax=closest.x-body.x,ay=closest.y-body.y,d=Math.hypot(ax,ay)||1,k=P.escape_speed;
        body.vx=(-ay/d)*e.away*k-(ax/d)*k*0.45; body.vy=(ax/d)*e.away*k-(ay/d)*k*0.45;
        body.airborne=44; escapes++;}}

    if(body.airborne>0){
      body.x+=body.vx; body.y+=body.vy; body.vx*=0.94; body.vy*=0.94; body.airborne--;
      const m=30;
      if(body.x<m){body.x=m;body.vx=Math.abs(body.vx)*0.5;}
      if(body.x>W-m){body.x=W-m;body.vx=-Math.abs(body.vx)*0.5;}
      if(body.y<m){body.y=m;body.vy=Math.abs(body.vy)*0.5;}
      if(body.y>H-m){body.y=H-m;body.vy=-Math.abs(body.vy)*0.5;}
    } else if(rate){
      body.x += (HOME.x-body.x)*rate;
      body.y += (HOME.y-body.y)*rate;
    }

    for(const o of shots) if(!body.airborne&&Math.hypot(o.x-body.x,o.y-body.y)<FLY_R+OBJ_R){hits++;shots=shots.filter(s=>s!==o);}
    maxDrift=Math.max(maxDrift,Math.hypot(body.x-HOME.x,body.y-HOME.y));
  }
  return {maxDrift:Math.round(maxDrift), escapes, hits,
          endX:Math.round(body.x), pinned: body.x<60||body.x>W-60};
}

/* The bug this guards against: every escape moved the fly and nothing
 * brought it back, so a sustained barrage walked it to the edge of the
 * arena where it had no room left to dodge. */

console.log('sustained barrage, 2400 steps  (home x = ' + Math.round(HOME.x) + ')');
console.log('');
for(const rate of [0, 0.045]){
  const ends=[]; let hits=0, esc=0;
  for(const speed of [6,10,14]) for(const every of [40,25,15]){
    const r=barrage(2400,every,speed,rate);
    ends.push(Math.round(Math.hypot(r.endX-HOME.x,0)));
    hits+=r.hits; esc+=r.escapes;
  }
  const worst=Math.max.apply(null,ends);
  console.log('  return '+(rate?'on ':'off')+'   ends this far from home: '+
              Math.min.apply(null,ends)+'-'+worst+'px'+
              (worst>400?'   <-- WALKED OFF':'   ok')+
              '   hits '+hits+'  escapes '+esc);
}
