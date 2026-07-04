/**
 * 2D対戦ギアゲーム『Spinning Crush』システム定義 & コアロジック
 */

// ==========================================
// 1. データモデル型定義（完全日本語キー）
// ==========================================

export interface 概要データ {
  キー: string;
  値: string;
}

export interface UI遷移データ {
  画面名: string;
  説明: string;
}

export interface ステージマスタ行 {
  ステージID: string;
  ステージ名: string;
  解放条件: string;
  ガチャ解禁: string;
  フレーバー: string;
  メモ?: string;
}

export interface ステータスデータ {
  項目: string;
  内容: string;
}

export interface バトルデータ {
  設定名: string;
  数値: string;
}

export interface ドロップデータ {
  設定名: string;
  数値: string;
}

export interface チップマスタ行 {
  チップID: string;
  チップ名: string;
  画像ID: string;
  レベル2奥義ID: string;
  レベル3奥義ID: string;
  レベル4奥義ID: string;
  レベル5奥義ID: string;
  フレーバー: string;
}

export interface 奥義マスタ行 {
  奥義ID: string;
  奥義名: string;
  奥義種別: string; // "1":攻撃・弱, "2":攻撃・強, "3":防御, "4":回避, "5":カウンター
  消費攻撃ゲージ: string;
  消費奥義ゲージ: string;
  効果量: string;
  フレーバー: string;
  対応ギアメモ: string;
  メモ: string;
  種別メモ: string;
}

export interface パーツマスタ行 {
  パーツID: string;
  パーツ名: string;
  種別: string; // "1":ブレード, "2":ウェイト, "3":ソール
  画像ID: string;
  ランク: string;
  属性: string; // "火", "風", "土", "水", "無"
  ライフ: string;
  アタック: string;
  ディフェンス: string;
  スピード: string;
  レンジ: string;
  モビリティ: string;
  フレーバー: string;
  ステ確認: string;
  メモ: string;
}

export interface エネミーマスタ行 {
  エネミーID: string;
  エネミー名: string;
  イラストID: string;
  登場ステージID: string;
  並び順: string;
  ボスフラグ: string; // "1" or "0"
  チップID: string;
  ブレードID: string;
  ウェイトID: string;
  ソールID: string;
  AI難易度?: string;
  AI性格?: string;
  クリア必要勝利数?: string;
}

export interface システムNPCマスタ行 {
  システムNPCID: string;
  システムNPC名: string;
  イラストID: string;
  役割メモ: string;
}

export interface セリフマスタ行 {
  TEXT_ID: string;
  テキスト内容: string;
}

export interface シナリオマスタ行 {
  シナリオID: string;
  ステップ: string;
  話者名: string;
  イラストID: string;
  立ち位置: string;
  テキスト: string;
  演出: string;
}

/**
 * ロジックAで出力・引き渡されるアセンブルデータ形式
 */
export interface アセンブルデータ {
  ステータス: {
    ライフ: number;
    アタック: number;
    ディフェンス: number;
    スピード: number;
    レンジ: number;
    モビリティ: number;
  };
  部位属性: {
    ブレード: string;
    ウェイト: string;
    ソール: string;
  };
  装備ID: {
    チップ: string;
    ブレード: string;
    ウェイト: string;
    ソール: string;
  };
  解放奥義: string[];
}

// 属性の四すくみ相性判定
// 戻り値: 1 (勝者), -1 (敗者), 0 (互角/無)
export function 属性相性判定(属性A: string, 属性B: string): number {
  if (属性A === "無" || 属性B === "無") return 0;
  if (属性A === 属性B) return 0;

  // 四すくみ: 火 -> 風 -> 土 -> 水 -> 火
  const 相性マップ: { [key: string]: string } = {
    "火": "風",
    "風": "土",
    "土": "水",
    "水": "火"
  };

  if (相性マップ[属性A] === 属性B) {
    return 1; // 属性Aの勝ち
  }
  if (相性マップ[属性B] === 属性A) {
    return -1; // 属性Aの負け
  }
  return 0;
}

// ==========================================
// 2. 【ロジックA】 アセンブル管理関数
// ==========================================

