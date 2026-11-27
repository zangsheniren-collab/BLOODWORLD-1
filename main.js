(() => {
  const $ = id => document.getElementById(id);
  const screens = { title: $("titleScreen"), battle: $("battleScreen"), result: $("resultScreen") };
  let player, enemy, difficulty, engine;
  let phase = "menu", touchMode = "drag", soulLocked = false;
  let battleMode = "solo", duoMembers = [], lastLuckySourceId = null;
  let enemyMode = false, enemyModeTurnsRemaining = 8, enemyModeAttackCount = 0;
  let heartAiTimer = null, freezeTimer = null;
  let soul = { x: 0.5, y: 0.76 }, hitCooldown = 0, boosted = false, boostMultiplier = 1.6;
  let abilityUses = 3, counterNextTurn = false, nextEnemySpeedScale = 1, incomingDamageScale = 1;
  let movementSamples = [];
  let lastAdaptivePattern = null;
  let turnTimer = null, soundOn = false, controlTimer = null, controlScale = 1;
  const canvas = $("bulletCanvas"), arena = $("dodgeArena"), soulEl = $("soul");
  const commandButtons = [...document.querySelectorAll("[data-command]")];

  const ENEMY_MODE_UNLOCK_KEY = "bloodworld_enemy_mode_unlocked_v1";
  function isEnemyModeUnlocked() {
    try { return localStorage.getItem(ENEMY_MODE_UNLOCK_KEY) === "1"; }
    catch (_) { return false; }
  }
  function refreshEnemyModeUnlock() {
    const option = $("modeSelect").querySelector('option[value="enemy"]');
    const unlocked = isEnemyModeUnlocked();
    if (option) {
      option.disabled = !unlocked;
      option.textContent = unlocked ? "ENEMY / 裏ステージ" : "??? / INSANE CLEAR REQUIRED";
    }
    return unlocked;
  }

  function show(name) {
    Object.values(screens).forEach(s => s.classList.remove("active"));
    screens[name].classList.add("active");
  }
  function setText(id, t) { $(id).textContent = t; }
  function setCommandsEnabled(enabled) {
    commandButtons.forEach(button => { button.disabled = !enabled || (button.dataset.command === "ability" && abilityUses <= 0); });
    $("commandPanel").classList.toggle("is-locked", !enabled);
  }
  function syncDuoHp() {
    if (!enemy || !enemy.isDuo) return;
    enemy.hp = enemy.members.reduce((sum, member) => sum + Math.max(0, member.hp), 0);
    const alive = enemy.members.filter(member => member.hp > 0);
    enemy.name = alive.length ? alive.map(member => member.name).join(" ＆ ") : "コンビチーム";
    setText("enemyName", enemy.name);
    setText("enemyRank", alive.length > 1 ? `#コンビ // ${alive.map(member => member.title || member.rank).join(" × ")}` : `#コンビ // 残る敵：${alive[0]?.name || "なし"}`);
  }
  function hpUI() {
    syncDuoHp();
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
  function enemyPhaseLevel(target = enemy) {
    if (target && target.phasePatterns) {
      if (target.hp <= 70) return 6;
      return Math.max(0, Math.min(target.phasePatterns.length - 1,
        Math.floor(((target.maxHp || target.hp) - target.hp) / 100)));
    }
    const ratio = target ? target.hp / target.maxHp : 1;
    if (ratio <= 1 / 3) return 2;
    if (ratio <= 2 / 3) return 1;
    return 0;
  }
  function enemyPatternPool(level, target = enemy) {
    if (target && target.phasePatterns) {
      if (level >= 6) return [...(target.finalPatterns || [])];
      return [...(target.phasePatterns[level] || target.phasePatterns[0] || [])];
    }
    const patterns = [...(target?.patterns || [])];
    if (level >= 1) patterns.push(...(target?.patternsMid || []));
    if (level >= 2) patterns.push(...(target?.patternsFinal || []));
    return patterns;
  }
  function phaseDescription(level, target = enemy) {
    if (target?.id === "hirai_souka") {
      return level >= 6 ? "最終雷光 // HP70以下・超高速光線連打" : `雷光第${level + 1}段階 // HPが100減るごとに弾幕変化`;
    }
    if (target?.isDuo) return "コンビ連携 // 2人の弾幕が交互に押し寄せる";
    if (target?.randomBoss) return "運命抽選 // 今ターンの敵が選ばれた";
    if (level === 2) return "最終段階 // 弾幕が大きく変化した！";
    if (level === 1) return "第二段階 // 攻撃が激しくなった！";
    return "通常段階";
  }

  function applyDifficultyHp(character) {
    const baseHp = character.maxHp || character.hp;
    const scaled = Math.round(baseHp * (difficulty.enemyHpScale || 1));
    const topDifficultyBonus = difficulty.enemyDamageBonus > 0 ? 100 : 0;
    character.maxHp = Math.min(800, scaled + topDifficultyBonus);
    character.hp = character.maxHp;
  }

  function shuffleCopy(list) {
    const copy = [...(list || [])];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function buildDuoPatternPool() {
    const activeMembers = (enemy.members || []).filter(member => member.hp > 0);
    const pools = activeMembers.map(member => {
      if (member.randomBoss) {
        const source = selectLuckySource();
        member.currentRandomSourceName = source?.name || "ランダムな敵";
        return shuffleCopy(source ? allCharacterPatterns(source) : ["heart_note"]);
      }
      member.currentRandomSourceName = null;
      const level = enemyPhaseLevel(member);
      let pool = enemyPatternPool(level, member);
      if (member.id === "himeno_hime") {
        pool = pool.filter(id => id !== "hime_ice_planet");
        if (level >= 2) {
          member.icePlanetCharge = (member.icePlanetCharge || 0) + 1;
          if (member.icePlanetCharge >= 3) {
            member.icePlanetCharge = 0;
            pool.push("hime_ice_planet");
          }
        }
        pool = shuffleCopy(pool);
        if (member.illusionPending) {
          pool.unshift("hime_illusion");
          member.illusionPending = false;
        }
        return pool;
      }
      return shuffleCopy(pool);
    });
    const merged = [];
    let index = 0;
    while (pools.some(pool => index < pool.length)) {
      for (const pool of pools) if (index < pool.length) merged.push(pool[index]);
      index++;
    }
    return merged;
  }

  function selectLuckySource() {
    const candidates = Object.values(BW_DATA.characters).filter(character =>
      character.role === "enemy" && !character.randomBoss && (character.patterns?.length || character.phasePatterns?.length));
    if (!candidates.length) return null;
    const fresh = candidates.filter(character => character.id !== lastLuckySourceId);
    const source = (fresh.length ? fresh : candidates)[Math.floor(Math.random() * (fresh.length ? fresh : candidates).length)];
    lastLuckySourceId = source.id;
    return structuredClone(source);
  }

  function allCharacterPatterns(character) {
    if (character.phasePatterns) return [...character.phasePatterns.flat(), ...(character.finalPatterns || [])];
    return [...(character.patterns || []), ...(character.patternsMid || []), ...(character.patternsFinal || [])];
  }

  function resetBattle() {
    if (engine) engine.stop();
    clearTimeout(turnTimer);
    clearTimeout(controlTimer);
    clearTimeout(freezeTimer);
    if (heartAiTimer) clearInterval(heartAiTimer);
    player = structuredClone(BW_DATA.characters[$("playerSelect").value]);
    difficulty = BW_DATA.difficulties[$("difficultySelect").value];
    battleMode = $("modeSelect")?.value || "solo";
    enemyMode = battleMode === "enemy";
    duoMembers = [];
    lastLuckySourceId = null;
    enemyModeTurnsRemaining = 8;
    enemyModeAttackCount = 0;
    nextEnemySpeedScale = 1;
    incomingDamageScale = 1;
    boostMultiplier = 1.6;

    if (enemyMode) {
      player = structuredClone(BW_DATA.characters[$("enemyModeCharacterSelect").value] || BW_DATA.characters.hirai_souka);
      const heartHp = Math.min(800, Math.round(600 * (difficulty.enemyHpScale || 1)));
      enemy = {
        id:"escaping_heart", role:"target", rank:"ESCAPE TARGET", name:"逃げるハート",
        title:"THE RUNAWAY HEART", color:"#ff668e", intro:"小さなハートが戦場の奥へ逃げ込んだ。弾幕を当てて捕まえろ。",
        hp:heartHp, maxHp:heartHp, description:"8回の攻撃ターンが終わる前にHPを0にしよう。"
      };
    } else if (battleMode === "duo") {
      const firstId = $("duoEnemyA").value;
      const secondId = $("duoEnemyB").value;
      duoMembers = [firstId, secondId].map(id => structuredClone(BW_DATA.characters[id] || BW_DATA.characters.photo_candray));
      duoMembers.forEach(member => {
        applyDifficultyHp(member);
        member.revived = false;
        member.justRevived = false;
        member.selfDestructTriggered = false;
        member.selfDestructPending = false;
        member.turnCount = 0;
        member.mirrorActive = false;
        member.icePlanetCharge = 0;
      });
      enemy = {
        id:"duo", isDuo:true, members:duoMembers, role:"enemy", rank:"コンビ",
        name:duoMembers.map(member => member.name).join(" ＆ "),
        title:"TWO-PERSON ENCOUNTER", color:duoMembers[0].color || "#9bc8ff",
        intro:`「${duoMembers[0].name}と${duoMembers[1].name}が、同時に動き出した……！」`,
        description:"選択した2人の敵が同じターンに弾幕を交互に展開するコンビ戦。",
        hp:duoMembers.reduce((sum, member) => sum + member.hp, 0),
        maxHp:duoMembers.reduce((sum, member) => sum + member.maxHp, 0),
        turnMs:Math.min(15000, Math.max(...duoMembers.map(member => member.turnMs || difficulty.turnMs))),
        phaseBonusMs:1700,
        soukaHimeSynergy:duoMembers.some(member => member.id === "hirai_souka") && duoMembers.some(member => member.id === "himeno_hime")
      };
    } else {
      enemy = structuredClone(BW_DATA.characters[$("enemySelect").value] || BW_DATA.characters.photo_candray);
      if (enemy.role === "enemy") applyDifficultyHp(enemy);
      enemy.turnCount = 0;
      enemy.mirrorActive = false;
      enemy.illusionPending = false;
      enemy.icePlanetCharge = 0;
    }

    phase = "menu";
    hitCooldown = 0;
    boosted = false;
    abilityUses = player.id === "hanamori_suzune" ? 3 : (player.abilityUses || 0);
    counterNextTurn = false;
    controlScale = 1;
    clearTimeout(controlTimer);
    movementSamples = [];
    lastAdaptivePattern = null;
    if (enemy && !enemy.isDuo) {
      enemy.revived = false;
      enemy.justRevived = false;
      enemy.selfDestructTriggered = false;
      enemy.selfDestructPending = false;
    }
    soulLocked = false;
    soulEl.classList.remove("soul-locked", "soul-frozen");
    setText("playerName", player.name);
    setText("playerRank", enemyMode ? `#${player.rank} // ENEMY MODE` : `#${player.rank}`);
    setText("enemyName", enemy.name);
    $("enemyRank").textContent = enemyMode
      ? `TARGET // 逃走HP ${enemy.hp}・攻撃残り${enemyModeTurnsRemaining}回`
      : battleMode === "duo"
        ? `#コンビ // ${duoMembers.map(member => member.title || member.rank).join(" × ")}`
        : `#${enemy.rank} // ${enemy.title}`;
    $("enemyPortrait").style.setProperty("--enemy-color", enemyMode ? (player.color || "#9bc8ff") : (enemy.color || "#9bc8ff"));
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
      blitz_van_slosis:{name:"BLITZ VAN SLOSIS",mark:"七",caption:"HEPTA SALPINGES / ARCHBISHOP"},
      hirai_souka:{name:"HIRAI SOUKA",mark:"⚡",caption:"ELECTRIC FLASH / DOMINANT"},
      himeno_hime:{name:"HIMENO / LUPINUS",mark:"❄",caption:"THE SNOW FOX PRINCESS"},
      oracle_dice:{name:"ORACLE DICE",mark:"🎲",caption:"THE WORST LUCK / RANDOM BOSS"},
      duo:{name:"DUO ENCOUNTER",mark:"2",caption:"TWO ENEMIES / COMBO MODE"}
    };
    const portrait = portraits[enemyMode ? player.id : enemy.id] || portraits.photo_candray;
    $("portraitName").textContent = portrait.name;
    $("portraitMark").textContent = portrait.mark;
    $("portraitCaption").textContent = enemyMode ? `${player.name} // HUNT MODE` : portrait.caption;
    positionSoul(0.5, 0.76);
    hpUI();
    note(enemyMode
      ? `裏ステージ // ${player.name}を操作して逃げるハートを狙え。残り攻撃回数：${enemyModeTurnsRemaining}`
      : player.id === "hanna_milly" ? "ミリーは魔女帽子をぎゅっと押さえた。回復薬は持っていない。" : `${player.name}は戦闘態勢に入った。`);

    const actButton = commandButtons.find(b => b.dataset.command === "act");
    const itemButton = commandButtons.find(b => b.dataset.command === "item");
    const abilityButton = commandButtons.find(b => b.dataset.command === "ability");
    actButton.querySelector("small").textContent = player.id === "hanna_milly" ? "香りを隠す" : "相手を観察";
    itemButton.querySelector("small").textContent = player.items?.length ? "特殊アイテム" : "所持品なし";
    abilityButton.style.display = !enemyMode && player.abilityName ? "flex" : player.id === "hanamori_suzune" && !enemyMode ? "flex" : "none";
    abilityButton.querySelector("b").textContent = player.abilityName || (player.id === "hanamori_suzune" ? "能力" : "能力");
    abilityButton.querySelector("small").textContent = `残り${abilityUses}回`;
    commandButtons.forEach(button => { button.style.display = enemyMode && button.dataset.command !== "fight" ? "none" : "flex"; });
    commandButtons.find(b => b.dataset.command === "fight").querySelector("b").textContent = enemyMode ? "ATTACK" : "FIGHT";
    commandButtons.find(b => b.dataset.command === "fight").querySelector("small").textContent = enemyMode ? "弾幕を放つ" : "攻撃する";
    $("commandPanel").style.gridTemplateColumns = enemyMode ? "1fr" : "repeat(5,1fr)";
    $("commandPanel").style.display = "grid";
    $("joystick").style.display = "none";
    $("arenaHint").textContent = enemyMode ? "逃げるハートを自動追跡中" : "指でなぞる / スティック切替";
    setCommandsEnabled(true);
  }

  function start() {
    resetBattle();
    show("battle");
    if (!engine) {
      engine = new BulletEngine(canvas, arena, (damage, effect, bullet) => {
        if (phase !== "dodge" || hitCooldown > 0) return;
        if (enemyMode) {
          enemy.hp = Math.max(0, enemy.hp - Math.max(1, Math.round(damage)));
          hpUI();
          note(`弾幕命中！ 逃げるハートに${Math.max(1, Math.round(damage))}ダメージ。`);
          hitCooldown = 110;
          setTimeout(() => { hitCooldown = 0; }, 110);
          if (enemy.hp <= 0) finish(true);
          return;
        }
        if (effect && effect.type === "freeze") {
          soulLocked = true;
          soulEl.classList.add("soul-frozen");
          clearTimeout(freezeTimer);
          freezeTimer = setTimeout(() => {
            soulLocked = false;
            soulEl.classList.remove("soul-frozen");
          }, effect.duration || 200);
          note("凍結 // ハートが0.2秒だけ青く凍りついた！");
        } else if (effect && effect.type === "knockback") {
          positionSoul(soul.x + (effect.dx || 0) * (effect.power || 0.12), soul.y + (effect.dy || 0) * (effect.power || 0.12));
          note("斬撃の衝撃でハートが弾き飛ばされた！");
        } else if (effect && effect.type === "slow") {
          controlScale = Math.min(controlScale, effect.scale || 0.78);
          clearTimeout(controlTimer);
          controlTimer = setTimeout(() => { controlScale = 1; note("刻印の鈍化が解けた。"); }, effect.duration || 1100);
          note("刻印弾の効果 // 一時的に移動が鈍くなった！");
        }
        const reduced = (player.id === "hanna_milly" && player.guardNext ? damage * player.actReduction : damage) * incomingDamageScale;
        player.guardNext = false;
        incomingDamageScale = 1;
        player.hp = Math.max(0, player.hp - Math.max(1, Math.round(reduced)));
        hitCooldown = 450;
        setTimeout(() => { hitCooldown = 0; }, 450);
        hpUI();
        if (!effect || effect.type !== "knockback") note("弾幕に触れた！");
        if (effect && effect.type === "freeze" && enemy) {
          const himeTarget = enemy.isDuo
            ? enemy.members.find(member => member.id === "himeno_hime" && member.hp > 0)
            : (enemy.id === "himeno_hime" ? enemy : null);
          if (himeTarget && himeTarget.hp < himeTarget.maxHp) himeTarget.illusionPending = true;
        }
        if (player.hp <= 0) finish(false);
      });
    }
  }

  function enemyTurn() {
    if (enemyMode || player.hp <= 0 || enemy.hp <= 0 || phase === "result") return;
    if (enemy.id === "himeno_hime") {
      enemy.turnCount = (enemy.turnCount || 0) + 1;
    }
    clearTimeout(turnTimer);
    phase = "dodge";
    setCommandsEnabled(false);
    $("commandPanel").style.display = "none";
    $("joystick").style.display = touchMode === "stick" ? "block" : "none";

    const level = enemyPhaseLevel();
    const duoYuzu = enemy.isDuo ? enemy.members.find(member => member.id === "kashiwabara_yuzuka" && member.selfDestructPending) : null;
    const yuzuFinale = (!enemy.isDuo && enemy.id === "kashiwabara_yuzuka" && enemy.selfDestructPending) || !!duoYuzu;
    let patternSource = null;
    let patterns;
    let patternSelector = null;
    let duration;
    let engineLevel = Math.min(2, level);
    const options = {
      finisher: enemy.specialFinisher && level >= 2,
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
      singleShot: yuzuFinale && !enemy.isDuo,
      counterAbility: counterNextTurn,
      onStatusEffect: (type, durationMs, scale) => {
        controlScale = type === "fast" ? Math.max(1.15, scale) : Math.min(0.8, scale);
        clearTimeout(controlTimer);
        note(type === "fast" ? "移動速度上昇 // 操作が速くなった！" : "移動速度低下 // 操作が重くなった……！");
        controlTimer = setTimeout(() => { controlScale = 1; note("移動速度が通常に戻った。"); }, durationMs);
      },
      onStageEffect: () => positionSoul(soul.x, soul.y)
    };

    if (enemy.id === "himeno_hime" && enemy.illusionPending) {
      patterns = ["hime_illusion"];
      duration = Math.min(7600, (enemy.turnMs || difficulty.turnMs) * 0.52);
      enemy.illusionPending = false;
      dialogue("「……雪景色が、少し違って見えるでしょう？」");
      note("幻覚 // 姫乃への攻撃が成立し、凍結で動きを止めた条件を満たした。視界の揺らぎから幻影弾幕が迫る！");
    } else if (enemy.id === "himeno_hime" && level >= 2) {
      enemy.icePlanetCharge = (enemy.icePlanetCharge || 0) + 1;
      duration = enemy.turnMs || difficulty.turnMs;
      if (enemy.icePlanetCharge >= 3) {
        enemy.icePlanetCharge = 0;
        patterns = ["hime_ice_planet"];
        options.singleShot = true;
        dialogue("「三つ数えたら、氷の星が閉じるよ」");
        note("アイスプラネット // 3ロルの展開準備が完了。氷の檻が閉じ、巨大な氷柱弾幕が解き放たれる！");
      } else {
        patterns = enemyPatternPool(level).filter(id => id !== "hime_ice_planet");
        dialogue("「氷の星を、少しずつ組み立てているの」");
        note(`アイスプラネット展開準備 // ${enemy.icePlanetCharge}/3ロル。姫乃は吹雪と氷鏡の弾幕を重ねている。`);
      }
    } else if (yuzuFinale) {
      patterns = ["yuzu_final_burst"];
      duration = enemy.isDuo ? 10200 : (enemy.selfDestructTurnMs || 10200);
      options.singleShot = !enemy.isDuo;
      patternSelector = null;
      dialogue("「最後までアーシだけ見ててよね！ どっかーん！」");
      note("柚花の最終自爆技 // 大量の本弾幕と遅れて届く余波！");
    } else if (enemy.isDuo) {
      patterns = buildDuoPatternPool();
      const aliveMembers = enemy.members.filter(member => member.hp > 0);
      duration = Math.max(9800, Math.min(15000, enemy.turnMs + Math.min(2, level) * enemy.phaseBonusMs));
      options.densityScale = enemy.soukaHimeSynergy ? 1.25 : 0.72;
      options.speedScale = enemy.soukaHimeSynergy ? 1.16 : 0.93;
      options.damageScale = enemy.soukaHimeSynergy ? 1.24 : 1;
      const borrowedSources = aliveMembers.filter(member => member.randomBoss && member.currentRandomSourceName).map(member => `${member.name}→${member.currentRandomSourceName}`);
      dialogue(`「${aliveMembers.map(member => member.name).join("と")}の連携弾幕、開始！」`);
      note(enemy.soukaHimeSynergy
        ? `雪狐姫×雷速 // 専用共鳴が発動！ 弾幕密度・弾速・威力が大幅上昇した連携を${Math.ceil(duration / 1000)}秒間回避！`
        : `${phaseDescription(level)} / ${borrowedSources.length ? `運ボスの抽選先：${borrowedSources.join("・")} / ` : ""}弾幕密度を抑えたコンビ連携を${Math.ceil(duration / 1000)}秒間回避！`);
    } else if (enemy.randomBoss) {
      patternSource = selectLuckySource();
      patterns = patternSource ? shuffleCopy(allCharacterPatterns(patternSource)) : ["heart_note"];
      let previousLuckyPattern = null;
      patternSelector = pool => {
        const candidates = pool.filter(id => id !== previousLuckyPattern);
        const selected = (candidates.length ? candidates : pool)[Math.floor(Math.random() * (candidates.length ? candidates : pool).length)];
        previousLuckyPattern = selected;
        return selected;
      };
      duration = (enemy.turnMs || difficulty.turnMs) + Math.min(2, level) * (enemy.phaseBonusMs || difficulty.phaseBonusMs);
      dialogue(`「運命の抽選結果は……${patternSource?.name || "未知の敵"}！」`);
      note(`運ボスのランダム弾幕 // 今ターンは${patternSource?.name || "未知の敵"}の弾幕。次のターンには必ず別の敵が選ばれる。`);
    } else {
      patterns = enemyPatternPool(level);
      duration = (enemy.turnMs || difficulty.turnMs) + Math.min(2, level) * (enemy.phaseBonusMs || difficulty.phaseBonusMs) + (enemy.id === "nohr_solphonsh" ? 1200 : 0);
      dialogue(level === 2 && enemy.id === "nohr_solphonsh" ? enemy.quote :
        level === 2 && enemy.id === "merli_arl" ? "「ここから先は、深海ノアの領域よ。」" :
        enemy.id === "hirai_souka" && level >= 6 ? "「……ここからは、光より速い。」" : enemy.intro);
      note(`${phaseDescription(level)} / ${Math.ceil(duration / 1000)}秒間回避！`);
    }

    if (!patterns || !patterns.length) patterns = ["heart_note"];
    if (patternSelector) options.patternSelector = patternSelector;
    else if (!enemy.adaptivePatterns) options.patternSelector = null;
    if (nextEnemySpeedScale !== 1) {
      options.speedScale = (options.speedScale || 1) * nextEnemySpeedScale;
      nextEnemySpeedScale = 1;
    }
    engine.start(patterns, difficulty, duration, () => soul, engineLevel, options);

    counterNextTurn = false;
    turnTimer = setTimeout(() => {
      if (phase !== "dodge") return;
      engine.stop();
      soulLocked = false;
      soulEl.classList.remove("soul-locked", "soul-frozen");
      controlScale = 1;
      clearTimeout(controlTimer);
      $("joystick").style.display = "none";
      phase = "menu";
      $("commandPanel").style.display = "grid";
      setCommandsEnabled(true);
      if (yuzuFinale && phase !== "result") {
        if (enemy.isDuo) {
          duoYuzu.hp = 0;
          duoYuzu.selfDestructPending = false;
          syncDuoHp();
          hpUI();
          if (enemy.hp <= 0) { finish(true); return; }
          dialogue("「ユズの最後の一撃が弾けた。だが、もう一人はまだ戦場に残っている……！」");
          note(`${enemy.name}とのコンビ戦が続く。残る敵の弾幕に備えよう。`);
          return;
        }
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
    clearTimeout(freezeTimer);
    stopHeartAI();
    controlScale = 1;
    phase = "result";
    setCommandsEnabled(false);
    $("joystick").style.display = "none";
    show("result");
    setText("resultTitle", win ? (enemyMode ? "HEART CAPTURED" : "VICTORY") : (enemyMode ? "HEART ESCAPED" : "DEFEAT"));
    let resultMessage = enemyMode
      ? (win ? `${player.name}の弾幕が命中し、逃げるハートを捕まえた。` : `${enemy.name}は攻撃をかわし切り、戦場から逃げ切った。`)
      : (win ? `${enemy.name}との戦闘を終えた。` : `${player.name}は戦闘を続けられなくなった。難易度を下げて再挑戦してみよう。`);
    if (win && !enemyMode && enemy && enemy.hp <= 0 && difficulty && difficulty.label === "INSANE" && !isEnemyModeUnlocked()) {
      try { localStorage.setItem(ENEMY_MODE_UNLOCK_KEY, "1"); } catch (_) {}
      refreshEnemyModeUnlock();
      resultMessage += "\n\n隠しモード解放！ ENEMY MODEが選択できるようになった。";
    }
    setText("resultText", resultMessage);
  }

  function enemyDamage(amount, sourceType = "normal") {
    enemy.lastMirrorReflected = false;
    const currentTarget = enemy.isDuo ? enemy.members.find(member => member.hp > 0) : enemy;
    if (currentTarget?.id === "himeno_hime") {
      const mirrorChance = sourceType === "heat" ? (currentTarget.heatMirrorChance || 0.5) : (currentTarget.mirrorGuardChance || 0.7);
      if (Math.random() < mirrorChance) {
        player.hp = Math.max(0, player.hp - Math.max(1, Math.round(amount)));
        hpUI();
        enemy.lastMirrorReflected = true;
        dialogue("「氷鏡に映った攻撃は、そのままお返しするね」");
        note(`氷鏡反射 // ${Math.round(mirrorChance * 100)}%の反射判定に成功。攻撃が跳ね返された！`);
        if (player.hp <= 0) finish(false);
        return false;
      }
      note("氷鏡に亀裂が走った。今回の攻撃は反射されなかった。");
    }
    if (enemy.isDuo) {
      let remaining = amount;
      for (const member of enemy.members) {
        if (member.hp <= 0 || remaining <= 0) continue;
        const beforeHp = member.hp;
        const nextHp = beforeHp - remaining;
        if (member.selfDestructAt && !member.selfDestructTriggered && beforeHp > member.maxHp * member.selfDestructAt && nextHp <= member.maxHp * member.selfDestructAt) {
          member.selfDestructTriggered = true;
          member.selfDestructPending = true;
          member.hp = Math.max(1, Math.ceil(member.maxHp * member.selfDestructAt));
          remaining = 0;
          dialogue(`「${member.name}の最終演出が始まる……！」`);
          note(`${member.name}が最終技の準備に入った！`);
          break;
        }
        const dealt = Math.min(beforeHp, remaining);
        member.hp = Math.max(0, beforeHp - dealt);
        remaining -= dealt;
        if (member.reviveOnce && !member.revived && member.hp <= member.maxHp * (member.reviveThreshold || 0.3)) {
          member.revived = true;
          member.justRevived = true;
          member.hp = member.maxHp;
          remaining = 0;
          dialogue(`「${member.name}はまだ倒れない……！」`);
          note(`${member.name}の能力 // HPが一度だけ全回復した！`);
          break;
        }
      }
      syncDuoHp();
      hpUI();
      if (enemy.hp <= 0) { finish(true); return true; }
      return false;
    }

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
    if (phase !== "menu") return;
    if (enemyMode) {
      if (cmd === "fight") startEnemyModeAttack();
      return;
    }
    phase = "resolving";
    setCommandsEnabled(false);

    if (cmd === "fight") {
      const dmg = Math.round(player.attack * difficulty.playerDamage * (boosted ? boostMultiplier : 1));
      boosted = false;
      boostMultiplier = 1.6;
      enemyDamage(dmg);
      if (phase === "result") return;
      if (enemy.lastMirrorReflected) {
        turnTimer = setTimeout(enemyTurn, 700);
        return;
      }
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
          tsubomi_koharu:"雷を帯びた刀の軌跡を短い斬撃レーザーとして連続で放つ少年。",
          kashiwabara_yuzuka:"ハートの移動速度を遅くしたり速くしたりする妨害と、銃・剣の攻撃を使うドミナント。",
          ogres_lily:"アーセナル所属のガンスミス兼道具屋。追従弾、予告付きの着弾陣、分裂する刻印弾を使い分けるロード。",
          nagatsuki:"虫を模した低威力・高密度の群弾幕と、狙いを定めた旧式銃器の弾幕を織り交ぜるドミナント。",
          blitz_van_slosis:"水と氷を操る根源破滅教団の大司教。広範囲を覆う氷弾幕と七首の獣を思わせる終幕を放つロード。",
          hirai_souka:"直線軌道の雷移動と、細い光線を連続させる高速戦闘者。",
          himeno_hime:"雪の狐姫。氷鏡で攻撃を反射し、命中時にはハートを0.2秒凍結させる。"
        };
        dialogue(enemy.isDuo ? `コンビモード：${enemy.members.map(member => member.name).join(" ＆ ")}。2人の弾幕が交互に連携する。` : descriptions[enemy.id] || enemy.description || "相手の様子を観察した。");
        note(enemy.id === "himeno_hime" ? "氷鏡 // 姫乃への通常攻撃は70%、熱を使う攻撃は50%の確率で反射される。" : "相手の情報を確認した。");
      }
      turnTimer = setTimeout(() => { if (phase === "resolving") enemyTurn(); }, 1200);
    } else if (cmd === "item") {
      const usable = (player.items || []).filter(i => i.count > 0);
      if (!usable.length) {
        dialogue(player.id === "hanna_milly" ? "「ミリー、何も持っていないのです……！」" : "使えるアイテムがない。");
        note("使用できるアイテムはない。");
        phase = "menu";
        setCommandsEnabled(true);
        return;
      }
      const choice = usable[0];
      choice.count--;
      if (choice.kind === "heal") {
        const old = player.hp;
        player.hp = Math.min(player.maxHp, player.hp + Math.ceil(player.maxHp * (choice.power || 0.5)));
        dialogue(`${choice.name}を使用。${player.hp - old}HPが回復した。`);
      } else if (choice.kind === "damage") {
        enemyDamage(choice.power);
        if (phase === "result") return;
        if (enemy.lastMirrorReflected) { turnTimer = setTimeout(enemyTurn, 900); return; }
        dialogue(`${choice.name}を使用。${enemy.name}に${choice.power}ダメージ。`);
      } else if (choice.kind === "recharge") {
        abilityUses = Math.min(player.abilityUses || 3, abilityUses + (choice.power || 1));
        commandButtons.find(b => b.dataset.command === "ability").querySelector("small").textContent = `残り${abilityUses}回`;
        dialogue(`${choice.name}を使用。能力使用回数が${choice.power || 1}回復した。`);
      } else if (choice.kind === "guard") {
        incomingDamageScale = Math.max(0.1, 1 - (choice.power || 0.5));
        dialogue(`${choice.name}を使用。次の被ダメージを軽減する。`);
      } else if (choice.kind === "boost") {
        boosted = true;
        boostMultiplier = choice.power || 1.6;
        dialogue(`${choice.name}を使用。次の攻撃が強化された。`);
      }
      hpUI();
      note(`${choice.name}：残り${choice.count}個`);
      itemButtonLabel();
      turnTimer = setTimeout(enemyTurn, 900);
    } else if (cmd === "ability") {
      if (abilityUses <= 0) { phase = "menu"; setCommandsEnabled(true); return; }
      abilityUses--;
      const abilityButton = commandButtons.find(b => b.dataset.command === "ability");
      abilityButton.querySelector("small").textContent = `残り${abilityUses}回`;
      if (player.id === "hanamori_suzune") {
        counterNextTurn = true;
        enemyDamage(60);
        if (phase === "result") return;
        if (enemy.lastMirrorReflected) { turnTimer = setTimeout(enemyTurn, 700); return; }
        dialogue("「花森鈴音の能力！ 花弁の螺旋で、周囲の弾幕を打ち消すよ！」");
        note("能力発動 // 敵に固定60ダメージ！ 次の敵ターン開始から15秒間、螺旋花弁弾で敵弾を相殺する。");
      } else if (player.abilityId === "souka_blink") {
        const x = soul.x < 0.5 ? 0.82 : 0.18;
        const y = soul.y > 0.56 ? 0.36 : 0.78;
        positionSoul(x, y);
        hitCooldown = 760;
        setTimeout(() => { hitCooldown = 0; }, 760);
        dialogue("「電迅・刹那。……ここにいる」");
        note("雷光転位 // 安全地帯へ移動し、約0.76秒間の被弾を防いだ。");
      } else if (player.abilityId === "yuzu_tempo") {
        nextEnemySpeedScale = 0.62;
        controlScale = 1.34;
        clearTimeout(controlTimer);
        controlTimer = setTimeout(() => { controlScale = 1; }, 9000);
        dialogue("「テンポジャック♡ ほらほら、ついてこれる〜？」");
        note("速度操作 // 次の敵弾速を38%低下。ハートの移動速度も一時上昇。");
      } else if (player.abilityId === "koharu_flashcut") {
        const removed = engine ? engine.clearBulletsNear(soul.x, soul.y, Math.min(engine.w, engine.h) * 0.27) : 0;
        enemyDamage(24);
        if (phase === "result") return;
        if (enemy.lastMirrorReflected) { turnTimer = setTimeout(enemyTurn, 700); return; }
        dialogue("「残雷・瞬断！」");
        note(`瞬間斬撃 // 周囲の弾幕${removed}個を切り払い、敵に固定24ダメージ。`);
      }
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

  function itemButtonLabel() {
    const itemButton = commandButtons.find(b => b.dataset.command === "item");
    const remaining = (player.items || []).reduce((sum, item) => sum + item.count, 0);
    itemButton.querySelector("small").textContent = remaining > 0 ? `特殊アイテム ${remaining}` : "所持品なし";
  }

  function startHeartAI() {
    if (heartAiTimer) clearInterval(heartAiTimer);
    let target = {x:0.5,y:0.76};
    let changeAt = performance.now() + 500;
    heartAiTimer = setInterval(() => {
      if (!enemyMode || phase !== "dodge") return;
      const now = performance.now();
      if (now >= changeAt) {
        target = {x:0.1 + Math.random() * 0.8, y:0.52 + Math.random() * 0.38};
        changeAt = now + 420 + Math.random() * 620;
      }
      positionSoul(soul.x + (target.x - soul.x) * 0.11, soul.y + (target.y - soul.y) * 0.11);
    }, 42);
  }

  function stopHeartAI() {
    if (heartAiTimer) clearInterval(heartAiTimer);
    heartAiTimer = null;
  }

  function startEnemyModeAttack() {
    if (!enemyMode || phase !== "menu") return;
    phase = "dodge";
    setCommandsEnabled(false);
    $("commandPanel").style.display = "none";
    $("joystick").style.display = "none";
    const level = Math.min(2, Math.floor(enemyModeAttackCount / 3));
    let patterns;
    if (player.randomBoss) {
      const source = selectLuckySource();
      patterns = source ? allCharacterPatterns(source) : ["heart_note"];
      dialogue(`「運命の弾幕を選ぶ……${source?.name || "未知の敵"}！」`);
    } else if (player.phasePatterns) {
      const phaseIndex = Math.min(player.phasePatterns.length - 1, enemyModeAttackCount);
      patterns = enemyModeAttackCount >= player.phasePatterns.length
        ? [...(player.finalPatterns || [])]
        : [...(player.phasePatterns[phaseIndex] || player.phasePatterns[0])];
    } else {
      patterns = enemyPatternPool(level, player);
    }
    const pool = patterns.length ? patterns : ["heart_note"];
    let previous = null;
    const duration = 7200 + level * 850;
    const selector = ids => {
      const choices = ids.length > 1 ? ids.filter(id => id !== previous) : ids;
      previous = choices[Math.floor(Math.random() * choices.length)] || ids[0];
      return previous;
    };
    if (!player.randomBoss) dialogue(`「${player.name}の弾幕、展開開始！」`);
    note(`ENEMY MODE // ${player.name}を操作中。逃げるハートを狙え。攻撃${enemyModeTurnsRemaining}回目。`);
    engine.start(pool, difficulty, duration, () => soul, level, {
      densityScale:1.04, speedScale:1.04, damageScale:1.12,
      patternSelector:selector, movementGetter:movementProfile
    });
    startHeartAI();
    turnTimer = setTimeout(() => {
      if (phase !== "dodge") return;
      engine.stop();
      stopHeartAI();
      phase = "menu";
      enemyModeAttackCount++;
      enemyModeTurnsRemaining--;
      $("commandPanel").style.display = "grid";
      $("enemyRank").textContent = `TARGET // 逃走HP ${enemy.hp}・攻撃残り${enemyModeTurnsRemaining}回`;
      setCommandsEnabled(true);
      if (enemy.hp <= 0) { finish(true); return; }
      if (enemyModeTurnsRemaining <= 0) { finish(false); return; }
      dialogue("ハートはまだ逃げ続けている……。");
      note(`攻撃終了 // 逃走HP ${enemy.hp} / ${enemy.maxHp}。残り攻撃回数：${enemyModeTurnsRemaining}`);
    }, duration + 150);
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

  function updateModeControls() {
    refreshEnemyModeUnlock();
    const mode = $("modeSelect").value;
    const duo = mode === "duo";
    const isEnemyMode = mode === "enemy";
    $("soloEnemyControl").style.display = mode === "solo" ? "flex" : "none";
    $("duoEnemyControls").style.display = duo ? "flex" : "none";
    $("enemyModeControls").style.display = isEnemyMode ? "flex" : "none";
    $("playerControl").style.display = isEnemyMode ? "none" : "flex";
  }
  function preventDuplicateDuoChoice(changedId) {
    const changed = $(changedId), other = $(changedId === "duoEnemyA" ? "duoEnemyB" : "duoEnemyA");
    if (changed.value !== other.value) return;
    const alternative = [...other.options].find(option => option.value !== changed.value);
    if (alternative) other.value = alternative.value;
  }
  $("modeSelect").addEventListener("change", updateModeControls);
  $("duoEnemyA").addEventListener("change", () => preventDuplicateDuoChoice("duoEnemyA"));
  $("duoEnemyB").addEventListener("change", () => preventDuplicateDuoChoice("duoEnemyB"));
  updateModeControls();
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
