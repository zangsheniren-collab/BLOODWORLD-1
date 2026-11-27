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
    photo_candray: {
      id:"photo_candray", name:"フォト・キャンドレイ", role:"enemy", rank:"ドミナント",
      hp:120, maxHp:120, attack:8, color:"#f2a9df", image:null,
      title:"誘いの道化師",
      intro:"「ウティと楽しく過ごすのよ！」",
      description:"音・道・心理干渉を操る、甘く妖しい道化師。",
      patterns:["heart_note","false_path","candy_spiral","sound_wave"],
      patternsMid:["candy_rain","cross_candy","sweep_notes"],
      patternsFinal:["zigzag_lane","orbit_candy","heart_storm","wide_fan"]
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
    wide_fan:{name:"大広角ファン",type:"fan",color:"#f5d77b",shape:"diamond",count:9,speed:1.85,damage:6,interval:760}
  }
};
