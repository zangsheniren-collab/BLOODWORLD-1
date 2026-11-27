# BLOODWORLD // BULLET HELL — UPDATE 0.5

スマートフォン向けオフライン弾幕バトル試作版。全ファイルをGitHubリポジトリ直下へ置く構成です。

## 今回の更新
- プレイヤーのハート表示と当たり判定を小型化。
- 敵キャラクターにニトロ（偽名）を追加。ドローン弾幕、支援パルス、予告円の後に広がる時間差弾幕を使用します。
- 敵キャラクターに花森 鈴音を追加。HPが30%以下になると一度だけ最大HPまで回復します。
- 鈴音はプレイヤーの現在位置や直近の移動方向に応じて弾幕を変化させ、最終段階では移動方向を予測する攻撃を使用します。

## GitHubへの反映
ZIPを展開し、中のファイルをすべてリポジトリ直下へアップロードしてください。同名ファイルは上書きし、新しいJSONファイルを追加します。

## ファイル
index.html / style.css / data.js / engine.js / main.js
hanamori_suzune.json / hanamori_suzune_enemy.json / hanna_milly.json
photo_candray.json / nohr_solphonsh.json / merli_arl.json / nitro.json
README.md / .nojekyll

これはプロトタイプです。敵の弾幕の速度・間隔・当たり判定などはプレイテスト後に調整してください。