export function アセンブル実行(
  チップID: string,
  ブレードID: string,
  ウェイトID: string,
  ソールID: string,
  チップレベル: number,
  パーツマスタ: パーツマスタ行[],
  チップマスタ: チップマスタ行[],
  奥義マスタ: 奥義マスタ行[]
): アセンブルデータ {
  // パーツ検索 (IDは厳格に文字列比較)
  const ブレードパーツ = パーツマスタ.find(p => p.パーツID === ブレードID);
  const ウェイトパーツ = パーツマスタ.find(p => p.パーツID === ウェイトID);
  const ソールパーツ = パーツマスタ.find(p => p.パーツID === ソールID);

  if (!ブレードパーツ || !ウェイトパーツ || !ソールパーツ) {
    throw new Error(`指定されたパーツが見つかりません。ブレード:${ブレードID}, ウェイト:${ウェイトID}, ソール:${ソールID}`);
  }

  const チップパーツ = チップマスタ.find(c => c.チップID === チップID);
  if (!チップパーツ) {
    throw new Error(`指定されたチップが見つかりません。チップ:${チップID}`);
  }

  // ステータス合算 (SUM)
  const ステータス = {
    ライフ: Number(ブレードパーツ.ライフ || 0) + Number(ウェイトパーツ.ライフ || 0) + Number(ソールパーツ.ライフ || 0),
    アタック: Number(ブレードパーツ.アタック || 0) + Number(ウェイトパーツ.アタック || 0) + Number(ソールパーツ.アタック || 0),
    ディフェンス: Number(ブレードパーツ.ディフェンス || 0) + Number(ウェイトパーツ.ディフェンス || 0) + Number(ソールパーツ.ディフェンス || 0),
    スピード: Number(ブレードパーツ.スピード || 0) + Number(ウェイトパーツ.スピード || 0) + Number(ソールパーツ.スピード || 0),
    レンジ: Number(ブレードパーツ.レンジ || 0) + Number(ウェイトパーツ.レンジ || 0) + Number(ソールパーツ.レンジ || 0),
    モビリティ: Number(ブレードパーツ.モビリティ || 0) + Number(ウェイトパーツ.モビリティ || 0) + Number(ソールパーツ.モビリティ || 0),
  };

  // 部位属性
  const 部位属性 = {
    ブレード: ブレードパーツ.属性 || "無",
    ウェイト: ウェイトパーツ.属性 || "無",
    ソール: ソールパーツ.属性 || "無",
  };

  // 装備ID
  const 装備ID = {
    チップ: チップID,
    ブレード: ブレードID,
    ウェイト: ウェイトID,
    ソール: ソールID,
  };

  // 解放奥義の判定
  const 解放奥義: string[] = [];
  if (チップレベル >= 2 && チップパーツ.レベル2奥義ID) {
    解放奥義.push(チップパーツ.レベル2奥義ID);
  }
  if (チップレベル >= 3 && チップパーツ.レベル3奥義ID) {
    解放奥義.push(チップパーツ.レベル3奥義ID);
  }
  if (チップレベル >= 4 && チップパーツ.レベル4奥義ID) {
    解放奥義.push(チップパーツ.レベル4奥義ID);
  }
  if (チップレベル >= 5 && チップパーツ.レベル5奥義ID) {
    解放奥義.push(チップパーツ.レベル5奥義ID);
  }

  // 奥義マスタに存在する有効な奥義IDのみにフィルタリング
  const 有効な解放奥義 = 解放奥義.filter(id => id && id.trim() !== "" && 奥義マスタ.some(o => o.奥義ID === id));

  return {
    ステータス,
    部位属性,
    装備ID,
    解放奥義: 有効な解放奥義
  };
}

export class バトル更新マネージャー {
  // 状態変数
  public プレイヤーギア: アセンブルデータ;
  public エネミーギア: アセンブルデータ;

  public エネミーAI難易度: number = 2;
  public エネミーAI性格: string = "バランス";
  
  public プレイヤーライフ: number;
  public エネミーライフ: number;
  
  // 2D座標・速度ベクトル
  public プレイヤー位置X: number;
  public プレイヤー位置Y: number;
  public プレイヤー速度X: number = 0;
  public プレイヤー速度Y: number = 0;

  public エネミー位置X: number;
  public エネミー位置Y: number;
  public エネミー速度X: number = 0;
  public エネミー速度Y: number = 0;
  
