/* Core battle engine. Pattern definitions live in data.js. */
(() => {
  class BulletEngine {
    constructor(canvas, arena, onHit) {
      this.canvas=canvas; this.ctx=canvas.getContext("2d"); this.arena=arena; this.onHit=onHit;
      this.bullets=[]; this.running=false; this.last=0; this.elapsed=0; this.pattern=null; this.patternTimer=0; this.spiralAngle=0; this.nextSpawn=0; this.patternIndex=0;
      this.difficulty=BW_DATA.difficulties.normal; this.soul={x:0.5,y:0.76}; this.frame=0;
      this.resize=()=>{const r=this.arena.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=Math.floor(r.width*dpr);this.canvas.height=Math.floor(r.height*dpr);this.ctx.setTransform(dpr,0,0,dpr,0,0);this.w=r.width;this.h=r.height;};
      new ResizeObserver(this.resize).observe(arena); this.resize();
    }
    start(patternIds, difficulty, duration, soulGetter) {
      this.stop(); this.bullets=[]; this.patternIds=patternIds; this.difficulty=difficulty; this.duration=duration; this.soulGetter=soulGetter;
      this.running=true; this.last=performance.now(); this.elapsed=0; this.patternTimer=0; this.nextSpawn=0; this.patternIndex=0; this.prevNow=0; this.frame=requestAnimationFrame(t=>this.loop(t));
    }
    stop(){this.running=false;if(this.frame)cancelAnimationFrame(this.frame);this.bullets=[];this.clear();}
    clear(){this.ctx.clearRect(0,0,this.w||0,this.h||0);}
    spawn(pattern) {
      const cx=this.w/2, cy=this.h*0.12, speed=pattern.speed*this.difficulty.bulletSpeed;
      const add=(x,y,vx,vy,shape=pattern.shape||"orb")=>this.bullets.push({x,y,vx,vy,shape,color:pattern.color,r:shape==="heart"?6:4,damage:pattern.damage*this.difficulty.enemyDamage});
      if(pattern.type==="aimed"){
        const n=Math.max(1,Math.round(pattern.count*this.difficulty.bulletCount));
        for(let i=0;i<n;i++){const target=this.soulGetter(),tx=target.x*this.w,ty=target.y*this.h,dx=tx-cx+(i-(n-1)/2)*24,dy=ty-cy,len=Math.hypot(dx,dy)||1;add(cx,cy,dx/len*speed,dy/len*speed,"heart");}
      } else if(pattern.type==="fan"){
        const n=Math.max(3,Math.round(pattern.count*this.difficulty.bulletCount));
        for(let i=0;i<n;i++){const a=Math.PI/2+(i-(n-1)/2)*0.23;add(cx,cy,Math.cos(a)*speed,Math.sin(a)*speed);}
      } else if(pattern.type==="spiral"){
        const n=Math.max(2,Math.round(pattern.count*this.difficulty.bulletCount));
        for(let i=0;i<n;i++){const a=this.spiralAngle+i*Math.PI*2/n;add(cx,cy,Math.cos(a)*speed,Math.sin(a)*speed, "diamond");}
        this.spiralAngle+=0.42;
      } else if(pattern.type==="wave"){
        for(let i=0;i<3;i++){const x=this.w*(0.2+i*0.3);add(x,cy,(i-1)*0.25,speed,"note");}
      } else if(pattern.type==="lane"){
        const n=Math.max(2,Math.round(pattern.count*this.difficulty.bulletCount));
        for(let i=0;i<n;i++){const x=this.w*(i+1)/(n+1);add(x,0,0,speed,"diamond");}
      }
    }
    loop(now){
      if(!this.running)return;
      const dt=Math.min((now-this.last)/16.67,2);this.last=now;this.elapsed+=now-(this.prevNow||now);this.prevNow=now;
      this.patternTimer+=16.67*dt;
      if(this.patternTimer>=this.nextSpawn){
        const patternId=this.patternIds[this.patternIndex%this.patternIds.length];
        const pattern=BW_DATA.patterns[patternId];
        if(pattern)this.spawn(pattern);
        this.patternIndex++;
        this.nextSpawn=this.patternTimer+Math.max(180,(pattern?.interval||500)/this.difficulty.bulletCount);
      }
      const ctx=this.ctx;ctx.clearRect(0,0,this.w,this.h);
      const s=this.soulGetter();
      for(let i=this.bullets.length-1;i>=0;i--){
        const b=this.bullets[i];b.x+=b.vx*dt;b.y+=b.vy*dt;
        ctx.save();ctx.translate(b.x,b.y);ctx.rotate(Math.atan2(b.vy,b.vx));
        ctx.fillStyle=b.color;ctx.shadowColor=b.color;ctx.shadowBlur=10;
        if(b.shape==="diamond"){ctx.rotate(Math.PI/4);ctx.fillRect(-4,-4,8,8);}
        else if(b.shape==="heart"){ctx.font="14px sans-serif";ctx.fillText("♥",-7,5);}
        else if(b.shape==="note"){ctx.font="17px sans-serif";ctx.fillText("♪",-6,6);}
        else{ctx.beginPath();ctx.arc(0,0,b.r,0,Math.PI*2);ctx.fill();}
        ctx.restore();
        const sx=s.x*this.w,sy=s.y*this.h;
        if(Math.hypot(b.x-sx,b.y-sy)<(b.r+7)){this.bullets.splice(i,1);this.onHit(b.damage);continue;}
        if(b.x<-25||b.x>this.w+25||b.y<-25||b.y>this.h+25)this.bullets.splice(i,1);
      }
      if(this.elapsed>=this.duration){this.stop();return;}
      this.frame=requestAnimationFrame(t=>this.loop(t));
    }
  }
  window.BulletEngine=BulletEngine;
})();
