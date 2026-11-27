/* Core battle engine. Pattern definitions live in data.js. */
(() => {
  const BULLET_DENSITY_SCALE = 0.8;

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
      this.playerBullets = [];
      this.counterActive = false;
      this.counterSpawnTimer = 0;
      this.counterElapsed = 0;
      this.counterAngle = 0;
      this.running = false;
      this.last = 0;
      this.elapsed = 0;
      this.patternTimer = 0;
      this.spiralAngle = 0;
      this.nextSpawn = 0;
      this.patternIndex = 0;
      this.difficulty = BW_DATA.difficulties.normal;
      this.phaseLevel = 0;
      this.bulletDensityScale = BULLET_DENSITY_SCALE;
      this.extraSpeedScale = 1;
      this.damageScale = 1;
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
      this.playerBullets = [];
      this.counterActive = options.counterAbility === true;
      this.counterSpawnTimer = 0;
      this.counterElapsed = 0;
      this.counterAngle = 0;
      this.patternIds = patternIds;
      this.difficulty = difficulty;
      this.duration = duration;
      this.soulGetter = soulGetter;
      this.phaseLevel = Math.max(0, Math.min(2, phaseLevel));
      this.bulletDensityScale = BULLET_DENSITY_SCALE * Math.max(0.1, options.densityScale ?? 1);
      this.extraSpeedScale = Math.max(0.5, options.speedScale ?? 1);
      this.damageScale = Math.max(0.1, options.damageScale ?? 1);
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
      this.playerBullets = [];
      this.counterActive = false;
      this.stageEffect = null;
      this.statusVisual = null;
      if (this.onStageEffect) this.onStageEffect(this.getSafeBounds());
      this.clear();
    }

    scaledMinimum(value) {
      return Math.max(1, Math.round(value * this.bulletDensityScale));
    }

    getSafeBounds() {
      if (this.stageEffect) return {minX:this.stageEffect.minX, maxX:this.stageEffect.maxX, minY:0.035, maxY:0.965};
      return {minX:0.025, maxX:0.975, minY:0.035, maxY:0.965};
    }

    clearBulletsNear(xRatio, yRatio, radiusPx) {
      const x = xRatio * this.w, y = yRatio * this.h;
      let removed = 0;
      this.bullets = this.bullets.filter(b => {
        let distance = Infinity;
        if (b.kind === "beam" || b.kind === "slash") {
          const x1 = b.x1 ?? b.x ?? 0, y1 = b.y1 ?? b.y ?? 0;
          const x2 = b.x2 ?? b.x ?? 0, y2 = b.y2 ?? b.y ?? 0;
          distance = pointToSegmentDistance(x, y, x1, y1, x2, y2);
        } else {
          distance = Math.hypot((b.x || 0) - x, (b.y || 0) - y);
        }
        const hit = distance <= radiusPx + (b.r || b.width || 0);
        if (hit) removed++;
        return !hit;
      });
      return removed;
    }

    getHitEffect(pattern, vx = 0, vy = 0) {
      if (pattern.effect === "knockback") {
        const length = Math.hypot(vx, vy) || 1;
        return {type:"knockback", dx:vx / length, dy:vy / length, power:pattern.knockbackPower || 0.12};
      }
      if (pattern.hitEffect === "slow") {
        return {type:"slow", duration:pattern.effectDuration || 1100, scale:pattern.effectScale || 0.78};
      }
      if (pattern.hitEffect === "freeze") {
        return {type:"freeze", duration:pattern.effectDuration || 200};
      }
      return null;
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
      const speed = pattern.speed * this.difficulty.bulletSpeed * level.speed * this.extraSpeedScale;
      // 通常はUPDATE 0.11の0.8倍密度。コンビ戦ではさらに密度と速度を抑える。
      const count = Math.max(1, Math.round((pattern.count || 3) * this.difficulty.bulletCount * level.count * this.bulletDensityScale));
      const add = (x, y, vx, vy, shape = pattern.shape || "orb") => {
        const effect = this.getHitEffect(pattern, vx, vy);
        const bullet = {
          x, y, vx, vy, shape, color: pattern.color,
          r: (shape === "heart" || shape === "spear" || shape === "sword") ? 7 : 4,
          damage: (pattern.damage * this.difficulty.enemyDamage * level.damage * this.damageScale + (this.difficulty.enemyDamageBonus || 0)),
          effect
        };
        this.bullets.push(bullet);
        return bullet;
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
        const n = Math.max(this.scaledMinimum(3), count);
        const spread = pattern.spread || 0.18;
        for (let i = 0; i < n; i++) {
          const a = Math.PI / 2 + (i - (n - 1) / 2) * spread;
          add(cx, cy, Math.cos(a) * speed, Math.sin(a) * speed);
        }
      } else if (pattern.type === "spiral") {
        const n = Math.max(this.scaledMinimum(2), count);
        for (let i = 0; i < n; i++) {
          const a = this.spiralAngle + i * Math.PI * 2 / n;
          add(cx, cy, Math.cos(a) * speed, Math.sin(a) * speed, "diamond");
        }
        this.spiralAngle += 0.42 + this.phaseLevel * 0.08;
      } else if (pattern.type === "wave") {
        const n = Math.max(this.scaledMinimum(3), count);
        for (let i = 0; i < n; i++) {
          const x = this.w * (i + 1) / (n + 1);
          const drift = Math.sin(this.patternTimer / 260 + i) * speed * 0.28;
          add(x, cy, drift, speed, pattern.shape || "note");
        }
      } else if (pattern.type === "lane") {
        const n = Math.max(this.scaledMinimum(2), count);
        for (let i = 0; i < n; i++) {
          const x = this.w * (i + 1) / (n + 1);
          add(x, -5, 0, speed, pattern.shape || "diamond");
        }
      } else if (pattern.type === "rain") {
        const n = Math.max(this.scaledMinimum(5), count);
        for (let i = 0; i < n; i++) {
          const x = this.w * (i + 0.5) / n;
          const drift = Math.sin(i * 1.7 + this.patternIndex) * speed * 0.28;
          add(x, -8 - (i % 3) * 12, drift, speed, pattern.shape || "heart");
        }
      } else if (pattern.type === "cross") {
        const n = Math.max(this.scaledMinimum(3), count);
        for (let i = 0; i < n; i++) {
          const y = cy + i * Math.max(5, this.h * 0.035);
          const dy = speed * (0.48 + (i % 2) * 0.18);
          add(-8, y, speed, dy, pattern.shape || "diamond");
          add(this.w + 8, y, -speed, dy, pattern.shape || "diamond");
        }
      } else if (pattern.type === "sweep") {
        const side = this.patternIndex % 2 === 0 ? 1 : -1;
        const startX = side === 1 ? -8 : this.w + 8;
        const n = Math.max(this.scaledMinimum(4), count);
        for (let i = 0; i < n; i++) {
          const t = (i - (n - 1) / 2) * 0.12;
          const vx = side * speed * Math.cos(t);
          const vy = speed * (0.42 + Math.abs(t) * 0.5);
          add(startX, cy + i * 3, vx, vy, "note");
        }
      } else if (pattern.type === "zigzag") {
        const n = Math.max(this.scaledMinimum(4), count);
        for (let i = 0; i < n; i++) {
          const x = this.w * (i + 1) / (n + 1);
          const dir = i % 2 === 0 ? 1 : -1;
          add(x, -8 - (i % 2) * 18, dir * speed * 0.48, speed, "diamond");
        }
      } else if (pattern.type === "ring") {
        const n = Math.max(this.scaledMinimum(6), count);
        const ringX = this.w / 2;
        const ringY = this.h * 0.25;
        for (let i = 0; i < n; i++) {
          const a = this.spiralAngle + Math.PI * 2 * i / n;
          add(ringX, ringY, Math.cos(a) * speed, Math.sin(a) * speed, pattern.shape || "heart");
        }
        this.spiralAngle += 0.22;
      } else if (pattern.type === "burst") {
        const n = Math.max(this.scaledMinimum(7), count);
        for (let i = 0; i < n; i++) {
          const a = Math.PI * 0.12 + (Math.PI * 0.76) * i / (n - 1);
          add(cx, this.h * 0.2, Math.cos(a) * speed, Math.sin(a) * speed, "heart");
        }
      } else if (pattern.type === "shockwave") {
        const n = Math.max(this.scaledMinimum(8), count);
        for (let i = 0; i < n; i++) {
          const a = Math.PI * 2 * i / n + this.spiralAngle;
          add(cx, this.h * 0.34, Math.cos(a) * speed, Math.sin(a) * speed, "orb");
        }
        this.spiralAngle += 0.13;
      } else if (pattern.type === "vortex") {
        const n = Math.max(this.scaledMinimum(8), count);
        const ox = cx + Math.sin(this.patternTimer / 500) * this.w * 0.16;
        const oy = this.h * 0.22;
        for (let i = 0; i < n; i++) {
          const a = this.spiralAngle + i * Math.PI * 2 / n;
          add(ox, oy, Math.cos(a) * speed, Math.sin(a) * speed, pattern.shape || "orb");
        }
        this.spiralAngle += 0.36 + this.phaseLevel * 0.1;
      } else if (pattern.type === "cutter") {
        const n = Math.max(this.scaledMinimum(5), count);
        const spread = pattern.spread || 0.32;
        for (let i = 0; i < n; i++) {
          const a = Math.PI / 2 + (i - (n - 1) / 2) * spread;
          add(cx, cy, Math.cos(a) * speed, Math.sin(a) * speed, pattern.shape || "sword");
        }
      } else if (pattern.type === "laser" || pattern.type === "laserSequence" || pattern.type === "movingLaser" || pattern.type === "rotatingLaser" || pattern.type === "zigzagLaser" || pattern.type === "laserBarrage") {
        const beamDamage = pattern.damage * this.difficulty.enemyDamage * level.damage * this.damageScale + (this.difficulty.enemyDamageBonus || 0);
        const beamLength = pattern.length || Math.hypot(this.w, this.h) * 1.45;
        const warning = pattern.warning || 560;
        const active = pattern.active || 260;
        const addBeam = (x, y, angle, delay = 0, extra = {}) => {
          this.bullets.push({
            kind:"beam", x, y, baseX:x, baseY:y, angle, length:extra.length || beamLength,
            width:extra.width || pattern.width || 10, color:pattern.color, damage:beamDamage,
            effect:this.getHitEffect(pattern), age:-delay, warning, active, life:warning + active + 120,
            rotateSpeed:extra.rotateSpeed || 0,
            moveAmplitude:extra.moveAmplitude || 0,
            movePeriod:extra.movePeriod || 900,
            movePhase:extra.movePhase || 0
          });
        };
        if (pattern.type === "laser") {
          const n = Math.max(1, count);
          for (let i = 0; i < n; i++) {
            const x = this.w * (i + 1) / (n + 1);
            addBeam(x, this.h / 2, pattern.angle == null ? Math.PI / 2 : pattern.angle, i * (pattern.delay || 0));
          }
        } else if (pattern.type === "laserSequence") {
          const n = Math.max(2, count);
          const target = this.soulGetter();
          const centerX = target.x * this.w;
          for (let i = 0; i < n; i++) {
            const offset = (i - (n - 1) / 2) * this.w * (pattern.spacing || 0.12);
            const x = Math.max(this.w * 0.04, Math.min(this.w * 0.96, centerX + offset));
            const angle = Math.PI / 2 + (i - (n - 1) / 2) * (pattern.angleStep || 0.055);
            addBeam(x, this.h / 2, angle, i * (pattern.delay || 110));
          }
        } else if (pattern.type === "movingLaser") {
          const n = Math.max(2, count);
          for (let i = 0; i < n; i++) {
            const x = this.w * (i + 1) / (n + 1);
            addBeam(x, this.h / 2, Math.PI / 2 + (i - (n - 1) / 2) * (pattern.angleStep || 0.02), 0, {
              width:pattern.width || 6,
              moveAmplitude:(pattern.moveAmplitude || 0.1) * this.w,
              movePeriod:pattern.movePeriod || 900,
              movePhase:i * 0.9
            });
          }
        } else if (pattern.type === "rotatingLaser") {
          const n = Math.max(1, count);
          for (let i = 0; i < n; i++) {
            const x = this.w * (i + 1) / (n + 1);
            addBeam(x, this.h * (0.42 + i * 0.08), Math.PI / 2 + i * (pattern.angleStep || 1.0), 0, {
              rotateSpeed:(i % 2 ? -1 : 1) * (pattern.rotateSpeed || 0.01),
              length:Math.hypot(this.w, this.h) * 1.18
            });
          }
        } else if (pattern.type === "zigzagLaser") {
          const segments = Math.max(3, count - 1);
          const amplitude = (pattern.amplitude || 0.2) * this.w;
          const points = [];
          for (let i = 0; i <= segments; i++) {
            const x = this.w / 2 + (i % 2 === 0 ? -amplitude : amplitude);
            const y = this.h * (0.02 + 0.96 * i / segments);
            points.push({x,y});
          }
          for (let i = 0; i < segments; i++) {
            const a = points[i], b = points[i + 1];
            const dx = b.x - a.x, dy = b.y - a.y;
            addBeam((a.x + b.x) / 2, (a.y + b.y) / 2, Math.atan2(dy, dx), i * (pattern.delay || 95), {
              length:Math.hypot(dx, dy) + 18, width:pattern.width || 8
            });
          }
        } else if (pattern.type === "laserBarrage") {
          const n = Math.max(2, count);
          const target = this.soulGetter();
          for (let i = 0; i < n; i++) {
            const offset = (Math.random() - 0.5) * this.w * 0.6;
            const x = Math.max(this.w * 0.04, Math.min(this.w * 0.96, target.x * this.w + offset));
            const angle = Math.PI / 2 + (Math.random() - 0.5) * (pattern.angleSpread || 0.12);
            addBeam(x, this.h / 2, angle, i * 44, {width:pattern.width || 7});
          }
        }
      } else if (pattern.type === "sideFan") {
        const n = Math.max(this.scaledMinimum(6), count);
        for (let i = 0; i < n; i++) {
          const side = i % 2 === 0 ? -1 : 1;
          const x = side < 0 ? -8 : this.w + 8;
          const y = this.h * (0.12 + (i % 6) * 0.11);
          const inward = -side * speed * (0.65 + (i % 3) * 0.08);
          const down = speed * (0.48 + (i % 4) * 0.08);
          add(x, y, inward, down, pattern.shape || "feather");
        }
      } else if (pattern.type === "swoop") {
        const n = Math.max(this.scaledMinimum(3), count);
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
      } else if (pattern.type === "hunterFan") {
        const target = this.movementGetter();
        const lead = pattern.lead || 0.28;
        const tx = Math.max(0.06, Math.min(0.94, target.x + target.vx * lead)) * this.w;
        const ty = Math.max(0.1, Math.min(0.9, target.y + target.vy * lead)) * this.h;
        const ox = this.w * (0.16 + Math.random() * 0.68);
        const oy = this.h * (0.08 + Math.random() * 0.16);
        const base = Math.atan2(ty - oy, tx - ox) + (Math.random() - 0.5) * (pattern.jitter || 0.08);
        const n = Math.max(this.scaledMinimum(3), count);
        const spread = pattern.spread || 0.12;
        for (let i = 0; i < n; i++) {
          const angle = base + (i - (n - 1) / 2) * spread;
          add(ox + (Math.random() - 0.5) * 10, oy, Math.cos(angle) * speed, Math.sin(angle) * speed);
        }
      } else if (pattern.type === "randomEdges") {
        const target = this.movementGetter();
        const lead = pattern.lead || 0.25;
        const tx = Math.max(0.06, Math.min(0.94, target.x + target.vx * lead)) * this.w;
        const ty = Math.max(0.1, Math.min(0.9, target.y + target.vy * lead)) * this.h;
        const n = Math.max(this.scaledMinimum(4), count);
        for (let i = 0; i < n; i++) {
          const edge = Math.floor(Math.random() * 4);
          let x, y;
          if (edge === 0) { x = Math.random() * this.w; y = -8; }
          else if (edge === 1) { x = -8; y = this.h * (0.08 + Math.random() * 0.72); }
          else if (edge === 2) { x = this.w + 8; y = this.h * (0.08 + Math.random() * 0.72); }
          else { x = this.w * Math.random(); y = this.h + 8; }
          const jitter = pattern.jitter || 0.12;
          const aimX = tx + (Math.random() - 0.5) * this.w * jitter;
          const aimY = ty + (Math.random() - 0.5) * this.h * jitter;
          const dx = aimX - x, dy = aimY - y, len = Math.hypot(dx, dy) || 1;
          add(x, y, dx / len * speed, dy / len * speed);
        }
      } else if (pattern.type === "playerBurst") {
        const target = this.movementGetter();
        const lead = pattern.lead || 0.3;
        const tx = Math.max(0.08, Math.min(0.92, target.x + target.vx * lead)) * this.w;
        const ty = Math.max(0.14, Math.min(0.88, target.y + target.vy * lead)) * this.h;
        const zones = Math.max(1, Math.min(this.scaledMinimum(4), count));
        for (let i = 0; i < zones; i++) {
          const offset = (i - (zones - 1) / 2) * this.w * (pattern.zoneGap || 0.13);
          const x = Math.max(this.w * 0.08, Math.min(this.w * 0.92, tx + offset + (Math.random() - 0.5) * this.w * 0.035));
          const y = Math.max(this.h * 0.14, Math.min(this.h * 0.88, ty + (Math.random() - 0.5) * this.h * 0.06));
          this.bullets.push({kind:"massCharge",x,y,color:pattern.color || "#ffffff",
            damage:(pattern.damage * this.difficulty.enemyDamage * level.damage * this.damageScale + (this.difficulty.enemyDamageBonus || 0)),age:0,
            warning:pattern.warning || 850,
            count:Math.max(1, Math.round((pattern.burstCount || (12 + this.phaseLevel * 2)) * this.bulletDensityScale)),
            speed:speed,shape:pattern.shape || "diamond",
            effect:this.getHitEffect(pattern, 0, 1)});
        }
      } else if (pattern.type === "slashHunt") {
        const target = this.movementGetter();
        const lead = pattern.lead || 0.16;
        const tx = Math.max(0.08, Math.min(0.92, target.x + target.vx * lead)) * this.w;
        const ty = Math.max(0.12, Math.min(0.9, target.y + target.vy * lead)) * this.h;
        const n = Math.max(1, count);
        const base = Math.atan2(ty - cy, tx - cx);
        const spread = pattern.angleSpread || 0.22;
        const length = Math.hypot(this.w, this.h) * (pattern.lengthScale || 0.78);
        for (let i = 0; i < n; i++) {
          const angle = base + (i - (n - 1) / 2) * spread + (Math.random() - 0.5) * 0.12;
          const shift = (i - (n - 1) / 2) * this.w * 0.035;
          const px = Math.max(this.w * 0.08, Math.min(this.w * 0.92, tx + shift));
          const py = Math.max(this.h * 0.12, Math.min(this.h * 0.9, ty + (Math.random() - 0.5) * this.h * 0.04));
          const x1 = px - Math.cos(angle) * length / 2, y1 = py - Math.sin(angle) * length / 2;
          const x2 = px + Math.cos(angle) * length / 2, y2 = py + Math.sin(angle) * length / 2;
          this.bullets.push({kind:"slash",x1,y1,x2,y2,angle,width:pattern.width || 13,
            color:pattern.color,damage:(pattern.damage * this.difficulty.enemyDamage * level.damage * this.damageScale + (this.difficulty.enemyDamageBonus || 0)),
            warning:pattern.warning || 460,active:pattern.active || 180,
            life:(pattern.warning || 460)+(pattern.active || 180)+100,age:0,hit:false,
            effect:this.getHitEffect(pattern, -Math.sin(angle), Math.cos(angle))});
        }
      } else if (pattern.type === "splitFan") {
        const target = this.movementGetter();
        const lead = pattern.lead || 0.25;
        const tx = Math.max(0.06, Math.min(0.94, target.x + target.vx * lead)) * this.w;
        const ty = Math.max(0.1, Math.min(0.9, target.y + target.vy * lead)) * this.h;
        const ox = this.w * (0.14 + Math.random() * 0.72), oy = this.h * 0.12;
        const base = Math.atan2(ty - oy, tx - ox);
        const n = Math.max(this.scaledMinimum(3), count), spread = pattern.spread || 0.12;
        for (let i = 0; i < n; i++) {
          const angle = base + (i - (n - 1) / 2) * spread;
          const bullet = add(ox, oy, Math.cos(angle) * speed, Math.sin(angle) * speed);
          bullet.splitAfter = pattern.splitAfter || 110;
          bullet.splitAngle = pattern.splitAngle || 0.25;
          bullet.splitCount = this.scaledMinimum(pattern.splitCount || 2);
        }
      } else if (pattern.type === "stageShift") {
        this.stageEffect = {
          minX:Math.max(0.12, Math.min(0.34, pattern.minX || 0.2)),
          maxX:Math.min(0.88, Math.max(0.66, pattern.maxX || 0.8)),
          expiresAt:this.elapsed + (pattern.stageDuration || 3600), color:pattern.color || "#e9c84e"
        };
        this.onStageEffect(this.getSafeBounds());
      } else if (pattern.type === "status" || pattern.type === "statusAim") {
        const duration = pattern.statusDuration || 2600;
        this.statusVisual = {color:pattern.color || "#c8b2ef", expiresAt:this.elapsed + duration};
        this.onStatusEffect(pattern.statusEffect || "slow", duration, pattern.statusScale || 0.65);
        if (pattern.type === "statusAim") {
          const target = this.soulGetter();
          const n = Math.max(this.scaledMinimum(2), count);
          for (let i = 0; i < n; i++) {
            const ox = cx + (i - (n - 1) / 2) * 24;
            const tx = target.x * this.w + (i - (n - 1) / 2) * 16;
            const ty = target.y * this.h;
            const dx = tx - ox, dy = ty - cy, len = Math.hypot(dx, dy) || 1;
            add(ox, cy, dx / len * speed, dy / len * speed, pattern.shape || "heart");
          }
        }
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
            color:pattern.color,damage:(pattern.damage * this.difficulty.enemyDamage * level.damage * this.damageScale + (this.difficulty.enemyDamageBonus || 0)),
            warning:pattern.warning || 250,active:pattern.active || 170,life:(pattern.warning || 250)+(pattern.active || 170)+100,
            age:0,hit:false,effect:{type:"knockback",dx:-Math.sin(angle),dy:Math.cos(angle),power:pattern.knockbackPower || 0.13}});
        }
      } else if (pattern.type === "massBurst") {
        const aftershock = pattern.aftershock ? {
          count:Math.max(1, Math.round(pattern.aftershock.count * this.difficulty.bulletCount * level.count * this.bulletDensityScale)),
          warning:pattern.aftershock.delay || 900,
          speed:speed * (pattern.aftershock.speedScale || 0.78),
          damage:(pattern.damage * this.difficulty.enemyDamage * level.damage * this.damageScale + (this.difficulty.enemyDamageBonus || 0)),
          color:pattern.aftershock.color || pattern.color || "#d9bafa",
          angleOffset:pattern.aftershock.angleOffset == null ? 0.08 : pattern.aftershock.angleOffset
        } : null;
        this.bullets.push({kind:"massCharge",x:cx,y:this.h*0.42,color:pattern.color || "#d9bafa",
          damage:(pattern.damage * this.difficulty.enemyDamage * level.damage * this.damageScale + (this.difficulty.enemyDamageBonus || 0)),age:0,
          warning:pattern.warning || 850,count:Math.max(this.scaledMinimum(36),count),speed,shape:pattern.shape || "diamond",
          aftershock,aftershockDone:false,angleOffset:0,dome:pattern.dome === true,
          effect:this.getHitEffect(pattern)});
      } else if (pattern.type === "drone") {
        const n = Math.max(this.scaledMinimum(2), count);
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
            damage:(pattern.damage * this.difficulty.enemyDamage * level.damage * this.damageScale + (this.difficulty.enemyDamageBonus || 0)),
            age:0, warning:620, burstCount:this.scaledMinimum(10 + this.phaseLevel * 2),
            burstSpeed:speed, radius:14
          });
        }
      } else if (pattern.type === "predictive") {
        const n = Math.max(this.scaledMinimum(2), count);
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
      if (this.counterActive) {
        this.counterElapsed += 16.67 * dt;
        this.counterSpawnTimer += 16.67 * dt;
        if (this.counterElapsed >= 15000) this.counterActive = false;
        else if (this.counterSpawnTimer >= 95) {
          this.counterSpawnTimer = 0;
          const px = s.x * this.w, py = s.y * this.h;
          // 4本の花弁弾が鈴音の位置から外へ伸び、左右交互の旋回で螺旋を描く。
          for (let k = 0; k < 4; k++) {
            const angle = this.counterAngle + k * Math.PI / 2;
            this.playerBullets.push({
              x:px, y:py, originX:px, originY:py, radius:0,
              angle, turnRate:k % 2 === 0 ? 0.078 : -0.078,
              radialSpeed:4.6, age:0, r:7, color:k % 2 === 0 ? "#b9f4a8" : "#e5ffb9"
            });
          }
          this.counterAngle += 0.17;
        }
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
          ctx.shadowColor = b.color; ctx.shadowBlur = 18; ctx.stroke();
          if (b.dome) {
            const domeW = this.w * (0.18 + progress * 0.22);
            const domeH = this.h * (0.12 + progress * 0.22);
            ctx.beginPath();
            ctx.ellipse(this.w * 0.5, this.h * 0.54, domeW, domeH, 0, Math.PI, Math.PI * 2);
            ctx.strokeStyle = "#e8fbff"; ctx.lineWidth = 3; ctx.globalAlpha = 0.18 + progress * 0.68;
            ctx.shadowColor = "#b8efff"; ctx.shadowBlur = 22; ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(this.w * 0.5, this.h * 0.54 - domeH);
            ctx.lineTo(this.w * 0.5, this.h * 0.54 + domeH * 0.7);
            ctx.stroke();
          }
          ctx.restore();
          if (b.age >= b.warning) {
            for (let k = 0; k < b.count; k++) {
              const speed = b.speed * (0.78 + (k % 4) * 0.08);
              const angle = Math.PI * 2 * k / b.count + (b.angleOffset || 0);
              this.bullets.push({x:b.x,y:b.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
                shape:b.shape,color:b.color,r:4,damage:b.damage,effect:b.effect || null});
            }
            if (b.aftershock && !b.aftershockDone) {
              // 第一波のあとに遅れて第二波を放つ。発射源の予告リングも再表示する。
              b.aftershockDone = true;
              b.age = 0;
              b.warning = b.aftershock.warning;
              b.count = b.aftershock.count;
              b.speed = b.aftershock.speed;
              b.damage = b.aftershock.damage;
              b.color = b.aftershock.color;
              b.angleOffset = b.aftershock.angleOffset;
              b.aftershock = null;
            } else {
              this.bullets.splice(i,1);
            }
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
          if (active && !b.hit && pointToSegmentDistance(s.x*this.w,s.y*this.h,b.x1,b.y1,b.x2,b.y2) < b.width/2 + 2.5) {
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
                damage:b.damage, effect:b.effect || null
              });
            }
            this.bullets.splice(i, 1);
          }
          continue;
        }
        if (b.kind === "beam") {
          b.age += 16.67 * dt;
          if (b.age < 0) continue;
          if (b.rotateSpeed) b.angle += b.rotateSpeed * dt;
          b.x = b.baseX + (b.moveAmplitude ? Math.sin((this.elapsed + b.movePhase * 100) / (b.movePeriod || 900)) * b.moveAmplitude : 0);
          const half = (b.length || this.h * 1.4) / 2;
          const ux = Math.cos(b.angle), uy = Math.sin(b.angle);
          b.x1 = b.x - ux * half; b.y1 = b.y - uy * half;
          b.x2 = b.x + ux * half; b.y2 = b.y + uy * half;
          const active = b.age >= b.warning && b.age <= b.warning + b.active;
          ctx.save();
          ctx.beginPath(); ctx.moveTo(b.x1,b.y1); ctx.lineTo(b.x2,b.y2);
          ctx.strokeStyle = b.color; ctx.lineCap = "round";
          ctx.globalAlpha = active ? 0.82 : 0.24;
          ctx.lineWidth = active ? b.width : 2;
          ctx.shadowColor = b.color; ctx.shadowBlur = active ? 20 : 6; ctx.stroke();
          ctx.restore();
          if (active && !b.hit) {
            const sx = s.x * this.w, sy = s.y * this.h;
            if (pointToSegmentDistance(sx,sy,b.x1,b.y1,b.x2,b.y2) < b.width / 2 + 2.5) {
              b.hit = true;
              this.onHit(b.damage,b.effect || null,b);
            }
          }
          if (b.age >= b.life) this.bullets.splice(i, 1);
          continue;
        }
        if (b.splitAfter && !b.splitDone) {
          b.travelled = (b.travelled || 0) + Math.hypot(b.vx, b.vy) * dt;
          if (b.travelled >= b.splitAfter) {
            b.splitDone = true;
            const baseAngle = Math.atan2(b.vy, b.vx);
            const branches = Math.max(2, b.splitCount || 2);
            for (let k = 0; k < branches; k++) {
              const branchAngle = baseAngle + (k - (branches - 1) / 2) * (b.splitAngle || 0.25);
              this.bullets.push({x:b.x,y:b.y,vx:Math.cos(branchAngle) * Math.hypot(b.vx,b.vy) * 1.04,
                vy:Math.sin(branchAngle) * Math.hypot(b.vx,b.vy) * 1.04,shape:b.shape,color:b.color,r:b.r,
                damage:b.damage * 0.72,effect:b.effect || null});
            }
            this.bullets.splice(i, 1);
            continue;
          }
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
        } else if (b.shape === "bug") {
          ctx.beginPath(); ctx.ellipse(0,0,4,6,0,0,Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(-5,-2,4,3,-0.5,0,Math.PI*2); ctx.ellipse(5,-2,4,3,0.5,0,Math.PI*2); ctx.fill();
          ctx.strokeStyle="#e5e2d5"; ctx.lineWidth=1;
          ctx.beginPath(); ctx.moveTo(-2,3); ctx.lineTo(-5,7); ctx.moveTo(2,3); ctx.lineTo(5,7); ctx.stroke();
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
        if (Math.hypot(b.x - sx, b.y - sy) < (b.r + 2)) {
          this.bullets.splice(i, 1);
          this.onHit(b.damage,b.effect || null,b);
          continue;
        }
        if (b.x < -30 || b.x > this.w + 30 || b.y < -30 || b.y > this.h + 30) {
          this.bullets.splice(i, 1);
        }
      }

      for (let i = this.playerBullets.length - 1; i >= 0; i--) {
        const pb = this.playerBullets[i];
        if (pb.radialSpeed) {
          pb.radius += pb.radialSpeed * dt;
          pb.angle += pb.turnRate * dt;
          pb.x = pb.originX + Math.cos(pb.angle) * pb.radius;
          pb.y = pb.originY + Math.sin(pb.angle) * pb.radius;
        } else {
          pb.x += pb.vx * dt;
          pb.y += pb.vy * dt;
        }
        pb.age += 16.67 * dt;
        ctx.save();
        ctx.translate(pb.x,pb.y);
        ctx.rotate((pb.angle || 0) + Math.PI / 2);
        ctx.fillStyle = pb.color || "#b9f4a8";
        ctx.shadowColor = "#c7ffad";
        ctx.shadowBlur = 17;
        ctx.beginPath(); ctx.ellipse(0,0,5,10,0,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle="#f0ffe7"; ctx.lineWidth=1.2;
        ctx.beginPath(); ctx.moveTo(0,-8); ctx.lineTo(0,8); ctx.stroke();
        ctx.restore();
        for (let j = this.bullets.length - 1; j >= 0; j--) {
          const eb = this.bullets[j];
          let cancelled = false;
          if (eb.kind === "slash") {
            cancelled = pointToSegmentDistance(pb.x,pb.y,eb.x1,eb.y1,eb.x2,eb.y2) < (eb.width || 10) / 2 + (pb.r || 6);
          } else if (eb.kind === "beam") {
            cancelled = pointToSegmentDistance(pb.x,pb.y,eb.x1,eb.y1,eb.x2,eb.y2) < (eb.width || 12) / 2 + (pb.r || 6);
          } else if (eb.kind) {
            // Charge系は予告・発生源のため、弾幕相殺の対象外。
            continue;
          } else {
            cancelled = Math.hypot(pb.x-eb.x,pb.y-eb.y) < (eb.r || 4) + (pb.r || 6);
          }
          if (cancelled) this.bullets.splice(j,1);
        }
        if (pb.x < -24 || pb.x > this.w + 24 || pb.y < -24 || pb.y > this.h + 24 || pb.age > 2200) this.playerBullets.splice(i,1);
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
