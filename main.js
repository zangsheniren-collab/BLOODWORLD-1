(() => {
  const $ = id => document.getElementById(id);
  const screens = { title: $("titleScreen"), battle: $("battleScreen"), result: $("resultScreen") };
  let player, enemy, difficulty, engine;
  let phase = "menu", touchMode = "drag", soulLocked = false;
  let soul = { x: 0.5, y: 0.76 }, hitCooldown = 0, boosted = false;
  let movementSamples = [];
  let turnTimer = null, soundOn = false;
  const canvas = $("bulletCanvas"), arena = $("dodgeArena"), soulEl = $("soul");
  const commandButtons = [...document.querySelectorAll("[data-command]")];

  function show(name) {
    Object.values(screens).forEach(s => s.classList.remove("active"));
    screens[name].classList.add("active");
  }
  function setText(id, t) { $(id).textContent = t; }
  function setCommandsEnabled(enabled) {
    commandButtons.forEach(button => { button.disabled = !enabled; });
    $("commandPanel").classList.toggle("is-locked", !enabled);
  }
  function hpUI() {
    setText("playerHpText", `${Math.max(0, player.hp)} / ${player.maxHp}`);
    $("playerHpBar").style.width = `${Math.max(0, player.hp) / player.maxHp * 100}%`;
    $("playerHpBar").style.background = player.id === "hanna_milly" ? "linear-gradient(90deg,#c9c0e8,#f5efff)" : "";
    setText("enemyHpText", `${Math.max(0, enemy.hp)} / ${enemy.maxHp}`);
    $("enemyHpBar").style.width = `${Math.max(0, enemy.hp) / enemy.maxHp * 100}%`;
  }
  function note(t) { setText("statusNote", t); }
  function dialogue(t) { setText("dialogue", t); }
  function positionSoul(x, y) {
    const oldX = soul.x, oldY = soul.y;
    soul.x = Math.max(0.025, Math.min(0.975, x));
    soul.y = Math.max(0.035, Math.min(0.965, y));
    if (Math.hypot(soul.x - oldX, soul.y - oldY) > 0.002) {
      const now = performance.now();
      movementSamples.push({x:soul.x, y:soul.y, t:now});
      movementSamples = movementSamples.filter(p => now - p.t < 6500).slice(-32);
    }
    soulEl.style.left = `${soul.x * 100}%`;
    soulEl.style.top = `${soul.y * 100}%`;
  }

  function movementProfile() {
    const now = performance.now();
    movementSamples = movementSamples.filter(p => now - p.t < 5000);
    if (movementSamples.length < 2) return {x:soul.x, y:soul.y, vx:0, vy:0, zone:soul.x < .34 ? "left" : soul.x > .66 ? "right" : "center"};
    const first = movementSamples[0], last = movementSamples[movementSamples.length - 1];
    const seconds = Math.max(.12, (last.t - first.t) / 1000);
    const vx = Math.max(-1.8, Math.min(1.8, (last.x - first.x) / seconds));
    const vy = Math.max(-1.8, Math.min(1.8, (last.y - first.y) / seconds));
    const zone = soul.x < .34 ? "left" : soul.x > .66 ? "right" : "center";
    return {x:soul.x, y:soul.y, vx, vy, zone};
  }

  function selectSuzunePattern(pool, index, level) {
    const m = movementProfile();
    if (level >= 2) {
      // The final phase leads the player's recent movement, not merely the current position.
      return Math.abs(m.vx) + Math.abs(m.vy) > .12 && index % 3 !== 2
        ? "suzune_predictive" : "suzune_predictive_fan";
    }
    if (level === 1) {
      if (m.zone === "left") return index % 2 ? "suzune_root_lanes" : "suzune_petals_cross";
      if (m.zone === "right") return index % 2 ? "suzune_petals_cross" : "suzune_root_lanes";
      return index % 2 ? "suzune_pollen_ring" : "suzune_seed_aim";
    }
    if (m.zone === "left") return "suzune_leaf_fan";
    if (m.zone === "right") return "suzune_vine_wave";
    return "suzune_seed_aim";
  }
  function enemyPhaseLevel() {
    const ratio = enemy.hp / enemy.maxHp;
    if (ratio <= 1 / 3) return 2;
    if (ratio <= 2 / 3) return 1;
    return 0;
  }
  function enemyPatternPool(level) {
    const patterns = [...(enemy.patterns || [])];
    if (level >= 1) patterns.push(...(enemy.patternsMid || []));
    if (level >= 2) patterns.push(...(enemy.patternsFinal || []));
    return patterns;
  }
  function phaseDescription(level) {
    if (level === 2) return "最終段階 // 弾幕が大きく変化した！";
    if (level === 1) return "第二段階 // 攻撃が激しくなった！";
    return "通常段階";
  }

  function resetBattle() {
    if (engine) engine.stop();
    clearTimeout(turnTimer);
    player = structuredClone(BW_DATA.characters[$("playerSelect").value]);
    enemy = structuredClone(BW_DATA.characters[$("enemySelect").value] || BW_DATA.characters.photo_candray);
    difficulty = BW_DATA.difficulties[$("difficultySelect").value];
    phase = "menu";
    hitCooldown = 0;
    boosted = false;
    movementSamples = [];
    enemy.revived = false;
    soulLocked = false;
    soulEl.classList.remove("soul-locked");
    setText("playerName", player.name);
    setText("playerRank", `#${player.rank}`);
    setText("enemyName", enemy.name);
    $("enemyRank").textContent = `#${enemy.rank} // ${enemy.title}`;
    $("enemyPortrait").style.setProperty("--enemy-color", enemy.color || "#9bc8ff");
    const portraits = {
      photo_candray:{name:"PHOTO CANDRAY",mark:"?",caption:"IMAGE SLOT / COMING SOON"},
      nohr_solphonsh:{name:"NOHR SOLPHONSH",mark:"剣",caption:"ONE WHO TRANSCENDS DEATH"},
      nitro:{name:"NITRO",mark:"N",caption:"THE ADAPTER"},
      hanamori_suzune_enemy:{name:"HANAMORI SUZUNE",mark:"花",caption:"THE PLANT GOVERNOR"},
      merli_arl:{name:"MERLI ARL",mark:"水",caption:"A SINGLE THREAD OF GUILT"}
    };
    const portrait = portraits[enemy.id] || portraits.photo_candray;
    $("portraitName").textContent = portrait.name;
    $("portraitMark").textContent = portrait.mark;
    $("portraitCaption").textContent = portrait.caption;
    positionSoul(0.5, 0.76);
    hpUI();
    note(player.id === "hanna_milly" ? "ミリーは魔女帽子をぎゅっと押さえた。回復薬は持っていない。" : "鈴音は鈴蛇薔薇を構えた。");
    commandButtons.find(b => b.dataset.command === "act").querySelector("small").textContent =
      player.id === "hanna_milly" ? "香りを隠す" : "相手を観察";
    commandButtons.find(b => b.dataset.command === "item").querySelector("small").textContent =
      player.items.length ? "薬品を使う" : "所持品なし";
    dialogue(enemy.intro);
    $("commandPanel").style.display = "grid";
    $("joystick").style.display = "none";
    $("arenaHint").textContent = "指でなぞる / スティック切替";
    setCommandsEnabled(true);
  }

  function start() {
    resetBattle();
    show("battle");
    if (!engine) {
      engine = new BulletEngine(canvas, arena, damage => {
        if (phase !== "dodge" || hitCooldown > 0) return;
        const reduced = player.id === "hanna_milly" && player.guardNext ? damage * player.actReduction : damage;
        player.guardNext = false;
        player.hp = Math.max(0, player.hp - Math.max(1, Math.round(reduced)));
        hitCooldown = 450;
        setTimeout(() => { hitCooldown = 0; }, 450);
        hpUI();
        note("弾幕に触れた！");
        if (player.hp <= 0) finish(false);
      });
    }
  }

  function enemyTurn() {
    if (player.hp <= 0 || enemy.hp <= 0 || phase === "result") return;
    clearTimeout(turnTimer);
    phase = "dodge";
    setCommandsEnabled(false);
    $("commandPanel").style.display = "none";
    $("joystick").style.display = touchMode === "stick" ? "block" : "none";

    const level = enemyPhaseLevel();
    const duration = (enemy.turnMs || difficulty.turnMs) + level * (enemy.phaseBonusMs || difficulty.phaseBonusMs) + (enemy.id === "nohr_solphonsh" ? 1200 : 0);
    const patterns = enemyPatternPool(level);
    dialogue(level === 2 && enemy.id === "nohr_solphonsh" ? enemy.quote :
      level === 2 && enemy.id === "merli_arl" ? "「ここから先は、深海ノアの領域よ。」" : enemy.intro);
    note(`${phaseDescription(level)} / ${Math.ceil(duration / 1000)}秒間回避！`);
    engine.start(patterns, difficulty, duration, () => soul, level, {
      finisher: enemy.specialFinisher,
      onFinisherStart: () => {
        soulLocked = true;
        soulEl.classList.add("soul-locked");
        dialogue("「抗ってみせろ。これが最後の試練だ。」");
        note("特殊能力発動 // 魂が拘束された！");
      },
      onFinisherHit: () => {
        player.hp = Math.max(0, player.hp - Math.max(1, Math.round(8 * difficulty.enemyDamage)));
        hpUI();
        note("死を越えた一閃 // 回避不能の固定ダメージ！");
        if (player.hp <= 0) finish(false);
      },
      movementGetter: movementProfile,
      patternSelector: enemy.adaptivePatterns ? selectSuzunePattern : null
    });

    turnTimer = setTimeout(() => {
      if (phase !== "dodge") return;
      engine.stop();
      soulLocked = false;
      soulEl.classList.remove("soul-locked");
      $("joystick").style.display = "none";
      phase = "menu";
      $("commandPanel").style.display = "grid";
      setCommandsEnabled(true);
      dialogue("攻撃をしのいだ。");
      note(`${player.name}のターン。行動を選ぼう。`);
    }, duration + 150);
  }

  function finish(win) {
    if (engine) engine.stop();
    clearTimeout(turnTimer);
    phase = "result";
    setCommandsEnabled(false);
    $("joystick").style.display = "none";
    show("result");
    setText("resultTitle", win ? "VICTORY" : "DEFEAT");
    setText("resultText", win
      ? `${enemy.name}との戦闘を終えた。これはプロトタイプの仮エンディングです。`
      : `${player.name}は戦闘を続けられなくなった。難易度を下げて再挑戦してみよう。`);
  }

  function enemyDamage(amount) {
    enemy.hp = Math.max(0, enemy.hp - amount);
    if (enemy.reviveOnce && !enemy.revived && enemy.hp <= enemy.maxHp * (enemy.reviveThreshold || 0.3)) {
      enemy.revived = true;
      enemy.hp = enemy.maxHp;
      hpUI();
      dialogue("「えへへ、まだまだ元気だよ！ お花の力、見せてあげる！」");
      note("花森 鈴音の能力 // HPが一度だけ全回復した！");
      return false;
    }
    hpUI();
    if (enemy.hp <= 0) {
      finish(true);
      return true;
    }
    return false;
  }

  function playerAction(cmd) {
    // Lock immediately. Repeated taps cannot execute multiple actions in one turn.
    if (phase !== "menu") return;
    phase = "resolving";
    setCommandsEnabled(false);

    if (cmd === "fight") {
      const dmg = Math.round(player.attack * difficulty.playerDamage * (boosted ? 1.6 : 1));
      boosted = false;
      enemyDamage(dmg);
      if (phase === "result") return;
      dialogue(player.id === "hanna_milly"
        ? `「え、えいっ……！」 魔力の小さな波が届いた。${dmg}ダメージ。`
        : `${player.name}の攻撃！ ${dmg} ダメージ。`);
      note("攻撃が命中した。");
      turnTimer = setTimeout(enemyTurn, 700);
    } else if (cmd === "act") {
      if (player.id === "hanna_milly") {
        player.guardNext = true;
        dialogue("「甘い香りがする……？ そ、それは気のせいなのです！」");
        note("香りを隠した。次の敵ターンの被ダメージを少し軽減する。");
      } else {
        const descriptions = {
          photo_candray:"音と道を操るドミナント。甘い道化師の姿に油断は禁物。",
          nohr_solphonsh:"死を越えた伝説。剣と槍を用いた苛烈な弾幕を放つ。",
          merli_arl:"深海ノアの館長。水流・衝撃波・レーザーを操るロード。",
          nitro:"機械技術と観察眼に長けた武器商人。複数のドローンと時間差のパルス弾幕を使う。",
          hanamori_suzune_enemy:"植物と薬品を操るロード。移動先に応じて弾幕を変え、追い詰められると一度だけ全回復する。"
        };
        dialogue(descriptions[enemy.id] || enemy.description || "相手の様子を観察した。");
        note("相手の情報を確認した。");
      }
      turnTimer = setTimeout(() => { if (phase === "resolving") enemyTurn(); }, 1200);
    } else if (cmd === "item") {
      const usable = (player.items || []).filter(i => i.count > 0);
      if (!usable.length) {
        dialogue(player.id === "hanna_milly" ? "「ミリー、何も持っていないのです……！」" : "使える薬品がない。");
        note("使用できるアイテムはない。");
        phase = "menu";
        setCommandsEnabled(true);
        return;
      }
      const choice = usable.find(i => i.kind === "heal" && player.hp < player.maxHp) || usable[0];
      choice.count--;
      if (choice.kind === "heal") {
        const old = player.hp;
        player.hp = Math.min(player.maxHp, player.hp + choice.power);
        dialogue(`${choice.name}を使用。HPが${player.hp - old}回復した。`);
      } else if (choice.kind === "damage") {
        enemyDamage(choice.power);
        dialogue(`${choice.name}を使用。フォトに${choice.power}ダメージ。`);
        if (phase === "result") return;
      } else {
        boosted = true;
        dialogue("身体強化薬を使用。次の攻撃が強化された。");
      }
      hpUI();
      note(`${choice.name}：残り${choice.count}個`);
      turnTimer = setTimeout(enemyTurn, 900);
    } else if (cmd === "mercy") {
      dialogue(`${player.name}は武器を下ろした。${enemy.name}は不思議そうにこちらを見ている。`);
      note("この試作版ではMERCYで戦闘を終了できる。");
      turnTimer = setTimeout(() => finish(true), 900);
    } else {
      phase = "menu";
      setCommandsEnabled(true);
    }
  }

  // Drag control: the whole enlarged battle box is available to touch.
  let dragging = false;
  let dragAnchor = null;
  function pointerMove(e) {
    if (!dragging || phase !== "dodge" || soulLocked || !dragAnchor) return;
    const r = arena.getBoundingClientRect();
    const dx = (e.clientX - dragAnchor.x) / r.width;
    const dy = (e.clientY - dragAnchor.y) / r.height;
    positionSoul(dragAnchor.soulX + dx * 1.25, dragAnchor.soulY + dy * 1.25);
  }
  arena.addEventListener("pointerdown", e => {
    if (phase !== "dodge" || touchMode !== "drag" || soulLocked) return;
    dragging = true;
    dragAnchor = { x:e.clientX, y:e.clientY, soulX:soul.x, soulY:soul.y };
    arena.setPointerCapture(e.pointerId);
  });
  arena.addEventListener("pointermove", pointerMove);
  arena.addEventListener("pointerup", () => { dragging = false; dragAnchor = null; });
  arena.addEventListener("pointercancel", () => { dragging = false; dragAnchor = null; });

  // Larger virtual stick with a stronger movement response.
  const joy = $("joystick"), knob = $("stickKnob");
  let joyPointer = null;
  joy.addEventListener("pointerdown", e => {
    if (phase !== "dodge" || soulLocked) return;
    e.stopPropagation();
    joyPointer = e.pointerId;
    joy.setPointerCapture(e.pointerId);
    moveJoy(e);
  });
  joy.addEventListener("pointermove", e => {
    if (e.pointerId === joyPointer) moveJoy(e);
  });
  function moveJoy(e) {
    const r = joy.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const max = 38;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
    knob.style.left = `${38 + dx}px`;
    knob.style.top = `${38 + dy}px`;
    if (!soulLocked) positionSoul(soul.x + dx / max * 0.065, soul.y + dy / max * 0.065);
  }
  function resetJoy() {
    joyPointer = null;
    knob.style.left = "38px";
    knob.style.top = "38px";
  }
  joy.addEventListener("pointerup", resetJoy);
  joy.addEventListener("pointercancel", resetJoy);

  $("startBtn").addEventListener("click", start);
  $("commandPanel").addEventListener("click", e => {
    const button = e.target.closest("[data-command]");
    if (button && !button.disabled) playerAction(button.dataset.command);
  });
  $("backToTitle").addEventListener("click", () => {
    if (engine) engine.stop();
    clearTimeout(turnTimer);
    phase = "menu";
    show("title");
  });
  $("retryBtn").addEventListener("click", start);
  $("resultTitleBtn").addEventListener("click", () => show("title"));
  $("soundToggle").addEventListener("click", () => {
    soundOn = !soundOn;
    $("soundToggle").textContent = `♪ SOUND: ${soundOn ? "ON" : "OFF"}`;
  });
  $("arenaHint").addEventListener("click", () => {
    touchMode = touchMode === "drag" ? "stick" : "drag";
    $("arenaHint").textContent = touchMode === "drag" ? "指でなぞる / スティック切替" : "仮想スティック / タップで切替";
  });
  show("title");
})();
