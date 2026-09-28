/* Headless check of the escape reflex, including whether the fly
 * physically clears the object after the Giant Fiber fires.
 */
const fs = require('fs');
global.window = global;
eval(fs.readFileSync('circuit.js','utf8'));
require('./tuning.js'); require('./fly.js'); require('./vision.js');

const P = window.ARENA_PARAMS;

// The fly faces left in the arena. Angles below are azimuth relative to
// where it is pointing, so the test stays in the fly's own frame.
const FACING = -Math.PI / 2;
const FLY_R = 9, HOME = {x:0, y:0};
let OBJ_R = 19;

/* Full arena simulation: detection AND the dodge. */
function trial(angle, speed, miss, start = 420) {
  const fly = new Fly(window.CIRCUIT, P);
  const body = {x:0, y:0, vx:0, vy:0, airborne:0};

  const w = angle + FACING;
  let obj = {x: Math.sin(w)*start, y: -Math.cos(w)*start, r: OBJ_R};
  const tx = Math.cos(w)*miss, ty = Math.sin(w)*miss;
  let vx = tx - obj.x, vy = ty - obj.y;
  const L = Math.hypot(vx, vy);
  vx = vx/L*speed; vy = vy/L*speed;

  let fired = null, lead = 0;

  for (let t = 0; t < 900; t++) {
    obj.x += vx; obj.y += vy;

    const v = Vision.look(body, obj, FACING);
    fly.step(v);

    if (!body.airborne) {
      const e = fly.escape();
      if (e) {
        const ax = obj.x - body.x, ay = obj.y - body.y;
        const d = Math.hypot(ax, ay) || 1;
        const kick = P.escape_speed;
        body.vx = (-ay/d)*e.away*kick - (ax/d)*kick*0.45;
        body.vy = ( ax/d)*e.away*kick - (ay/d)*kick*0.45;
        body.airborne = 44;
        fired = e.side; lead = Math.round(d);
      }
    }

    if (body.airborne > 0) {
      body.x += body.vx; body.y += body.vy;
      body.vx *= 0.94; body.vy *= 0.94;
      body.airborne--;
    }

    const gap = Math.hypot(obj.x - body.x, obj.y - body.y);
    if (!body.airborne && gap < FLY_R + OBJ_R) return {hit:true, fired, lead};
    if (Math.hypot(obj.x, obj.y) > 1000) return {hit:false, fired, lead, gone:true};
  }
  return {hit:false, fired, lead};
}

function idle(steps = 900) {
  const fly = new Fly(window.CIRCUIT, P);
  let n = 0;
  for (let t = 0; t < steps; t++) { fly.step({L:0,R:0}); if (fly.escape()) n++; }
  return n;
}

const LEFT  = [-1.2,-0.9,-0.6,-0.3];
const RIGHT = [ 1.2, 0.9, 0.6, 0.3];
const ALL   = [...LEFT, 0, ...RIGHT];
const SPEEDS = [2,4,6,8,10,12,14];

let survived = 0, total = 0, leads = [], sideOK = 0, sideN = 0;

for (const s of SPEEDS) for (const a of ALL) {
  const r = trial(a, s, 0);
  total++; if (!r.hit) survived++;
  if (r.lead) leads.push(r.lead);
}
for (const a of LEFT)  { sideN++; if (trial(a,6,0).fired === 'L') sideOK++; }
for (const a of RIGHT) { sideN++; if (trial(a,6,0).fired === 'R') sideOK++; }

let flinch = 0, nearN = 0;
for (const s of [4,8,12]) for (const a of [-1.0,-0.4,0,0.4,1.0]) {
  nearN++; if (trial(a, s, 260).fired) flinch++;
}

const pad = (x,n) => String(x).padStart(n);

console.log('arena params      ', JSON.stringify(P));
console.log('survived direct   ', pad(survived,3) + '/' + total, ' (' + SPEEDS.length + ' speeds x ' + ALL.length + ' angles)');
console.log('correct GF side   ', pad(sideOK,3) + '/' + sideN);
console.log('flinch at near miss', pad(flinch,2) + '/' + nearN);
console.log('false alarms idle ', pad(idle(),3) + ' in 900 steps');
console.log('escape lead px    ', Math.min(...leads) + ' - ' + Math.max(...leads));