  public プレイヤー攻撃ゲージ: number = 0;
  public エネミー攻撃ゲージ: number = 0;
  public プレイヤー奥義ゲージ: number = 0;
  public エネミー奥義ゲージ: number = 0;

  public 現在フェーズ: "ディスタンス" | "コマンド" = "ディスタンス";
  public スピンロス経過フレーム数: number = 0;
  public 攻撃側: "プレイヤー" | "エネミー" | null = null;

  // 衝突判定通信用フラグ
  public isJustCollided: boolean = false;
  public collisionX: number = 0;
  public collisionY: number = 0;

  // 定数定義 (GBAベイブレード風物理 & バトル設計書)
  private readonly 基礎移動速度 = 2.5;
  private readonly 移動速度モビリティ係数 = 0.015;
  private readonly スピンロス秒数フレーム = 60; // 60フレーム＝1秒
  private readonly スピンロスダメージ = 2;

  private readonly スタジアム中心X = 400;
  private readonly スタジアム中心Y = 300;
  private readonly スタジアム半径 = 250;
  private readonly ギア半径 = 25;
  private readonly 摩擦係数 = 0.98;
  private readonly 反発係数 = 0.8;      // ギア同士の反発
  private readonly 壁反発係数 = 0.55;    // スタジアム壁との反発

  constructor(プレイヤーギア: アセンブルデータ, エネミーギア: アセンブルデータ) {
    this.プレイヤーギア = プレイヤーギア;
    this.エネミーギア = エネミーギア;
    
    this.プレイヤーライフ = プレイヤーギア.ステータス.ライフ;
    this.エネミーライフ = エネミーギア.ステータス.ライフ;
    
    // 初期攻撃ゲージを50%スタートに設定 (テンポ改善)
    this.プレイヤー攻撃ゲージ = 50;
    this.エネミー攻撃ゲージ = 50;
    
    // 円形スタジアムの左右に対面配置
    this.プレイヤー位置X = 250;
    this.プレイヤー位置Y = 300;
    
    this.エネミー位置X = 550;
    this.エネミー位置Y = 300;

    // 円形スタジアムを回り込むような接線方向の初期速度を付与 (ぐるぐる運動の初速)
    this.プレイヤー速度Y = -4.5;
    this.エネミー速度Y = 4.5;
  }

