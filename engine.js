/* Core battle engine. Pattern definitions live in data.js. */
(() => {
  function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }
  class BulletEngine {
    constructor(canvas, arena, onHit) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.arena = arena;
      this.onHit = onHit;
      this.bullets = [];
      this.running = false;
      this.last = 0;
      this.elapsed = 0;
      this.patternTimer = 0;
      this.spiralAngle = 0;
      this.nextSpawn = 0;
      this.patternIndex = 0;
      this.difficulty = BW_DATA.difficulties.normal;
      this.phaseLevel = 0;
      this.soul = { x: 0.5, y: 0.76 };
      this.frame = 0;
      this.stageEffect = null;
      this.statusVisual = null;
      this.onStatusEffect = () => {};
      this.onStageEffect = () => {};
      this.resize = () => {
        const r = this.arena.getBoundingClientRect();
        const dpr = Math.min(devicePixelRatio || 1, 2);
        this.canvas.width = Math.floor(r.width * dpr);
        this.canvas.height = Math.floor(r.height * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.w = r.width;
        this.h = r.height;
      };
      new ResizeObserver(this.resize).observe(arena);
      this.resize();
    }

    start(patternIds, difficulty, duration, soulGetter, phaseLevel = 0, options = {}) {
      this.stop();
      this.bullets = [];
      this.patternIds = patternIds;
      this.difficulty = difficulty;
      this.duration = duration;
      this.soulGetter = soulGetter;
      this.phaseLevel = Math.max(0, Math.min(2, phaseLevel));
      this.finisher = options.finisher === true && this.phaseLevel >= 2;
      this.onFinisherStart = options.onFinisherStart || (() => {});
      this.onFinisherHit = options.onFinisherHit || (() => {});
      this.finisherStarted = false;
      this.finisherHit = false;
      this.patternSelector = options.patternSelector || null;
      this.movementGetter = options.movementGetter || (() => ({x:0.5,y:0.76,vx:0,vy:0}));
      this.onStatusEffect = options.onStatusEffect || (() => {});
      this.onStageEffect = options.onStageEffect || (() => {});
      this.singleShot = options.singleShot === true;
      this.stageEffect = null;
      this.statusVisual = null;
      this.running = true;
      this.last = performance.now();
      this.elapsed = 0;
      this.patternTimer = 0;
      this.nextSpawn = 0;
      this.patternIndex = 0;
      this.prevNow = 0;
      this.frame = requestAnimationFrame(t => this.loop(t));
    }

    stop() {
      this.running = false;
      if (this.frame) cancelAnimationFrame(this.frame);
      this.bullets = [];
      this.stageEffect = null;
      this.statusVisual = null;
      if (this.onStageEffect) this.onStageEffect(this.getSafeBounds());
      this.clear();
    }

    getSafeBounds() {
      if (this.stageEffect) return {minX:this.stageEffect.minX, maxX:this.stageEffect.maxX, minY:0.035, maxY:0.965};
      return {minX:0.025, maxX:0.975, minY:0.035, maxY:0.965};
    }

    clear() {
      this.ctx.clearRect(0, 0, this.w || 0, this.h || 0);
    }

    get intensity() {
      return [
        { speed: 1, count: 1, cadence: 1, damage: 1 },
        { speed: 1.1, count: 1.16, cadence: 0.88, damage: 1.05 },
        { speed: 1.22, count: 1.32, cadence: 0.78, damage: 1.1 }
      ][this.phaseLevel];
    }

    spawn(pattern) {
      const level = this.intensity;
      const cx = this.w / 2;
      const cy = this.h * 0.12;
      const speed = pattern.speed * this.difficulty.bulletSpeed * level.speed;
      const count = Math.max(1, Math.round((pattern.count || 3) * this.difficulty.bulletCount * level.count));
      const add = (x, y, vx, vy, shape = pattern.shape || "orb") => {
        this.bullets.push({
          x, y, vx, vy, shape, color: pattern.color,
          r: (shape === "heart" || shape === "spear" || shape === "sword") ? 7 : 4,
          damage: pattern.damage * this.difficulty.enemyDamage * level.damage,
          effect: pattern.effect === "knockback" ? {
            type:"knockback", dx:(Math.hypot(vx,vy) ? vx/Math.hypot(vx,vy) : 0),
            dy:(Math.hypot(vx,vy) ? vy/Math.hypot(vx,vy) : 0),
            power:pattern.knockbackPower || 0.12
          } : null
        });
      };

      if (pattern.type === "aimed") {
        const n = Math.max(1, count);
        for (let i = 0; i < n; i++) {
          const target = this.soulGetter();
          const tx = target.x * this.w;
          const ty = target.y * this.h;
          const dx = tx - cx + (i - (n - 1) / 2) * 24;
          const dy = ty - cy;
          const len = Math.hypot(dx, dy) || 1;
          add(cx, cy, dx / len * speed, dy / len * speed, pattern.shape || "heart");
        }
      } else if (pattern.type === "fan") {
        const n = Math.max(3, count);
        const spread = pattern.spread || 0.18;
        for (let i = 0; i < n; i++) {
          const a = Math.PI / 2 + (i - (n - 1) / 2) * spread;
          add(cx, cy, Math.cos(a) * speed, Math.sin(a) * speed);
        }
      } else if (pattern.type === "spiral") {
        const n = Math.max(2, count);
        for (let i = 0; i < n; i++) {
          const a = this.spiralAngle + i * Math.PI * 2 / n;
          add(cx, cy, Math.cos(a) * speed, Math.sin(a) * speed, "diamond");
        }
        this.spiralAngle += 0.42 + this.phaseLevel * 0.08;
      } else if (pattern.type === "wave") {
        const n = Math.max(3, count);
        for (let i = 0; i < n; i++) {
          const x = this.w * (i + 1) / (n + 1);
          const drift = Math.sin(this.patternTimer / 260 + i) * speed * 0.28;
          add(x, cy, drift, speed, pattern.shape || "note");
        }
      } else if (pattern.type === "lane") {
        const n = Math.max(2, count);
        for (let i = 0; i < n; i++) {
          const x = this.w * (i + 1) / (n + 1);
          add(x, -5, 0, speed, pattern.shape || "diamond");
        }
      } else if (pattern.type === "rain") {
        const n = Math.max(5, count);
        for (let i = 0; i < n; i++) {
          const x = this.w * (i + 0.5) / n;
          const drift = Math.sin(i * 1.7 + this.patternIndex) * speed * 0.28;
          add(x, -8 - (i % 3) * 12, drift, speed, pattern.shape || "heart");
        }
      } else if (pattern.type === "cross") {
        const n = Math.max(3, count);
        for (let i = 0; i < n; i++) {
          const y = cy + i * Math.max(5, this.h * 0.035);
          const dy = speed * (0.48 + (i % 2) * 0.18);
          add(-8, y, speed, dy, pattern.shape || "diamond");
          add(this.w + 8, y, -speed, dy, pattern.shape || "diamond");
        }
      } else if (pattern.type === "sweep") {
        const side = this.patternIndex % 2 === 0 ? 1 : -1;
        const startX = side === 1 ? -8 : this.w + 8;
        const n = Math.max(4, count);
        for (let i = 0; i < n; i++) {
          const t = (i - (n - 1) / 2) * 0.12;
          const vx = side * speed * Math.cos(t);
          const vy = speed * (0.42 + Math.abs(t) * 0.5);
          add(startX, cy + i * 3, vx, vy, "note");
        }
      } else if (pattern.type === "zigzag") {
        const n = Math.max(4, count);
        for (let i = 0; i < n; i++) {
          const x = this.w * (i + 1) / (n + 1);
          const dir = i % 2 === 0 ? 1 : -1;
          add(x, -8 - (i % 2) * 18, dir * speed * 0.48, speed, "diamond");
        }
      } else if (pattern.type === "ring") {
        const n = Math.max(6, count);
        const ringX = this.w / 2;
        const ringY = this.h * 0.25;
        for (let i = 0; i < n; i++) {
          const a = this.spiralAngle + Math.PI * 2 * i / n;
          add(ringX, ringY, Math.cos(a) * speed, Math.sin(a) * speed, pattern.shape || "heart");
        }
        this.spiralAngle += 0.22;
      } else if (pattern.type === "burst") {
        const n = Math.max(7, count);
        for (let i = 0; i < n; i++) {
          const a = Math.PI * 0.12 + (Math.PI * 0.76) * i / (n - 1);
          add(cx, this.h * 0.2, Math.cos(a) * speed, Math.sin(a) * speed, "heart");
        }
      } else if (pattern.type === "shockwave") {
        const n = Math.max(8, count);
        for (let i = 0; i < n; i++) {
          const a = Math.PI * 2 * i / n + this.spiralAngle;
          add(cx, this.h * 0.34, Math.cos(a) * speed, Math.sin(a) * speed, "orb");
        }
        this.spiralAngle += 0.13;
      } else if (pattern.type === "vortex") {
        const n = Math.max(8, count);
        const ox = cx + Math.sin(this.patternTimer / 500) * this.w * 0.16;
        const oy = this.h * 0.22;
        for (let i = 0; i < n; i++) {
          const a = this.spiralAngle + i * Math.PI * 2 / n;
          add(ox, oy, Math.cos(a) * speed, Math.sin(a) * speed, pattern.shape || "orb");
        }
        this.spiralAngle += 0.36 + this.phaseLevel * 0.1;
      } else if (pattern.type === "cutter") {
        const n = Math.max(5, count);
        const spread = pattern.spread || 0.32;
        for (let i = 0; i < n; i++) {
          const a = Math.PI / 2 + (i - (n - 1) / 2) * spread;
          add(cx, cy, Math.cos(a) * speed, Math.sin(a) * speed, pattern.shape || "sword");
        }
      } else if (pattern.type === "laser") {
        const n = Math.max(1, count);
        for (let i = 0; i < n; i++) {
          const x = this.w * (i + 1) / (n + 1);
          this.bullets.push({
            kind:"beam", x, y:0, width:pattern.width || 18,
            color:pattern.color, damage:pattern.damage * this.difficulty.enemyDamage * level.damage,
            age:0, warning:650, active:650, life:1050
          });
        }
      } else if (pattern.type === "sideFan") {
        const n = Math.max(6, count);
        for (let i = 0; i < n; i++) {
          const side = i % 2 === 0 ? -1 : 1;
          const x = side < 0 ? -8 : this.w + 8;
          const y = this.h * (0.12 + (i % 6) * 0.11);
          const inward = -side * speed * (0.65 + (i % 3) * 0.08);
          const down = speed * (0.48 + (i % 4) * 0.08);
          add(x, y, inward, down, pattern.shape || "feather");
        }
      } else if (pattern.type === "swoop") {
        const n = Math.max(3, count);
        const target = this.soulGetter();
        for (let i = 0; i < n; i++) {
          const side = i % 2 === 0 ? -1 : 1;
          const x = side < 0 ? -10 : this.w + 10;
          const y = this.h * (0.08 + (i % 3) * 0.12);
          const tx = target.x * this.w + (i - (n - 1) / 2) * 16;
          const ty = target.y * this.h;
          const dx = tx - x, dy = ty - y, len = Math.hypot(dx,dy) || 1;
          add(x, y, dx / len * speed, dy / len * speed, pattern.shape || "beak");
        }
      } else if (pattern.type === "stageShift") {
        this.stageEffect = {
          minX:Math.max(0.12, Math.min(0.34, pattern.minX || 0.2)),
          maxX:Math.min(0.88, Math.max(0.66, pattern.maxX || 0.8)),
          expiresAt:this.elapsed + (pattern.stageDuration || 3600), color:pattern.color || "#e9c84e"
        };
        this.onStageEffect(this.getSafeBounds());
      } else if (pattern.type === "status") {
        const duration = pattern.statusDuration || 2600;
        this.statusVisual = {color:pattern.color || "#c8b2ef", expiresAt:this.elapsed + duration};
        this.onStatusEffect(pattern.statusEffect || "slow", duration, pattern.statusScale || 0.65);
      } else if (pattern.type === "slash") {
        const n = Math.max(1, count);
        const length = Math.hypot(this.w, this.h) * 1.35;
        const base = pattern.angle == null ? 0.8 : pattern.angle;
        const step = pattern.angleStep || 0.16;
        for (let i = 0; i < n; i++) {
          const angle = base + (i - (n - 1) / 2) * step;
          const x1 = cx - Math.cos(angle) * length / 2;
          const y1 = cy - Math.sin(angle) * length / 2;
          const x2 = cx + Math.cos(angle) * length / 2;
          const y2 = cy + Math.sin(angle) * length / 2;
          this.bullets.push({kind:"slash",x1,y1,x2,y2,angle,width:pattern.width || 13,
            color:pattern.color,damage:pattern.damage * this.difficulty.enemyDamage * level.damage,
            warning:pattern.warning || 250,active:pattern.active || 170,life:(pattern.warning || 250)+(pattern.active || 170)+100,
            age:0,hit:false,effect:{type:"knockback",dx:-Math.sin(angle),dy:Math.cos(angle),power:pattern.knockbackPower || 0.13}});
        }
      } else if (pattern.type === "massBurst") {
        this.bullets.push({kind:"massCharge",x:cx,y:this.h*0.42,color:pattern.color || "#d9bafa",
          damage:pattern.damage * this.difficulty.enemyDamage * level.damage,age:0,
          warning:pattern.warning || 850,count:Math.max(36,count),speed,shape:pattern.shape || "diamond"});
      } else if (pattern.type === "drone") {
        const n = Math.max(2, count);
        const target = this.soulGetter();
        for (let i = 0; i < n; i++) {
          const x = this.w * (i + 1) / (n + 1);
          const tx = target.x * this.w + (i - (n - 1) / 2) * 20;
          const ty = target.y * this.h;
          const dx = tx - x, dy = ty - cy, len = Math.hypot(dx, dy) || 1;
          add(x, cy, dx / len * speed, dy / len * speed, "drone");
        }
      } else if (pattern.type === "delayedBurst") {
        const n = Math.max(1, count);
        const target = this.soulGetter();
        for (let i = 0; i < n; i++) {
          const offset = (i - (n - 1) / 2) * this.w * 0.17;
          const x = Math.max(this.w * 0.08, Math.min(this.w * 0.92, target.x * this.w + offset));
          const y = Math.max(this.h * 0.2, Math.min(this.h * 0.78, target.y * this.h));
          this.bullets.push({
            kind:"charge", x, y, color:pattern.color,
            damage:pattern.damage * this.difficulty.enemyDamage * level.damage,
            age:0, warning:620, burstCount:10 + this.phaseLevel * 2,
            burstSpeed:speed, radius:14
          });
        }
      } else if (pattern.type === "predictive") {
        const n = Math.max(2, count);
        const target = this.movementGetter();
        const lead = 0.48;
        const tx = Math.max(0.06, Math.min(0.94, target.x + target.vx * lead)) * this.w;
        const ty = Math.max(0.1, Math.min(0.9, target.y + target.vy * lead)) * this.h;
        const dx = tx - cx, dy = ty - cy, base = Math.atan2(dy, dx);
        const spread = pattern.spread || 0.12;
        for (let i = 0; i < n; i++) {
          const angle = base + (i - (n - 1) / 2) * spread;
          add(cx, cy, Math.cos(angle) * speed, Math.sin(angle) * speed, pattern.shape || "orb");
        }
      }
    }

    loop(now) {
      if (!this.running) return;
      const dt = Math.min((now - this.last) / 16.67, 2);
      this.last = now;
      this.elapsed += now - (this.prevNow || now);
      this.prevNow = now;
      this.patternTimer += 16.67 * dt;
      if (this.stageEffect && this.elapsed >= this.stageEffect.expiresAt) {
        this.stageEffect = null;
        this.onStageEffect(this.getSafeBounds());
      }
      if (this.statusVisual && this.elapsed >= this.statusVisual.expiresAt) this.statusVisual = null;

      if (this.patternTimer >= this.nextSpawn) {
        const selectedId = this.patternSelector
          ? this.patternSelector(this.patternIds, this.patternIndex, this.phaseLevel)
          : null;
        const patternId = selectedId || this.patternIds[this.patternIndex % this.patternIds.length];
        const pattern = BW_DATA.patterns[patternId];
        if (pattern) this.spawn(pattern);
        this.patternIndex++;
        const cadence = this.intensity.cadence;
        this.nextSpawn = (this.singleShot || pattern?.singleShot)
          ? Infinity
          : this.patternTimer + Math.max(240, (pattern?.interval || 650) / (this.difficulty.bulletCount * cadence));
      }

      if (this.finisher && !this.finisherStarted && this.elapsed >= this.duration - 1450) {
        this.finisherStarted = true;
        this.onFinisherStart();
      }
      if (this.finisher && this.finisherStarted && !this.finisherHit && this.elapsed >= this.duration - 160) {
        this.finisherHit = true;
        this.onFinisherHit();
      }

      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h);
      const s = this.soulGetter();
      if (this.stageEffect) {
        const left = this.stageEffect.minX * this.w;
        const right = this.stageEffect.maxX * this.w;
        ctx.save();
        ctx.fillStyle = this.stageEffect.color;
        ctx.globalAlpha = 0.16;
        ctx.fillRect(0, 0, left, this.h);
        ctx.fillRect(right, 0, this.w - right, this.h);
        ctx.globalAlpha = 0.82;
        ctx.fillRect(left - 2, 0, 3, this.h);
        ctx.fillRect(right - 1, 0, 3, this.h);
        ctx.restore();
      }
      if (this.statusVisual) {
        ctx.save();
        ctx.fillStyle = this.statusVisual.color;
        ctx.globalAlpha = 0.075;
        ctx.fillRect(0, 0, this.w, this.h);
        ctx.restore();
      }
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        if (b.kind === "massCharge") {
          b.age += 16.67 * dt;
          const progress = Math.min(1, b.age / b.warning);
          ctx.save();
          ctx.beginPath();
          ctx.arc(b.x, b.y, 10 + progress * Math.max(this.w, this.h) * 0.52, 0, Math.PI * 2);
          ctx.strokeStyle = b.color; ctx.lineWidth = 4; ctx.globalAlpha = 0.22 + progress * 0.7;
          ctx.shadowColor = b.color; ctx.shadowBlur = 18; ctx.stroke(); ctx.restore();
          if (b.age >= b.warning) {
            for (let k = 0; k < b.count; k++) {
              const angle = 0.06 + (Math.PI - 0.12) * k / Math.max(1, b.count - 1);
              const speed = b.speed * (0.78 + (k % 4) * 0.08);
              this.bullets.push({x:b.x,y:b.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
                shape:b.shape,color:b.color,r:4,damage:b.damage,effect:null});
            }
            this.bullets.splice(i,1);
          }
          continue;
        }
        if (b.kind === "slash") {
          b.age += 16.67 * dt;
          const active = b.age >= b.warning;
          ctx.save(); ctx.beginPath(); ctx.moveTo(b.x1,b.y1); ctx.lineTo(b.x2,b.y2);
          ctx.strokeStyle = b.color; ctx.lineCap = "round";
          ctx.globalAlpha = active ? 0.9 : 0.24;
          ctx.lineWidth = active ? b.width : 2;
          ctx.shadowColor = b.color; ctx.shadowBlur = active ? 22 : 7; ctx.stroke(); ctx.restore();
          if (active && !b.hit && pointToSegmentDistance(s.x*this.w,s.y*this.h,b.x1,b.y1,b.x2,b.y2) < b.width/2 + 5) {
            b.hit = true; this.onHit(b.damage,b.effect,b);
          }
          if (b.age >= b.life) this.bullets.splice(i,1);
          continue;
        }
        if (b.kind === "charge") {
          b.age += 16.67 * dt;
          const progress = Math.min(1, b.age / b.warning);
          ctx.save();
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius + progress * 20, 0, Math.PI * 2);
          ctx.strokeStyle = b.color;
          ctx.lineWidth = 3;
          ctx.globalAlpha = 0.25 + progress * 0.65;
          ctx.shadowColor = b.color;
          ctx.shadowBlur = 14;
          ctx.stroke();
          ctx.restore();
          if (b.age >= b.warning) {
            for (let k = 0; k < b.burstCount; k++) {
              const a = Math.PI * 2 * k / b.burstCount;
              this.bullets.push({
                x:b.x, y:b.y, vx:Math.cos(a) * b.burstSpeed, vy:Math.sin(a) * b.burstSpeed,
                shape:"diamond", color:b.color, r:4,
                damage:b.damage
              });
            }
            this.bullets.splice(i, 1);
          }
          continue;
        }
        if (b.kind === "beam") {
          b.age += 16.67 * dt;
          const active = b.age >= b.warning;
          ctx.save();
          ctx.fillStyle = b.color;
          ctx.globalAlpha = active ? 0.72 : 0.2;
          ctx.shadowColor = b.color;
          ctx.shadowBlur = active ? 18 : 5;
          ctx.fillRect(b.x - b.width / 2, 0, b.width, this.h);
          if (!active) {
            ctx.globalAlpha = 0.75;
            ctx.fillRect(b.x - 2, 0, 4, this.h);
          }
          ctx.restore();
          if (active) {
            const sx = s.x * this.w;
            if (Math.abs(sx - b.x) < b.width / 2 + 4) {
              if (!b.hit) {
                b.hit = true;
                this.onHit(b.damage,b.effect || null,b);
              }
            }
          }
          if (b.age >= b.life) this.bullets.splice(i, 1);
          continue;
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.atan2(b.vy, b.vx));
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 10;
        if (b.shape === "drone") {
          ctx.beginPath();
          ctx.moveTo(-7, 0); ctx.lineTo(0, -5); ctx.lineTo(7, 0); ctx.lineTo(0, 5); ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(-1, -1, 2, 2);
        } else if (b.shape === "ring") {
          ctx.beginPath();
          ctx.arc(0, 0, 7, 0, Math.PI * 2);
          ctx.strokeStyle = b.color;
          ctx.lineWidth = 3;
          ctx.stroke();
        } else if (b.shape === "diamond") {
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-4, -4, 8, 8);
        } else if (b.shape === "heart") {
          ctx.font = "14px sans-serif";
          ctx.fillText("♥", -7, 5);
        } else if (b.shape === "note") {
          ctx.font = "17px sans-serif";
          ctx.fillText("♪", -6, 6);
        } else if (b.shape === "sword") {
          ctx.font = "19px sans-serif";
          ctx.fillText("⚔", -9, 6);
        } else if (b.shape === "spear" || b.shape === "beak") {
          ctx.font = "19px sans-serif";
          ctx.fillText("➤", -8, 6);
        } else if (b.shape === "leaf" || b.shape === "feather") {
          ctx.beginPath();
          ctx.ellipse(0,0,b.shape === "leaf" ? 8 : 9, b.shape === "leaf" ? 4 : 2.8, 0, 0, Math.PI*2);
          ctx.fill();
          ctx.strokeStyle = "#fff4cf"; ctx.globalAlpha = 0.65; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(-6,0); ctx.lineTo(6,0); ctx.stroke();
        } else if (b.shape === "ribbon") {
          ctx.beginPath(); ctx.moveTo(-8,-3); ctx.quadraticCurveTo(0,8,8,-3); ctx.lineTo(5,4); ctx.quadraticCurveTo(0,10,-8,-3); ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, b.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        const sx = s.x * this.w;
        const sy = s.y * this.h;
        if (Math.hypot(b.x - sx, b.y - sy) < (b.r + 4)) {
          this.bullets.splice(i, 1);
          this.onHit(b.damage,b.effect || null,b);
          continue;
        }
        if (b.x < -30 || b.x > this.w + 30 || b.y < -30 || b.y > this.h + 30) {
          this.bullets.splice(i, 1);
        }
      }

      if (this.elapsed >= this.duration) {
        this.stop();
        return;
      }
      this.frame = requestAnimationFrame(t => this.loop(t));
    }
  }
  window.BulletEngine = BulletEngine;
})();
