(() => {
  const $ = id => document.getElementById(id);
  const screens = { title: $("titleScreen"), battle: $("battleScreen"), result: $("resultScreen") };
  let player, enemy, difficulty, engine;
  let phase = "menu", touchMode = "drag";
  let soul = { x: 0.5, y: 0.76 }, hitCooldown = 0, boosted = false;
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
    setText("enemyHpText", `${Math.max(0, enemy.hp)} / ${enemy.maxHp}`);
    $("enemyHpBar").style.width = `${Math.max(0, enemy.hp) / enemy.maxHp * 100}%`;
  }
  function note(t) { setText("statusNote", t); }
  function dialogue(t) { setText("dialogue", t); }
  function positionSoul(x, y) {
    soul.x = Math.max(0.025, Math.min(0.975, x));
    soul.y = Math.max(0.035, Math.min(0.965, y));
    soulEl.style.left = `${soul.x * 100}%`;
    soulEl.style.top = `${soul.y * 100}%`;
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
    enemy = structuredClone(BW_DATA.characters.photo_candray);
    difficulty = BW_DATA.difficulties[$("difficultySelect").value];
    phase = "menu";
    hitCooldown = 0;
    boosted = false;
    setText("playerName", player.name);
    setText("playerRank", `#${player.rank}`);
    setText("enemyName", enemy.name);
    positionSoul(0.5, 0.76);
    hpUI();
    note("鈴音は鈴蛇薔薇を構えた。");
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
        player.hp = Math.max(0, player.hp - Math.max(1, Math.round(damage)));
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
    const duration = difficulty.turnMs + level * difficulty.phaseBonusMs;
    const patterns = enemyPatternPool(level);
    dialogue(level === 2 ? "「もっともっと遊ぶのよ！ 逃がさないのさ！」" : enemy.intro);
    note(`${phaseDescription(level)} / ${Math.ceil(duration / 1000)}秒間回避！`);
    engine.start(patterns, difficulty, duration, () => soul, level);

    turnTimer = setTimeout(() => {
      if (phase !== "dodge") return;
      engine.stop();
      $("joystick").style.display = "none";
      phase = "menu";
      $("commandPanel").style.display = "grid";
      setCommandsEnabled(true);
      dialogue("攻撃をしのいだ。");
      note("鈴音のターン。行動を選ぼう。");
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
      ? "フォトとの戦闘を終えた。これはプロトタイプの仮エンディングです。"
      : "鈴音は戦闘を続けられなくなった。難易度を下げて再挑戦してみよう。");
  }

  function enemyDamage(amount) {
    enemy.hp = Math.max(0, enemy.hp - amount);
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
      dialogue(`鈴音の攻撃！ ${dmg} ダメージ。`);
      note("攻撃が命中した。");
      turnTimer = setTimeout(enemyTurn, 700);
    } else if (cmd === "act") {
      dialogue("フォト・キャンドレイ：音と道を操るドミナント。ボスへの執着は本心か、演技か……。");
      note("相手の情報を確認した。");
      turnTimer = setTimeout(() => { if (phase === "resolving") enemyTurn(); }, 1200);
    } else if (cmd === "item") {
      const usable = player.items.filter(i => i.count > 0);
      if (!usable.length) {
        dialogue("使える薬品がない。");
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
      dialogue("鈴音は武器を下ろした。フォトは不思議そうに首を傾げている。");
      note("この試作版ではMERCYで戦闘を終了できる。");
      turnTimer = setTimeout(() => finish(true), 900);
    } else {
      phase = "menu";
      setCommandsEnabled(true);
    }
  }

  // Drag control: the whole enlarged battle box is available to touch.
  let dragging = false;
  function pointerMove(e) {
    if (!dragging || phase !== "dodge") return;
    const r = arena.getBoundingClientRect();
    positionSoul((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  }
  arena.addEventListener("pointerdown", e => {
    if (phase !== "dodge" || touchMode !== "drag") return;
    dragging = true;
    arena.setPointerCapture(e.pointerId);
    pointerMove(e);
  });
  arena.addEventListener("pointermove", pointerMove);
  arena.addEventListener("pointerup", () => { dragging = false; });
  arena.addEventListener("pointercancel", () => { dragging = false; });

  // Larger virtual stick with a stronger movement response.
  const joy = $("joystick"), knob = $("stickKnob");
  let joyPointer = null;
  joy.addEventListener("pointerdown", e => {
    if (phase !== "dodge") return;
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
    positionSoul(soul.x + dx / max * 0.04, soul.y + dy / max * 0.04);
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