if (process.argv[2] === 'sides') {
  console.log('\nper-angle side check (speed 6):');
  for (const a of [-1.2,-0.9,-0.6,-0.3,-0.15,0,0.15,0.3,0.6,0.9,1.2]) {
    const r = trial(a, 6, 0);
    const want = a < -0.05 ? 'L' : (a > 0.05 ? 'R' : '-');
    const bad = r.fired && want !== '-' && r.fired !== want;
    console.log('  az ' + pad(a,5) + '  fired ' + r.fired + '  want ' + want +
                '  lead ' + pad(r.lead,3) + (bad ? '   <-- WRONG' : ''));
  }
}

/* Several objects at once: each eye takes the strongest looming signal.
 * Checks the fly still escapes, and still picks the side of whichever
 * object is actually the threat.
 */
function volley(angles, speed, start = 420) {
  const fly = new Fly(window.CIRCUIT, P);
  const body = {x:0, y:0, vx:0, vy:0, airborne:0};

  const shots = angles.map(a => {
    const w = a + FACING;
    const o = {x: Math.sin(w)*start, y: -Math.cos(w)*start, r: OBJ_R};
    const L = Math.hypot(o.x, o.y);
    o.vx = -o.x/L*speed; o.vy = -o.y/L*speed;
    return o;
  });

  let fired = null;

  for (let t = 0; t < 900; t++) {
    for (const o of shots) { o.x += o.vx; o.y += o.vy; }

    const view = {L:0, R:0};
    let closest = null, nearest = Infinity;

    for (const o of shots) {
      const v = Vision.look(body, o, FACING);
      if (v.L > view.L) view.L = v.L;
      if (v.R > view.R) view.R = v.R;
      if (v.dist < nearest) { nearest = v.dist; closest = o; }
    }

    fly.step(view);

    if (!body.airborne && closest) {
      const e = fly.escape();
      if (e) {
        const ax=closest.x-body.x, ay=closest.y-body.y, d=Math.hypot(ax,ay)||1;
        const kick=P.escape_speed;
        body.vx=(-ay/d)*e.away*kick-(ax/d)*kick*0.45;
        body.vy=( ax/d)*e.away*kick-(ay/d)*kick*0.45;
        body.airborne=44; fired=e.side;
      }
    }
    if (body.airborne>0){ body.x+=body.vx; body.y+=body.vy; body.vx*=0.94; body.vy*=0.94; body.airborne--; }

    for (const o of shots) {
      if (!body.airborne && Math.hypot(o.x-body.x, o.y-body.y) < FLY_R+OBJ_R) return {hit:true, fired};
    }
    if (shots.every(o => Math.hypot(o.x,o.y) > 1000)) return {hit:false, fired};
  }
  return {hit:false, fired};
}

console.log('');
const VOLLEYS = [
  { name: 'two, both left ', a: [-1.1, -0.5], want: 'L' },
  { name: 'two, both right', a: [ 1.1,  0.5], want: 'R' },
  { name: 'three spread   ', a: [-1.1, 0, 1.1], want: null },
  { name: 'five spread    ', a: [-1.2,-0.6,0,0.6,1.2], want: null },
  { name: 'eight at once  ', a: [-1.4,-1.0,-0.6,-0.2,0.2,0.6,1.0,1.4], want: null }
];

for (const v of VOLLEYS) {
  let hit = 0, sideBad = 0;
  for (const s of SPEEDS) {
    const r = volley(v.a, s);
    if (r.hit) hit++;
    if (v.want && r.fired !== v.want) sideBad++;
  }
  console.log('  ' + v.name + '  n=' + v.a.length +
              '   hit ' + hit + '/' + SPEEDS.length +
              (v.want ? '   wrong side ' + sideBad + '/' + SPEEDS.length : ''));
}

if (process.argv[2] === 'volley') {
  console.log('\nthree-way volley, per speed:');
  for (const s of SPEEDS) {
    const r = volley([-1.1, 0, 1.1], s);
    console.log('  speed ' + pad(s,2) + '  ' + (r.hit ? 'HIT' : 'escaped') +
                '   GF fired: ' + r.fired);
  }
}
