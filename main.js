(() => {
  const $=id=>document.getElementById(id);
  const screens={title:$("titleScreen"),battle:$("battleScreen"),result:$("resultScreen")};
  let player,enemy,difficulty,engine,phase="menu",touchMode="drag",soul={x:.5,y:.76},hitCooldown=0,boosted=false,turnTimer=null,soundOn=false;
  const canvas=$("bulletCanvas"),arena=$("dodgeArena"),soulEl=$("soul");
  function show(name){Object.values(screens).forEach(s=>s.classList.remove("active"));screens[name].classList.add("active");}
  function setText(id,t){$(id).textContent=t;}
  function hpUI(){
    setText("playerHpText",`${Math.max(0,player.hp)} / ${player.maxHp}`);$("playerHpBar").style.width=`${Math.max(0,player.hp)/player.maxHp*100}%`;
    setText("enemyHpText",`${Math.max(0,enemy.hp)} / ${enemy.maxHp}`);$("enemyHpBar").style.width=`${Math.max(0,enemy.hp)/enemy.maxHp*100}%`;
  }
  function note(t){setText("statusNote",t);}
  function dialogue(t){setText("dialogue",t);}
  function positionSoul(x,y){soul.x=Math.max(.035,Math.min(.965,x));soul.y=Math.max(.06,Math.min(.94,y));soulEl.style.left=(soul.x*100)+"%";soulEl.style.top=(soul.y*100)+"%";}
  function resetBattle(){
    player=structuredClone(BW_DATA.characters[$("playerSelect").value]);enemy=structuredClone(BW_DATA.characters.photo_candray);
    difficulty=BW_DATA.difficulties[$("difficultySelect").value];phase="menu";hitCooldown=0;boosted=false;
    setText("playerName",player.name);setText("playerRank","#"+player.rank);setText("enemyName",enemy.name);
    positionSoul(.5,.76);hpUI();note("鈴音は鈴蛇薔薇を構えた。");dialogue(enemy.intro);
    $("commandPanel").style.display="grid";$("joystick").style.display="none";$("arenaHint").textContent="敵のターンで弾幕を回避しよう";
  }
  function start(){
    resetBattle();show("battle");
    engine=new BulletEngine(canvas,arena,damage=>{if(phase!=="dodge"||hitCooldown>0)return;player.hp=Math.max(0,player.hp-Math.max(1,Math.round(damage)));hitCooldown=450;setTimeout(()=>hitCooldown=0,450);hpUI();note("弾幕に触れた！");if(player.hp<=0)finish(false);});
  }
  function enemyTurn(){
    if(player.hp<=0||enemy.hp<=0)return;
    phase="dodge";$("commandPanel").style.display="none";$("joystick").style.display=touchMode==="stick"?"block":"none";
    dialogue(enemy.intro);note("敵の攻撃！ 魂を操作して回避しよう。");
    const ids=enemy.patterns;engine.start(ids,difficulty,difficulty.turnMs,()=>soul);
    turnTimer=setTimeout(()=>{if(phase==="dodge"){engine.stop();$("joystick").style.display="none";phase="menu";$("commandPanel").style.display="grid";dialogue("攻撃をしのいだ。");note("鈴音のターン。行動を選ぼう。");}},difficulty.turnMs+100);
  }
  function finish(win){
    if(engine)engine.stop();clearTimeout(turnTimer);phase="result";show("result");
    setText("resultTitle",win?"VICTORY":"DEFEAT");
    setText("resultText",win?"フォトとの戦闘を終えた。これはプロトタイプの仮エンディングです。":"鈴音は戦闘を続けられなくなった。難易度を下げて再挑戦してみよう。");
  }
  function enemyDamage(amount){enemy.hp=Math.max(0,enemy.hp-amount);hpUI();if(enemy.hp<=0){finish(true);return true;}return false;}
  function playerAction(cmd){
    if(phase!=="menu")return;
    if(cmd==="fight"){
      const dmg=Math.round(player.attack*difficulty.playerDamage*(boosted?1.6:1));boosted=false;
      enemyDamage(dmg);if(phase==="result")return;
      dialogue(`鈴音の攻撃！ ${dmg} ダメージ。`);note("攻撃が命中した。");setTimeout(enemyTurn,700);
    }else if(cmd==="act"){
      dialogue("フォト・キャンドレイ：音と道を操るドミナント。ボスへの執着は本心か、演技か……。");
      note("相手の情報を確認した。");setTimeout(()=>{if(phase==="menu")enemyTurn();},1200);
    }else if(cmd==="item"){
      const usable=player.items.filter(i=>i.count>0);
      if(!usable.length){dialogue("使える薬品がない。");return;}
      const choice=usable.find(i=>i.kind==="heal"&&player.hp<player.maxHp)||usable[0];
      choice.count--;
      if(choice.kind==="heal"){const old=player.hp;player.hp=Math.min(player.maxHp,player.hp+choice.power);dialogue(`${choice.name}を使用。HPが${player.hp-old}回復した。`);}
      else if(choice.kind==="damage"){enemyDamage(choice.power);dialogue(`${choice.name}を使用。フォトに${choice.power}ダメージ。`);if(phase==="result")return;}
      else{boosted=true;dialogue("身体強化薬を使用。次の攻撃が強化された。");}
      hpUI();note(`${choice.name}：残り${choice.count}個`);setTimeout(enemyTurn,900);
    }else if(cmd==="mercy"){
      dialogue("鈴音は武器を下ろした。フォトは不思議そうに首を傾げている。");
      note("この試作版ではMERCYで戦闘を終了できる。");setTimeout(()=>finish(true),900);
    }
  }
  // Drag control: pointer events work with finger, mouse and stylus.
  let dragging=false;
  function pointerMove(e){if(!dragging||phase!=="dodge")return;const r=arena.getBoundingClientRect();positionSoul((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);}
  arena.addEventListener("pointerdown",e=>{if(phase!=="dodge")return;dragging=true;arena.setPointerCapture(e.pointerId);pointerMove(e);});
  arena.addEventListener("pointermove",pointerMove);arena.addEventListener("pointerup",()=>dragging=false);arena.addEventListener("pointercancel",()=>dragging=false);
  // Virtual joystick.
  const joy=$("joystick"),knob=$("stickKnob");let joyPointer=null;
  joy.addEventListener("pointerdown",e=>{if(phase!=="dodge")return;joyPointer=e.pointerId;joy.setPointerCapture(e.pointerId);moveJoy(e);});
  joy.addEventListener("pointermove",e=>{if(e.pointerId===joyPointer)moveJoy(e);});
  function moveJoy(e){const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=e.clientX-cx,dy=e.clientY-cy,len=Math.hypot(dx,dy),max=29;if(len>max){dx=dx/len*max;dy=dy/len*max;}knob.style.left=(29+dx)+"px";knob.style.top=(29+dy)+"px";const ar=arena.getBoundingClientRect();positionSoul(soul.x+dx/max*.018,soul.y+dy/max*.018);}
  function resetJoy(){joyPointer=null;knob.style.left="28px";knob.style.top="28px";}
  joy.addEventListener("pointerup",resetJoy);joy.addEventListener("pointercancel",resetJoy);
  $("startBtn").addEventListener("click",start);
  $("commandPanel").addEventListener("click",e=>{const b=e.target.closest("[data-command]");if(b)playerAction(b.dataset.command);});
  $("backToTitle").addEventListener("click",()=>{if(engine)engine.stop();clearTimeout(turnTimer);show("title");});
  $("retryBtn").addEventListener("click",start);$("resultTitleBtn").addEventListener("click",()=>show("title"));
  $("soundToggle").addEventListener("click",()=>{soundOn=!soundOn;$("soundToggle").textContent=`♪ SOUND: ${soundOn?"ON":"OFF"}`;});
  // Optional control-mode toggle by tapping the arena hint.
  $("arenaHint").addEventListener("click",()=>{touchMode=touchMode==="drag"?"stick":"drag";$("arenaHint").textContent=touchMode==="drag"?"指でなぞる / スティックで移動":"仮想スティックで移動";});
  $("difficultySelect").addEventListener("change",()=>{});
  show("title");
})();
