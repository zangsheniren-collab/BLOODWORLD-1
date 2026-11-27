/* Core battle engine. Pattern definitions live in data.js. */
(() => {
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
      this.clear();
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
          damage: pattern.damage * this.difficulty.enemyDamage * level.damage
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
          add(cx, cy, dx / len * speed, dy / len * speed, "heart");
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
      }
    }

    loop(now) {
      if (!this.running) return;
      const dt = Math.min((now - this.last) / 16.67, 2);
      this.last = now;
      this.elapsed += now - (this.prevNow || now);
      this.prevNow = now;
      this.patternTimer += 16.67 * dt;

      if (this.patternTimer >= this.nextSpawn) {
        const patternId = this.patternIds[this.patternIndex % this.patternIds.length];
        const pattern = BW_DATA.patterns[patternId];
        if (pattern) this.spawn(pattern);
        this.patternIndex++;
        const cadence = this.intensity.cadence;
        this.nextSpawn = this.patternTimer + Math.max(240, (pattern?.interval || 650) / (this.difficulty.bulletCount * cadence));
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
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
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
            if (Math.abs(sx - b.x) < b.width / 2 + 7) {
              if (!b.hit) {
                b.hit = true;
                this.onHit(b.damage);
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
        if (b.shape === "ring") {
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
        } else if (b.shape === "spear") {
          ctx.font = "19px sans-serif";
          ctx.fillText("➤", -8, 6);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, b.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        const sx = s.x * this.w;
        const sy = s.y * this.h;
        if (Math.hypot(b.x - sx, b.y - sy) < (b.r + 7)) {
          this.bullets.splice(i, 1);
          this.onHit(b.damage);
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
