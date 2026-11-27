/* キャラクター・難易度・弾幕の追加は原則このデータを編集します。 */
window.BW_DATA = {
  difficulties: {
    easy:   { label:"EASY",   bulletSpeed:0.72, bulletCount:0.72, enemyDamage:0.7, playerDamage:1.25, turnMs:8800, phaseBonusMs:650 },
    normal: { label:"NORMAL", bulletSpeed:1,    bulletCount:1,    enemyDamage:1,   playerDamage:1,    turnMs:10000, phaseBonusMs:850 },
    hard:   { label:"HARD",   bulletSpeed:1.22, bulletCount:1.3,  enemyDamage:1.2, playerDamage:0.9,  turnMs:10500, phaseBonusMs:950 },
    insane: { label:"INSANE", bulletSpeed:1.48, bulletCount:1.65,enemyDamage:1.45,playerDamage:0.78, turnMs:11000, phaseBonusMs:1050 }
  },
  characters: {
    hanamori_suzune: {
      id:"hanamori_suzune", name:"花森 鈴音", role:"player", rank:"ロード",
      hp:80, maxHp:80, attack:18, color:"#a9e99b", image:null,
      title:"植物を統治する者",
      intro:"「私が助けてあげるから！ 平気だよ！」",
      description:"植物と薬品を扱う、自由奔放なロード。",
      items:[
        {id:"heal",name:"回復薬大",count:2,kind:"heal",power:28,description:"HPを28回復する"},
        {id:"poison",name:"毒薬大",count:2,kind:"damage",power:22,description:"敵に追加ダメージ"},
        {id:"boost",name:"身体強化薬",count:2,kind:"boost",power:1,description:"次の攻撃を強化"},
        {id:"drink",name:"栄養ドリンク",count:2,kind:"heal",power:12,description:"HPを12回復する"}
      ],
      patterns:["petal_fan","vine_wave","pollen_ring"]
    },
    hanna_milly: {
      id:"hanna_milly", name:"ハンナ・ミリー", role:"player", rank:"スレイブ",
      hp:38, maxHp:38, attack:7, color:"#f4efff", image:null,
      title:"歩くデザート",
      intro:"「ひっ……ミリー、獲物じゃないのです……！」",
      description:"空気中の魔力を吸収して血へ変換する体質。戦闘能力は低く、回復薬も持たない。",
      items:[],
      patterns:["sugar_drift","pale_pulse"],
      passive:"魔力変換体質",
      actName:"香りを隠す",
      actDescription:"次の敵ターンに受けるダメージを少しだけ軽減する。",
      actReduction:0.82
    },
    photo_candray: {
      id:"photo_candray", name:"フォト・キャンドレイ", role:"enemy", rank:"ドミナント",
      hp:120, maxHp:120, attack:8, color:"#f2a9df", image:null,
      title:"誘いの道化師",
      intro:"「ウティと楽しく過ごすのよ！」",
      description:"音・道・心理干渉を操る、甘く妖しい道化師。",
      patterns:["heart_note","false_path","candy_spiral","sound_wave"],
      patternsMid:["candy_rain","cross_candy","sweep_notes"],
      patternsFinal:["zigzag_lane","orbit_candy","heart_storm","wide_fan"]
    },
    merli_arl: {
      id:"merli_arl", name:"メルリ・アール", role:"enemy", rank:"ロード",
      hp:360, maxHp:360, attack:18, color:"#72d9ee", image:null,
      title:"一縷の罪",
      intro:"「水族館に残された子たちに、一縷の罪も無いのだから。」",
      description:"AqoursLinkを率いる水族館『深海ノア』の館長。水流・水泡・深海生物を思わせる多彩な攻撃を操る。",
      turnMs:18500, phaseBonusMs:2600,
      patterns:["aqua_bubble","tide_sweep","current_vortex","fin_cutter"],
      patternsMid:["shockwave_ring","deep_laser","undertow_pull","dolphin_rush","aqua_bubble"],
      patternsFinal:["abyss_laser","tidal_cutter","double_vortex","leviathan_beam","shockwave_ring","deep_laser"]
    },
    nohr_solphonsh: {
      id:"nohr_solphonsh", name:"ノール・ソルフォンシュ", role:"enemy", rank:"ロード",
      hp:220, maxHp:220, attack:16, color:"#9bc8ff", image:null,
      title:"死を越えた伝説",
      intro:"「貴様らが人だと講釈を垂れるならば、せめて人らしく無様に抗って見せろ。」",
      description:"青い長髪を後ろで束ね、黒い衣服と汚れた旅人のローブ、銀色の装飾を纏うロード。強者には礼を尽くすが、弱者には傲慢。",
      quote:"「それが貴様らの生き様だ。違うか？」",
      patterns:["sword_rain","spear_line","blade_cross"],
      patternsMid:["spear_track","sword_fan","blade_rain","spear_ring"],
      patternsFinal:["sword_storm","spear_hunt","blade_cross_final","nohr_finisher"],
      specialFinisher:true
    }
  },
  patterns: {
    heart_note:{name:"恋の道化師",type:"aimed",color:"#ff80c5",shape:"heart",count:3,speed:2.0,damage:7,interval:650},
    false_path:{name:"偽道",type:"lane",color:"#f5d77b",shape:"diamond",count:3,speed:1.5,damage:8,interval:800},
    candy_spiral:{name:"飴色螺旋",type:"spiral",color:"#9edfff",shape:"diamond",count:3,speed:1.7,damage:6,interval:650},
    sound_wave:{name:"歌の道化師",type:"wave",color:"#d9a6ff",shape:"note",count:4,speed:1.9,damage:6,interval:760},
    petal_fan:{name:"花弁の散弾",type:"fan",color:"#f5d77b",shape:"orb",count:5,speed:1.8,damage:5,interval:650},
    vine_wave:{name:"蔦の波",type:"wave",color:"#8fe0a0",shape:"note",count:4,speed:1.6,damage:5,interval:760},
    pollen_ring:{name:"花粉の輪",type:"spiral",color:"#d4f6a0",shape:"diamond",count:3,speed:1.5,damage:4,interval:700},
    candy_rain:{name:"キャンディ・レイン",type:"rain",color:"#ff9cca",shape:"heart",count:8,speed:1.55,damage:5,interval:900},
    cross_candy:{name:"交差する飴玉",type:"cross",color:"#f8d77e",shape:"diamond",count:5,speed:1.8,damage:7,interval:1000},
    sweep_notes:{name:"音符の掃射",type:"sweep",color:"#c7a5ff",shape:"note",count:6,speed:1.75,damage:6,interval:850},
    zigzag_lane:{name:"ジグザグ・ロード",type:"zigzag",color:"#8fe5ff",shape:"diamond",count:6,speed:1.7,damage:6,interval:850},
    orbit_candy:{name:"オービット・キャンディ",type:"ring",color:"#ffb6dc",shape:"heart",count:9,speed:1.65,damage:7,interval:1050},
    heart_storm:{name:"ハート・ストーム",type:"burst",color:"#ff6faf",shape:"heart",count:11,speed:1.95,damage:7,interval:900},
    wide_fan:{name:"大広角ファン",type:"fan",color:"#f5d77b",shape:"diamond",count:9,speed:1.85,damage:6,interval:760},
    sword_rain:{name:"剣雨",type:"rain",color:"#a9d5ff",shape:"sword",count:8,speed:2.0,damage:8,interval:760},
    spear_line:{name:"槍列",type:"lane",color:"#d8e8ff",shape:"spear",count:5,speed:2.25,damage:9,interval:920},
    blade_cross:{name:"交差剣閃",type:"cross",color:"#8bbcff",shape:"sword",count:6,speed:2.15,damage:9,interval:850},
    spear_track:{name:"追尾槍",type:"aimed",color:"#d7e6ff",shape:"spear",count:4,speed:2.05,damage:9,interval:680},
    sword_fan:{name:"剣閃扇",type:"fan",color:"#9bc8ff",shape:"sword",count:9,speed:2.25,damage:8,interval:700,spread:0.24},
    blade_rain:{name:"銀刃の雨",type:"rain",color:"#d7e4f5",shape:"sword",count:12,speed:2.25,damage:8,interval:680},
    spear_ring:{name:"槍環",type:"ring",color:"#a9cfff",shape:"spear",count:12,speed:2.0,damage:9,interval:820},
    sword_storm:{name:"剣嵐",type:"burst",color:"#8fc0ff",shape:"sword",count:15,speed:2.65,damage:10,interval:620},
    spear_hunt:{name:"追跡槍群",type:"aimed",color:"#e2edff",shape:"spear",count:7,speed:2.5,damage:10,interval:560},
    blade_cross_final:{name:"終端交差",type:"cross",color:"#7aaeff",shape:"sword",count:10,speed:2.7,damage:10,interval:620},
    nohr_finisher:{name:"死を越えた一閃",type:"fan",color:"#e7f1ff",shape:"spear",count:13,speed:2.8,damage:10,interval:780,spread:0.3},

    sugar_drift:{name:"淡雪の魔力",type:"wave",color:"#f7efff",shape:"orb",count:3,speed:1.2,damage:4,interval:900},
    pale_pulse:{name:"かすかな脈動",type:"spiral",color:"#d9d2ef",shape:"diamond",count:2,speed:1.05,damage:3,interval:1150},

    aqua_bubble:{name:"水泡の群れ",type:"rain",color:"#75e5f2",shape:"orb",count:12,speed:1.55,damage:7,interval:820},
    tide_sweep:{name:"満ち潮の掃射",type:"sweep",color:"#55cfe5",shape:"diamond",count:10,speed:1.8,damage:8,interval:900},
    current_vortex:{name:"潮流渦",type:"vortex",color:"#4cc7df",shape:"orb",count:16,speed:1.65,damage:8,interval:1000},
    fin_cutter:{name:"尾鰭のカッター",type:"cutter",color:"#a1f2f5",shape:"sword",count:7,speed:2.0,damage:9,interval:980},
    shockwave_ring:{name:"潮界・衝撃波",type:"shockwave",color:"#d0fbff",shape:"ring",count:16,speed:2.1,damage:9,interval:1150},
    deep_laser:{name:"深海レーザー",type:"laser",color:"#4deaff",count:2,speed:0,damage:10,interval:1500,width:18},
    undertow_pull:{name:"引き潮",type:"vortex",color:"#3c9dbb",shape:"diamond",count:20,speed:1.35,damage:8,interval:900},
    dolphin_rush:{name:"深海の突進",type:"cutter",color:"#79eaff",shape:"spear",count:11,speed:2.25,damage:10,interval:850},
    abyss_laser:{name:"深淵の奔流",type:"laser",color:"#b4fbff",count:3,speed:0,damage:11,interval:1050,width:28},
    tidal_cutter:{name:"潮汐カッター",type:"cutter",color:"#d5ffff",shape:"sword",count:13,speed:2.45,damage:10,interval:720},
    double_vortex:{name:"二重潮流",type:"vortex",color:"#44c8e7",shape:"orb",count:24,speed:1.95,damage:9,interval:760},
    leviathan_beam:{name:"龍宮の光条",type:"laser",color:"#8defff",count:1,speed:0,damage:12,interval:1250,width:42}
  }
};