  // プレイヤーと敵の「間合い（直線距離）」を取得
  public get現在の間合い(): number {
    const dx = this.エネミー位置X - this.プレイヤー位置X;
    const dy = this.エネミー位置Y - this.プレイヤー位置Y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // モビリティ依存の移動速度計算
  public get移動速度(モビリティ: number): number {
    return this.基礎移動速度 + モビリティ * this.移動速度モビリティ係数;
  }

  // レンジ依存の判定サークル半径生成 (インフレ対策として減衰させる)
  public getレンジサークル半径(レンジ: number): number {
    // 初期レンジ103 -> 約78px、中期レンジ300 -> 約114px、最強レンジ700 -> 約186px
    return 60 + (レンジ * 0.18);
  }

  // 1フレームごとの更新処理
  public update(プレイヤー入力: "A" | "D" | "F" | null, _deltaTime: number = 16.67) {
    this.isJustCollided = false;

    if (this.現在フェーズ === "コマンド") {
      // コマンドフェーズ(静)中はゲーム時間は完全停止
      return;
    }

    const プレイヤー移動速度 = this.get移動速度(this.プレイヤーギア.ステータス.モビリティ);
    const エネミー移動速度 = this.get移動速度(this.エネミーギア.ステータス.モビリティ);

    // プレイヤーから見たエネミーへの方向ベクトル
    const dx = this.エネミー位置X - this.プレイヤー位置X;
    const dy = this.エネミー位置Y - this.プレイヤー位置Y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // --- ① プレイヤー操作による加速突撃/回避 ---
    if (dist > 0) {
      const dirX = dx / dist;
      const dirY = dy / dist;

      if (プレイヤー入力 === "D") {
        // 敵の方向に直線的に接近突撃 (直線加速を強化)
        this.プレイヤー速度X += dirX * 0.18 * プレイヤー移動速度;
        this.プレイヤー速度Y += dirY * 0.18 * プレイヤー移動速度;
      } else if (プレイヤー入力 === "A") {
        // 敵と反対方向に直線的に後退回避 (離脱加速を強化)
        this.プレイヤー速度X -= dirX * 0.22 * プレイヤー移動速度;
        this.プレイヤー速度Y -= dirY * 0.22 * プレイヤー移動速度;
      }
    }

    // --- ② 敵NPC of AI操作 (AI難易度1〜4に基づくフットワークAI) ---
    if (dist > 0) {
      const dirX = dx / dist;
      const dirY = dy / dist;
      
      // エネミーからプレイヤーへの時計回りの接線ベクトル
      const eTanX = dirY;
      const eTanY = -dirX;

      if (this.エネミーAI難易度 === 1) {
        // レベル1：のらりくらり接近（時々立ち止まる）
        const tick = Math.floor(this.エネミー攻撃ゲージ * 3) % 4;
        const isIdle = tick === 0; // 25%の確率で立ち止まる

        if (!isIdle) {
          // 通常の半分の速度でプレイヤーへ直進
          this.エネミー速度X += -dirX * 0.025 * エネミー移動速度;
          this.エネミー速度Y += -dirY * 0.025 * エネミー移動速度;
        }
      } 
      else if (this.エネミーAI難易度 === 3) {
        // レベル3：ゲージ管理型（溜まるまでは外周へ逃げ、溜まったら一直線に突撃）
        if (this.エネミー攻撃ゲージ < 100) {
          // 時計回りに回りつつ、外側（逃げる方向）へ後退
          this.エネミー速度X += (dirX * 0.08 + eTanX * 0.12) * エネミー移動速度;
          this.エネミー速度Y += (dirY * 0.08 + eTanY * 0.12) * エネミー移動速度;
        } else {
          // ゲージ満タン時：一直線に高速突撃
          this.エネミー速度X += -dirX * 0.18 * エネミー移動速度;
          this.エネミー速度Y += -dirY * 0.18 * エネミー移動速度;
        }
      } 
      else if (this.エネミーAI難易度 >= 4) {
        // レベル4以上：完全間合い管理（引き撃ち ➔ 満タン時超高速突撃）
        if (this.エネミー攻撃ゲージ < 100) {
          const pRange = this.getレンジサークル半径(this.プレイヤーギア.ステータス.レンジ);
          
          if (dist < pRange + 25) {
            // プレイヤーの射程内、またはギリギリ外側の場合：全力で後退して射程から逃れる
            this.エネミー速度X += (dirX * 0.22 + eTanX * 0.10) * エネミー移動速度;
            this.エネミー速度Y += (dirY * 0.22 + eTanY * 0.10) * エネミー移動速度;
          } else if (dist > pRange + 65) {
            // 離れすぎている場合：少し接近して距離を調整
            this.エネミー速度X += -dirX * 0.05 * エネミー移動速度;
            this.エネミー速度Y += -dirY * 0.05 * エネミー移動速度;
          } else {
            // 絶妙な距離：射程外をキープしながら高速旋回
            this.エネミー速度X += eTanX * 0.15 * エネミー移動速度;
            this.エネミー速度Y += eTanY * 0.15 * エネミー移動速度;
          }
        } else {
          // ゲージ満タン時：超加速でゼロ距離へ急襲
          this.エネミー速度X += -dirX * 0.26 * エネミー移動速度;
          this.エネミー速度Y += -dirY * 0.26 * エネミー移動速度;
        }
      } 
      else {
        // レベル2（デフォルト一般）：時計回りに旋回しつつマイルドに接近
        this.エネミー速度X += (-dirX * 0.05 + eTanX * 0.06) * エネミー移動速度;
        this.エネミー速度Y += (-dirY * 0.05 + eTanY * 0.06) * エネミー移動速度;
      }
    }

    // --- ②.5 すり鉢引力の適用 (スタジアム中心への緩やかな引力) ---
    const pCx = this.スタジアム中心X - this.プレイヤー位置X;
    const pCy = this.スタジアム中心Y - this.プレイヤー位置Y;
    const pCdist = Math.sqrt(pCx * pCx + pCy * pCy);
    if (pCdist > 0) {
      const gravity = 0.04;
      this.プレイヤー速度X += (pCx / pCdist) * gravity;
      this.プレイヤー速度Y += (pCy / pCdist) * gravity;
    }

    const eCx = this.スタジアム中心X - this.エネミー位置X;
    const eCy = this.スタジアム中心Y - this.エネミー位置Y;
    const eCdist = Math.sqrt(eCx * eCx + eCy * eCy);
    if (eCdist > 0) {
      const gravity = 0.04;
      this.エネミー速度X += (eCx / eCdist) * gravity;
      this.エネミー速度Y += (eCy / eCdist) * gravity;
    }

    // --- ③ 摩擦（滑らかなスライド）の適用 ---
    this.プレイヤー速度X *= this.摩擦係数;
    this.プレイヤー速度Y *= this.摩擦係数;
    this.エネミー速度X *= this.摩擦係数;
    this.エネミー速度Y *= this.摩擦係数;

    // --- ④ 位置の更新 ---
    this.プレイヤー位置X += this.プレイヤー速度X;
    this.プレイヤー位置Y += this.プレイヤー速度Y;
    
    this.エネミー位置X += this.エネミー速度X;
    this.エネミー位置Y += this.エネミー速度Y;

    // --- ⑤ スタジアムの壁との境界衝突物理 ---
    const checkWallCollision = (posX: number, posY: number, velX: number, velY: number) => {
      const cx = posX - this.スタジアム中心X;
      const cy = posY - this.スタジアム中心Y;
      const cdist = Math.sqrt(cx * cx + cy * cy);
      const maxDistance = this.スタジアム半径 - this.ギア半径;

      if (cdist > maxDistance) {
        // 押し戻し
        const newPosX = this.スタジアム中心X + (cx / cdist) * maxDistance;
        const newPosY = this.スタジアム中心Y + (cy / cdist) * maxDistance;

        // 壁法線ベクトル (外向き)
        const nx = cx / cdist;
        const ny = cy / cdist;

        // 法線方向 of 速度内積
        const dot = velX * nx + velY * ny;
        let newVelX = velX;
        let newVelY = velY;

        if (dot > 0) {
          // 内側方向に弾性反射
          newVelX -= (1.0 + this.壁反発係数) * dot * nx;
          newVelY -= (1.0 + this.壁反発係数) * dot * ny;
        }

        return { posX: newPosX, posY: newPosY, velX: newVelX, velY: newVelY };
      }
      return { posX, posY, velX, velY };
    };

    // プレイヤー壁衝突適用
    const pWall = checkWallCollision(this.プレイヤー位置X, this.プレイヤー位置Y, this.プレイヤー速度X, this.プレイヤー速度Y);
    this.プレイヤー位置X = pWall.posX;
    this.プレイヤー位置Y = pWall.posY;
    this.プレイヤー速度X = pWall.velX;
    this.プレイヤー速度Y = pWall.velY;

    // エネミー壁衝突適用
    const eWall = checkWallCollision(this.エネミー位置X, this.エネミー位置Y, this.エネミー速度X, this.エネミー速度Y);
    this.エネミー位置X = eWall.posX;
    this.エネミー位置Y = eWall.posY;
    this.エネミー速度X = eWall.velX;
    this.エネミー速度Y = eWall.velY;

    // --- ⑥ ギア同士の激突物理判定 (円形衝突) ---
    const currentDist = this.get現在の間合い();
    const minCollisionDist = this.ギア半径 * 2; // 50px

    if (currentDist < minCollisionDist && currentDist > 0) {
      // 1. 位置の押し戻し（重なり解消）
      const overlap = minCollisionDist - currentDist;
      const ox = (this.エネミー位置X - this.プレイヤー位置X) / currentDist;
      const oy = (this.エネミー位置Y - this.プレイヤー位置Y) / currentDist;

      this.プレイヤー位置X -= ox * (overlap / 2);
      this.プレイヤー位置Y -= oy * (overlap / 2);
      
      this.エネミー位置X += ox * (overlap / 2);
      this.エネミー位置Y += oy * (overlap / 2);

      // 2. 弾性衝突の反発速度計算
      const rvx = this.エネミー速度X - this.プレイヤー速度X;
      const rvy = this.エネミー速度Y - this.プレイヤー速度Y;
      const velAlongNormal = rvx * ox + rvy * oy;

      if (velAlongNormal < 0) {
        // 近づき合っている場合のみ反発させる
        const impulse = -(1.0 + this.反発係数) * velAlongNormal;
        
        this.プレイヤー速度X -= impulse * 0.5 * ox;
        this.プレイヤー速度Y -= impulse * 0.5 * oy;
        
        this.エネミー速度X += impulse * 0.5 * ox;
        this.エネミー速度Y += impulse * 0.5 * oy;
      }

      // 3. 衝突トリガーフラグのセット（火花エフェクト・ヒットストップ用）
      this.isJustCollided = true;
      this.collisionX = (this.プレイヤー位置X + this.エネミー位置X) / 2;
      this.collisionY = (this.プレイヤー位置Y + this.エネミー位置Y) / 2;

      // 4. リアルタイム衝突削りダメージは廃止されました
    }

    // --- ⑦ 攻撃ゲージの自然自動蓄積 (時間経過) ---
    // 毎秒 10 ゲージ自動蓄積
    this.プレイヤー攻撃ゲージ = Math.min(100, this.プレイヤー攻撃ゲージ + (10 / 60));
    this.エネミー攻撃ゲージ = Math.min(100, this.エネミー攻撃ゲージ + (10 / 60));

    // --- ⑧ スピンロス (時間経過による強制ライフ減少ループ) ---
    this.スピンロス経過フレーム数 += 1;
    if (this.スピンロス経過フレーム数 >= this.スピンロス秒数フレーム) {
      this.プレイヤーライフ = Math.max(0, this.プレイヤーライフ - this.スピンロスダメージ);
      this.エネミーライフ = Math.max(0, this.エネミーライフ - this.スピンロスダメージ);
      this.スピンロス経過フレーム数 = 0;
    }

    // --- ⑨ コマンドフェーズへの移行判定 ---
    const プレイヤーレンジ = this.getレンジサークル半径(this.プレイヤーギア.ステータス.レンジ);
    const 間合い = this.get現在の間合い();

    if (
      this.現在フェーズ === "ディスタンス" &&
      Math.floor(this.プレイヤー攻撃ゲージ) >= 100 &&
      間合い <= プレイヤーレンジ
    ) {
      this.現在フェーズ = "コマンド";
      this.攻撃側 = "プレイヤー";
    }
  }
  // --- ⑩ 静フェーズ中の成否確率計算 ---

  public get最終回避率(防御側スピード: number, 攻撃側スピード: number, ソール属性相性補正: number): number {
    const 基礎回避率 = 30;
    const スピード差分補正 = (防御側スピード - 攻撃側スピード) / 20;
    return 基礎回避率 + スピード差分補正 + ソール属性相性補正;
  }

  public get最終カウンター成功率(防御側アタック: number, 攻撃側アタック: number, ブレード属性属性補正: number): number {
    const 基礎カウンター率 = 25;
    const アタック差分補正 = (防御側アタック - 攻撃側アタック) / 40;
    return 基礎カウンター率 + アタック差分補正 + ブレード属性属性補正;
  }

  // 反動クラッシュ (フェーズ終了時に弾き飛ばしてリセット)
  public 実行反動クラッシュ() {
    if (this.攻撃側 === "プレイヤー") {
      this.プレイヤー攻撃ゲージ = 0;
    } else if (this.攻撃側 === "エネミー") {
      this.エネミー攻撃ゲージ = 0;
    }

    this.現在フェーズ = "ディスタンス";
    this.攻撃側 = null;

    // 互いにスタジアムの反対方向へ大きな初速で吹き飛ばす
    const dx = this.エネミー位置X - this.プレイヤー位置X;
    const dy = this.エネミー位置Y - this.プレイヤー位置Y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0) {
      const dirX = dx / dist;
      const dirY = dy / dist;

      // 弾き飛ばし初速
      this.プレイヤー速度X = -dirX * 18;
      this.プレイヤー速度Y = -dirY * 18;
      
      this.エネミー速度X = dirX * 18;
      this.エネミー速度Y = dirY * 18;
    } else {
      this.プレイヤー速度X = -15;
      this.エネミー速度X = 15;
    }
  }
}

