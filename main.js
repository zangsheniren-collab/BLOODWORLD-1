(() => {
  const $ = id => document.getElementById(id);
  const screens = { title: $("titleScreen"), battle: $("battleScreen"), result: $("resultScreen") };
  let player, enemy, difficulty, engine;
  let phase = "menu", touchMode = "drag", soulLocked = false;
  let soul = { x: 0.5, y: 0.76 }, hitCooldown = 0, boosted = false;
  let abilityUses = 3, counterNextTurn = false;
  let movementSamples = [];
  let lastAdaptivePattern = null;
  let turnTimer = null, soundOn = false, controlTimer = null, controlScale = 1;
  const canvas = $("bulletCanvas"), arena = $("dodgeArena"), soulEl = $("soul");
  const commandButtons = [...document.querySelectorAll("[data-command]")];

  function show(name) {
    Object.values(screens).forEach(s => s.classList.remove("active"));
    screens[name].classList.add("active");
  }
  function setText(id, t) { $(id).textContent = t; }
  function setCommandsEnabled(enabled) {
    commandButtons.forEach(button => { button.disabled = !enabled || (button.dataset.command === "ability" && abilityUses <= 0); });
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
    const bounds = engine && engine.getSafeBounds ? engine.getSafeBounds() : {minX:0.025,maxX:0.975,minY:0.035,maxY:0.965};
    soul.x = Math.max(bounds.minX, Math.min(bounds.maxX, x));
    soul.y = Math.max(bounds.minY, Math.min(bounds.maxY, y));
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
    // 対象の移動方向を毎回読み直し、同じ攻撃順の暗記だけでは避けられないようにする。
    if (!pool || !pool.length) return null;
    const choices = pool.length > 1 ? pool.filter(id => id !== lastAdaptivePattern) : pool;
    const selected = choices[Math.floor(Math.random() * choices.length)] || pool[0];
    lastAdaptivePattern = selected;
    return selected;
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
    // 敵HPはEASYを基準に難易度ごとに倍率を適用。最高難易度のみ+100し、800を上限とする。
    if (enemy.role === "enemy") {
      const easyBaseHp = enemy.maxHp || enemy.hp;
      const difficultyHp = Math.round(easyBaseHp * (difficulty.enemyHpScale || 1));
      const highestBonus = difficulty.enemyDamageBonus > 0 ? 100 : 0;
      enemy.maxHp = Math.min(800, difficultyHp + highestBonus);
      enemy.hp = enemy.maxHp;
    }
    phase = "menu";
    hitCooldown = 0;
    boosted = false;
    abilityUses = 3; counterNextTurn = false;
    controlScale = 1;
    clearTimeout(controlTimer);
    movementSamples = [];
    lastAdaptivePattern = null;
    enemy.revived = false;
    enemy.justRevived = false;
    enemy.selfDestructTriggered = false;
    enemy.selfDestructPending = false;
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
      merli_arl:{name:"MERLI ARL",mark:"水",caption:"A SINGLE THREAD OF GUILT"},
      hatter_wikiss:{name:"HATTER WIKISS",mark:"黄",caption:"THE YELLOW KING"},
      tsubomi_koharu:{name:"TSUBOMI KOHARU",mark:"雷",caption:"THE LOST SWORD TIP"},
      kashiwabara_yuzuka:{name:"KASHIWABARA YUZUKA",mark:"鬼",caption:"YOU ARE IT"},
      ogres_lily:{name:"OGRES LILY",mark:"百",caption:"ARSENAL / THE RED FORGE"},
      nagatsuki:{name:"NAGATSUKI",mark:"蟲",caption:"THE ROMANTIC WANDERER"},
      blitz_van_slosis:{name:"BLITZ VAN SLOSIS",mark:"七",caption:"HEPTA SALPINGES / ARCHBISHOP"}
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
    const abilityButton = commandButtons.find(b => b.dataset.command === "ability");
    abilityButton.style.display = player.id === "hanamori_suzune" ? "flex" : "none";
    abilityButton.querySelector("small").textContent = `残り${abilityUses}回`;
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
      engine = new BulletEngine(canvas, arena, (damage, effect, bullet) => {
        if (phase !== "dodge" || hitCooldown > 0) return;
        if (effect && effect.type === "knockback") {
          positionSoul(soul.x + (effect.dx || 0) * (effect.power || 0.12), soul.y + (effect.dy || 0) * (effect.power || 0.12));
          note("斬撃の衝撃でハートが弾き飛ばされた！");
        } else if (effect && effect.type === "slow") {
          controlScale = Math.min(controlScale, effect.scale || 0.78);
          clearTimeout(controlTimer);
          controlTimer = setTimeout(() => { controlScale = 1; note("刻印の鈍化が解けた。"); }, effect.duration || 1100);
          note("刻印弾の効果 // 一時的に移動が鈍くなった！");
        }
        const reduced = player.id === "hanna_milly" && player.guardNext ? damage * player.actReduction : damage;
        player.guardNext = false;
        player.hp = Math.max(0, player.hp - Math.max(1, Math.round(reduced)));
        hitCooldown = 450;
        setTimeout(() => { hitCooldown = 0; }, 450);
        hpUI();
        if (!effect || effect.type !== "knockback") note("弾幕に触れた！");
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
    const yuzuFinale = enemy.id === "kashiwabara_yuzuka" && enemy.selfDestructPending;
    const baseDuration = yuzuFinale ? (enemy.selfDestructTurnMs || 7200) :
      (enemy.turnMs || difficulty.turnMs) + level * (enemy.phaseBonusMs || difficulty.phaseBonusMs) + (enemy.id === "nohr_solphonsh" ? 1200 : 0);
    const duration = counterNextTurn ? Math.max(baseDuration, 15000) : baseDuration;
    const patterns = yuzuFinale ? ["yuzu_final_burst"] : enemyPatternPool(level);
    dialogue(yuzuFinale ? "「最後までアーシだけ見ててよね！ どっかーん！」" :
      level === 2 && enemy.id === "nohr_solphonsh" ? enemy.quote :
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
        player.hp = Math.max(0, player.hp - Math.max(1, Math.round(8 * difficulty.enemyDamage + (difficulty.enemyDamageBonus || 0))));
        hpUI();
        note("死を越えた一閃 // 回避不能の固定ダメージ！");
        if (player.hp <= 0) finish(false);
      },
      movementGetter: movementProfile,
      patternSelector: enemy.adaptivePatterns ? selectSuzunePattern : null,
      singleShot: yuzuFinale,
      counterAbility: counterNextTurn,
      onStatusEffect: (type, durationMs, scale) => {
        controlScale = type === "fast" ? Math.max(1.15, scale) : Math.min(0.8, scale);
        clearTimeout(controlTimer);
        note(type === "fast" ? "移動速度上昇 // 操作が速くなった！" : "移動速度低下 // 操作が重くなった……！");
        controlTimer = setTimeout(() => { controlScale = 1; note("移動速度が通常に戻った。"); }, durationMs);
      },
      onStageEffect: () => positionSoul(soul.x, soul.y)
    });

    counterNextTurn = false;
    turnTimer = setTimeout(() => {
      if (phase !== "dodge") return;
      engine.stop();
      soulLocked = false;
      soulEl.classList.remove("soul-locked");
      controlScale = 1;
      clearTimeout(controlTimer);
      $("joystick").style.display = "none";
      phase = "menu";
      $("commandPanel").style.display = "grid";
      setCommandsEnabled(true);
      if (yuzuFinale && phase !== "result") {
        enemy.selfDestructPending = false;
        enemy.hp = 0;
        hpUI();
        finish(true);
        return;
      }
      dialogue("攻撃をしのいだ。");
      note(`${player.name}のターン。行動を選ぼう。`);
    }, duration + 150);
  }

  function finish(win) {
    if (engine) engine.stop();
    clearTimeout(turnTimer);
    clearTimeout(controlTimer);
    controlScale = 1;
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
    const nextHp = enemy.hp - amount;
    if (enemy.selfDestructAt && !enemy.selfDestructTriggered && enemy.hp > enemy.maxHp * enemy.selfDestructAt && nextHp <= enemy.maxHp * enemy.selfDestructAt) {
      enemy.selfDestructTriggered = true;
      enemy.selfDestructPending = true;
      enemy.hp = Math.max(1, Math.ceil(enemy.maxHp * enemy.selfDestructAt));
      hpUI();
      dialogue("「えっ、ここまで来ちゃった？ じゃあ最後は派手にいくよ！」");
      note("ユズの最終演出が始まる……！");
      return false;
    }
    enemy.hp = Math.max(0, nextHp);
    if (enemy.reviveOnce && !enemy.revived && enemy.hp <= enemy.maxHp * (enemy.reviveThreshold || 0.3)) {
      enemy.revived = true;
      enemy.justRevived = true;
      enemy.hp = enemy.maxHp;
      hpUI();
      dialogue("「えへへ、まだまだ元気だよ！ 枯れ葉の季節は、これからだよ！」");
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
      if (enemy.justRevived) {
        enemy.justRevived = false;
        turnTimer = setTimeout(enemyTurn, 700);
        return;
      }
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
          hanamori_suzune_enemy:"枯葉や落ち葉を操るロード。移動先に応じて弾幕を変え、追い詰められると一度だけ全回復する。",
          hatter_wikiss:"左右から羽根を飛ばし、黄衣の力で回避エリアそのものを狭めるロード。",
          tsubomi_koharu:"雷を帯びた刀の軌跡を短い斬撃レーザーとして連続で放つドミナント。",
          kashiwabara_yuzuka:"ハートの移動速度を遅くしたり速くしたりする妨害と、銃・剣の攻撃を使うドミナント。",
          ogres_lily:"アーセナル所属のガンスミス兼道具屋。追従弾、予告付きの着弾陣、分裂する刻印弾を使い分けるロード。",
          nagatsuki:"虫を模した低威力・高密度の群弾幕と、狙いを定めた旧式銃器の弾幕を織り交ぜるドミナント。",
          blitz_van_slosis:"水と氷を操る根源破滅教団の大司教。広範囲を覆う氷弾幕と七首の獣を思わせる終幕を放つロード。"
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
        player.hp = Math.min(player.maxHp, player.hp + Math.ceil(player.maxHp * (choice.power || 0.5)));
        dialogue(`${choice.name}を使用。最大HPの50%にあたる${player.hp - old}HPが回復した。`);
      } else if (choice.kind === "damage") {
        enemyDamage(choice.power);
        if (phase === "result") return;
        if (enemy.justRevived) {
          enemy.justRevived = false;
          dialogue("枯葉が舞い上がる……鈴音のHPが全回復した！");
        } else {
          dialogue(`${choice.name}を使用。${enemy.name}に${choice.power}ダメージ。`);
        }
      } else {
        boosted = true;
        dialogue("身体強化薬を使用。次の攻撃が強化された。");
      }
      hpUI();
      note(`${choice.name}：残り${choice.count}個`);
      turnTimer = setTimeout(enemyTurn, 900);
    } else if (cmd === "ability") {
      if (player.id !== "hanamori_suzune" || abilityUses <= 0) {
        phase = "menu"; setCommandsEnabled(true); return;
      }
      abilityUses--;
      counterNextTurn = true;
      const abilityButton = commandButtons.find(b => b.dataset.command === "ability");
      abilityButton.querySelector("small").textContent = `残り${abilityUses}回`;
      // 難易度補正を通さない固定60ダメージ。敵の特殊HP条件も通常攻撃と同様に判定する。
      enemyDamage(60);
      if (phase === "result") return;
      dialogue("「花森鈴音の能力！ 花弁の螺旋で、周囲の弾幕を打ち消すよ！」");
      note(enemy.selfDestructPending
        ? "能力発動 // 敵に固定60ダメージ！ 螺旋花弁弾で敵弾を相殺し、ユズの最終技へ。"
        : "能力発動 // 敵に固定60ダメージ！ 次の敵ターン開始から15秒間、全方位の螺旋花弁弾で敵弾を相殺する。");
      turnTimer = setTimeout(enemyTurn, 700);
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
    dragAnchor.x = e.clientX;
    dragAnchor.y = e.clientY;
    positionSoul(soul.x + dx * 1.25 * controlScale, soul.y + dy * 1.25 * controlScale);
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
    if (!soulLocked) positionSoul(soul.x + dx / max * 0.065 * controlScale, soul.y + dy / max * 0.065 * controlScale);
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
