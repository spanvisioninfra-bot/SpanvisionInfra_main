import { createEffect, createSignal, onMount, onCleanup, Show } from 'solid-js';

const clamp = value => Math.max(0, Math.min(1, value));
const edges = [], faces = [];
function segment(a, b, stage = 0, detail = false) { edges.push({ a, b, stage, detail }); }
function box(x1, z1, x2, z2, bottom, top, stage, glass = false) {
  const p = [[x1,bottom,z1],[x2,bottom,z1],[x2,bottom,z2],[x1,bottom,z2],[x1,top,z1],[x2,top,z1],[x2,top,z2],[x1,top,z2]];
  for (const [a,b] of [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]) segment(p[a],p[b],stage);
  for (const corners of [[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]) faces.push({ points: corners.map(i=>p[i]), stage, glass });
}

// A real three-dimensional architectural model, projected as an axonometric
// drawing. Local geometry keeps the illustration independent of WebGL or assets.
box(-6.2,-4.1,6.2,4.1,-.22,0,0);
box(-4.8,-3.3,4.8,3.3,.12,2.65,.8,true);
box(-5.6,-3.5,5.1,3.7,2.65,2.88,1.6);
box(-5.3,-3.3,4.8,3.3,2.88,5.25,2.1,true);
box(-5.6,-3.5,5.1,3.7,5.25,5.48,3);
box(-2.1,-2.5,4.8,3.1,5.48,7.65,3.5,true);
box(-2.35,-2.75,5.05,3.35,7.65,7.86,4.3);
for (const x of [-4.8,4.55]) for (const z of [-3.3,3.05]) box(x,z,x+.25,z+.25,.12,2.65,1.1);
for (const [left,right,bottom,top,front,back,stage] of [[-4.8,4.8,.12,2.65,3.3,-3.3,1.35],[-5.3,4.8,2.88,5.25,3.3,-3.3,2.55],[-2.1,4.8,5.48,7.65,3.1,-2.5,3.95]]) {
  for (let x=left+1.1; x<right; x+=1.15) {
    segment([x,bottom,front],[x,top,front],stage,true);
    segment([x,bottom,back],[x,top,back],stage,true);
  }
  for (let z=back+1.1; z<front; z+=1.15) {
    segment([left,bottom,z],[left,top,z],stage,true);
    segment([right,bottom,z],[right,top,z],stage,true);
  }
  segment([left,bottom+.25,front],[right,bottom+.25,front],stage,true);
}
// Terrace railing, entrance glazing and the approach steps.
for (const z of [-3.5,3.7]) {
  segment([-5.6,6.25,z],[-2.35,6.25,z],4.6,true);
  for (let x=-5.6;x<-2.3;x+=.65) segment([x,5.48,z],[x,6.25,z],4.6,true);
}
segment([-5.6,6.25,-3.5],[-5.6,6.25,3.7],4.6,true);
for (let z=-3.5;z<3.7;z+=.8) segment([-5.6,5.48,z],[-5.6,6.25,z],4.6,true);
box(-.75,3.31,.75,3.34,.12,2.3,2,true);
for (let i=0;i<3;i++) box(-1.2,3.5+i*.32,1.2,3.82+i*.32,-.04,.18-i*.055,.45);

function paint(ctx, width, height, time, mode, reduced) {
  ctx.clearRect(0,0,width,height);
  const light = mode === 'light';
  const ink = light ? '#263547' : '#e6ebf2';
  const soft = light ? '#64758a' : '#929fae';
  const scale = width / 18.8;
  const angle = -.68 + (reduced ? 0 : Math.sin(time*.18)*.2);
  const tilt = .48;
  const project = ([x,y,z]) => {
    const horizontal = x*Math.cos(angle)-z*Math.sin(angle);
    const depth = x*Math.sin(angle)+z*Math.cos(angle);
    return { x:width*.5+horizontal*scale, y:height*.67+(depth*Math.sin(tilt)-y*Math.cos(tilt))*scale, depth:depth*Math.cos(tilt)+y*Math.sin(tilt) };
  };
  const line = (a,b,color,alpha=1,dash=[]) => {
    ctx.strokeStyle=color;ctx.globalAlpha=alpha;ctx.setLineDash(dash);
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  };
  ctx.lineWidth=.65;
  for (let i=-8;i<=8;i++) {
    const alpha=(light?.13:.1)*(1-Math.abs(i)/12);
    line(project([i,-.26,-6]),project([i,-.26,6]),soft,alpha);
    if(Math.abs(i)<=6)line(project([-8,-.26,i]),project([8,-.26,i]),soft,alpha);
  }
  // Draw translucent, depth-sorted surfaces before their structural edges.
  const surfaces = faces.map(face=>({ ...face, projected:face.points.map(project) }));
  surfaces.sort((a,b)=>a.projected.reduce((sum,p)=>sum+p.depth,0)-b.projected.reduce((sum,p)=>sum+p.depth,0));
  for (const face of surfaces) {
    const alpha=clamp((time-face.stage-.8)*.55);
    if(!alpha)continue;
    ctx.globalAlpha=alpha*(face.glass?(light?.04:.025):(light?.09:.055));ctx.fillStyle=ink;
    ctx.beginPath();face.projected.forEach((point,i)=>i?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y));ctx.closePath();ctx.fill();
  }
  const drawTime=reduced?20:time;
  for (let index=0;index<edges.length;index++) {
    const edge=edges[index];const progress=clamp((drawTime-edge.stage-(index%12)*.045)/.75);
    if(!progress)continue;
    const a=project(edge.a),b=project(edge.b);
    ctx.lineWidth=edge.detail?.7:1.05;
    line(a,{x:a.x+(b.x-a.x)*progress,y:a.y+(b.y-a.y)*progress},edge.detail?soft:ink,edge.detail?.52:.8);
  }
  ctx.globalAlpha=1;
  if(time>4.9||reduced) {
    const dimension = (a,b,label) => {
      const start=project(a),end=project(b);
      ctx.lineWidth=.6;line(start,end,soft,.5);
      for(const point of [start,end])line({x:point.x-3,y:point.y+3},{x:point.x+3,y:point.y-3},soft,.7);
      const x=(start.x+end.x)/2,y=(start.y+end.y)/2;
      ctx.globalAlpha=.85;ctx.font=`${Math.max(8,width*.022)}px ui-monospace, monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
      const textWidth=ctx.measureText(label).width;
      ctx.fillStyle=light?'#f5f6f8':'#090b0e';ctx.fillRect(x-textWidth/2-4,y-7,textWidth+8,14);
      ctx.fillStyle=soft;ctx.fillText(label,x,y);ctx.globalAlpha=1;
    };
    dimension([-5.6,0,5.15],[5.1,0,5.15],'10.7 m');
    dimension([6.6,0,-3.3],[6.6,0,3.3],'6.6 m');
    line(project([-5.6,0,3.7]),project([-5.6,0,5.4]),soft,.3,[3,4]);
    line(project([5.1,0,3.7]),project([5.1,0,5.4]),soft,.3,[3,4]);
  }
  ctx.setLineDash([]);ctx.globalAlpha=1;
}

export default function ArchitectureDrawing(props) {
  const [failed,setFailed]=createSignal(false);
  let canvas, viewport, redraw=()=>{};
  createEffect(()=>{props.mode;redraw();});
  onMount(()=>{
    const ctx=canvas.getContext('2d');
    if(!ctx){setFailed(true);viewport.dataset.architectureState='fallback';return;}
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    let frame=0,previous=0,time=1.5,width=0,height=0,visible=true,disposed=false;
    const stop=()=>{cancelAnimationFrame(frame);frame=0;previous=0;};
    const render=now=>{
      frame=0;if(disposed||!visible||document.hidden)return;
      if(!motion.matches&&previous)time+=Math.min((now-previous)/1000,.05);
      previous=now;
      paint(ctx,width,height,motion.matches?20:time,props.mode,motion.matches);
      viewport.dataset.architectureState='ready';
      if(!motion.matches)frame=requestAnimationFrame(render);
    };
    redraw=()=>{if(!frame&&!disposed&&visible&&!document.hidden)frame=requestAnimationFrame(render);};
    const resize=()=>{
      width=viewport.clientWidth;height=viewport.clientHeight;
      const ratio=Math.min(window.devicePixelRatio||1,2);
      canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);redraw();
    };
    const visibilityChanged=()=>{stop();redraw();};
    const motionChanged=()=>{stop();redraw();};
    const sizeObserver=new ResizeObserver(resize);sizeObserver.observe(viewport);
    const visibilityObserver=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??true;stop();redraw();});visibilityObserver.observe(viewport);
    document.addEventListener('visibilitychange',visibilityChanged);motion.addEventListener('change',motionChanged);
    resize();
    onCleanup(()=>{disposed=true;stop();sizeObserver.disconnect();visibilityObserver.disconnect();document.removeEventListener('visibilitychange',visibilityChanged);motion.removeEventListener('change',motionChanged);redraw=()=>{};});
  });
  return <figure class="company-architecture" aria-label="Animated three-dimensional architectural drawing" data-sv-reveal>
    <div class="architecture-viewport" ref={viewport} data-architecture-state="loading">
      <div class="architecture-heading" aria-hidden="true"><span>ARCHITECTURAL STUDY</span><span>3D / AXONOMETRIC</span></div>
      <canvas ref={canvas} class="architecture-canvas" hidden={failed()} role="img" aria-label="A three-storey building with glass facades, structural frames and a roof terrace, drawn in an animated isometric view."/>
      <Show when={failed()}><svg class="architecture-fallback" viewBox="0 0 400 360" role="img" aria-label="Isometric architectural drawing of a three-storey building"><g fill="none" stroke="currentColor" stroke-width="1.3"><path d="m60 232 154-82 140 74-154 82zM84 220V126l125-67 123 65v106M84 126l125 66 123-68M209 192v94M84 166l125 66 123-68M84 202l125 66 123-68M144 159V94M273 158V92M116 236V145M177 268v-91M241 269V175M301 237V141M125 115V79l88-47 80 43v34M125 79l88 47 80-51M213 126V93"/></g></svg></Show>
    </div>
    <figcaption>Form. Structure. Detail.</figcaption>
  </figure>;
}