export interface リザルト報酬結果 {
  更新ドロップカウンタ: number;
  更新所持JP: number;
  更新インベントリ: string[];
  獲得パーツID: string;
  案内テキスト: string;
  新規獲得フラグ: boolean;
}

export function 報酬ドロップ処理(
  現在のドロップカウンタ: number,
  現在の所持JP: number,
  所持インベントリ: string[],
  パーツマスタ: パーツマスタ行[],
  セリフマスタ: セリフマスタ行[]
): リザルト報酬結果 {
  // ① 部位カテゴリの特定 (0=ブレード, 1=ウェイト, 2=ソール)
  const 部位カテゴリコード = 現在のドロップカウンタ;
  // パーツマスタ上の種別コード: "1": ブレード, "2": ウェイト, "3": ソール
  const ターゲット種別 = (部位カテゴリコード + 1).toString();

  // ② ターゲット種別かつ「ランク 1」の全パーツプールを抽出
  const 対象パーツプール = パーツマスタ.filter(p => p.種別 === ターゲット種別 && p.ランク === "1");

  if (対象パーツプール.length === 0) {
    throw new Error(`ドロップ対象となるランク1のパーツプール(種別:${ターゲット種別})がパーツマスタに存在しません。`);
  }

  // 1/N の均等確率で1個を完全ランダム抽選
  const 抽選インデックス = Math.floor(Math.random() * 対象パーツプール.length);
  const 獲得パーツ = 対象パーツプール[抽選インデックス];
  const 獲得パーツID = 獲得パーツ.パーツID;

  // ③ 重複チェック判定
  const 既所持 = 所持インベントリ.includes(獲得パーツID);
  let 更新所持JP = 現在の所持JP;
  let 更新インベントリ = [...所持インベントリ];
  let 案内テキスト = "";
  let 新規獲得フラグ = false;

  if (!既所持) {
    // 未所持の場合
    更新インベントリ.push(獲得パーツID);
    案内テキスト = `新パーツ「${獲得パーツ.パーツ名}」を獲得しました！`;
    新規獲得フラグ = true;
  } else {
    // 既所持の場合: パーツ付与をキャンセルし、所持JPを +10
    更新所持JP += 10;
    
    // セリフマスタから navi_recycle_ann を探す
    const セリフ = セリフマスタ.find(s => s.TEXT_ID === "navi_recycle_ann");
    if (セリフ && セリフ.テキスト内容) {
      // プレースホルダーなどがあれば置換する（仕様に準拠）
      案内テキスト = セリフ.テキスト内容;
    } else {
      // セリフマスタが空・存在しない場合の完全なフォールバック
      案内テキスト = "既に所持しているパーツのため、10JPにリサイクルしました。";
    }
  }

  // ④ 次回バトルのためドロップカウンタをローテーションインクリメント
  const 更新ドロップカウンタ = (現在のドロップカウンタ + 1) % 3;

  return {
    更新ドロップカウンタ,
    更新所持JP,
    更新インベントリ,
    獲得パーツID,
    案内テキスト,
    新規獲得フラグ
  };
}

// ==========================================
// 5. ステージ進行マネージャー
// ==========================================

export class ステージ進行マネージャー {
  private エネミーリスト: エネミーマスタ行[];
  private 現在の並び順インデックス: number = 0; // 0〜4 (1戦目〜5戦目)

  constructor(エネミーマスタ: エネミーマスタ行[]) {
    // 登場ステージID == "st001" のレコードを抽出し、並び順の昇順でソート
    this.エネミーリスト = エネミーマスタ
      .filter(e => e.登場ステージID === "st001")
      .sort((a, b) => Number(a.並び順) - Number(b.並び順));
  }

  public get現在の対戦相手(): エネミーマスタ行 | null {
    if (this.現在の並び順インデックス < this.エネミーリスト.length) {
      return this.エネミーリスト[this.現在の並び順インデックス];
    }
    return null;
  }

  public 勝利時進行() {
    this.現在の並び順インデックス++;
  }

  public get現在の対戦インデックス(): number {
    return this.現在の並び順インデックス;
  }

  public isステージクリア(): boolean {
    return this.現在の並び順インデックス >= this.エネミーリスト.length;
  }

  public 重リセット() {
    this.現在の並び順インデックス = 0;
  }
}
