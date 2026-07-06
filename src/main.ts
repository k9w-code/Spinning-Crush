import {
  パーツマスタ行,
  チップマスタ行,
  奥義マスタ行,
  エネミーマスタ行,
  システムNPCマスタ行,
  セリフマスタ行,
  ステージマスタ行,
  シナリオマスタ行,
  アセンブル実行,
  アセンブルデータ,
  バトル更新マネージャー,
  報酬ドロップ処理,
  属性相性判定
} from './domain/SpinningCrushSystem.ts';
import { SoundManager } from './sound/SoundManager';

// ==========================================
// 1. グローバルステート・定数
// ==========================================

interface SlotData {
  チップ: string;
  ブレード: string;
  ウェイト: string;
  ソール: string;
  レベル: number;
  EXP: number;
}

interface SaveData {
  所持JP: number;
  インベントリ: string[];
  ドロップカウンタ: number;
  ギアスロット: { [key: string]: SlotData | null };
  最後使用スロット: number;
  クリア状況: { [key: string]: boolean };
  ボス解放済み: boolean;
  ステージ1クリア: boolean;
  ステージ2クリア: boolean;
  ステージクリア状況: { [key: string]: boolean };
  勝利数: { [key: string]: number };
  ボス解放済みステージ: { [key: string]: boolean };
}

// 初期セーブデータ定義
const INITIAL_SAVE_DATA: SaveData = {
  所持JP: 0,
  インベントリ: ['c001', 'b101_n', 'w101_n', 's101_n'],
  ドロップカウンタ: 0,
  ギアスロット: {
    '1': { チップ: 'c001', ブレード: 'b101_n', ウェイト: 'w101_n', ソール: 's101_n', レベル: 1, EXP: 0 },
    '2': null,
    '3': null,
    '4': null,
    '5': null
  },
  最後使用スロット: 1,
  クリア状況: {},
  ボス解放済み: false,
  ステージ1クリア: false,
  ステージ2クリア: false,
  ステージクリア状況: {},
  勝利数: {},
  ボス解放済みステージ: {}
};

class SparkParticle {
  public x: number;
  public y: number;
  private vx: number;
  private vy: number;
  private life: number; // 0 to 1
  private maxLife: number;
  private color: string;
  private size: number;

  constructor(x: number, y: number, color: string) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 6;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = 1.0;
    this.maxLife = 15 + Math.random() * 20; // 15〜35 frames
    this.size = 2 + Math.random() * 3;
    this.color = color;
  }

  public update(): boolean {
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.94; // air resistance
    this.vy *= 0.94;
    this.life -= 1 / this.maxLife;
    return this.life > 0;
  }

  public draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 8;
    ctx.shadowColor = this.color;
    ctx.globalAlpha = this.life;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Shockwave {
  public x: number;
  public y: number;
  private radius: number = 5;
  private maxRadius: number = 40;
  private life: number = 1.0;
  private speed: number = 2.5;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  public update(): boolean {
    this.radius += this.speed;
    this.life = 1.0 - (this.radius / this.maxRadius);
    return this.life > 0;
  }

  public draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.strokeStyle = `rgba(255, 255, 255, ${this.life * 0.8})`;
    ctx.lineWidth = 3 * this.life;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

class SkillParticle {
  public x: number;
  public y: number;
  private vx: number;
  private vy: number;
  private size: number;
  private life: number = 1.0;
  private decay: number;
  private color: string;
  private type: 'fire' | 'water' | 'wind' | 'thunder';

  constructor(x: number, y: number, type: 'fire' | 'water' | 'wind' | 'thunder') {
    this.x = x;
    this.y = y;
    this.type = type;

    const angle = Math.random() * Math.PI * 2;
    if (type === 'fire') {
      const speed = 2 + Math.random() * 4;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed - 1.5;
      this.size = 6 + Math.random() * 8;
      this.color = `hsl(${Math.random() * 20 + 345}, 100%, 55%)`;
      this.decay = 0.02 + Math.random() * 0.02;
    } else if (type === 'water') {
      const speed = 1.5 + Math.random() * 3;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed + 0.5;
      this.size = 4 + Math.random() * 6;
      this.color = `hsl(${Math.random() * 30 + 190}, 100%, 50%)`;
      this.decay = 0.015 + Math.random() * 0.015;
    } else if (type === 'wind') {
      const speed = 4 + Math.random() * 6;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.size = 2 + Math.random() * 4;
      this.color = `hsl(${Math.random() * 40 + 100}, 80%, 65%)`;
      this.decay = 0.025 + Math.random() * 0.02;
    } else {
      const speed = 6 + Math.random() * 8;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.size = 1.5 + Math.random() * 2;
      this.color = `hsl(60, 100%, 70%)`;
      this.decay = 0.04 + Math.random() * 0.03;
    }
  }

  public update(): boolean {
    if (this.type === 'wind') {
      const ax = -this.vy * 0.15;
      const ay = this.vx * 0.15;
      this.vx += ax;
      this.vy += ay;
    }
    this.x += this.vx;
    this.y += this.vy;
    this.life -= this.decay;
    return this.life > 0;
  }

  public draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.globalAlpha = this.life;
    ctx.shadowBlur = 10;
    ctx.shadowColor = this.color;
    ctx.beginPath();
    if (this.type === 'thunder') {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.size;
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + (Math.random() - 0.5) * 15, this.y + (Math.random() - 0.5) * 15);
      ctx.stroke();
    } else {
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

class GameApp {
  private snd = SoundManager.getInstance();
  // セーブデータ
  public saveData: SaveData = JSON.parse(JSON.stringify(INITIAL_SAVE_DATA));
  private prevJp: number = 0; // バトル前のJP記憶用
  private particles: SparkParticle[] = [];
  private shockwaves: Shockwave[] = [];
  private skillParticles: SkillParticle[] = [];
  private isOsugiCutinActive: boolean = false;
  private osugiCutinFrames: number = 0;
  private onOsugiCutinComplete: (() => void) | null = null;
  private currentEnemySelectedOsugi: 奥義マスタ行 | null = null;

  // 激突突進アニメーション用ステート
  private isClashAnimationActive: boolean = false;
  private clashAnimFrame: number = 0;
  private clashOnComplete: (() => void) | null = null;

  // 戦闘計算結果の一時格納キャッシュ (激突の瞬間に適用するため)
  private clashPendingDamage: number = 0;
  private clashPendingIsHit: boolean = false;
  private clashPendingIsCounter: boolean = false;
  private clashPendingCounterDamage: number = 0;
  private clashPendingSide: 'プレイヤー' | 'エネミー' = 'プレイヤー';
  private clashPendingDialogText: string = "";
  private clashResultType: 'hit' | 'guard' | 'evade' | 'counter' = 'hit';
  private isPinchBgmActive: boolean = false;
  
  // 敵NPCがゲージ100%かつレンジ内になった時の攻撃移行ディレイフレーム
  private enemyTransitionDelayFrames: number = 0;

  // マスタデータ
  public パーツマスタ: パーツマスタ行[] = [];
  public チップマスタ: チップマスタ行[] = [];
  public 奥義マスタ: 奥義マスタ行[] = [];
  public エネミーマスタ: エネミーマスタ行[] = [];
  public システムNPCマスタ: システムNPCマスタ行[] = [];
  public セリフマスタ: セリフマスタ行[] = [];
  public ステージマスタ: ステージマスタ行[] = [];
  public シナリオマスタ: シナリオマスタ行[] = [];

  // 画面遷移管理
  private currentScreenId: string = 'title-screen';

  // カスタマイズ画面用ステータス
  private editingSlotId: string = '1';
  private customOriginScreen: string = 'garage-screen'; // 戻り先画面不具合修正用
  private customGearSim: SlotData = { チップ: 'c001', ブレード: 'b001_n', ウェイト: 'w001_n', ソール: 's001_n', レベル: 1, EXP: 0 };

  // マップ画面
  private mapCanvas: HTMLCanvasElement | null = null;
  private mapCtx: CanvasRenderingContext2D | null = null;
  private selectedStageId: string = "1";

  // VS準備画面
  private vsSlotIndex: number = 1;
  private selectedNpc: エネミーマスタ行 | null = null;

  // バトル画面
  private battleCanvas: HTMLCanvasElement | null = null;
  private battleManager: バトル更新マネージャー | null = null;
  private battleLoopId: number | null = null;
  private isBattleFinished: boolean = false;
  private keyState: { [key: string]: boolean } = {};
  
  // バトルカメラワーク・エフェクト用変数
  private battleCamera = { x: 0, y: 0, scale: 1, targetScale: 1 };
  private battleHitStopFrames: number = 0;
  private battleShakeFrames: number = 0;
  private playerRotation: number = 0;
  private enemyRotation: number = 0;

  // 会話演出 (広告ブロック回避のためtalk表記)
  private talkQueue: { speaker: string; text: string; onComplete?: () => void }[] = [];
  private currentTalkIndex: number = 0;
  private talkOnCompleteAll: (() => void) | null = null;

  // コマンドフェーズ選択用変数
  private selectedCommandIndex: number = 0;
  private activeCommandButtons: HTMLButtonElement[] = [];
  private commandPhaseCooldownFrames: number = 0;

  constructor() {
    this.initDOM();
  }

  // DOMイベントの初期化
  private initDOM() {
    window.addEventListener('DOMContentLoaded', async () => {
      // データのロード
      await this.loadAllMasters();
      this.loadGameFromStorage();

      // DOMバインド
      this.bindUiEvents();
      this.bindButtonHoverSound();
      this.setupCanvas();

      // タイトル表示
      this.changeScreen('title-screen');
    });
  }

  // ==========================================
  // 2. マスタデータ取得＆パース（二重フォールバック）
  // ==========================================
  private async loadAllMasters() {
    const sheets = [
      { name: '概要', gid: '0' },
      { name: 'UI遷移', gid: '99216876' },
      { name: 'ステータス', gid: '1822321800' },
      { name: 'バトル', gid: '2011083426' },
      { name: 'ドロップ', gid: '1877377932' },
      { name: 'チップマスタ', gid: '1898264736' },
      { name: '奥義マスタ', gid: '11227566' },
      { name: 'パーツマスタ', gid: '1819728774' },
      { name: 'エネミーマスタ', gid: '626294569' },
      { name: 'システムNPCマスタ', gid: '377748855' },
      { name: 'セリフマスタ', gid: '606980900' },
      { name: 'ステージマスタ', gid: '' },
      { name: 'シナリオマスタ', gid: '' }
    ];

    for (const sheet of sheets) {
      let csvText = '';
      
      // gidが設定されている場合のみ Google Sheets からのダイレクトロードを試行 (空文字だと概要シートが返るのを防止)
      if (sheet.gid !== '') {
        try {
          const directUrl = `https://docs.google.com/spreadsheets/d/1flC4ng6qE2tFSTa9tZNZ9Pao-cMHnhkCcLn0LxODbss/gviz/tq?tqx=out:csv&gid=${sheet.gid}`;
          const response = await fetch(directUrl);
          if (response.ok) {
            csvText = await response.text();
            console.log(`Successfully loaded ${sheet.name} from Google Sheets.`);
          }
        } catch (e) {
          console.warn(`CORS/Network error loading ${sheet.name} from Google Sheets. Falling back to local...`, e);
        }
      }

      // 2. 失敗した場合、ローカルの public/sheets/ にあるコピーからフェッチ
      if (!csvText) {
        try {
          const localUrl = `/sheets/${sheet.name}.csv`;
          const response = await fetch(localUrl);
          if (response.ok) {
            csvText = await response.text();
            console.log(`Successfully loaded ${sheet.name} from local server.`);
          }
        } catch (e) {
          console.error(`Failed to load ${sheet.name} from local server.`, e);
        }
      }

      // CSVのパース
      if (csvText) {
        const data = this.parseCsv(csvText);
        this.assignMasterData(sheet.name, data);
      }
    }
  }

  private parseCsv(content: string): any[] {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return [];
    
    const headers = this.parseCsvLine(lines[0]);
    const result: any[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const row = this.parseCsvLine(lines[i]);
      const obj: any = {};
      headers.forEach((h, idx) => {
        if (h && h.length > 0) {
          obj[h] = row[idx] || '';
        }
      });
      result.push(obj);
    }
    return result;
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  private assignMasterData(name: string, data: any[]) {
    switch (name) {
      case 'チップマスタ':
        this.チップマスタ = data;
        break;
      case '奥義マスタ':
        this.奥義マスタ = data;
        break;
      case 'パーツマスタ':
        this.パーツマスタ = data;
        break;
      case 'エネミーマスタ':
        this.エネミーマスタ = data;
        break;
      case 'システムNPCマスタ':
        this.システムNPCマスタ = data;
        break;
      case 'セリフマスタ':
        this.セリフマスタ = data;
        break;
      case 'ステージマスタ':
        this.ステージマスタ = data;
        break;
      case 'シナリオマスタ':
        this.シナリオマスタ = data;
        break;
    }
  }

  // ==========================================
  // 3. セーブ機能 (ローカルストレージ)
  // ==========================================
  private saveGameToStorage() {
    localStorage.setItem('spinning_crush_save', JSON.stringify(this.saveData));
    this.showSystemModal('セーブ完了', 'ガレージの日記に冒険の記録をセーブしました！');
  }

  private loadGameFromStorage(): boolean {
    const saved = localStorage.getItem('spinning_crush_save');
    if (saved) {
      try {
        this.saveData = JSON.parse(saved);
        // 後方互換性用のスロット初期化
        if (!this.saveData.ギアスロット) {
          this.saveData.ギアスロット = JSON.parse(JSON.stringify(INITIAL_SAVE_DATA.ギアスロット));
        }
        if (!this.saveData.勝利数) {
          this.saveData.勝利数 = {};
        }
        if (this.saveData.ボス解放済み === undefined) {
          this.saveData.ボス解放済み = false;
        }
        if (this.saveData.ステージ1クリア === undefined) {
          this.saveData.ステージ1クリア = false;
        }
        if (this.saveData.ステージ2クリア === undefined) {
          this.saveData.ステージ2クリア = false;
        }
        if (!this.saveData.ステージクリア状況) {
          this.saveData.ステージクリア状況 = {};
        }
        // 旧フラグからのインポート
        if (this.saveData.ステージ1クリア) {
          this.saveData.ステージクリア状況['st001'] = true;
        }
        if (this.saveData.ステージ2クリア) {
          this.saveData.ステージクリア状況['st002'] = true;
        }
        // 旧パーツIDから新パーツIDへの移行処理 (b001 -> b101 など)
        const convertOldId = (id: string): string => {
          if (/^[bws]00\d_[fawen]$/.test(id)) {
            return id.replace('00', '10');
          }
          return id;
        };

        if (this.saveData.インベントリ) {
          this.saveData.インベントリ = this.saveData.インベントリ.map(convertOldId);
        }
        if (this.saveData.ギアスロット) {
          Object.keys(this.saveData.ギアスロット).forEach(key => {
            const slot = this.saveData.ギアスロット[key];
            if (slot) {
              slot.ブレード = convertOldId(slot.ブレード);
              slot.ウェイト = convertOldId(slot.ウェイト);
              slot.ソール = convertOldId(slot.ソール);
            }
          });
        }

        if (!this.saveData.ボス解放済みステージ) {
          this.saveData.ボス解放済みステージ = {};
        }
        return true;
      } catch (e) {
        console.error(e);
      }
    }
    this.saveData = JSON.parse(JSON.stringify(INITIAL_SAVE_DATA));
    return false;
  }

  // ==========================================
  // 4. 画面遷移 & UI制御
  // ==========================================
  private changeScreen(screenId: string) {
    const shutter = document.getElementById('cyber-shutter');
    this.snd.playClick(); // シャッター閉と同時に決定/閉音

    const performSwitch = () => {
      // タイトル背景デモを一旦停止
      this.stopTitleDemo();

      const screens = document.querySelectorAll('.screen');
      screens.forEach(s => s.classList.remove('active'));

      const nextScreen = document.getElementById(screenId);
      if (nextScreen) {
        nextScreen.classList.add('active');
      }

      this.currentScreenId = screenId;

      // 遷移先の初期化処理
      if (screenId === 'title-screen') {
        this.initTitleDemo();
      } else if (screenId === 'garage-screen') {
        this.initGarageScreen();
      } else if (screenId === 'custom-screen') {
        this.initCustomScreen();
      } else if (screenId === 'map-screen') {
        this.initMapScreen();
      } else if (screenId === 'stage-screen') {
        this.initStageScreen();
      } else if (screenId === 'vs-screen') {
        this.initVsScreen();
      } else if (screenId === 'shop-screen') {
        this.initShopScreen();
      }

      // バトル画面移行時にBGMを開始、それ以外では停止
      if (screenId === 'battle-screen') {
        this.isPinchBgmActive = false;
        this.snd.startBattleBGM();
      } else {
        this.snd.stopBGM();
      }

      this.bindButtonHoverSound();
    };

    if (shutter) {
      shutter.classList.remove('hidden');
      shutter.classList.add('shutter-close');
      // 完全に画面が覆われたタイミングで切り替えを実行
      setTimeout(() => {
        performSwitch();
      }, 220);
      // シャッターを開く
      setTimeout(() => {
        shutter.classList.remove('shutter-close');
      }, 480);
      // 完全に開ききったら、斜めの装飾が画面外にはみ出して見えないように非表示にする
      setTimeout(() => {
        shutter.classList.add('hidden');
      }, 900);
    } else {
      performSwitch();
    }
  }

  private bindButtonHoverSound() {
    document.querySelectorAll('button, .command-btn, .inventory-item, .map-pin, .npc-card').forEach(el => {
      if (el.getAttribute('data-sound-bound') === '1') return;
      el.setAttribute('data-sound-bound', '1');
      el.addEventListener('mouseenter', () => {
        this.snd.playBleep();
      });
    });
  }

  // UIイベントバインディング
  private bindUiEvents() {
    // ① タイトル画面
    document.getElementById('btn-new-game')?.addEventListener('click', () => {
      this.snd.initContext();

      // セーブデータが存在する場合は誤消去防止の警告を出す
      const saved = localStorage.getItem('spinning_crush_save');
      if (saved) {
        const confirmStart = confirm('すでにセーブデータが存在します。最初から始めるとこれまでの記録（所持パーツ、JP、進行状況）はすべて消去されますが、本当に最初から始めますか？');
        if (!confirmStart) {
          return; // キャンセル
        }
      }

      this.saveData = JSON.parse(JSON.stringify(INITIAL_SAVE_DATA));
      // 新規データを即時セーブ（ページ更新で消えるのを防止）
      localStorage.setItem('spinning_crush_save', JSON.stringify(this.saveData));

      // まず自宅ガレージ画面へ遷移
      this.changeScreen('garage-screen');
      // シャッター演出の終了を待ってからガレージ背景の上でプロローグを再生
      setTimeout(() => {
        this.playScenario('prologue', () => {
          // 会話劇終了
        });
      }, 550);
    });

    document.getElementById('btn-load-game')?.addEventListener('click', () => {
      this.snd.initContext();
      if (this.loadGameFromStorage()) {
        this.changeScreen('garage-screen');
      } else {
        this.showSystemModal('エラー', 'セーブデータが見つかりません。NEW GAMEで開始してください。');
      }
    });

    document.getElementById('btn-setting')?.addEventListener('click', () => {
      this.showSystemModal('設定', '音量・画質などの設定画面です（プロトタイプ版につき変更不可）。');
    });

    // ② ガレージ画面
    document.getElementById('btn-goto-custom')?.addEventListener('click', () => {
      this.editingSlotId = this.saveData.最後使用スロット.toString();
      this.customOriginScreen = 'garage-screen'; // 戻り先を記録
      this.changeScreen('custom-screen');
    });

    document.getElementById('btn-garage-save')?.addEventListener('click', () => {
      this.saveGameToStorage();
    });

    document.getElementById('btn-goto-map')?.addEventListener('click', () => {
      this.changeScreen('map-screen');
    });

    // ③ カスタマイズ画面
    document.getElementById('btn-custom-cancel')?.addEventListener('click', () => {
      // 最後にいた元の画面へ正確に戻る
      this.changeScreen(this.customOriginScreen);
    });

    document.getElementById('btn-custom-confirm')?.addEventListener('click', () => {
      // 現在のアセンブルデータを確定してスロットに保存
      this.saveData.ギアスロット[this.editingSlotId] = JSON.parse(JSON.stringify(this.customGearSim));
      this.saveData.最後使用スロット = Number(this.editingSlotId);
      
      // セーブデータを自動セーブ
      localStorage.setItem('spinning_crush_save', JSON.stringify(this.saveData));
      
      // 最後にいた元の画面へ正確に戻る
      this.changeScreen(this.customOriginScreen);
    });

    // パーツスロット選択ボタンのバインド
    document.querySelectorAll('.part-select-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = (e.currentTarget as HTMLElement).getAttribute('data-part-type') as any;
        this.openInventoryDrawer(type);
      });
    });

    document.getElementById('btn-close-drawer')?.addEventListener('click', () => {
      document.getElementById('inventory-drawer')?.classList.remove('active');
    });

    // ④ マップ画面
    document.getElementById('btn-map-to-garage')?.addEventListener('click', () => {
      this.changeScreen('garage-screen');
    });

    // ⑤ ステージ詳細画面
    document.getElementById('btn-stage-back')?.addEventListener('click', () => {
      this.changeScreen('map-screen');
    });

    // ⑥ VS準備画面
    document.getElementById('btn-vs-back')?.addEventListener('click', () => {
      this.changeScreen('stage-screen');
    });

    document.getElementById('btn-vs-custom')?.addEventListener('click', () => {
      this.editingSlotId = this.vsSlotIndex.toString();
      this.customOriginScreen = 'vs-screen'; // 戻り先を記録
      this.changeScreen('custom-screen');
    });

    document.getElementById('btn-vs-start')?.addEventListener('click', () => {
      if (!this.selectedNpc) return;
      
      const enemyId = this.selectedNpc.エネミーID;
      const scenarioId = `${enemyId}_before`;
      const hasScenario = this.シナリオマスタ.some(s => s.シナリオID === scenarioId);

      if (hasScenario) {
        // 対戦前シナリオがある場合は掛け合い劇を再生してからバトル開始
        this.playScenario(scenarioId, () => {
          this.startBattle();
        });
      } else {
        // シナリオがない場合は従来の1行会話
        const found = this.セリフマスタ.find(s => s.TEXT_ID === `${enemyId}_before`);
        const beforeText = found ? found.テキスト内容 : "「いざ尋常に…勝負！」";

        this.startTalk([
          {
            speaker: this.selectedNpc.エネミー名,
            text: beforeText,
            onComplete: () => {
              const avatarRight = document.getElementById('talk-avatar-right');
              if (avatarRight) {
                // 右側にライバルキャラのホログラム立ち絵を表示
                const isDefault = !['e005', 'e010', 'e015', 'e020', 'e025', 'e030'].includes(enemyId);
                avatarRight.className = `talk-avatar right active ${isDefault ? 'avatar-default' : 'avatar-' + enemyId}`;
              }
            }
          }
        ], () => {
          const avatarRight = document.getElementById('talk-avatar-right');
          if (avatarRight) {
            avatarRight.className = 'talk-avatar right';
          }
          this.startBattle();
        });
      }
    });

    document.getElementById('btn-vs-slot-prev')?.addEventListener('click', () => {
      this.switchVsSlot(-1);
    });

    document.getElementById('btn-vs-slot-next')?.addEventListener('click', () => {
      this.switchVsSlot(1);
    });

    // ⑦ バトル画面リアルタイム操作 (タッチ操作対応)
    const btnAway = document.getElementById('btn-action-away');
    const btnApproach = document.getElementById('btn-action-approach');
    const btnTrigger = document.getElementById('btn-action-trigger');

    btnAway?.addEventListener('mousedown', () => { this.keyState['a'] = true; });
    btnAway?.addEventListener('mouseup', () => { this.keyState['a'] = false; });
    btnAway?.addEventListener('touchstart', () => { this.keyState['a'] = true; });
    btnAway?.addEventListener('touchend', () => { this.keyState['a'] = false; });

    btnApproach?.addEventListener('mousedown', () => { this.keyState['d'] = true; });
    btnApproach?.addEventListener('mouseup', () => { this.keyState['d'] = false; });
    btnApproach?.addEventListener('touchstart', () => { this.keyState['d'] = true; });
    btnApproach?.addEventListener('touchend', () => { this.keyState['d'] = false; });

    btnTrigger?.addEventListener('click', () => {
      if (this.battleManager && Math.floor(this.battleManager.プレイヤー攻撃ゲージ) >= 100) {
        this.keyState['f'] = true;
      }
    });

    // キーボード操作のバインド
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      this.keyState[key] = true;

      // デバッグメニュー起動 (Dキー) -> バトル中以外で有効
      if (key === 'd' && this.currentScreenId !== 'battle-screen') {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
          return;
        }

        e.preventDefault();
        const cmd = prompt(
          "【Spinning Crush デバッグメニュー】\n" +
          "1: JPを+10000する\n" +
          "2: すべてのパーツ(全アイテム)を取得する\n" +
          "3: 通常ライバルを全員撃破済みにする(ボス解放フラグ全開)\n" +
          "4: マスタデータのロード診断を行う\n" +
          "番号を入力してください:"
        );

        if (cmd === '1') {
          this.saveData.所持JP += 10000;
          localStorage.setItem('spinning_crush_save', JSON.stringify(this.saveData));
          this.showSystemModal('デバッグ完了', 'JPが10000追加されました！');
          const mapJp = document.getElementById('map-jp');
          if (mapJp) mapJp.textContent = this.saveData.所持JP.toString();
          const customJp = document.getElementById('custom-jp');
          if (customJp) customJp.textContent = this.saveData.所持JP.toString();
          const shopJp = document.getElementById('shop-jp');
          if (shopJp) shopJp.textContent = this.saveData.所持JP.toString();
        } else if (cmd === '2') {
          this.パーツマスタ.forEach(p => {
            if (!this.saveData.インベントリ.includes(p.パーツID)) {
              this.saveData.インベントリ.push(p.パーツID);
            }
          });
          localStorage.setItem('spinning_crush_save', JSON.stringify(this.saveData));
          this.showSystemModal('デバッグ完了', 'すべてのパーツを取得しました！カスタマイズ画面でご確認ください。');
        } else if (cmd === '3') {
          this.エネミーマスタ.forEach(enemy => {
            if (enemy.ボスフラグ !== '1') {
              this.saveData.クリア状況[enemy.エネミーID] = true;
            }
          });
          for (let i = 1; i <= 6; i++) {
            const stId = `st00${i}`;
            this.saveData.ボス解放済みステージ[stId] = true;
            this.saveData.ステージクリア状況[stId] = true;
          }
          localStorage.setItem('spinning_crush_save', JSON.stringify(this.saveData));
          this.showSystemModal('デバッグ完了', '全ステージのボスを即時アンロックしました！');
        } else if (cmd === '4') {
          const diag = 
            `【マスタデータ ロード状況】\n` +
            `- チップマスタ: ${this.チップマスタ?.length || 0} 件\n` +
            `- 奥義マスタ: ${this.奥義マスタ?.length || 0} 件\n` +
            `- パーツマスタ: ${this.パーツマスタ?.length || 0} 件\n` +
            `- エネミーマスタ: ${this.エネミーマスタ?.length || 0} 件\n` +
            `- システムNPCマスタ: ${this.システムNPCマスタ?.length || 0} 件\n` +
            `- セリフマスタ: ${this.セリフマスタ?.length || 0} 件\n` +
            `- ステージマスタ: ${this.ステージマスタ?.length || 0} 件\n` +
            `- シナリオマスタ: ${this.シナリオマスタ?.length || 0} 件\n` +
            `\n【プロローグデータ詳細】\n` +
            `ステップ数: ${this.シナリオマスタ?.filter(s => s.シナリオID === 'prologue').length || 0} 件`;
          alert(diag);
        }
        return;
      }

      // コマンドフェーズ選択のキー操作 (キーボード・ショートカット)
      if (
        this.currentScreenId === 'battle-screen' &&
        this.battleManager &&
        this.battleManager.現在フェーズ === 'コマンド' &&
        document.getElementById('command-overlay')?.classList.contains('active')
      ) {
        if (key === 'w' || e.key === 'ArrowUp') {
          e.preventDefault();
          this.moveCommandSelection(-1);
        } else if (key === 's' || e.key === 'ArrowDown') {
          e.preventDefault();
          this.moveCommandSelection(1);
        } else if (key === 'f' || e.key === 'Enter') {
          e.preventDefault();
          this.confirmCommandSelection();
        } 
        // 数字キー 1〜4 による直接コマンド実行
        else if (['1', '2', '3', '4'].includes(key)) {
          e.preventDefault();
          const idx = Number(key) - 1;
          if (idx >= 0 && idx < this.activeCommandButtons.length) {
            this.selectedCommandIndex = idx;
            this.confirmCommandSelection();
          }
        }
        // アルファベットキーによる連想直接コマンド実行
        // A/D (1番目), E (2番目), C (3番目), Q/S (4番目)
        else if (['a', 'd', 'e', 'c', 'q'].includes(key)) {
          e.preventDefault();
          let idx = -1;
          if (key === 'a' || key === 'd') idx = 0; // 攻撃(Attack) / 防御(Defense)
          else if (key === 'e') idx = 1;           // 回避(Evade)
          else if (key === 'c') idx = 2;           // カウンター(Counter)
          else if (key === 'q') idx = 3;           // 奥義(Quest-Ultimate)

          if (idx >= 0 && idx < this.activeCommandButtons.length) {
            this.selectedCommandIndex = idx;
            this.confirmCommandSelection();
          }
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      this.keyState[key] = false;
    });

    // バトル画面全体のクリックで「F」キーの役割を持たせる (レイヤーによる遮断を防ぐためdocument全体で捕捉)
    document.addEventListener('click', (e) => {
      if (this.currentScreenId !== 'battle-screen' || !this.battleManager) {
        return;
      }

      const target = e.target as HTMLElement;
      // ボタンが直接クリックされた場合は、通常のクリックイベントで処理されるため、ここでは無視する
      if (target.tagName.toLowerCase() === 'button' || target.closest('button') || target.classList.contains('command-btn')) {
        return;
      }

      if (this.battleManager.現在フェーズ === 'ディスタンス') {
        const range = this.battleManager.getレンジサークル半径(this.battleManager.プレイヤーギア.ステータス.レンジ);
        if (Math.floor(this.battleManager.プレイヤー攻撃ゲージ) >= 100 && this.battleManager.get現在の間合い() <= range) {
          this.keyState['f'] = true;
        }
      } else if (
        this.battleManager.現在フェーズ === 'コマンド' &&
        document.getElementById('command-overlay')?.classList.contains('active')
      ) {
        // コマンド選択フェーズ：画面の空きスペースクリックで「現在選択中のコマンド」を確定
        this.confirmCommandSelection();
      }
    });

    // ⑧ リザルト画面
    document.getElementById('btn-result-ok')?.addEventListener('click', () => {
      if (!this.selectedNpc) {
        this.changeScreen('stage-screen');
        return;
      }

      const currentStageId = this.selectedNpc.登場ステージID;
      const isBoss = this.selectedNpc.ボスフラグ === '1';
      const isCleared = this.saveData.クリア状況[this.selectedNpc.エネミーID] === true;

      // ボスを撃破してまだそのステージが未クリアとして記録されている場合
      if (isBoss && isCleared && !this.saveData.ステージクリア状況[currentStageId]) {
        this.saveData.ステージクリア状況[currentStageId] = true;
        
        // 後方互換のために古いフラグも更新
        if (currentStageId === 'st001') this.saveData.ステージ1クリア = true;
        if (currentStageId === 'st002') this.saveData.ステージ2クリア = true;

        localStorage.setItem('spinning_crush_save', JSON.stringify(this.saveData));

        // マップ画面に戻し、ステージクリアの派手な演出を実行
        this.changeScreen('map-screen');

        setTimeout(() => {
          const clearOverlay = document.getElementById('stage-clear-overlay');
          if (clearOverlay) {
            clearOverlay.classList.add('active');
            this.snd.playClearJingle(); // お祝いファンファーレ
            
            // 2.8秒後にオーバーレイをフェードアウトさせ、クリア会話シナリオを再生
            setTimeout(() => {
              clearOverlay.classList.remove('active');
              const scenarioId = `${currentStageId}_clear`;
              this.playScenario(scenarioId, () => {
                this.changeScreen('stage-screen');
              });
            }, 2800);
          }
        }, 600); // 画面遷移シャッターが開くのを待つ
      } else {
        this.changeScreen('stage-screen');
      }
    });

    // ⑨ ショップ画面
    document.getElementById('btn-shop-back')?.addEventListener('click', () => {
      this.changeScreen('map-screen');
    });

    document.getElementById('btn-shop-gacha')?.addEventListener('click', () => {
      this.executeShopGacha();
    });

    document.getElementById('btn-gacha-perf-confirm')?.addEventListener('click', () => {
      const overlay = document.getElementById('gacha-performance-overlay');
      if (overlay) {
        overlay.classList.remove('active');
      }
      this.initShopScreen();
    });

    // 会話・モーダルバインド
    document.getElementById('talk-dialog')?.addEventListener('click', () => {
      this.nextTalk();
    });

    document.getElementById('btn-modal-close')?.addEventListener('click', () => {
      document.getElementById('system-modal')?.classList.remove('active');
    });
  }

  // ==========================================
  // 5. 各画面の初期化・描画バインディング
  // ==========================================

  // --- ② 自宅ガレージ画面 ---
  private initGarageScreen() {
    const jpEl = document.getElementById('garage-jp');
    if (jpEl) jpEl.textContent = this.saveData.所持JP.toString();

    const currentSlot = this.saveData.ギアスロット[this.saveData.最後使用スロット.toString()];
    if (currentSlot) {
      // ギア名表示
      const chip = this.チップマスタ.find(c => c.チップID === currentSlot.チップ);
      const nameEl = document.getElementById('garage-gear-name');
      if (nameEl) nameEl.textContent = chip ? chip.チップ名 : 'カスタムギア';

      // アセンブル実行してステータス表示
      const assembled = アセンブル実行(
        currentSlot.チップ,
        currentSlot.ブレード,
        currentSlot.ウェイト,
        currentSlot.ソール,
        currentSlot.レベル,
        this.パーツマスタ,
        this.チップマスタ,
        this.奥義マスタ
      );

      this.renderStatsList('garage-stats-list', assembled.ステータス);

      // ギアグラフィック描画プレビュー
      this.renderGearPreview('garage-gear-canvas', assembled);
    }
  }

  private renderStatsList(containerId: string, stats: any) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    const keys = ['ライフ', 'アタック', 'ディフェンス', 'スピード', 'レンジ', 'モビリティ'];
    keys.forEach(key => {
      const val = stats[key] || 0;
      const percent = Math.min(100, (val / 500) * 100); // 簡易上限500ベース
      
      const row = document.createElement('div');
      row.className = 'stats-row';
      row.innerHTML = `
        <span class="stats-label">${key}</span>
        <div class="stats-val-box">
          <span class="stats-value">${val}</span>
          <div class="stats-bar-outer">
            <div class="stats-bar-inner" style="width: ${percent}%"></div>
          </div>
        </div>
      `;
      container.appendChild(row);
    });
  }

  // --- ③ カスタマイズ画面 ---
  private initCustomScreen() {
    const jpEl = document.getElementById('custom-jp');
    if (jpEl) jpEl.textContent = this.saveData.所持JP.toString();

    // スロットの描画
    this.renderCustomSlots();

    // 編集初期値の設定
    const slot = this.saveData.ギアスロット[this.editingSlotId];
    if (slot) {
      this.customGearSim = JSON.parse(JSON.stringify(slot));
    } else {
      // 未編成ならチップのみセットされた初期値
      this.customGearSim = { チップ: 'c001', ブレード: '', ウェイト: '', ソール: '', レベル: 1, EXP: 0 };
    }

    this.updateCustomAssembleArea();
  }

  private renderCustomSlots() {
    const container = document.getElementById('custom-slots-container');
    if (!container) return;

    container.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const slot = this.saveData.ギアスロット[i.toString()];
      const isEditing = this.editingSlotId === i.toString();

      const card = document.createElement('div');
      card.className = `slot-card ${isEditing ? 'active' : ''}`;
      
      let gearName = '未編成';
      let details = 'パーツをセットしてください';
      
      if (slot) {
        const chip = this.チップマスタ.find(c => c.チップID === slot.チップ);
        gearName = chip ? chip.チップ名 : 'カスタムギア';
        const assembled = アセンブル実行(slot.チップ, slot.ブレード, slot.ウェイト, slot.ソール, slot.レベル, this.パーツマスタ, this.チップマスタ, this.奥義マスタ);
        details = `L: ${assembled.ステータス.ライフ} A: ${assembled.ステータス.アタック} D: ${assembled.ステータス.ディフェンス}`;
      }

      card.innerHTML = `
        <div class="slot-header">
          <span>スロット ${i}</span>
          <span class="slot-gear-name">${gearName}</span>
        </div>
        <div style="font-size: 0.8rem; color: var(--color-text-sub);">${details}</div>
      `;

      card.addEventListener('click', () => {
        this.editingSlotId = i.toString();
        this.initCustomScreen();
      });

      container.appendChild(card);
    }
  }

  private prevCustomGearSim: any = null;
  private updateCustomAssembleArea() {
    const nameEl = document.getElementById('custom-active-slot-name');
    if (nameEl) nameEl.textContent = `スロット ${this.editingSlotId} の編集 (レベル: ${this.customGearSim.レベル})`;

    // パーツ換装の変更検知
    const isChanged = this.prevCustomGearSim && (
      this.prevCustomGearSim.チップ !== this.customGearSim.チップ ||
      this.prevCustomGearSim.ブレード !== this.customGearSim.ブレード ||
      this.prevCustomGearSim.ウェイト !== this.customGearSim.ウェイト ||
      this.prevCustomGearSim.ソール !== this.customGearSim.ソール
    );

    if (isChanged) {
      // フラッシュアニメーションのトリガー
      const canvas = document.getElementById('custom-gear-canvas');
      if (canvas) {
        canvas.classList.remove('equip-flash-active');
        void (canvas as any).offsetWidth; // リフロー
        canvas.classList.add('equip-flash-active');
      }
      // ガシャコン換装SEの再生
      this.playEquipSound();
    }

    this.prevCustomGearSim = JSON.parse(JSON.stringify(this.customGearSim));

    // 各部位の装備名更新
    const setEquippedName = (elId: string, partId: string, defaultName: string) => {
      const el = document.getElementById(elId);
      if (!el) return;
      
      if (partId) {
        // チップかパーツか
        const isChip = elId === 'equipped-chip-name';
        const found = isChip 
          ? this.チップマスタ.find(c => c.チップID === partId)
          : this.パーツマスタ.find(p => p.パーツID === partId);
        
        if (found) {
          const attr = (found as any).属性 ? ` [${(found as any).属性}]` : '';
          el.textContent = `${(found as any).パーツ名 || (found as any).チップ名}${attr}`;
          el.style.color = 'var(--color-neon-blue)';
          return;
        }
      }
      el.textContent = defaultName;
      el.style.color = 'var(--color-text-sub)';
    };

    setEquippedName('equipped-chip-name', this.customGearSim.チップ, 'バトルチップ未装備');
    setEquippedName('equipped-blade-name', this.customGearSim.ブレード, 'ブレード未装備');
    setEquippedName('equipped-weight-name', this.customGearSim.ウェイト, 'ウェイト未装備');
    setEquippedName('equipped-sole-name', this.customGearSim.ソール, 'ソール未装備');

    // プレビューの描画 (未編成ならダミーアセンブル)
    const assembledSim = アセンブル実行(
      this.customGearSim.チップ,
      this.customGearSim.ブレード || 'b101_n',
      this.customGearSim.ウェイト || 'w101_n',
      this.customGearSim.ソール || 's101_n',
      this.customGearSim.レベル,
      this.パーツマスタ,
      this.チップマスタ,
      this.奥義マスタ
    );
    this.renderGearPreview('custom-gear-canvas', assembledSim);

    // シミュレーション計算
    this.renderAssembleSimStats();
  }

  // 換装用のガシャコン金属音
  private playEquipSound() {
    const snd = SoundManager.getInstance();
    snd.initContext();
    const ctx = (snd as any).ctx;
    if (!ctx) return;

    const time = ctx.currentTime;
    
    // 1段目: 高めの金属打撃
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(600, time);
    osc1.frequency.linearRampToValueAtTime(150, time + 0.12);
    gain1.gain.setValueAtTime(0.04, time);
    gain1.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(time);
    osc1.stop(time + 0.18);

    // 2段目: 低いラッチ（少し遅らせて重なりを演出）
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(200, time + 0.05);
    osc2.frequency.linearRampToValueAtTime(80, time + 0.18);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(350, time + 0.05);

    gain2.gain.setValueAtTime(0.001, time + 0.05);
    gain2.gain.linearRampToValueAtTime(0.06, time + 0.07);
    gain2.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

    osc2.connect(filter);
    filter.connect(gain2);
    gain2.connect(ctx.destination);
    
    osc2.start(time + 0.05);
    osc2.stop(time + 0.25);
  }

  private renderAssembleSimStats() {
    const grid = document.getElementById('custom-sim-stats-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // 現在(セーブデータ)のステータス
    const currentSlot = this.saveData.ギアスロット[this.editingSlotId];
    let currentStats = { ライフ: 0, アタック: 0, ディフェンス: 0, スピード: 0, レンジ: 0, モビリティ: 0 };
    
    if (currentSlot && currentSlot.ブレード && currentSlot.ウェイト && currentSlot.ソール) {
      const assembled = アセンブル実行(currentSlot.チップ, currentSlot.ブレード, currentSlot.ウェイト, currentSlot.ソール, currentSlot.レベル, this.パーツマスタ, this.チップマスタ, this.奥義マスタ);
      currentStats = assembled.ステータス;
    }

    // 換装シミュレーションステータス
    let nextStats = { ライフ: 0, アタック: 0, ディフェンス: 0, スピード: 0, レンジ: 0, モビリティ: 0 };
    if (this.customGearSim.ブレード && this.customGearSim.ウェイト && this.customGearSim.ソール) {
      const assembledNext = アセンブル実行(this.customGearSim.チップ, this.customGearSim.ブレード, this.customGearSim.ウェイト, this.customGearSim.ソール, this.customGearSim.レベル, this.パーツマスタ, this.チップマスタ, this.奥義マスタ);
      nextStats = assembledNext.ステータス;
    }

    const keys = ['ライフ', 'アタック', 'ディフェンス', 'スピード', 'レンジ', 'モビリティ'];
    
    const wrapper = document.createElement('div');
    wrapper.className = 'lcd-meter-container';

    keys.forEach(key => {
      const curr = (currentStats as any)[key] || 0;
      const next = (nextStats as any)[key] || 0;
      const diff = next - curr;

      const diffText = diff > 0 ? `+${diff}` : (diff < 0 ? `${diff}` : '±0');

      // 液晶セグメントバーの作成 (最大20ブロック)
      const maxBlocks = 20;
      // MAXの基準値を600とし、初期値でも見栄えがするよう最小3ブロックを保証するマイルドなスケーリング
      const pct = Math.min(1.0, next / 600);
      const nextBlocks = Math.max(3, Math.round(pct * maxBlocks));
      
      let barStr = '';
      for (let i = 0; i < maxBlocks; i++) {
        barStr += i < nextBlocks ? '■' : '□';
      }

      // 液晶用の短縮ラベル
      let shortLabel = 'HP';
      if (key === 'アタック') shortLabel = 'ATK';
      else if (key === 'ディフェンス') shortLabel = 'DEF';
      else if (key === 'スピード') shortLabel = 'SPD';
      else if (key === 'レンジ') shortLabel = 'RNG';
      else if (key === 'モビリティ') shortLabel = 'MOB';

      const item = document.createElement('div');
      item.className = 'lcd-meter-item';
      item.innerHTML = `
        <span class="lcd-label">${shortLabel}</span>
        <span class="lcd-bar">${barStr}</span>
        <span style="font-size:0.8rem; font-family:monospace; min-width:105px; text-align:right;">
          ${curr}➔${next} <span style="font-weight:bold; color:${diff > 0 ? '#39ff14' : (diff < 0 ? '#ff3344' : '#888')};">${diffText}</span>
        </span>
      `;
      wrapper.appendChild(item);
    });

    grid.appendChild(wrapper);
  }

  // インベントリドロワーを展開
  private openInventoryDrawer(type: 'チップ' | 'ブレード' | 'ウェイト' | 'ソール') {
    const titleEl = document.getElementById('inventory-part-type-title');
    if (titleEl) titleEl.textContent = `${type}一覧`;

    const grid = document.getElementById('inventory-items-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // 所持している該当タイプのパーツ一覧を表示
    // チップと他のパーツでマスタが分かれている
    if (type === 'チップ') {
      const list = this.チップマスタ.filter(c => this.saveData.インベントリ.includes(c.チップID));
      list.forEach(item => {
        const isEquipped = this.customGearSim.チップ === item.チップID;
        const card = document.createElement('div');
        card.className = `inventory-item ${isEquipped ? 'equipped' : ''}`;
        card.innerHTML = `
          <div class="item-name">${item.チップ名}</div>
          <div class="item-attributes">${item.フレーバー || 'コアパーツ'}</div>
        `;
        card.addEventListener('click', () => {
          this.customGearSim.チップ = item.チップID;
          this.updateCustomAssembleArea();
          document.getElementById('inventory-drawer')?.classList.remove('active');
        });
        grid.appendChild(card);
      });
    } else {
      // パーツIDマッピング用の種別コード ("1": ブレード, "2": ウェイト, "3": ソール)
      const typeCode = type === 'ブレード' ? '1' : (type === 'ウェイト' ? '2' : '3');
      const list = this.パーツマスタ.filter(p => p.種別 === typeCode && this.saveData.インベントリ.includes(p.パーツID));
      
      // 現在装備している同一部位のパーツ情報を取得
      const currentEquippedId = type === 'ブレード' ? this.customGearSim.ブレード 
                               : (type === 'ウェイト' ? this.customGearSim.ウェイト 
                               : this.customGearSim.ソール);
      const currentPart = this.パーツマスタ.find(p => p.パーツID === currentEquippedId);

      // 差分テキスト生成ヘルパー
      const getDiffSpan = (currValStr: string | undefined, newValStr: string) => {
        const currVal = Number(currValStr || 0);
        const newVal = Number(newValStr || 0);
        const diff = newVal - currVal;
        if (diff > 0) {
          return `<span class="stat-val">${newVal} <span class="stat-diff plus">(+${diff})</span></span>`;
        } else if (diff < 0) {
          return `<span class="stat-val">${newVal} <span class="stat-diff minus">(${diff})</span></span>`;
        } else {
          return `<span class="stat-val">${newVal} <span class="stat-diff zero">(±0)</span></span>`;
        }
      };

      list.forEach(item => {
        const isEquipped = currentEquippedId === item.パーツID;

        // 各部位固有の4ステータスを抽出
        let statsHtml = '';
        if (type === 'ブレード') {
          statsHtml = `
            <span>ATK:${getDiffSpan(currentPart?.アタック, item.アタック)}</span>
            <span>DEF:${getDiffSpan(currentPart?.ディフェンス, item.ディフェンス)}</span>
            <span>RNG:${getDiffSpan(currentPart?.レンジ, item.レンジ)}</span>
            <span>MOB:${getDiffSpan(currentPart?.モビリティ, item.モビリティ)}</span>
          `;
        } else if (type === 'ウェイト') {
          statsHtml = `
            <span>HP:${getDiffSpan(currentPart?.ライフ, item.ライフ)}</span>
            <span>ATK:${getDiffSpan(currentPart?.アタック, item.アタック)}</span>
            <span>DEF:${getDiffSpan(currentPart?.ディフェンス, item.ディフェンス)}</span>
            <span>SPD:${getDiffSpan(currentPart?.スピード, item.スピード)}</span>
          `;
        } else { // ソール
          statsHtml = `
            <span>HP:${getDiffSpan(currentPart?.ライフ, item.ライフ)}</span>
            <span>SPD:${getDiffSpan(currentPart?.スピード, item.スピード)}</span>
            <span>RNG:${getDiffSpan(currentPart?.レンジ, item.レンジ)}</span>
            <span>MOB:${getDiffSpan(currentPart?.モビリティ, item.モビリティ)}</span>
          `;
        }

        const card = document.createElement('div');
        card.className = `inventory-item ${isEquipped ? 'equipped' : ''}`;
        card.innerHTML = `
          <div class="item-name">${item.パーツ名}</div>
          <div class="item-attributes">
            <span class="attr-tag">${item.属性}属性</span>
            <span class="attr-tag">ランク${item.ランク}</span>
          </div>
          <div class="item-stats-summary drawer-style">
            ${statsHtml}
          </div>
        `;
        card.addEventListener('click', () => {
          if (type === 'ブレード') this.customGearSim.ブレード = item.パーツID;
          else if (type === 'ウェイト') this.customGearSim.ウェイト = item.パーツID;
          else this.customGearSim.ソール = item.パーツID;
          
          this.updateCustomAssembleArea();
          document.getElementById('inventory-drawer')?.classList.remove('active');
        });
        grid.appendChild(card);
      });
    }

    document.getElementById('inventory-drawer')?.classList.add('active');
  }

  // --- ④ 全体マップ画面 ---
  private initMapScreen() {
    const jpEl = document.getElementById('map-jp');
    if (jpEl) jpEl.textContent = this.saveData.所持JP.toString();

    const pinsContainer = document.getElementById('map-pins-container');
    if (!pinsContainer) return;
    pinsContainer.innerHTML = '';

    // ピンの位置マッピング
    const pinPositions: { [key: string]: { x: number; y: number } } = {
      'st001': { x: 150, y: 250 },
      'st002': { x: 300, y: 150 },
      'st003': { x: 450, y: 250 },
      'st004': { x: 600, y: 150 },
      'st005': { x: 720, y: 250 },
      'st006': { x: 680, y: 90 }
    };

    // ステージマスタからピンを生成
    this.ステージマスタ.forEach(stage => {
      const pos = pinPositions[stage.ステージID];
      if (!pos) return;

      // 解放条件チェック
      let isLocked = false;
      if (stage.解放条件) {
        isLocked = !this.saveData.ステージクリア状況[stage.解放条件];
      }
      const isCleared = !!this.saveData.ステージクリア状況[stage.ステージID];
      const isCurrent = !isLocked && !isCleared;

      const pin = document.createElement('div');
      pin.className = `map-pin ${isLocked ? 'locked' : ''} ${isCleared ? 'cleared' : ''} ${isCurrent ? 'current' : ''}`;
      pin.style.left = `${pos.x - 24}px`;
      pin.style.top = `${pos.y - 48}px`;

      const inner = document.createElement('div');
      inner.className = 'map-pin-inner';
      inner.textContent = stage.ステージID.replace('st', ''); // "001"などの数字を表示
      pin.appendChild(inner);

      // クリア済みのステージにCLEAREDバッジを付与
      if (isCleared) {
        const badge = document.createElement('span');
        badge.className = 'pin-cleared-badge';
        badge.textContent = 'CLEARED';
        pin.appendChild(badge);
      }

      if (!isLocked) {
        pin.addEventListener('click', () => {
          this.selectedStageId = stage.ステージID;
          this.initStageScreen();
          this.changeScreen('stage-screen');
        });
      } else {
        pin.addEventListener('click', () => {
          const reqStage = this.ステージマスタ.find(s => s.ステージID === stage.解放条件);
          const reqName = reqStage ? reqStage.ステージ名 : '前ステージ';
          this.showSystemModal('エリアロック', `『${reqName}』のボスを撃破すると解放されます！`);
        });
      }

      pinsContainer.appendChild(pin);
    });

    // ジャンクショップピンの追加
    const shopDiv = document.createElement('div');
    shopDiv.className = 'map-pin shop-pin';
    shopDiv.style.left = '376px'; // x = 400 - 24
    shopDiv.style.top = '52px';  // y = 100 - 48
    shopDiv.innerHTML = '<div class="map-pin-inner">🛒</div>';
    shopDiv.style.background = '#ffd800';
    shopDiv.style.borderColor = '#222';
    shopDiv.addEventListener('click', () => {
      this.changeScreen('shop-screen');
    });
    pinsContainer.appendChild(shopDiv);

    // マップ背景を描画
    this.renderMapBackground();
  }

  private renderMapBackground() {
    this.mapCanvas = document.getElementById('map-canvas') as HTMLCanvasElement;
    if (!this.mapCanvas) return;
    this.mapCtx = this.mapCanvas.getContext('2d');
    const ctx = this.mapCtx;
    if (!ctx) return;

    ctx.clearRect(0, 0, 800, 400);

    // 1. 背景（サイバーブラック）
    ctx.fillStyle = '#06070c';
    ctx.fillRect(0, 0, 800, 400);

    // 2. 電脳グリッドの描画 (SFビジュアル)
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.04)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < 800; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 400); ctx.stroke();
    }
    for (let y = 0; y < 400; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(800, y); ctx.stroke();
    }

    const pinPositions: { [key: string]: { x: number; y: number } } = {
      'st001': { x: 150, y: 250 },
      'st002': { x: 300, y: 150 },
      'st003': { x: 450, y: 250 },
      'st004': { x: 600, y: 150 },
      'st005': { x: 720, y: 250 },
      'st006': { x: 680, y: 90 }
    };

    const connections = [
      { from: 'st001', to: 'st002' },
      { from: 'st002', to: 'st003' },
      { from: 'st003', to: 'st004' },
      { from: 'st004', to: 'st005' },
      { from: 'st005', to: 'st006' }
    ];

    // 3. 道の動的色分け描画 (進行度連動)
    connections.forEach(conn => {
      const fromPos = pinPositions[conn.from];
      const toPos = pinPositions[conn.to];
      if (!fromPos || !toPos) return;

      const fromCleared = !!this.saveData.ステージクリア状況[conn.from];
      
      const toStage = this.ステージマスタ.find(s => s.ステージID === conn.to);
      let toLocked = false;
      if (toStage && toStage.解放条件) {
        toLocked = !this.saveData.ステージクリア状況[toStage.解放条件];
      }

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(fromPos.x, fromPos.y);
      ctx.lineTo(toPos.x, toPos.y);

      if (fromCleared) {
        // クリア済み接続線：太いネオングリーン実線
        ctx.strokeStyle = '#39ff14';
        ctx.lineWidth = 4.5;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#39ff14';
        ctx.stroke();
      } else if (!toLocked) {
        // 現在進行中の接続線：ネオンオレンジ点滅風の破線
        ctx.strokeStyle = '#ffaa00';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 6]);
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#ffaa00';
        ctx.stroke();
      } else {
        // ロック中の接続線：細いダークグレーの破線
        ctx.strokeStyle = '#2d313d';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
      }
      ctx.restore();
    });

    // 4. ロックされているエリアの霧および電脳警告ラインの描画
    const stages = ['st001', 'st002', 'st003', 'st004', 'st005', 'st006'];
    let firstLockedIdx = -1;
    for (let i = 0; i < stages.length; i++) {
      const sId = stages[i];
      const stage = this.ステージマスタ.find(s => s.ステージID === sId);
      if (stage && stage.解放条件) {
        if (!this.saveData.ステージクリア状況[stage.解放条件]) {
          firstLockedIdx = i;
          break;
        }
      }
    }

    if (firstLockedIdx !== -1) {
      const lockX = pinPositions[stages[firstLockedIdx]].x - 50;
      
      // 暗黒の電脳シールド
      ctx.save();
      ctx.fillStyle = 'rgba(10, 11, 16, 0.75)';
      ctx.fillRect(lockX, 0, 800 - lockX, 400);

      // 境界線ネオンレッド警告線
      ctx.strokeStyle = '#ff0055';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(lockX, 0);
      ctx.lineTo(lockX, 400);
      ctx.stroke();

      // 警告文字
      ctx.fillStyle = '#ff0055';
      ctx.font = 'bold 15px "Impact", "Outfit", sans-serif';
      ctx.letterSpacing = '2px';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ff0055';
      ctx.fillText("LOCKED AREA", lockX + 25, 30);
      ctx.restore();
    }
  }

  // --- ⑤ ステージ詳細画面 ---
  private initStageScreen() {
    const listEl = document.getElementById('stage-npc-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    // アクティブなステージ情報をバインド
    const stage = this.ステージマスタ.find(s => s.ステージID === this.selectedStageId);
    const stageTitle = document.getElementById('stage-title');
    if (stageTitle && stage) {
      stageTitle.textContent = `${stage.ステージ名}: ${stage.フレーバー || ''}`;
    }

    // 選択されたステージIDのエネミーを並び順の昇順で抽出
    const npcs = this.エネミーマスタ
      .filter(e => e.登場ステージID === this.selectedStageId)
      .sort((a, b) => Number(a.並び順) - Number(b.並び順));

    const normalNpcs = npcs.filter(n => n.ボスフラグ !== '1');
    const isAllNormalCleared = normalNpcs.every(n => this.saveData.クリア状況[n.エネミーID] === true);

    // ボス解放トリガー：通常ライバル全員クリアしてまだこのステージのボス解放会話を見ていない場合
    const hasBossUnlocked = this.saveData.ボス解放済みステージ[this.selectedStageId] === true;
    if (isAllNormalCleared && !hasBossUnlocked) {
      this.saveData.ボス解放済みステージ[this.selectedStageId] = true;
      localStorage.setItem('spinning_crush_save', JSON.stringify(this.saveData));

      const bossNpc = npcs.find(n => n.ボスフラグ === '1');
      const bossName = bossNpc ? bossNpc.エネミー名 : 'ボス';

      this.startTalk([
        {
          speaker: 'ナビィ',
          text: '「マスター！通常ライバルの4人を全員撃破しました！」',
          onComplete: () => {
            const avatarLeft = document.getElementById('talk-avatar-left');
            if (avatarLeft) {
              avatarLeft.className = 'talk-avatar left active avatar-sn_001';
            }
          }
        },
        { speaker: 'ナビィ', text: `「これでついにこのエリアのボス『${bossName}』がアンロックされました！」` },
        { speaker: 'ナビィ', text: `「『${bossName}』は手強い強敵です。ガレージで万全のアセンブルを整えて挑みましょう！」` }
      ], () => {
        const avatarLeft = document.getElementById('talk-avatar-left');
        if (avatarLeft) avatarLeft.className = 'talk-avatar left';
        this.initStageScreen(); // カードリストの再描画
      });
      return;
    }

    let winCount = 0;

    npcs.forEach(npc => {
      const card = document.createElement('div');
      const isBoss = npc.ボスフラグ === '1';
      const isCleared = this.saveData.クリア状況[npc.エネミーID] === true;
      if (isCleared) winCount++;

      // ボスがロック中の場合
      if (isBoss && !isAllNormalCleared) {
        card.className = 'npc-card boss locked';
        card.innerHTML = `
          <div class="npc-card-info">
            <h4>??? <span class="npc-boss-badge" style="background:var(--color-text-sub);">LOCKED</span></h4>
            <span style="font-size: 0.8rem; color: var(--color-neon-pink);">通常ライバルを全員撃破すると挑戦可能になります</span>
          </div>
          <div class="npc-win-status">
            🔒 LOCKED
          </div>
        `;
        listEl.appendChild(card);
        return;
      }

      const wins = this.saveData.勝利数[npc.エネミーID] || 0;
      const reqWins = Number(npc.クリア必要勝利数 || 3);

      card.className = `npc-card ${isBoss ? 'boss' : ''}`;
      card.innerHTML = `
        <div class="npc-card-info">
          <h4>${npc.エネミー名}${isBoss ? '<span class="npc-boss-badge">BOSS</span>' : ''}</h4>
          <span style="font-size: 0.8rem; color: var(--color-text-sub);">登場ステージID: ${npc.登場ステージID} | 並び順: ${npc.並び順}</span>
        </div>
        <div class="npc-win-status ${isCleared ? 'cleared' : ''}">
          ${isCleared ? `★ WIN (${wins}/${reqWins})` : `☆ CHALLENGE (${wins}/${reqWins})`}
        </div>
      `;

      card.addEventListener('click', () => {
        this.selectedNpc = npc;
        
        // バトル前フリートークセリフをマスタから取得 (見つからない場合はフォールバック)
        const textKey = `${npc.エネミーID}_btl`;
        const foundSerifu = this.セリフマスタ.find(s => s.TEXT_ID === textKey);
        const serifuContent = foundSerifu?.テキスト内容 || `「ふっ、予選第${npc.並び順}戦の相手はお前か。手加減はしないぞ！」`;

        this.startTalk([
          {
            speaker: npc.エネミー名,
            text: serifuContent,
            onComplete: () => {
              const avatarRight = document.getElementById('talk-avatar-right');
              if (avatarRight) {
                // 右側にライバルキャラのホログラム立ち絵を表示
                const isDefault = !['e005'].includes(npc.エネミーID);
                avatarRight.className = `talk-avatar right active ${isDefault ? 'avatar-default' : 'avatar-' + npc.エネミーID}`;
              }
            }
          }
        ], () => {
          // 終わったらアバターを片付けてVS画面へ
          const avatarRight = document.getElementById('talk-avatar-right');
          if (avatarRight) avatarRight.className = 'talk-avatar right';
          this.changeScreen('vs-screen');
        });
      });

      listEl.appendChild(card);
    });

    // 進行状況ゲージ更新
    const gaugeFill = document.getElementById('stage-clear-gauge-fill');
    if (gaugeFill) {
      const pct = (winCount / npcs.length) * 100;
      gaugeFill.style.width = `${pct}%`;
    }
    const textEl = document.getElementById('stage-clear-text');
    if (textEl) {
      textEl.textContent = `${winCount} / ${npcs.length}`;
    }
  }

  // --- ⑥ VS準備画面 ---
  private initVsScreen() {
    if (!this.selectedNpc) return;

    // プレイヤーの最後使用スロットから表示
    this.vsSlotIndex = this.saveData.最後使用スロット;

    this.updateVsGearDisplay();
  }

  private switchVsSlot(dir: number) {
    let nextIndex = this.vsSlotIndex;
    let found = false;

    // 5つのスロットの中で、未編成(null)でない有効なスロットをループ検索
    for (let i = 1; i <= 5; i++) {
      nextIndex = nextIndex + dir;
      if (nextIndex > 5) nextIndex = 1;
      if (nextIndex < 1) nextIndex = 5;

      if (this.saveData.ギアスロット[nextIndex.toString()] !== null) {
        this.vsSlotIndex = nextIndex;
        found = true;
        break;
      }
    }

    if (found) {
      this.updateVsGearDisplay();
    }
  }

  private updateVsGearDisplay() {
    if (!this.selectedNpc) return;

    // プレイヤーギア
    const playerSlot = this.saveData.ギアスロット[this.vsSlotIndex.toString()];
    if (!playerSlot) return;

    const playerAssembled = アセンブル実行(
      playerSlot.チップ,
      playerSlot.ブレード,
      playerSlot.ウェイト,
      playerSlot.ソール,
      playerSlot.レベル,
      this.パーツマスタ,
      this.チップマスタ,
      this.奥義マスタ
    );

    const slotLabel = document.getElementById('vs-slot-label');
    if (slotLabel) slotLabel.textContent = `スロット ${this.vsSlotIndex} (出撃)`;

    const playerGearName = document.getElementById('vs-player-gear-name');
    if (playerGearName) {
      const chip = this.チップマスタ.find(c => c.チップID === playerSlot.チップ);
      playerGearName.textContent = chip ? chip.チップ名 : 'カスタムギア';
    }

    this.renderVsStats('vs-player-stats', playerAssembled);
    this.renderGearPreview('vs-player-canvas', playerAssembled);

    // エネミーギア
    const enemyAssembled = アセンブル実行(
      this.selectedNpc.チップID,
      this.selectedNpc.ブレードID,
      this.selectedNpc.ウェイトID,
      this.selectedNpc.ソールID,
      1, // 敵はレベル1固定
      this.パーツマスタ,
      this.チップマスタ,
      this.奥義マスタ
    );

    const enemyGearName = document.getElementById('vs-enemy-gear-name');
    if (enemyGearName) {
      enemyGearName.textContent = this.selectedNpc.エネミー名;
    }

    this.renderVsStats('vs-enemy-stats', enemyAssembled);
    this.renderGearPreview('vs-enemy-canvas', enemyAssembled);

    // 装備パーツリスト＆属性相性バッジの動的生成
    const playerPartsEl = document.getElementById('vs-player-parts');
    const enemyPartsEl = document.getElementById('vs-enemy-parts');

    if (playerPartsEl && enemyPartsEl) {
      // プレイヤー側パーツ
      const pBladePart = this.パーツマスタ.find(p => p.パーツID === playerSlot!.ブレード);
      const pWeightPart = this.パーツマスタ.find(p => p.パーツID === playerSlot!.ウェイト);
      const pSolePart = this.パーツマスタ.find(p => p.パーツID === playerSlot!.ソール);

      // エネミー側パーツ
      const eBladePart = this.パーツマスタ.find(p => p.パーツID === this.selectedNpc!.ブレードID);
      const eWeightPart = this.パーツマスタ.find(p => p.パーツID === this.selectedNpc!.ウェイトID);
      const eSolePart = this.パーツマスタ.find(p => p.パーツID === this.selectedNpc!.ソールID);

      const pBladeAttr = playerAssembled.部位属性.ブレード;
      const eBladeAttr = enemyAssembled.部位属性.ブレード;
      const pWeightAttr = playerAssembled.部位属性.ウェイト;
      const eWeightAttr = enemyAssembled.部位属性.ウェイト;
      const pSoleAttr = playerAssembled.部位属性.ソール;
      const eSoleAttr = enemyAssembled.部位属性.ソール;

      const bladeRes = 属性相性判定(pBladeAttr, eBladeAttr);
      const weightRes = 属性相性判定(pWeightAttr, eWeightAttr);
      const soleRes = 属性相性判定(pSoleAttr, eSoleAttr);

      const getAttrClass = (attr: string) => {
        if (attr === '火') return 'attr-fire';
        if (attr === '水') return 'attr-water';
        if (attr === '風') return 'attr-wind';
        if (attr === '土' || attr === '雷') return 'attr-earth';
        return 'attr-none';
      };

      const getMatchupBadgeHtml = (res: number, side: 'player' | 'enemy') => {
        if (res === 0) return '<span class="vs-matchup-badge badge-draw">DRAW</span>';
        if (side === 'player') {
          return res === 1 
            ? '<span class="vs-matchup-badge badge-win">▲ ADV</span>' 
            : '<span class="vs-matchup-badge badge-lose">▼ BAD</span>';
        } else {
          return res === -1 
            ? '<span class="vs-matchup-badge badge-win">▲ ADV</span>' 
            : '<span class="vs-matchup-badge badge-lose">▼ BAD</span>';
        }
      };

      // プレイヤー側表示
      playerPartsEl.innerHTML = `
        <div class="vs-part-row">
          <span class="vs-part-type">刃:</span>
          <span class="vs-part-name">${pBladePart ? pBladePart.パーツ名 : '---'}</span>
          <span class="vs-part-attr ${getAttrClass(pBladeAttr)}">${pBladeAttr}</span>
          ${pBladeAttr !== '無' || eBladeAttr !== '無' ? getMatchupBadgeHtml(bladeRes, 'player') : ''}
        </div>
        <div class="vs-part-row">
          <span class="vs-part-type">重:</span>
          <span class="vs-part-name">${pWeightPart ? pWeightPart.パーツ名 : '---'}</span>
          <span class="vs-part-attr ${getAttrClass(pWeightAttr)}">${pWeightAttr}</span>
          ${pWeightAttr !== '無' || eWeightAttr !== '無' ? getMatchupBadgeHtml(weightRes, 'player') : ''}
        </div>
        <div class="vs-part-row">
          <span class="vs-part-type">底:</span>
          <span class="vs-part-name">${pSolePart ? pSolePart.パーツ名 : '---'}</span>
          <span class="vs-part-attr ${getAttrClass(pSoleAttr)}">${pSoleAttr}</span>
          ${pSoleAttr !== '無' || eSoleAttr !== '無' ? getMatchupBadgeHtml(soleRes, 'player') : ''}
        </div>
      `;

      // エネミー側表示
      enemyPartsEl.innerHTML = `
        <div class="vs-part-row">
          <span class="vs-part-type">刃:</span>
          <span class="vs-part-name">${eBladePart ? eBladePart.パーツ名 : '---'}</span>
          <span class="vs-part-attr ${getAttrClass(eBladeAttr)}">${eBladeAttr}</span>
          ${pBladeAttr !== '無' || eBladeAttr !== '無' ? getMatchupBadgeHtml(bladeRes, 'enemy') : ''}
        </div>
        <div class="vs-part-row">
          <span class="vs-part-type">重:</span>
          <span class="vs-part-name">${eWeightPart ? eWeightPart.パーツ名 : '---'}</span>
          <span class="vs-part-attr ${getAttrClass(eWeightAttr)}">${eWeightAttr}</span>
          ${pWeightAttr !== '無' || eWeightAttr !== '無' ? getMatchupBadgeHtml(weightRes, 'enemy') : ''}
        </div>
        <div class="vs-part-row">
          <span class="vs-part-type">底:</span>
          <span class="vs-part-name">${eSolePart ? eSolePart.パーツ名 : '---'}</span>
          <span class="vs-part-attr ${getAttrClass(eSoleAttr)}">${eSoleAttr}</span>
          ${pSoleAttr !== '無' || eSoleAttr !== '無' ? getMatchupBadgeHtml(soleRes, 'enemy') : ''}
        </div>
      `;
    }
  }

  private renderVsStats(elId: string, assembled: アセンブルデータ) {
    const el = document.getElementById(elId);
    if (!el) return;

    const stats = assembled.ステータス;
    el.innerHTML = `
      <div class="vs-stat-item"><span>ライフ:</span> <span>${stats.ライフ}</span></div>
      <div class="vs-stat-item"><span>アタック:</span> <span>${stats.アタック}</span></div>
      <div class="vs-stat-item"><span>防衛:</span> <span>${stats.ディフェンス}</span></div>
      <div class="vs-stat-item"><span>速さ:</span> <span>${stats.スピード}</span></div>
      <div class="vs-stat-item"><span>範囲:</span> <span>${stats.レンジ}</span></div>
      <div class="vs-stat-item"><span>機動:</span> <span>${stats.モビリティ}</span></div>
    `;
  }

  private getGachaMaxRank(): number {
    let maxRank = 1;
    this.ステージマスタ.forEach(stage => {
      const isUnlocked = !stage.解放条件 || this.saveData.ステージクリア状況[stage.解放条件] === true;
      if (isUnlocked) {
        const match = stage.ガチャ解禁.match(/\d+/);
        const rankVal = match ? parseInt(match[0]) : 1;
        if (rankVal > maxRank) {
          maxRank = rankVal;
        }
      }
    });
    return maxRank;
  }

  // --- ⑨ ジャンクショップ画面 ---
  private initShopScreen() {
    const jpEl = document.getElementById('shop-jp');
    if (jpEl) jpEl.textContent = this.saveData.所持JP.toString();

    const gachaMsg = document.getElementById('gacha-status-message');
    if (gachaMsg) gachaMsg.textContent = '';

    // ガチャ実行の制限
    const maxRank = this.getGachaMaxRank();
    const targetParts = this.パーツマスタ.filter(p => {
      const pRank = parseInt(p.ランク);
      return !isNaN(pRank) && pRank <= maxRank;
    });
    const isAllOwned = targetParts.every(p => this.saveData.インベントリ.includes(p.パーツID));
    
    const btn = document.getElementById('btn-shop-gacha') as HTMLButtonElement;
    if (btn) {
      if (isAllOwned) {
        btn.disabled = true;
        btn.textContent = `全ランク${maxRank}以下パーツ獲得済み`;
      } else {
        btn.disabled = false;
        btn.textContent = `ガチャを回す (解禁: ランク${maxRank}以下)`;
      }
    }
  }

  // ガチャの実行
  private executeShopGacha() {
    if (this.saveData.所持JP < 10) {
      this.showSystemModal('JP不足', 'ガチャを回すには 10 JP 必要です。ライバルとバトルしてJPを獲得しましょう！');
      return;
    }

    const maxRank = this.getGachaMaxRank();
    const targetParts = this.パーツマスタ.filter(p => {
      const pRank = parseInt(p.ランク);
      return !isNaN(pRank) && pRank <= maxRank;
    });
    const unownedParts = targetParts.filter(p => !this.saveData.インベントリ.includes(p.パーツID));

    if (unownedParts.length === 0) {
      this.showSystemModal('ショップ案内', `現在解放されているランク${maxRank}以下のすべてのパーツを獲得済みです！`);
      return;
    }

    // 10JP消費
    this.saveData.所持JP -= 10;
    
    // ガチャ演出としてランダムで1個未所持パーツを獲得
    const randomIndex = Math.floor(Math.random() * unownedParts.length);
    const reward = unownedParts[randomIndex];

    this.saveData.インベントリ.push(reward.パーツID);
    localStorage.setItem('spinning_crush_save', JSON.stringify(this.saveData));

    // ガチャ演出オーバーレイのDOM要素を取得
    const overlay = document.getElementById('gacha-performance-overlay');
    const handle = document.getElementById('gacha-perf-handle');
    const capsule = document.getElementById('gacha-capsule-fall');
    const flash = document.getElementById('gacha-perf-flash');
    const card = document.getElementById('gacha-perf-result-card');

    if (overlay && handle && capsule && flash && card) {
      // クラスを初期化
      overlay.classList.add('active');
      handle.classList.remove('turn-action');
      capsule.classList.remove('drop-active', 'split-active');
      capsule.style.opacity = '0';
      flash.classList.remove('flash-active');
      card.classList.remove('card-visible');

      // 1. ハンドル回転
      setTimeout(() => {
        handle.classList.add('turn-action');
        this.snd.playGachaSpin(); // ハンドル回転音
      }, 50);

      // 2. カプセル落下 (ハンドルが回りきった0.5秒後)
      setTimeout(() => {
        capsule.style.opacity = '1';
        capsule.classList.add('drop-active');
      }, 550);

      // 3. カプセル分裂 ＆ 閃光 (落下完了の1.3秒後)
      setTimeout(() => {
        capsule.classList.add('split-active');
        flash.classList.add('flash-active');
        this.snd.playCapsuleDropOpen(); // カプセル分裂音
        this.snd.playExplosion(); // 閃光爆発音
      }, 1300);

      // 4. カード出現 ＆ 2D Canvas描画 (1.5秒後)
      setTimeout(() => {
        // 獲得パーツ情報のバインド
        const nameEl = document.getElementById('gacha-result-part-name');
        if (nameEl) nameEl.textContent = reward.パーツ名;

        const statsEl = document.getElementById('gacha-result-part-stats');
        if (statsEl) {
          statsEl.innerHTML = `
            <div style="display:flex; justify-content:space-between; font-size:0.9rem; color:#ff5500; font-weight:800;">
              <span>部位: ${reward.種別 === '1' ? 'ブレード' : (reward.種別 === '2' ? 'ウェイト' : 'ソール')}</span>
              <span>属性: ${reward.属性}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:5px; font-weight:700;">
              <span>HP: +${reward.ライフ}</span>
              <span>ATK: +${reward.アタック}</span>
              <span>DEF: +${reward.ディフェンス}</span>
            </div>
          `;
        }

        // 獲得パーツのCanvasプレビュー描画
        const visualContainer = document.getElementById('gacha-result-part-visual');
        if (visualContainer) {
          visualContainer.innerHTML = '<canvas id="gacha-reward-canvas" width="80" height="80"></canvas>';
          const rewardAssembled = アセンブル実行(
            'c001',
            reward.種別 === '1' ? reward.パーツID : 'b101_n',
            reward.種別 === '2' ? reward.パーツID : 'w101_n',
            reward.種別 === '3' ? reward.パーツID : 's101_n',
            1,
            this.パーツマスタ,
            this.チップマスタ,
            this.奥義マスタ
          );
          this.renderGearPreview('gacha-reward-canvas', rewardAssembled);
        }

        card.classList.add('card-visible');
        this.snd.playVictoryJingle(); // 獲得お祝いファンファーレ
      }, 1500);
    } else {
      // フォールバック（何らかの理由でDOMがない場合）
      this.initShopScreen();
      this.snd.playVictoryJingle();
      this.showSystemModal('ガチャ結果', `新パーツ「${reward.パーツ名}」を獲得しました！`);
    }
  }

  // ==========================================
  // 6. 2D Canvas によるギアプレビュー描画
  // ==========================================
  private previewAnimIds: { [canvasId: string]: number } = {};
  private previewAngles: { [canvasId: string]: number } = {};
  private previewHovers: { [canvasId: string]: boolean } = {};
  private previewSparks: { [canvasId: string]: { x: number, y: number, vx: number, vy: number, life: number, maxLife: number, color: string }[] } = {};

  private renderGearPreview(canvasId: string, assembled: アセンブルデータ) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 既存のループがあればキャンセル
    if (this.previewAnimIds[canvasId]) {
      cancelAnimationFrame(this.previewAnimIds[canvasId]);
    }

    this.previewAngles[canvasId] = this.previewAngles[canvasId] || 0;
    this.previewHovers[canvasId] = false;
    this.previewSparks[canvasId] = [];

    // ホバー音・フラグのイベントリスナー設定 (重複回避のため data 属性でチェック)
    if (canvas.getAttribute('data-hover-bound') !== '1') {
      canvas.setAttribute('data-hover-bound', '1');
      
      canvas.addEventListener('mouseenter', () => {
        this.previewHovers[canvasId] = true;
        this.playGearRevSound();
      });
      canvas.addEventListener('mouseleave', () => {
        this.previewHovers[canvasId] = false;
      });
    }

    const attr = assembled.部位属性.ブレード;
    let neonColor = '#00f3ff';
    if (attr === '火') neonColor = '#ff0055';
    else if (attr === '水') neonColor = '#00f3ff';
    else if (attr === '風') neonColor = '#39ff14';
    else if (attr === '土') neonColor = '#ffaa00';
    else if (attr === '無') neonColor = '#f0f3fa';

    const loop = () => {
      // 画面からCanvasが消えていたらループを終了
      const currentCanvas = document.getElementById(canvasId);
      if (!currentCanvas || !ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const isHovered = this.previewHovers[canvasId];
      const speed = isHovered ? 0.16 : 0.015;
      this.previewAngles[canvasId] += speed;

      const sparks = this.previewSparks[canvasId] || [];

      // ホバー時は火花パーティクルを生成
      if (isHovered && sparks) {
        // 毎フレーム 1〜2 個の火花を外周に生成
        const r = 50; // プレビューのギア半径
        const theta = Math.random() * Math.PI * 2;
        sparks.push({
          x: w / 2 + r * Math.cos(theta),
          y: h / 2 + r * Math.sin(theta),
          vx: (Math.random() - 0.5) * 5 + Math.cos(theta) * 2,
          vy: (Math.random() - 0.5) * 5 + Math.sin(theta) * 2 - 2, // 上方向へ
          life: 0,
          maxLife: 15 + Math.random() * 10,
          color: neonColor
        });
      }

      // 火花の更新と描画
      if (sparks) {
        for (let i = sparks.length - 1; i >= 0; i--) {
          const p = sparks[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.15; // 重力
          p.life++;
          if (p.life >= p.maxLife) {
            sparks.splice(i, 1);
          } else {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = 1.0 - (p.life / p.maxLife);
            ctx.shadowBlur = 6;
            ctx.shadowColor = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.5 + Math.random() * 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
            ctx.shadowBlur = 0;
          }
        }
      }

      // ギアの描画 (半径50pxでプレビュー表示)
      this.drawGear(ctx, w / 2, h / 2, 50, assembled, this.previewAngles[canvasId]);

      this.previewAnimIds[canvasId] = requestAnimationFrame(loop);
    };

    loop();
  }

  // ギア急回転起動音の動的シンセサイズ (ギュイィィン)
  private playGearRevSound() {
    const snd = SoundManager.getInstance();
    snd.initContext();
    const ctx = (snd as any).ctx;
    if (!ctx) return;

    const time = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, time);
    osc.frequency.exponentialRampToValueAtTime(880, time + 0.35);

    // ハイパスフィルタを通して、キュイィンという高域成分に絞る
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(400, time);
    filter.frequency.exponentialRampToValueAtTime(1200, time + 0.35);

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.03, time + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(time);
    osc.stop(time + 0.45);
  }

  private drawGear(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    assembled: アセンブルデータ,
    rotation: number
  ) {
    ctx.save();
    ctx.translate(x, y);

    // 1. 属性に応じたネオンカラーの決定 (色分け)
    let neonColor = 'var(--color-neon-blue)';
    const attr = assembled.部位属性.ブレード;
    if (attr === '火') neonColor = '#ff0055';      // ネオンレッド
    else if (attr === '水') neonColor = '#00f3ff'; // ネオンブルー
    else if (attr === '風') neonColor = '#39ff14'; // ネオングリーン
    else if (attr === '土') neonColor = '#ffaa00'; // ネオンオレンジ/イエロー
    else if (attr === '無') neonColor = '#f0f3fa'; // サイバーホワイト

    // パーツの個性(ID末尾のタイプ)とランクを取得するヘルパー
    const getPartType = (partId: string): 'attack' | 'defense' | 'speed' | 'balance' => {
      if (!partId) return 'balance';
      const parts = partId.split('_');
      if (parts.length < 2) return 'balance';
      const suffix = parts[1].toLowerCase();
      if (suffix === 'f') return 'attack';
      if (suffix === 'e') return 'defense';
      if (suffix === 'a') return 'speed';
      if (suffix === 'w') return 'balance';
      return 'balance';
    };

    const getPartRank = (partId: string): number => {
      if (!partId || partId.length < 2) return 1;
      const r = Number(partId.charAt(1));
      return isNaN(r) ? 1 : r;
    };

    const bladeId = assembled.装備ID.ブレード;
    const weightId = assembled.装備ID.ウェイト;
    const soleId = assembled.装備ID.ソール;
    const chipId = assembled.装備ID.チップ;

    const bladeType = getPartType(bladeId);
    const bladeRank = getPartRank(bladeId);

    const weightType = getPartType(weightId);
    const weightRank = getPartRank(weightId);

    const soleType = getPartType(soleId);

    const chipType = getPartType(chipId);

    // 0. 超高速スピン気流（ネオントレイルライン）
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.35, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = neonColor;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5;
    ctx.shadowBlur = 8;
    ctx.shadowColor = neonColor;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.35, rotation * 3, rotation * 3 + Math.PI * 0.45);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.35, rotation * 3 + Math.PI, rotation * 3 + Math.PI + Math.PI * 0.45);
    ctx.stroke();
    ctx.restore();

    ctx.rotate(rotation);

    // 1. 最下層：ソール (中心の光るスタビライザーライン)
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 15;
    ctx.shadowColor = neonColor;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.15, 0, Math.PI * 2);
    ctx.fill();

    // ソールの個性に応じた補助スタビライザー
    ctx.save();
    ctx.strokeStyle = neonColor;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.6;
    if (soleType === 'speed') {
      // スピード型：3本のシャープスリットライン
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(radius * 0.45 * Math.cos(angle), radius * 0.45 * Math.sin(angle));
        ctx.stroke();
      }
    } else if (soleType === 'defense') {
      // 防御型：頑丈な二重同心円リング
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.35, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // バランス型等：シンプルな一重サークルライン
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.28, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // 2. 第二層：ウェイト (メタル重量リング)
    let weightSides = 6;
    let weightColor = 'rgba(255, 215, 0, 0.7)'; // ゴールド（デフォルト）

    if (weightType === 'attack') {
      weightSides = 8; // アタック：シャープな八角形
      weightColor = 'rgba(255, 140, 0, 0.75)'; // カッパー/ブロンズ
    } else if (weightType === 'defense') {
      weightSides = 12; // 防御：円に近い十二角形
      weightColor = 'rgba(192, 192, 192, 0.8)'; // 重厚シルバー
    } else {
      weightSides = 6; // バランス等：スタンダード六角形
      weightColor = 'rgba(212, 175, 55, 0.8)'; // ゴールド
    }

    // ランクが高いほどウェイトが太く肉厚になる
    ctx.strokeStyle = weightColor;
    ctx.lineWidth = radius * (0.14 + weightRank * 0.015);
    ctx.shadowBlur = 0;
    ctx.beginPath();
    for (let i = 0; i <= weightSides; i++) {
      const angle = (i / weightSides) * Math.PI * 2;
      const rx = (radius * 0.5) * Math.cos(angle);
      const ry = (radius * 0.5) * Math.sin(angle);
      if (i === 0) ctx.moveTo(rx, ry);
      else ctx.lineTo(rx, ry);
    }
    ctx.closePath();
    ctx.stroke();

    // 3. 第一層：ブレード (物理回転翼)
    ctx.strokeStyle = neonColor;
    ctx.lineWidth = radius * 0.08;
    ctx.shadowBlur = 10;
    ctx.shadowColor = neonColor;
    ctx.fillStyle = 'rgba(10, 12, 20, 0.6)'; // スモーククリア樹脂風

    // ランクが高いほど外周のトゲトゲが巨大化
    const outerScale = 1.1 + (bladeRank * 0.035);

    ctx.beginPath();
    if (bladeType === 'attack') {
      // 攻撃特化：8枚の鋭い鋸歯（のこぎり）刃
      const blades = 8;
      for (let i = 0; i < blades; i++) {
        const angle = (i / blades) * Math.PI * 2;
        const x1 = radius * 0.85 * Math.cos(angle);
        const y1 = radius * 0.85 * Math.sin(angle);
        const tx = radius * outerScale * Math.cos(angle + 0.15);
        const ty = radius * outerScale * Math.sin(angle + 0.15);
        const x2 = radius * 0.7 * Math.cos(angle + 0.25);
        const y2 = radius * 0.7 * Math.sin(angle + 0.25);

        if (i === 0) ctx.moveTo(x1, y1);
        ctx.lineTo(tx, ty);
        ctx.lineTo(x2, y2);
      }
    } else if (bladeType === 'defense') {
      // 防御特化：円形に近い盾状の丸い4枚ガード刃
      const blades = 4;
      for (let i = 0; i < blades; i++) {
        const angle = (i / blades) * Math.PI * 2;
        const x1 = radius * 0.9 * Math.cos(angle);
        const y1 = radius * 0.9 * Math.sin(angle);
        const tx = radius * outerScale * 0.95 * Math.cos(angle + 0.4);
        const ty = radius * outerScale * 0.95 * Math.sin(angle + 0.4);
        const x2 = radius * 0.85 * Math.cos(angle + 0.8);
        const y2 = radius * 0.85 * Math.sin(angle + 0.8);

        if (i === 0) ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(tx, ty, x2, y2);
      }
    } else if (bladeType === 'speed') {
      // スピード特化：逆巻く巨大な2枚ツバサ翼
      const blades = 2;
      for (let i = 0; i < blades; i++) {
        const angle = (i / blades) * Math.PI * 2;
        const x1 = radius * 0.75 * Math.cos(angle);
        const y1 = radius * 0.75 * Math.sin(angle);
        const tx1 = radius * outerScale * 1.15 * Math.cos(angle + 0.35);
        const ty1 = radius * outerScale * 1.15 * Math.sin(angle + 0.35);
        const tx2 = radius * outerScale * 1.25 * Math.cos(angle + 0.45);
        const ty2 = radius * outerScale * 1.25 * Math.sin(angle + 0.45);
        const x2 = radius * 0.6 * Math.cos(angle + 0.9);
        const y2 = radius * 0.6 * Math.sin(angle + 0.9);

        if (i === 0) ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(tx1, ty1, tx2, ty2, x2, y2);
      }
    } else {
      // バランス型：スタンダードな4枚フック刃
      const blades = 4;
      for (let i = 0; i < blades; i++) {
        const angle = (i / blades) * Math.PI * 2;
        const x1 = radius * Math.cos(angle);
        const y1 = radius * Math.sin(angle);
        const tx = radius * outerScale * 1.1 * Math.cos(angle + 0.25);
        const ty = radius * outerScale * 1.1 * Math.sin(angle + 0.25);
        const x2 = radius * 0.7 * Math.cos(angle + 0.5);
        const y2 = radius * 0.7 * Math.sin(angle + 0.5);

        if (i === 0) ctx.moveTo(x1, y1);
        ctx.lineTo(tx, ty);
        ctx.lineTo(x2, y2);
      }
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 4. 最上層：コアチップ (中央のシンボルマーク)
    ctx.fillStyle = '#0a0b10';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // コアチップ内の性格紋章
    ctx.strokeStyle = neonColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (chipType === 'attack') {
      // 火/攻撃：トライアングル (炎・刃)
      ctx.moveTo(0, -radius * 0.18);
      ctx.lineTo(-radius * 0.14, radius * 0.1);
      ctx.lineTo(radius * 0.14, radius * 0.1);
      ctx.closePath();
      ctx.stroke();
    } else if (chipType === 'defense') {
      // 防御：サークルプロテクター (シールド)
      ctx.arc(0, 0, radius * 0.15, 0, Math.PI * 2);
      ctx.stroke();
    } else if (chipType === 'speed') {
      // 回避/スピード：三つ巴渦巻ライン
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2;
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(
          radius * 0.1 * Math.cos(angle + 0.4), 
          radius * 0.1 * Math.sin(angle + 0.4),
          radius * 0.18 * Math.cos(angle + 0.8),
          radius * 0.18 * Math.sin(angle + 0.8)
        );
        ctx.stroke();
      }
    } else {
      // バランス：シンプル十字マーカー
      ctx.moveTo(-radius * 0.18, 0);
      ctx.lineTo(radius * 0.18, 0);
      ctx.moveTo(0, -radius * 0.18);
      ctx.lineTo(0, radius * 0.18);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ==========================================
  // 7. 【バトル画面】2D Canvas リアルタイムバトルのコア
  // ==========================================
  private setupCanvas() {
    this.battleCanvas = document.getElementById('main-battle-canvas') as HTMLCanvasElement;
    if (this.battleCanvas) {
      this.battleCanvas.addEventListener('click', () => {
        if (this.battleManager && this.battleManager.現在フェーズ === 'ディスタンス') {
          const range = this.battleManager.getレンジサークル半径(this.battleManager.プレイヤーギア.ステータス.レンジ);
          if (Math.floor(this.battleManager.プレイヤー攻撃ゲージ) >= 100 && this.battleManager.get現在の間合い() <= range) {
            this.keyState['f'] = true;
          }
        }
      });
    }
  }

  private startBattle() {
    if (!this.selectedNpc) return;

    this.prevJp = this.saveData.所持JP; // バトル前のJPを記録
    this.changeScreen('battle-screen');
    
    // バトル初期化
    const playerSlot = this.saveData.ギアスロット[this.vsSlotIndex.toString()] as SlotData;
    const playerAssembled = アセンブル実行(
      playerSlot.チップ,
      playerSlot.ブレード,
      playerSlot.ウェイト,
      playerSlot.ソール,
      playerSlot.レベル,
      this.パーツマスタ,
      this.チップマスタ,
      this.奥義マスタ
    );

    const enemyAssembled = アセンブル実行(
      this.selectedNpc.チップID,
      this.selectedNpc.ブレードID,
      this.selectedNpc.ウェイトID,
      this.selectedNpc.ソールID,
      1,
      this.パーツマスタ,
      this.チップマスタ,
      this.奥義マスタ
    );

    this.battleManager = new バトル更新マネージャー(playerAssembled, enemyAssembled);
    this.battleManager.エネミーAI難易度 = Number(this.selectedNpc.AI難易度 || 2);
    this.battleManager.エネミーAI性格 = this.selectedNpc.AI性格 || "バランス";
    this.isBattleFinished = false;
    this.keyState = {};
    
    // エフェクトと演出ステートの初期化
    this.particles = [];
    this.shockwaves = [];
    this.skillParticles = [];
    this.isOsugiCutinActive = false;
    this.osugiCutinFrames = 0;
    this.currentEnemySelectedOsugi = null;
    this.isClashAnimationActive = false;
    this.clashAnimFrame = 0;
    this.clashOnComplete = null;
    this.enemyTransitionDelayFrames = 0;
    document.getElementById('seiju-cutin-overlay')?.classList.remove('active');
    
    // UI更新
    const nameEl = document.getElementById('battle-enemy-name');
    if (nameEl) nameEl.textContent = this.selectedNpc.エネミー名;

    // カメラワーク初期化
    this.battleCamera = { x: 400, y: 300, scale: 1, targetScale: 1 };
    this.playerRotation = 0;
    this.enemyRotation = 0;
    this.battleHitStopFrames = 0;
    this.battleShakeFrames = 0;

    // 最初のディスタンスフェーズ開始
    this.runBattleLoop();
  }

  private runBattleLoop() {
    const loop = () => {
      if (this.isBattleFinished) return;

      this.updateBattle();
      this.drawBattle();

      this.battleLoopId = requestAnimationFrame(loop);
    };

    if (this.battleLoopId) cancelAnimationFrame(this.battleLoopId);
    this.battleLoopId = requestAnimationFrame(loop);
  }

  private updateBattle() {
    if (!this.battleManager) return;

    // 被弾ヒットストップ中はフレーム停止
    if (this.battleHitStopFrames > 0) {
      this.battleHitStopFrames--;
      return;
    }

    // 聖獣召喚カットイン演出中の処理 (戦闘を一時停止してカットインと必殺エフェクトのみ動かす)
    if (this.isOsugiCutinActive) {
      this.osugiCutinFrames--;
      
      // 必殺エフェクト、火花、衝撃波の更新のみ実行
      this.skillParticles = this.skillParticles.filter(sp => sp.update());
      this.particles = this.particles.filter(p => p.update());
      this.shockwaves = this.shockwaves.filter(s => s.update());
      
      // カットインフラッシュ時に少し画面を揺らす
      if (this.osugiCutinFrames === 60) {
        this.battleShakeFrames = 15;
      }

      if (this.osugiCutinFrames <= 0) {
        this.isOsugiCutinActive = false;
        document.getElementById('seiju-cutin-overlay')?.classList.remove('active');
        if (this.onOsugiCutinComplete) {
          this.onOsugiCutinComplete();
          this.onOsugiCutinComplete = null;
        }
      }
      return;
    }

    // 左右激突突進アニメーション中の処理 (GBA風対戦演出)
    if (this.isClashAnimationActive) {
      this.clashAnimFrame++;

      // エフェクトはアニメーション中も毎フレーム動かす
      this.particles = this.particles.filter(p => p.update());
      this.shockwaves = this.shockwaves.filter(s => s.update());
      this.skillParticles = this.skillParticles.filter(sp => sp.update());

      // コマ自体を高速回転させる (せめぎ合い中はさらに高速に)
      const rotSpeed = (this.clashAnimFrame >= 25 && this.clashAnimFrame < 45) ? 0.6 : 0.35;
      this.playerRotation += rotSpeed;
      this.enemyRotation -= rotSpeed;

      // 25〜45F：せめぎ合いガリガリ摩擦期間中に火花を連続生成 (回避時は摩擦なし)
      if (this.clashAnimFrame >= 25 && this.clashAnimFrame < 45 && this.clashResultType !== 'evade') {
        if (this.clashResultType === 'guard') {
          // ガード時は青白い摩擦火花
          this.particles.push(new SparkParticle(400 + (Math.random() - 0.5) * 30, 300 + (Math.random() - 0.5) * 30, '#00f3ff'));
          this.particles.push(new SparkParticle(400 + (Math.random() - 0.5) * 30, 300 + (Math.random() - 0.5) * 30, '#ffffff'));
        } else {
          this.particles.push(new SparkParticle(400 + (Math.random() - 0.5) * 30, 300 + (Math.random() - 0.5) * 30, '#ff5500'));
          this.particles.push(new SparkParticle(400 + (Math.random() - 0.5) * 30, 300 + (Math.random() - 0.5) * 30, '#ffd800'));
        }
      }

      // 45フレーム目：決着（爆発と吹っ飛び）
      if (this.clashAnimFrame === 45) {
        // 1. 計算しておいたダメージの実際の適用
        let playerTookDamage = false;
        const dmg = Math.floor(this.clashPendingDamage);
        if (this.clashPendingIsHit && dmg > 0) {
          if (this.clashPendingSide === 'プレイヤー') {
            this.battleManager.エネミーライフ = Math.max(0, this.battleManager.エネミーライフ - dmg);
          } else {
            this.battleManager.プレイヤーライフ = Math.max(0, this.battleManager.プレイヤーライフ - dmg);
            playerTookDamage = true;
          }
        }

        // カウンター被弾の場合、カウンターした側にダメージ適用
        if (this.clashPendingIsCounter) {
          const counterDmg = Math.floor(this.clashPendingCounterDamage);
          if (this.clashPendingSide === 'プレイヤー') {
            this.battleManager.プレイヤーライフ = Math.max(0, this.battleManager.プレイヤーライフ - counterDmg);
            if (counterDmg > 0) playerTookDamage = true;
          } else {
            this.battleManager.エネミーライフ = Math.max(0, this.battleManager.エネミーライフ - counterDmg);
          }
        }

        // プレイヤー被弾時のダメージフラッシュ演出 (パッケージ4)
        if (playerTookDamage) {
          const uiContainer = document.getElementById('ui-container');
          if (uiContainer) {
            uiContainer.classList.remove('damage-flash-active');
            void (uiContainer as any).offsetWidth; // リフロー
            uiContainer.classList.add('damage-flash-active');
            setTimeout(() => {
              uiContainer.classList.remove('damage-flash-active');
            }, 360);
          }
        }

        // 2. 超巨大な衝撃波＆大爆発パーティクルの発生 (回避成功時は発生させない)
        if (this.clashResultType !== 'evade') {
          this.shockwaves.push(new Shockwave(400, 300));
          
          const bigShock = new Shockwave(400, 300);
          (bigShock as any).maxRadius = 150;
          (bigShock as any).speed = 4.5;
          this.shockwaves.push(bigShock);

          // 火花パーティクルを大量生成
          const sparkCount = this.clashResultType === 'guard' ? 12 : 30; // ガード時は火花少なめ
          const color1 = this.clashResultType === 'guard' ? '#00f3ff' : '#ff5500';
          const color2 = this.clashResultType === 'guard' ? '#ffffff' : '#ffd800';

          for (let i = 0; i < sparkCount; i++) {
            this.particles.push(new SparkParticle(400, 300, color1));
            this.particles.push(new SparkParticle(400, 300, color2));
            if (Math.random() < 0.5) {
              this.particles.push(new SparkParticle(400, 300, '#ffffff'));
            }
          }
        }

        // コミック擬音の生成とポップアップ
        const btlScreen = document.getElementById('battle-screen');
        if (btlScreen) {
          const clashWord = document.createElement('div');
          clashWord.className = 'comic-word-overlay';
          
          // clashResultType に応じた擬音テキスト
          if (this.clashResultType === 'counter') clashWord.textContent = 'COUNTER!!';
          else if (this.clashResultType === 'guard') clashWord.textContent = 'GUARD!!';
          else if (this.clashResultType === 'evade') clashWord.textContent = 'EVADE!!';
          else clashWord.textContent = 'CLASH!!';

          clashWord.style.left = '50%';
          clashWord.style.top = '50%';
          btlScreen.appendChild(clashWord);
          
          setTimeout(() => {
            clashWord.remove();
          }, 800);
        }

        // 3. ヒットストップ ＆ スクリーンシェイク適用
        if (this.clashResultType === 'evade') {
          this.battleHitStopFrames = 0;
          this.battleShakeFrames = 0;
        } else if (this.clashResultType === 'guard') {
          this.battleHitStopFrames = 5; // ガード成功時はヒットストップも軽微
          this.battleShakeFrames = 8;  // シェイクも微小
        } else {
          // 通常ヒット・カウンター成功時は大きなシェイク
          this.battleHitStopFrames = 15;
          this.battleShakeFrames = 25;
        }

        // HUDを即時更新
        this.updateBattleHUD();
      }

      // 60フレーム目：アニメーション終了
      if (this.clashAnimFrame >= 60) {
        this.isClashAnimationActive = false;
        if (this.clashOnComplete) {
          this.clashOnComplete();
          this.clashOnComplete = null;
        }
      }
      return;
    }

    // コマンド決定用のクールダウンフレームの更新
    if (this.commandPhaseCooldownFrames > 0) {
      this.commandPhaseCooldownFrames--;
    }

    // プレイヤーの入力値マッピング (移行はオートになったためFキー入力のディスタンスフェーズ中マッピングは不要)
    let input: 'A' | 'D' | 'F' | null = null;
    if (this.keyState['a'] || this.keyState['arrowleft']) input = 'A';
    if (this.keyState['d'] || this.keyState['arrowright']) input = 'D';
    if (this.keyState['f']) {
      // コマンドフェーズ決定用のFキー入力は、キーダウン処理側で別途制御するため、ここでは入力を消費するのみ
      this.keyState['f'] = false;
    }

    // バトル更新
    this.battleManager.update(input);

    // 衝突検知時のエフェクト生成
    if (this.battleManager.isJustCollided) {
      // 火花生成 (ポップなオレンジ＆イエロー＆ホワイトのトイスパーク)
      for (let i = 0; i < 15; i++) {
        this.particles.push(new SparkParticle(this.battleManager.collisionX, this.battleManager.collisionY, '#ff5500'));
        this.particles.push(new SparkParticle(this.battleManager.collisionX, this.battleManager.collisionY, '#ffd800'));
        if (Math.random() < 0.4) {
          this.particles.push(new SparkParticle(this.battleManager.collisionX, this.battleManager.collisionY, '#ffffff'));
        }
      }

      // 激突の衝撃波 (Shockwave) を生成
      this.shockwaves.push(new Shockwave(this.battleManager.collisionX, this.battleManager.collisionY));

      // リアルタイム衝突時の簡易ヒットストップ＆シェイク
      this.battleHitStopFrames = 3;
      this.battleShakeFrames = 5;
    }

    // パーティクルの更新
    this.particles = this.particles.filter(p => p.update());
    this.shockwaves = this.shockwaves.filter(s => s.update());
    this.skillParticles = this.skillParticles.filter(sp => sp.update());

    // 回転アニメーション
    this.playerRotation += 0.25;
    this.enemyRotation -= 0.2;

    // UIの各パラメータ連動
    this.updateBattleHUD();

    // 100ゲージ移行での静フェーズ (overlayがまだactiveでない場合のみ展開する)
    // 激突アニメーション中や結果ダイアログ会話表示中の多重暴発を防ぐガードを適用
    const talkDialog = document.getElementById('talk-dialog');
    const isTalkActive = talkDialog && talkDialog.classList.contains('active');

    if (
      this.battleManager.現在フェーズ === 'コマンド' &&
      this.battleManager.攻撃側 === 'プレイヤー' &&
      !this.isClashAnimationActive &&
      !isTalkActive
    ) {
      const overlay = document.getElementById('command-overlay');
      if (overlay && !overlay.classList.contains('active')) {
        this.openCommandSelection();
      }
    }

    // 敵NPCが攻撃ゲージ100％かつ射程内になった場合、難易度に応じた移行ディレイ（迷い時間）を経てから強制移行する
    const enemyRange = this.battleManager.getレンジサークル半径(this.battleManager.エネミーギア.ステータス.レンジ);
    const overlay = document.getElementById('command-overlay');
    
    if (
      this.battleManager.現在フェーズ === 'ディスタンス' &&
      Math.floor(this.battleManager.エネミー攻撃ゲージ) >= 100 &&
      this.battleManager.get現在の間合い() <= enemyRange &&
      overlay && !overlay.classList.contains('active')
    ) {
      if (this.enemyTransitionDelayFrames === 0) {
        const lvl = this.battleManager.エネミーAI難易度;
        if (lvl === 1) this.enemyTransitionDelayFrames = 75; // 1.25秒
        else if (lvl === 2) this.enemyTransitionDelayFrames = 60;  // 1.0秒
        else if (lvl === 3) this.enemyTransitionDelayFrames = 24;  // 0.4秒
        else if (lvl === 4) this.enemyTransitionDelayFrames = 12;  // 0.2秒
        else this.enemyTransitionDelayFrames = 60;
      }
      
      this.enemyTransitionDelayFrames--;
      if (this.enemyTransitionDelayFrames <= 0) {
        this.enemyTransitionDelayFrames = 0;
        this.battleManager.現在フェーズ = 'コマンド';
        this.battleManager.攻撃側 = 'エネミー';
        this.triggerEnemyCommandPhase();
      }
    } else {
      this.enemyTransitionDelayFrames = 0; // 範囲外に逃げられた場合は迷いタイマーをクリア
    }

    // 勝敗判定チェック
    this.checkBattleEndConditions();
  }

  private updateBattleHUD() {
    if (!this.battleManager) return;

    const hpPctP = (this.battleManager.プレイヤーライフ / this.battleManager.プレイヤーギア.ステータス.ライフ) * 100;
    const hpPctE = (this.battleManager.エネミーライフ / this.battleManager.エネミーギア.ステータス.ライフ) * 100;

    // HPが30%以下になったらBGMをピンチBGM(高速化)に変更
    if ((hpPctP <= 30 || hpPctE <= 30) && !this.isPinchBgmActive) {
      this.isPinchBgmActive = true;
      this.snd.startPinchBGM();
    }

    const pHPBar = document.getElementById('battle-player-hp-bar');
    const eHPBar = document.getElementById('battle-enemy-hp-bar');
    if (pHPBar) pHPBar.style.width = `${hpPctP}%`;
    if (eHPBar) eHPBar.style.width = `${hpPctE}%`;

    const pDmgBar = document.getElementById('battle-player-hp-damage');
    const eDmgBar = document.getElementById('battle-enemy-hp-damage');
    if (pDmgBar) pDmgBar.style.width = `${hpPctP}%`;
    if (eDmgBar) eDmgBar.style.width = `${hpPctE}%`;

    const pHPVal = document.getElementById('battle-player-hp-val');
    const eHPVal = document.getElementById('battle-enemy-hp-val');
    if (pHPVal) pHPVal.textContent = `${this.battleManager.プレイヤーライフ} / ${this.battleManager.プレイヤーギア.ステータス.ライフ}`;
    if (eHPVal) eHPVal.textContent = `${this.battleManager.エネミーライフ} / ${this.battleManager.エネミーギア.ステータス.ライフ}`;

    // ゲージ
    const pAtkBar = document.getElementById('battle-player-atk-bar');
    const pAtkVal = document.getElementById('battle-player-atk-val');
    if (pAtkBar) pAtkBar.style.width = `${this.battleManager.プレイヤー攻撃ゲージ}%`;
    if (pAtkVal) pAtkVal.textContent = `${Math.floor(this.battleManager.プレイヤー攻撃ゲージ)}`;

    const eAtkBar = document.getElementById('battle-enemy-atk-bar');
    const eAtkVal = document.getElementById('battle-enemy-atk-val');
    if (eAtkBar) eAtkBar.style.width = `${this.battleManager.エネミー攻撃ゲージ}%`;
    if (eAtkVal) eAtkVal.textContent = `${Math.floor(this.battleManager.エネミー攻撃ゲージ)}`;

    const pSpBar = document.getElementById('battle-player-sp-bar');
    const pSpVal = document.getElementById('battle-player-sp-val');
    if (pSpBar) pSpBar.style.width = `${this.battleManager.プレイヤー奥義ゲージ}%`;
    if (pSpVal) pSpVal.textContent = `${Math.floor(this.battleManager.プレイヤー奥義ゲージ)}`;

    const eSpBar = document.getElementById('battle-enemy-sp-bar');
    const eSpVal = document.getElementById('battle-enemy-sp-val');
    if (eSpBar) eSpBar.style.width = `${this.battleManager.エネミー奥義ゲージ}%`;
    if (eSpVal) eSpVal.textContent = `${Math.floor(this.battleManager.エネミー奥義ゲージ)}`;

    // 間合い表示
    const distEl = document.getElementById('battle-distance-display');
    if (distEl) distEl.textContent = `${Math.floor(this.battleManager.get現在の間合い())} px`;

    // 攻撃開始ボタン [F] の活性/非活性化
    const btnTrigger = document.getElementById('btn-action-trigger') as HTMLButtonElement;
    if (btnTrigger) {
      const range = this.battleManager.getレンジサークル半径(this.battleManager.プレイヤーギア.ステータス.レンジ);
      const isReady = Math.floor(this.battleManager.プレイヤー攻撃ゲージ) >= 100 && this.battleManager.get現在の間合い() <= range;
      btnTrigger.disabled = !isReady;
    }
  }

  // コマンド選択肢のハイライト状態更新
  private updateCommandHighlight() {
    this.activeCommandButtons.forEach((btn, idx) => {
      if (idx === this.selectedCommandIndex) {
        btn.classList.add('selected');
        btn.focus();
      } else {
        btn.classList.remove('selected');
      }
    });
  }

  // コマンド選択肢の上下移動
  private moveCommandSelection(dir: number) {
    if (this.activeCommandButtons.length === 0) return;

    let nextIdx = this.selectedCommandIndex;
    const len = this.activeCommandButtons.length;

    // 次の有効（disabledでない）なボタンを探す
    for (let i = 0; i < len; i++) {
      nextIdx = (nextIdx + dir + len) % len;
      if (!this.activeCommandButtons[nextIdx].disabled) {
        this.selectedCommandIndex = nextIdx;
        this.updateCommandHighlight();
        this.snd.playBleep(); // ホバー移動音
        break;
      }
    }
  }

  // 現在選択中のコマンドを決定
  private confirmCommandSelection() {
    // クールダウン中は入力を無視して誤タップ誤爆を防ぐ
    if (this.commandPhaseCooldownFrames > 0) return;

    const btn = this.activeCommandButtons[this.selectedCommandIndex];
    if (btn && !btn.disabled) {
      this.snd.playClick(); // 決定音
      btn.click();
    }
  }

  // コマンドフェーズ移行時のUI展開
  private openCommandSelection() {
    const overlay = document.getElementById('command-overlay');
    if (!overlay) return;
    if (overlay.classList.contains('active')) return;

    overlay.classList.add('active');
    this.snd.playBleep(); // コマンド開始アラート音
    
    // コマンドフェーズ移行時の手応え演出 (短いフリーズ＆シェイク)
    this.battleHitStopFrames = 2;
    this.battleShakeFrames = 8;
    
    // コマンドフェーズ移行直後の誤入力防止クールダウン (約300ms)
    this.commandPhaseCooldownFrames = 18;

    const titleEl = document.getElementById('command-title-text');
    if (titleEl) titleEl.textContent = "プレイヤーの攻撃ターン！";

    const container = document.getElementById('battle-command-list');
    if (!container) return;
    container.innerHTML = '';

    this.activeCommandButtons = [];
    this.selectedCommandIndex = 0;

    // 通常コマンド3種
    const commands = [
      { name: '通常攻撃 (弱)', type: 'weak', cost: '消費ATK:30', info: '倍率 0.7倍 / SP獲得 +20' },
      { name: '通常攻撃 (中)', type: 'mid', cost: '消費ATK:50', info: '倍率 1.0倍 / SP獲得 +30' },
      { name: '通常攻撃 (強)', type: 'strong', cost: '消費ATK:70', info: '倍率 1.5倍 / SP獲得 +40' }
    ];

    commands.forEach(cmd => {
      const btn = document.createElement('button');
      btn.className = 'command-btn';
      btn.innerHTML = `
        <span class="command-btn-name">${cmd.name}</span>
        <span style="font-size: 0.8rem; color: var(--color-neon-orange);">${cmd.info}</span>
        <span class="command-btn-cost">${cmd.cost}</span>
      `;
      btn.addEventListener('click', () => {
        if (this.commandPhaseCooldownFrames > 0) return;
        this.executePlayerAttack(cmd.type);
      });
      container.appendChild(btn);
      this.activeCommandButtons.push(btn);
    });

    // 解放されている奥義の追加
    const playerSlot = this.saveData.ギアスロット[this.vsSlotIndex.toString()] as SlotData;
    const playerAssembled = アセンブル実行(playerSlot.チップ, playerSlot.ブレード, playerSlot.ウェイト, playerSlot.ソール, playerSlot.レベル, this.パーツマスタ, this.チップマスタ, this.奥義マスタ);

    playerAssembled.解放奥義.forEach(osugiId => {
      const osugi = this.奥義マスタ.find(o => o.奥義ID === osugiId);
      if (osugi && (osugi.奥義種別 === '1' || osugi.奥義種別 === '2')) {
        const canUse = this.battleManager && 
                       this.battleManager.プレイヤー攻撃ゲージ >= Number(osugi.消費攻撃ゲージ) &&
                       this.battleManager.プレイヤー奥義ゲージ >= Number(osugi.消費奥義ゲージ);

        const btn = document.createElement('button');
        btn.className = 'command-btn command-osugi';
        btn.disabled = !canUse;
        btn.innerHTML = `
          <span class="command-btn-name">【奥義】${osugi.奥義名}</span>
          <span style="font-size: 0.8rem; color: var(--color-neon-pink);">${osugi.効果量}%ダメージ</span>
          <span class="command-btn-cost">消費ATK:${osugi.消費攻撃ゲージ}/SP:${osugi.消費奥義ゲージ}</span>
        `;
        btn.addEventListener('click', () => {
          if (this.commandPhaseCooldownFrames > 0) return;
          this.executePlayerAttack('osugi', osugi);
        });
        container.appendChild(btn);
        this.activeCommandButtons.push(btn);
      }
    });

    this.updateCommandHighlight();
  }

  // プレイヤーが攻撃したときの処理
  private executePlayerAttack(type: string, osugi?: 奥義マスタ行) {
    try {
      if (!this.battleManager || !this.selectedNpc) return;
      document.getElementById('command-overlay')?.classList.remove('active');

      let atkCost = 0;
      let baseMultiplier = 1.0;
      let spGain = 0;
      let isOsugi = false;
      let skillName = "";

      if (type === 'weak') {
        atkCost = 30; baseMultiplier = 0.7; spGain = 20; skillName = "通常攻撃 (弱)";
      } else if (type === 'mid') {
        atkCost = 50; baseMultiplier = 1.0; spGain = 30; skillName = "通常攻撃 (中)";
      } else if (type === 'strong') {
        atkCost = 70; baseMultiplier = 1.5; spGain = 40; skillName = "通常攻撃 (強)";
      } else if (type === 'osugi' && osugi) {
        atkCost = Number(osugi.消費攻撃ゲージ);
        baseMultiplier = Number(osugi.効果量) / 100;
        spGain = 0;
        isOsugi = true;
        skillName = `【奥義】${osugi.奥義名}`;
      }

      // 攻撃ゲージ of 消費
      this.battleManager.プレイヤー攻撃ゲージ -= atkCost;
      // SP(奥義)ゲージ of 確定獲得
      this.battleManager.プレイヤー奥義ゲージ = Math.min(100, this.battleManager.プレイヤー奥義ゲージ + spGain);

      // 敵NPCが防御側のときのAI決定ロジック
      const enemyAssembled = アセンブル実行(
        this.selectedNpc.チップID,
        this.selectedNpc.ブレードID,
        this.selectedNpc.ウェイトID,
        this.selectedNpc.ソールID,
        1,
        this.パーツマスタ,
        this.チップマスタ,
        this.奥義マスタ
      );

      // 解放されている敵の防御系奥義を探す
      let enemyDefOsugi: 奥義マスタ行 | null = null;
      let enemyEvadeOsugi: 奥義マスタ行 | null = null;
      let enemyCounterOsugi: 奥義マスタ行 | null = null;

      for (const osugiId of enemyAssembled.解放奥義) {
        const osugi = this.奥義マスタ.find(o => o.奥義ID === osugiId);
        if (osugi) {
          if (osugi.奥義種別 === '3') enemyDefOsugi = osugi;
          else if (osugi.奥義種別 === '4') enemyEvadeOsugi = osugi;
          else if (osugi.奥義種別 === '5') enemyCounterOsugi = osugi;
        }
      }

      const personality = this.battleManager.エネミーAI性格;
      const lvl = this.battleManager.エネミーAI難易度;

      let enemyDefChoice: '防御' | '回避' | 'カウンター' | '防御奥義' | '回避奥義' | 'カウンター奥義' = '防御';
      let selectedDefOsugi: 奥義マスタ行 | null = null;

      // カウンターおよび回避の成功率シミュレーション (レベル3以上の賢い敵のみ適用)
      let counterChance = 25;
      let evadeChance = 30;

      const pGear = this.battleManager.プレイヤーギア;
      const eGear = this.battleManager.エネミーギア;

      if (lvl >= 3) {
        // カウンター成功率のシミュレーション
        const bComp = 属性相性判定(eGear.部位属性.ブレード, pGear.部位属性.ブレード);
        const bBonus = bComp === 1 ? 10 : (bComp === -1 ? -10 : 0);
        counterChance = this.battleManager.get最終カウンター成功率(eGear.ステータス.アタック, pGear.ステータス.アタック, bBonus);

        // 回避成功率のシミュレーション
        const sComp = 属性相性判定(eGear.部位属性.ソール, pGear.部位属性.ソール);
        const sBonus = sComp === 1 ? 10 : (sComp === -1 ? -10 : 0);
        evadeChance = this.battleManager.get最終回避率(eGear.ステータス.スピード, pGear.ステータス.スピード, sBonus);
      }

      const eAtkGauge = this.battleManager.エネミー攻撃ゲージ;
      const eSpGauge = this.battleManager.エネミー奥義ゲージ;

      // 各コマンドの実行可能フラグ
      const canNormalCounter = eAtkGauge >= 30 && eSpGauge >= 30;
      const canDefOsugi = enemyDefOsugi && eSpGauge >= Number(enemyDefOsugi.消費奥義ゲージ);
      const canEvadeOsugi = enemyEvadeOsugi && eSpGauge >= Number(enemyEvadeOsugi.消費奥義ゲージ);
      const canCounterOsugi = enemyCounterOsugi && 
                               eSpGauge >= Number(enemyCounterOsugi.消費奥義ゲージ) && 
                               eAtkGauge >= Number(enemyCounterOsugi.消費攻撃ゲージ || 0);

      // 性格ごとの選択ロジック
      if (personality === '攻撃') {
        // 攻撃型：SPを温存するため常に通常防御のみ
        enemyDefChoice = '防御';
      }
      else if (personality === '防御') {
        // 防御型：防御奥義 ➔ 通常防御の順で優先
        if (canDefOsugi && Math.random() < 0.75) {
          enemyDefChoice = '防御奥義';
          selectedDefOsugi = enemyDefOsugi;
        } else {
          enemyDefChoice = '防御';
        }
      }
      else if (personality === '回避') {
        // 回避型：回避奥義 ➔ 通常回避 ➔ 通常防御
        const evadeAllowed = (lvl < 3 || evadeChance >= 30);
        if (canEvadeOsugi && evadeAllowed && Math.random() < 0.70) {
          enemyDefChoice = '回避奥義';
          selectedDefOsugi = enemyEvadeOsugi;
        } else if (evadeAllowed && Math.random() < 0.70) {
          enemyDefChoice = '回避';
        } else {
          enemyDefChoice = '防御';
        }
      }
      else if (personality === '逆転') {
        // 逆転型：カウンター奥義 ➔ 通常カウンター ➔ 通常防御
        const counterAllowed = (lvl < 3 || counterChance >= 25);
        if (canCounterOsugi && counterAllowed && Math.random() < 0.75) {
          enemyDefChoice = 'カウンター奥義';
          selectedDefOsugi = enemyCounterOsugi;
        } else if (canNormalCounter && counterAllowed && Math.random() < 0.70) {
          enemyDefChoice = 'カウンター';
        } else {
          enemyDefChoice = '防御';
        }
      }
      else {
        // バランス型：フラットな選択
        const rand = Math.random() * 100;
        const counterAllowed = (lvl < 3 || counterChance >= 25);
        const evadeAllowed = (lvl < 3 || evadeChance >= 30);

        if (rand < 20 && canNormalCounter && counterAllowed) {
          enemyDefChoice = 'カウンター';
        } else if (rand < 50 && evadeAllowed) {
          if (canEvadeOsugi && Math.random() < 0.3) {
            enemyDefChoice = '回避奥義';
            selectedDefOsugi = enemyEvadeOsugi;
          } else {
            enemyDefChoice = '回避';
          }
        } else {
          if (canDefOsugi && Math.random() < 0.25) {
            enemyDefChoice = '防御奥義';
            selectedDefOsugi = enemyDefOsugi;
          } else {
            enemyDefChoice = '防御';
          }
        }
      }

      // 成否 of ジャッジメント (奥義の場合は演出を挟む)
      const runAttack = () => {
        this.resolveCombatResult('プレイヤー', enemyDefChoice, baseMultiplier, isOsugi, skillName, selectedDefOsugi);
      };

      if (isOsugi && osugi) {
        this.triggerOsugiPerformance(osugi, 'プレイヤー', runAttack);
      } else {
        runAttack();
      }
    } catch (e: any) {
      console.error("executePlayerAttack error:", e);
      this.showSystemModal('エラー', '攻撃処理中にエラーが発生しました: ' + e.message);
    }
  }



  // 敵の攻撃フェーズが開始したときの処理 (敵NPCによる攻撃決定)
  private triggerEnemyCommandPhase() {
    if (!this.battleManager || !this.selectedNpc) return;

    // 敵のアセンブルデータを取得
    const enemyAssembled = アセンブル実行(
      this.selectedNpc.チップID,
      this.selectedNpc.ブレードID,
      this.selectedNpc.ウェイトID,
      this.selectedNpc.ソールID,
      1,
      this.パーツマスタ,
      this.チップマスタ,
      this.奥義マスタ
    );

    // 使える奥義を探す (AI性格別の温存しきい値に基づく)
    let selectedEnemyOsugi: 奥義マスタ行 | null = null;
    const enemyOsugiCandidates: 奥義マスタ行[] = [];
    
    for (const osugiId of enemyAssembled.解放奥義) {
      const osugi = this.奥義マスタ.find(o => o.奥義ID === osugiId);
      if (osugi && (osugi.奥義種別 === '1' || osugi.奥義種別 === '2')) {
        const canUse = this.battleManager.エネミー攻撃ゲージ >= Number(osugi.消費攻撃ゲージ) &&
                       this.battleManager.エネミー奥義ゲージ >= Number(osugi.消費奥義ゲージ);
        if (canUse) {
          enemyOsugiCandidates.push(osugi);
        }
      }
    }

    const personality = this.battleManager.エネミーAI性格;
    const currentSP = this.battleManager.エネミー奥義ゲージ;

    // 奥義候補がある場合、性格に基づく温存判定
    if (enemyOsugiCandidates.length > 0) {
      const candidate = enemyOsugiCandidates[0]; // 最も強い奥義を優先
      const osugiSpCost = Number(candidate.消費奥義ゲージ);
      let shouldKeepSp = false;

      if (personality === '防御' || personality === '回避') {
        // 防御/回避奥義(SP:40)のために、SPが 「防御奥義コスト(40) + 攻撃奥義コスト」 未満なら温存
        if (currentSP < 40 + osugiSpCost) {
          shouldKeepSp = true;
        }
      } else if (personality === '逆転') {
        // カウンター(SP:30)やカウンター奥義(SP:60)のために、SPが 「カウンターコスト(30) + 攻撃奥義コスト」 未満なら温存
        if (currentSP < 30 + osugiSpCost) {
          shouldKeepSp = true;
        }
      }

      // 攻撃型は温存せず100%発動、バランス型は80%で発動
      if (personality === '攻撃') {
        shouldKeepSp = false;
      } else if (personality === 'バランス' && Math.random() < 0.2) {
        shouldKeepSp = true;
      }

      if (!shouldKeepSp) {
        selectedEnemyOsugi = candidate;
      }
    }

    let atkCost = 0;
    let multiplier = 1.0;
    let spGain = 0;
    let skillName = "";

    if (selectedEnemyOsugi) {
      this.currentEnemySelectedOsugi = selectedEnemyOsugi;
      atkCost = Number(selectedEnemyOsugi.消費攻撃ゲージ);
      multiplier = Number(selectedEnemyOsugi.効果量) / 100;
      spGain = 0;
      skillName = `【奥義】${selectedEnemyOsugi.奥義名}`;
    } else {
      this.currentEnemySelectedOsugi = null;
      
      // 通常の攻撃選択肢 (性格による偏り)
      let choice: 'weak' | 'mid' | 'strong' = 'weak';
      const atkGauge = this.battleManager.エネミー攻撃ゲージ;

      if (personality === '攻撃') {
        // 攻撃型：極力大ダメージ（強）を狙う
        if (atkGauge >= 70) choice = 'strong';
        else if (atkGauge >= 50) choice = 'mid';
        else choice = 'weak';
      } else if (personality === '防御' || personality === '回避') {
        // 防御/回避型：SP獲得効率が高く、ゲージ消費が少ない「弱」を多用する
        if (atkGauge >= 50 && Math.random() < 0.25) {
          choice = 'mid'; // たまに中
        } else {
          choice = 'weak';
        }
      } else {
        // バランス/逆転型：通常の段階的な選択
        if (atkGauge >= 70) choice = 'strong';
        else if (atkGauge >= 50) choice = 'mid';
        else choice = 'weak';
      }

      atkCost = choice === 'weak' ? 30 : (choice === 'mid' ? 50 : 70);
      multiplier = choice === 'weak' ? 0.7 : (choice === 'mid' ? 1.0 : 1.5);
      spGain = choice === 'weak' ? 20 : (choice === 'mid' ? 30 : 40);
      skillName = choice === 'weak' ? "通常攻撃 (弱)" : (choice === 'mid' ? "通常攻撃 (中)" : "通常攻撃 (強)");
    }

    this.battleManager.エネミー攻撃ゲージ -= atkCost;
    this.battleManager.エネミー奥義ゲージ = Math.min(100, this.battleManager.エネミー奥義ゲージ + spGain);

    // プレイヤーに防御用コマンドUIを展開
    this.openPlayerDefenseSelection(multiplier, skillName);
  }

  private openPlayerDefenseSelection(enemyAtkMultiplier: number, enemySkillName: string) {
    const overlay = document.getElementById('command-overlay');
    if (!overlay) return;
    if (overlay.classList.contains('active')) return;

    overlay.classList.add('active');
    this.snd.playBleep(); // ディフェンス開始アラート音

    // コマンドフェーズ移行時の手応え演出 (短いフリーズ＆シェイク)
    this.battleHitStopFrames = 2;
    this.battleShakeFrames = 8;

    // コマンドフェーズ移行直後の誤入力防止クールダウン (約300ms)
    this.commandPhaseCooldownFrames = 18;

    const titleEl = document.getElementById('command-title-text');
    if (titleEl) titleEl.textContent = `相手の攻撃！「${enemySkillName}」`;

    const container = document.getElementById('battle-command-list');
    if (!container) return;
    container.innerHTML = '';

    this.activeCommandButtons = [];
    this.selectedCommandIndex = 0;

    // 通常の防御側の選択肢 (通常防御 & 通常回避)
    const defChoices = [
      { name: '防御', type: '防御', info: 'ダメージ40%カット / SP獲得 +10' },
      { name: '回避', type: '回避', info: '確率で完全無効 / 失敗時通常被弾 / SP+10' }
    ];

    defChoices.forEach(choice => {
      const btn = document.createElement('button');
      btn.className = 'command-btn';
      btn.innerHTML = `
        <span class="command-btn-name">${choice.name}</span>
        <span style="font-size: 0.8rem; color: var(--color-neon-blue);">${choice.info}</span>
        <span class="command-btn-cost">消費なし</span>
      `;
      btn.addEventListener('click', () => {
        if (this.commandPhaseCooldownFrames > 0) return;
        this.executePlayerDefense(choice.type as any, enemyAtkMultiplier, enemySkillName);
      });
      container.appendChild(btn);
      this.activeCommandButtons.push(btn);
    });

    // 通常カウンター（攻撃/奥義ゲージ30以上）
    const canCounter = this.battleManager &&
                       this.battleManager.プレイヤー攻撃ゲージ >= 30 &&
                       this.battleManager.プレイヤー奥義ゲージ >= 30;

    const btnCounter = document.createElement('button');
    btnCounter.className = 'command-btn command-osugi';
    btnCounter.disabled = !canCounter;
    btnCounter.innerHTML = `
      <span class="command-btn-name">カウンター</span>
      <span style="font-size: 0.8rem; color: var(--color-neon-pink);">成功時無効+通常反撃 / 失敗時被弾 / SP獲得なし</span>
      <span class="command-btn-cost">消費ATK:30/SP:30</span>
    `;
    btnCounter.addEventListener('click', () => {
      if (this.commandPhaseCooldownFrames > 0) return;
      this.executePlayerDefense('カウンター', enemyAtkMultiplier, enemySkillName);
    });
    container.appendChild(btnCounter);
    this.activeCommandButtons.push(btnCounter);

    // 解放されている防御系奥義 (種別3, 4, 5) の追加
    const playerSlot = this.saveData.ギアスロット[this.vsSlotIndex.toString()] as SlotData;
    const playerAssembled = アセンブル実行(
      playerSlot.チップ,
      playerSlot.ブレード,
      playerSlot.ウェイト,
      playerSlot.ソール,
      playerSlot.レベル,
      this.パーツマスタ,
      this.チップマスタ,
      this.奥義マスタ
    );

    playerAssembled.解放奥義.forEach(osugiId => {
      const osugi = this.奥義マスタ.find(o => o.奥義ID === osugiId);
      if (osugi && (osugi.奥義種別 === '3' || osugi.奥義種別 === '4' || osugi.奥義種別 === '5')) {
        const osugiSpCost = Number(osugi.消費奥義ゲージ);
        const osugiAtkCost = Number(osugi.消費攻撃ゲージ || 0);

        const canUse = this.battleManager &&
                       this.battleManager.プレイヤー攻撃ゲージ >= osugiAtkCost &&
                       this.battleManager.プレイヤー奥義ゲージ >= osugiSpCost;

        let typeText = "防御奥義";
        let colorTheme = "var(--color-neon-blue)";
        let descText = "";

        if (osugi.奥義種別 === '3') {
          typeText = "防御奥義";
          descText = `被ダメージを ${osugi.効果量}% 軽減する`;
        } else if (osugi.奥義種別 === '4') {
          typeText = "回避奥義";
          descText = `基礎回避率 ${osugi.効果量}% で完全無効化`;
          colorTheme = "var(--color-neon-green)";
        } else if (osugi.奥義種別 === '5') {
          typeText = "カウンター奥義";
          descText = `無効化し、倍率 ${osugi.効果量}% で手痛く反撃`;
          colorTheme = "var(--color-neon-pink)";
        }

        const btnOsugi = document.createElement('button');
        btnOsugi.className = 'command-btn command-osugi';
        btnOsugi.disabled = !canUse;
        btnOsugi.innerHTML = `
          <span class="command-btn-name">【${typeText}】${osugi.奥義名}</span>
          <span style="font-size: 0.8rem; color: ${colorTheme};">${descText}</span>
          <span class="command-btn-cost">消費ATK:${osugiAtkCost}/SP:${osugiSpCost}</span>
        `;
        btnOsugi.addEventListener('click', () => {
          if (this.commandPhaseCooldownFrames > 0) return;
          this.executePlayerDefense(typeText as any, enemyAtkMultiplier, enemySkillName, osugi);
        });
        container.appendChild(btnOsugi);
        this.activeCommandButtons.push(btnOsugi);
      }
    });

    this.updateCommandHighlight();
  }

  private executePlayerDefense(
    choice: '防御' | '回避' | 'カウンター' | '防御奥義' | '回避奥義' | 'カウンター奥義',
    enemyAtkMultiplier: number,
    enemySkillName: string,
    defOsugi: 奥義マスタ行 | null = null
  ) {
    try {
      if (!this.battleManager) return;
      document.getElementById('command-overlay')?.classList.remove('active');

      const runDefense = () => {
        this.resolveCombatResult('エネミー', choice, enemyAtkMultiplier, this.currentEnemySelectedOsugi !== null, enemySkillName, defOsugi);
        this.currentEnemySelectedOsugi = null;
      };

      // 防御奥義が発動した場合は、防御側（プレイヤー）の聖獣演出を優先して再生！
      if (defOsugi) {
        this.triggerOsugiPerformance(defOsugi, 'プレイヤー', runDefense);
      } else if (this.currentEnemySelectedOsugi) {
        this.triggerOsugiPerformance(this.currentEnemySelectedOsugi, 'エネミー', runDefense);
      } else {
        runDefense();
      }
    } catch (e: any) {
      console.error("executePlayerDefense error:", e);
      this.showSystemModal('エラー', '防御処理中にエラーが発生しました: ' + e.message);
    }
  }

  // 奥義の聖獣召喚＆必殺エフェクト演出の実行
  private triggerOsugiPerformance(_osugi: 奥義マスタ行, side: 'プレイヤー' | 'エネミー', onComplete: () => void) {
    if (!this.battleManager) {
      onComplete();
      return;
    }

    this.snd.playOsugiCharge(); // 奥義発動チャージ音
    this.isOsugiCutinActive = true;
    this.osugiCutinFrames = 84; // 1.4秒 (84フレーム)
    this.onOsugiCutinComplete = onComplete;

    // 発動ギアのブレード属性を演出属性とする
    const gear = side === 'プレイヤー' ? this.battleManager.プレイヤーギア : this.battleManager.エネミーギア;
    const attr = gear.部位属性.ブレード || '無';

    // 聖獣画像のマッピング
    let imgUrl = "";
    if (attr === '火') imgUrl = './images/seiju_dranzer.png';
    else if (attr === '水') imgUrl = './images/seiju_draciel.png';
    else if (attr === '風') imgUrl = './images/seiju_dragoon.png';
    else if (attr === '土' || attr === '雷') imgUrl = './images/seiju_driger.png';

    const cutinImg = document.getElementById('seiju-cutin-img') as HTMLImageElement;
    const cutinOverlay = document.getElementById('seiju-cutin-overlay');

    if (cutinImg && cutinOverlay) {
      if (imgUrl) {
        cutinImg.src = imgUrl;
        cutinImg.style.display = 'block';
      } else {
        cutinImg.style.display = 'none'; // 無属性は画像なし（暗転＆フラッシュのみ）
      }
      cutinOverlay.classList.add('active');
    }

    // 必殺エフェクト用パーティクルの生成
    // 対象の座標を特定 (攻撃側がプレイヤーならエネミーに、エネミーならプレイヤーにエフェクトを叩き込む)
    const targetX = side === 'プレイヤー' ? this.battleManager.エネミー位置X : this.battleManager.プレイヤー位置X;
    const targetY = side === 'プレイヤー' ? this.battleManager.エネミー位置Y : this.battleManager.プレイヤー位置Y;

    // 属性の特定
    let particleType: 'fire' | 'water' | 'wind' | 'thunder' = 'fire';
    if (attr === '水') particleType = 'water';
    else if (attr === '風') particleType = 'wind';
    else if (attr === '土' || attr === '雷') particleType = 'thunder';

    // 粒子を大量生成 (120個)
    for (let i = 0; i < 120; i++) {
      this.skillParticles.push(new SkillParticle(targetX, targetY, particleType));
    }
  }

  // 攻防結果の判定とダメージ処理の集約
  private resolveCombatResult(
    攻撃側判定: 'プレイヤー' | 'エネミー',
    防御側コマンド: '防御' | '回避' | 'カウンター' | '防御奥義' | '回避奥義' | 'カウンター奥義',
    固有威力倍率: number,
    is攻撃奥義: boolean,
    スキル名: string,
    防御奥義: 奥義マスタ行 | null = null
  ) {
    try {
      if (!this.battleManager) return;

      const 攻撃側ギア = 攻撃側判定 === 'プレイヤー' ? this.battleManager.プレイヤーギア : this.battleManager.エネミーギア;
      const 防御側ギア = 攻撃側判定 === 'プレイヤー' ? this.battleManager.エネミーギア : this.battleManager.プレイヤーギア;

      // 1. 属性相性計算 (ブレード相性補正: 攻撃倍率に加減算)
      const ブレード相性 = 属性相性判定(攻撃側ギア.部位属性.ブレード, 防御側ギア.部位属性.ブレード);
      const ブレード属性補正 = ブレード相性 === 1 ? 0.1 : (ブレード相性 === -1 ? -0.1 : 0);
      const 最終倍率 = 固有威力倍率 + ブレード属性補正;

      // ダメージ計算の基本値
      const 攻撃側アタック = 攻撃側ギア.ステータス.アタック;
      const 防御側ディフェンス = 防御側ギア.ステータス.ディフェンス;
      
      // ダメージ基本計算式
      let ダメージ = 0.18 * 攻撃側アタック * (攻撃側アタック / 防御側ディフェンス) * 最終倍率;

      let advDialogText = '';
      let isHit = true;
      let isCounterSuccess = false;

      // 2. 防御側のコマンド判定処理
      if (防御側コマンド === '防御') {
        // ダメージ 40% カット (0.6倍)
        const ウェイト相性 = 属性相性判定(防御側ギア.部位属性.ウェイト, 攻撃側ギア.部位属性.ウェイト);
        const ウェイト補正 = ウェイト相性 === 1 ? 0.9 : (ウェイト相性 === -1 ? 1.1 : 1.0);
        
        ダメージ = ダメージ * 0.6 * ウェイト補正;
        
        // SP(奥義)ゲージの確定獲得 (防御した側が獲得)
        if (攻撃側判定 === 'プレイヤー') {
          this.battleManager.エネミー奥義ゲージ = Math.min(100, this.battleManager.エネミー奥義ゲージ + 10);
        } else {
          this.battleManager.プレイヤー奥義ゲージ = Math.min(100, this.battleManager.プレイヤー奥義ゲージ + 10);
        }

        advDialogText = `${攻撃側判定 === 'プレイヤー' ? 'あなた' : '相手'}の「${スキル名}」！\n${攻撃側判定 === 'プレイヤー' ? '相手' : 'あなた'}は防御を固め、ダメージを軽減した！ (被ダメージ: ${Math.floor(ダメージ)})`;
      } 
      else if (防御側コマンド === '防御奥義' && 防御奥義) {
        // 防御奥義コスト消費 (防御した側が消費)
        if (攻撃側判定 === 'プレイヤー') {
          this.battleManager.エネミー奥義ゲージ -= Number(防御奥義.消費奥義ゲージ);
        } else {
          this.battleManager.プレイヤー奥義ゲージ -= Number(防御奥義.消費奥義ゲージ);
        }

        // ダメージ軽減率は奥義マスタの効果量 (例: 70%カット ➔ ダメージ0.3倍)
        const cutPct = Number(防御奥義.効果量 || 70);
        const cutRate = 1.0 - (cutPct / 100);
        const ウェイト相性 = 属性相性判定(防御側ギア.部位属性.ウェイト, 攻撃側ギア.部位属性.ウェイト);
        const ウェイト補正 = ウェイト相性 === 1 ? 0.9 : (ウェイト相性 === -1 ? 1.1 : 1.0);

        ダメージ = ダメージ * cutRate * ウェイト補正;

        advDialogText = `${攻撃側判定 === 'プレイヤー' ? 'あなた' : '相手'}の「${スキル名}」！\n${攻撃側判定 === 'プレイヤー' ? '相手' : 'あなた'}は防御奥義「${防御奥義.奥義名}」を展開！ダメージを極限まで抑え込んだ！ (被ダメージ: ${Math.floor(ダメージ)})`;
      }
      else if (防御側コマンド === '回避') {
        // 回避率の確率判定
        const ソール相性 = 属性相性判定(防御側ギア.部位属性.ソール, 攻撃側ギア.部位属性.ソール);
        const ソール属性補正 = ソール相性 === 1 ? 10 : (ソール相性 === -1 ? -10 : 0);

        const 最終回避率 = this.battleManager.get最終回避率(防御側ギア.ステータス.スピード, 攻撃側ギア.ステータス.スピード, ソール属性補正);
        const 乱数 = Math.random() * 100;
        
        // SP(奥義)ゲージは成否に関わらず+10
        if (攻撃側判定 === 'プレイヤー') {
          this.battleManager.エネミー奥義ゲージ = Math.min(100, this.battleManager.エネミー奥義ゲージ + 10);
        } else {
          this.battleManager.プレイヤー奥義ゲージ = Math.min(100, this.battleManager.プレイヤー奥義ゲージ + 10);
        }

        if (乱数 < 最終回避率) {
          isHit = false;
          ダメージ = 0;
          advDialogText = `${攻撃側判定 === 'プレイヤー' ? 'あなた' : '相手'}の「${スキル名}」！\n${攻撃側判定 === 'プレイヤー' ? '相手' : 'あなた'}はスピードを活かして完全回避した！ (成功率: ${最終回避率.toFixed(1)}%)`;
        } else {
          advDialogText = `${攻撃側判定 === 'プレイヤー' ? 'あなた' : '相手'}の「${スキル名}」！\n${攻撃側判定 === 'プレイヤー' ? '相手' : 'あなた'}は回避に失敗した！通常ダメージを受けた。 (被ダメージ: ${Math.floor(ダメージ)})`;
        }
      } 
      else if (防御側コマンド === '回避奥義' && 防御奥義) {
        // 回避奥義コスト消費
        if (攻撃側判定 === 'プレイヤー') {
          this.battleManager.エネミー奥義ゲージ -= Number(防御奥義.消費奥義ゲージ);
        } else {
          this.battleManager.プレイヤー奥義ゲージ -= Number(防御奥義.消費奥義ゲージ);
        }

        // 基礎回避率を奥義効果量 (例: 一律60) で計算
        const baseEvade = Number(防御奥義.効果量 || 60);
        const ソール相性 = 属性相性判定(防御側ギア.部位属性.ソール, 攻撃側ギア.部位属性.ソール);
        const ソール属性補正 = ソール相性 === 1 ? 10 : (ソール相性 === -1 ? -10 : 0);

        const 最終回避率 = baseEvade + (防御側ギア.ステータス.スピード - 攻撃側ギア.ステータス.スピード) / 20 + ソール属性補正;
        const 乱数 = Math.random() * 100;

        if (乱数 < 最終回避率) {
          isHit = false;
          ダメージ = 0;
          advDialogText = `${攻撃側判定 === 'プレイヤー' ? 'あなた' : '相手'}の「${スキル名}」！\n${攻撃側判定 === 'プレイヤー' ? '相手' : 'あなた'}は回避奥義「${防御奥義.奥義名}」を発動！幻影のごとく攻撃を受け流した！ (成功率: ${最終回避率.toFixed(1)}%)`;
        } else {
          advDialogText = `${攻撃側判定 === 'プレイヤー' ? 'あなた' : '相手'}の「${スキル名}」！\n${攻撃側判定 === 'プレイヤー' ? '相手' : 'あなた'}は回避奥義を狙ったが失敗！通常ダメージを受けた。 (被ダメージ: ${Math.floor(ダメージ)})`;
        }
      }
      else if (防御側コマンド === 'カウンター') {
        // カウンターコスト消費
        if (攻撃側判定 === 'プレイヤー') {
          this.battleManager.エネミー攻撃ゲージ -= 30;
          this.battleManager.エネミー奥義ゲージ -= 30;
        } else {
          this.battleManager.プレイヤー攻撃ゲージ -= 30;
          this.battleManager.プレイヤー奥義ゲージ -= 30;
        }

        const ブレード相性 = 属性相性判定(防御側ギア.部位属性.ブレード, 攻撃側ギア.部位属性.ブレード);
        const ブレード属性補正 = ブレード相性 === 1 ? 10 : (ブレード相性 === -1 ? -10 : 0);
        
        const カウンター成功率 = this.battleManager.get最終カウンター成功率(防御側ギア.ステータス.アタック, 攻撃側ギア.ステータス.アタック, ブレード属性補正);
        const 乱数 = Math.random() * 100;

        if (乱数 < カウンター成功率) {
          isHit = false;
          isCounterSuccess = true;
          
          const 反撃ブレード相性 = 属性相性判定(防御側ギア.部位属性.ブレード, 攻撃側ギア.部位属性.ブレード);
          const 反撃補正 = 反撃ブレード相性 === 1 ? 0.1 : (反撃ブレード相性 === -1 ? -0.1 : 0);
          const 反撃ダメージ = 0.18 * 防御側ギア.ステータス.アタック * (防御側ギア.ステータス.アタック / 攻撃側ギア.ステータス.ディフェンス) * (0.7 + 反撃補正);

          this.clashPendingCounterDamage = 反撃ダメージ;
          advDialogText = `${攻撃側判定 === 'プレイヤー' ? 'あなた' : '相手'}の「${スキル名}」！\n${攻撃側判定 === 'プレイヤー' ? '相手' : 'あなた'}の鋭いカウンター炸裂！反撃ダメージを与えた！ (反撃被ダメージ: ${Math.floor(反撃ダメージ)} / 成功率: ${カウンター成功率.toFixed(1)}%)`;
        } else {
          this.clashPendingCounterDamage = 0;
          advDialogText = `${攻撃側判定 === 'プレイヤー' ? 'あなた' : '相手'}の「${スキル名}」！\n${攻撃側判定 === 'プレイヤー' ? '相手' : 'あなた'}はカウンターを狙ったが失敗！大ダメージを受けた。 (被ダメージ: ${Math.floor(ダメージ)})`;
        }
      }
      else if (防御側コマンド === 'カウンター奥義' && 防御奥義) {
        // カウンター奥義コスト消費
        const spCost = Number(防御奥義.消費奥義ゲージ);
        const atkCost = Number(防御奥義.消費攻撃ゲージ || 0);

        if (攻撃側判定 === 'プレイヤー') {
          this.battleManager.エネミー攻撃ゲージ -= atkCost;
          this.battleManager.エネミー奥義ゲージ -= spCost;
        } else {
          this.battleManager.プレイヤー攻撃ゲージ -= atkCost;
          this.battleManager.プレイヤー奥義ゲージ -= spCost;
        }

        // 成功率は通常のカウンターと同様
        const ブレード相性 = 属性相性判定(防御側ギア.部位属性.ブレード, 攻撃側ギア.部位属性.ブレード);
        const ブレード属性補正 = ブレード相性 === 1 ? 10 : (ブレード相性 === -1 ? -10 : 0);
        
        const カウンター成功率 = this.battleManager.get最終カウンター成功率(防御側ギア.ステータス.アタック, 攻撃側ギア.ステータス.アタック, ブレード属性補正);
        const 乱数 = Math.random() * 100;

        if (乱数 < カウンター成功率) {
          isHit = false;
          isCounterSuccess = true;
          
          // 反撃倍率は奥義効果量 (例: 200) / 100
          const counterAtkMultiplier = Number(防御奥義.効果量 || 200) / 100;
          const 反撃ブレード相性 = 属性相性判定(防御側ギア.部位属性.ブレード, 攻撃側ギア.部位属性.ブレード);
          const 反撃補正 = 反撃ブレード相性 === 1 ? 0.1 : (反撃ブレード相性 === -1 ? -0.1 : 0);
          const 反撃ダメージ = 0.18 * 防御側ギア.ステータス.アタック * (防御側ギア.ステータス.アタック / 攻撃側ギア.ステータス.ディフェンス) * (counterAtkMultiplier + 反撃補正);

          this.clashPendingCounterDamage = 反撃ダメージ;
          advDialogText = `${攻撃側判定 === 'プレイヤー' ? 'あなた' : '相手'}の「${スキル名}」！\n${攻撃側判定 === 'プレイヤー' ? '相手' : 'あなた'}のカウンター奥義「${防御奥義.奥義名}」が炸裂！強烈な反撃！ (反撃被ダメージ: ${Math.floor(反撃ダメージ)} / 成功率: ${カウンター成功率.toFixed(1)}%)`;
        } else {
          this.clashPendingCounterDamage = 0;
          advDialogText = `${攻撃側判定 === 'プレイヤー' ? 'あなた' : '相手'}の「${スキル名}」！\n${攻撃側判定 === 'プレイヤー' ? '相手' : 'あなた'}はカウンター奥義を狙ったが不発！大ダメージを受けた。 (被ダメージ: ${Math.floor(ダメージ)})`;
        }
      }

      // 戦闘計算結果を一時格納
      this.clashPendingDamage = ダメージ;
      this.clashPendingIsHit = isHit;
      this.clashPendingIsCounter = isCounterSuccess;
      this.clashPendingSide = 攻撃側判定;
      this.clashPendingDialogText = advDialogText;

      // clashResultType の決定 ('hit' | 'guard' | 'evade' | 'counter')
      if (isCounterSuccess) {
        this.clashResultType = 'counter';
      } else if (!isHit && ダメージ === 0) {
        this.clashResultType = 'evade';
      } else if (isHit && (防御側コマンド === '防御' || 防御側コマンド === '防御奥義')) {
        this.clashResultType = 'guard';
      } else {
        this.clashResultType = 'hit';
      }

      // 左右激突突進アニメーションを開始し、大爆発音を再生 (回避時は風切り音を代わりに鳴らすのも手だが一旦爆発で)
      this.isClashAnimationActive = true;
      this.clashAnimFrame = 0;
      this.snd.playExplosion();

      this.clashOnComplete = () => {
        // 激突完了の被弾瞬間に金属ヒット音を再生
        if (this.clashPendingIsHit || this.clashPendingIsCounter) {
          this.snd.playHit();
        }

        // もし防御側の奥義発動だった場合は、その奥義の聖獣カットイン演出もキック可能 (ここではシンプルにADVのみ展開)
        this.startTalk([
          { speaker: is攻撃奥義 ? 'システム' : (攻撃側判定 === 'プレイヤー' ? 'あなた' : '相手'), text: this.clashPendingDialogText }
        ], () => {
          if (this.battleManager) {
            this.battleManager.実行反動クラッシュ();
          }
          // ADV結果会話をプレイヤーが読み終えたこのタイミングで勝敗判定を実行
          this.checkBattleEndConditions();
        });
      };
    } catch (e: any) {
      console.error("resolveCombatResult error:", e);
      this.showSystemModal('エラー', 'ダメージ判定処理中にエラーが発生しました: ' + e.message);
    }
  }

  // バトルの勝敗判定
  private checkBattleEndConditions() {
    if (!this.battleManager || this.isBattleFinished) return;

    // 激突アニメーション中、または結果会話テキスト表示中は遷移を保留する
    const talkDialog = document.getElementById('talk-dialog');
    const isTalkActive = talkDialog && talkDialog.classList.contains('active');
    if (this.isClashAnimationActive || isTalkActive) return;

    const pLife = this.battleManager.プレイヤーライフ;
    const eLife = this.battleManager.エネミーライフ;

    if (pLife <= 0 || eLife <= 0) {
      this.isBattleFinished = true;
      if (this.battleLoopId) cancelAnimationFrame(this.battleLoopId);

      this.snd.stopBGM(); // バトルBGMの停止

      let winner: 'player' | 'enemy' | 'draw' = 'draw';

      if (pLife > 0 && eLife <= 0) {
        winner = 'player';
        this.snd.playVictoryJingle(); // 勝利ジングル
      } else if (pLife <= 0 && eLife > 0) {
        winner = 'enemy';
        this.snd.playDefeatJingle(); // 敗北ジングル
      } else {
        // スピンロスにより同時に0になった場合: 攻撃ゲージが多いほうの判定勝ち
        const pAtk = this.battleManager.プレイヤー攻撃ゲージ;
        const eAtk = this.battleManager.エネミー攻撃ゲージ;
        if (pAtk > eAtk) {
          winner = 'player';
          this.snd.playVictoryJingle();
        } else if (eAtk > pAtk) {
          winner = 'enemy';
          this.snd.playDefeatJingle();
        } else {
          winner = 'draw';
          this.snd.playDefeatJingle();
        }
      }

      this.processBattleResult(winner);
    }
  }

  // バトル結果処理（リザルト画面移行）
  private processBattleResult(winner: 'player' | 'enemy' | 'draw') {
    if (!this.selectedNpc) return;

    const npc = this.selectedNpc;
    const outcomeEl = document.getElementById('result-outcome');
    const speakerEl = document.getElementById('result-serifu-speaker');
    const textEl = document.getElementById('result-serifu-text');

    let acquiredPartId: string | null = null;

    if (winner === 'player') {
      if (outcomeEl) {
        outcomeEl.textContent = 'VICTORY';
        outcomeEl.className = 'text-win';
      }
      // 勝利数を加算し、必要勝利数に達したら撃破完了とする
      const currentWins = (this.saveData.勝利数[npc.エネミーID] || 0) + 1;
      this.saveData.勝利数[npc.エネミーID] = currentWins;

      const reqWins = Number(npc.クリア必要勝利数 || 3);
      if (currentWins >= reqWins) {
        this.saveData.クリア状況[npc.エネミーID] = true;
      }
      // JP + 1 獲得
      this.saveData.所持JP += 1;

      // 勝利時セリフ
      if (speakerEl) speakerEl.textContent = npc.エネミー名;
      const foundSerifu = this.セリフマスタ.find(s => s.TEXT_ID === `${npc.エネミーID}_win`);
      if (textEl) textEl.textContent = foundSerifu?.テキスト内容 || "「ま、参りました…！君のギア、本当に強いね！」";

      // ロジックC：報酬ドロップ・リサイクル
      const dropRes = 報酬ドロップ処理(
        this.saveData.ドロップカウンタ,
        this.saveData.所持JP,
        this.saveData.インベントリ,
        this.パーツマスタ,
        this.セリフマスタ
      );

      // セーブデータの更新
      this.saveData.ドロップカウンタ = dropRes.更新ドロップカウンタ;
      this.saveData.所持JP = dropRes.更新所持JP;
      this.saveData.インベントリ = dropRes.更新インベントリ;
      
      if (dropRes.獲得パーツID) {
        acquiredPartId = dropRes.獲得パーツID;
      }

      // 報酬演出の描画
      const dropTextEl = document.getElementById('drop-part-text');
      const dropVisual = document.getElementById('drop-part-visual');
      if (dropTextEl) dropTextEl.textContent = dropRes.案内テキスト;

      if (dropVisual) {
        dropVisual.innerHTML = '';
        const droppedPart = this.パーツマスタ.find(p => p.パーツID === dropRes.獲得パーツID);
        if (droppedPart) {
          // 簡易的に Canvas で報酬パーツのプレビューを描く
          const canvas = document.createElement('canvas');
          canvas.width = 100;
          canvas.height = 100;
          dropVisual.appendChild(canvas);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // パッキングしてダミーで描画
            const dummyAssemble = アセンブル実行('c001', droppedPart.種別 === '1' ? droppedPart.パーツID : 'b101_n', droppedPart.種別 === '2' ? droppedPart.パーツID : 'w101_n', droppedPart.種別 === '3' ? droppedPart.パーツID : 's101_n', 1, this.パーツマスタ, this.チップマスタ, this.奥義マスタ);
            this.drawGear(ctx, 50, 50, 40, dummyAssemble, 0);
          }
        }
      }

      // バトルチップ経験値の付与 (勝敗問わず+1EXP)
      this.addChipExp();

    } else {
      // 敗北 / 引き分け
      if (outcomeEl) {
        outcomeEl.textContent = winner === 'draw' ? 'DRAW' : 'DEFEAT';
        outcomeEl.className = 'text-lose';
      }
      
      // 敗北時セリフ
      if (speakerEl) speakerEl.textContent = npc.エネミー名;
      const foundSerifu = this.セリフマスタ.find(s => s.TEXT_ID === `${npc.エネミーID}_lose`);
      if (textEl) textEl.textContent = foundSerifu?.テキスト内容 || "「ふっ、まだまだ修行が足りないようだな。再戦を待っているぞ！」";

      // 報酬はなし
      const dropTextEl = document.getElementById('drop-part-text');
      const dropVisual = document.getElementById('drop-part-visual');
      if (dropTextEl) dropTextEl.textContent = 'パーツドロップなし (バトル敗北のため)';
      if (dropVisual) dropVisual.innerHTML = '❌';

      this.addChipExp();
    }

    // セーブ保存
    localStorage.setItem('spinning_crush_save', JSON.stringify(this.saveData));

    // 直接、リザルト画面表示 ＆ 事後シナリオ再生処理へ移行する（獲得したパーツIDを引数で渡す）
    this.showResultScreenAndPlayAfterScenario(winner, acquiredPartId);
  }

  // リザルト画面への遷移 ＆ 事後会話シナリオの再生 ＆ パーツ獲得演出のポップアップ
  private showResultScreenAndPlayAfterScenario(winner: 'player' | 'enemy' | 'draw', acquiredPartId: string | null) {
    this.changeScreen('result-screen');
    
    if (!this.selectedNpc) return;

    // 初期化：ポップアップを一旦非表示に (パッケージ5)
    const dropPanel = document.querySelector('.result-drop-panel');
    if (dropPanel) dropPanel.classList.remove('pop-active');

    const rewardJpEl = document.getElementById('result-reward-jp');
    if (rewardJpEl) rewardJpEl.textContent = `+0 JP`;

    const diff = Math.max(0, this.saveData.所持JP - this.prevJp);

    // リザルト演出タイムライン
    setTimeout(() => {
      // 1. JP獲得カウントアップ (パッケージ5)
      if (rewardJpEl && diff > 0) {
        let current = 0;
        const timer = setInterval(() => {
          current++;
          rewardJpEl.textContent = `+${current} JP`;
          this.snd.playBleep(); // カチカチ音
          if (current >= diff) {
            clearInterval(timer);
          }
        }, 120);
      }

      // 2. ドロップパネルのバウンス出現 (パッケージ5)
      setTimeout(() => {
        if (dropPanel) {
          dropPanel.classList.add('pop-active');
          this.playRewardGetSound(); // ピピピピロン！SE
        }
      }, Math.max(200, diff * 120 + 50));

    }, 600); // 画面シャッターが開ききった頃

    const enemyId = this.selectedNpc.エネミーID;
    const suffix = winner === 'player' ? 'win' : 'lose';
    const scenarioId = `${enemyId}_after_${suffix}`;
    const hasScenario = this.シナリオマスタ.some(s => s.シナリオID === scenarioId);

    if (hasScenario) {
      // 画面切り替え（シャッター）が落ち着くのを少し待ってから事後会話シナリオを再生
      setTimeout(() => {
        this.playScenario(scenarioId, () => {
          // 事後会話シナリオをプレイヤーが読み終えた「その瞬間」に、ド派手なパーツ獲得演出を起動する！！！
          if (acquiredPartId) {
            this.startPartGetPerformance(acquiredPartId, () => {
              // 獲得演出完了
            });
          }
        });
      }, 550);
    } else {
      // 事後シナリオがない通常NPCなどの場合：リザルト画面に入った直後（少し待って）にパーツ獲得演出を起動
      if (acquiredPartId) {
        setTimeout(() => {
          this.startPartGetPerformance(acquiredPartId, () => {});
        }, 1500); // カウントアップとポップアップ出現が終わった後に起動
      }
    }
  }

  // 報酬獲得のアルペジオSE (ピピピピロン✨)
  private playRewardGetSound() {
    const snd = SoundManager.getInstance();
    snd.initContext();
    const ctx = (snd as any).ctx;
    if (!ctx) return;

    const time = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, time); // C5
    osc1.frequency.setValueAtTime(659.25, time + 0.07); // E5
    osc1.frequency.setValueAtTime(783.99, time + 0.14); // G5
    osc1.frequency.setValueAtTime(1046.50, time + 0.21); // C6

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(523.25, time);
    osc2.frequency.setValueAtTime(659.25, time + 0.07);
    osc2.frequency.setValueAtTime(783.99, time + 0.14);
    osc2.frequency.setValueAtTime(1046.50, time + 0.21);

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.04, time + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + 0.45);
    osc2.stop(time + 0.45);
  }

  // チップの経験値獲得ロジック (勝敗問わず1EXP、3EXPごとにレベルアップ)
  private addChipExp() {
    const activeSlot = this.saveData.ギアスロット[this.vsSlotIndex.toString()];
    if (!activeSlot) return;

    activeSlot.EXP += 1;
    if (activeSlot.EXP >= 3) {
      if (activeSlot.レベル < 5) {
        activeSlot.レベル += 1;
        activeSlot.EXP = 0;
        this.showSystemModal('レベルアップ！', `スロット ${this.vsSlotIndex} のチップ「${this.チップマスタ.find(c => c.チップID === activeSlot.チップ)?.チップ名}」がレベル ${activeSlot.レベル} に上がりました！`);
      } else {
        activeSlot.EXP = 3; // カンスト
      }
    }
  }

  // ド派手なパーツ獲得全画面演出
  private partGetAnimFrameId: number | null = null;
  private startPartGetPerformance(partId: string, onConfirm: () => void) {
    const overlay = document.getElementById('part-get-overlay');
    if (!overlay) {
      onConfirm();
      return;
    }

    const nameEl = document.getElementById('part-get-name');
    const typeAttrEl = document.getElementById('part-get-type-attr');
    const descEl = document.getElementById('part-get-description');
    const statsGrid = document.getElementById('part-get-stats-grid');
    const canvas = document.getElementById('part-get-canvas') as HTMLCanvasElement;

    const part = this.パーツマスタ.find(p => p.パーツID === partId);
    if (!part) {
      onConfirm();
      return;
    }

    if (nameEl) nameEl.textContent = part.パーツ名;
    
    let typeName = 'ブレード';
    if (part.種別 === '2') typeName = 'ウェイト';
    else if (part.種別 === '3') typeName = 'ソール';

    if (typeAttrEl) typeAttrEl.textContent = `${typeName} | ${part.属性}属性 | ランク${part.ランク}`;
    if (descEl) descEl.textContent = part.フレーバー || '強力な性能を持つカスタムパーツ。';

    if (statsGrid) {
      statsGrid.innerHTML = '';
      
      // 有効なステータスのみ表示
      const stats = [
        { label: 'HP', val: Number(part.ライフ) },
        { label: 'ATK', val: Number(part.アタック) },
        { label: 'DEF', val: Number(part.ディフェンス) },
        { label: 'SPD', val: Number(part.スピード) },
        { label: 'RNG', val: Number(part.レンジ) },
        { label: 'MOB', val: Number(part.モビリティ) }
      ];

      stats.forEach(s => {
        if (s.val > 0) {
          const item = document.createElement('span');
          item.textContent = `・${s.label}: ${s.val}`;
          statsGrid.appendChild(item);
        }
      });
    }

    // Canvasでの超巨大ギア回転描画 (光彩を背にホログラフィックに回る)
    if (canvas) {
      const ctx = canvas.getContext('2d');
      let angle = 0;

      const dummyAssemble = アセンブル実行(
        'c001', 
        part.種別 === '1' ? part.パーツID : 'b101_n', 
        part.種別 === '2' ? part.パーツID : 'w101_n', 
        part.種別 === '3' ? part.パーツID : 's101_n', 
        1, 
        this.パーツマスタ, 
        this.チップマスタ, 
        this.奥義マスタ
      );

      const renderLoop = () => {
        if (ctx) {
          ctx.clearRect(0, 0, 300, 300);
          
          // ギアを中央に超巨大サイズで描画 (半径90px)
          this.drawGear(ctx, 150, 150, 90, dummyAssemble, angle);
          angle += 0.035;
        }
        this.partGetAnimFrameId = requestAnimationFrame(renderLoop);
      };

      if (this.partGetAnimFrameId) cancelAnimationFrame(this.partGetAnimFrameId);
      renderLoop();
    }

    // お祝いファンファーレ
    this.snd.playClearJingle();

    overlay.classList.add('active');

    // ボタンイベントの設定
    const confirmBtn = document.getElementById('btn-part-get-confirm');
    const handleConfirm = () => {
      if (this.partGetAnimFrameId) {
        cancelAnimationFrame(this.partGetAnimFrameId);
        this.partGetAnimFrameId = null;
      }
      overlay.classList.remove('active');
      confirmBtn?.removeEventListener('click', handleConfirm);
      onConfirm();
    };
    confirmBtn?.addEventListener('click', handleConfirm);
  }

  // --- ⑧ バトル描画処理 ---
  private drawBattle() {
    const canvas = this.battleCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || !this.battleManager) return;

    ctx.save();

    // 1. スクリーンシェイクの処理
    if (this.battleShakeFrames > 0) {
      const dx = (Math.random() - 0.5) * 16;
      const dy = (Math.random() - 0.5) * 16;
      ctx.translate(dx, dy);
      this.battleShakeFrames--;
    }

    const pX = this.battleManager.プレイヤー位置X;
    const pY = this.battleManager.プレイヤー位置Y;
    const eX = this.battleManager.エネミー位置X;
    const eY = this.battleManager.エネミー位置Y;

    // GBA風「左右スプリット対面＆激突突進シーン」の描画判定
    if (this.battleManager.現在フェーズ === 'コマンド' || this.isClashAnimationActive || this.isOsugiCutinActive) {
      // 1. 背景のクリアとネオングリッド線の描画
      ctx.fillStyle = '#020306';
      ctx.fillRect(0, 0, 800, 600);

      ctx.strokeStyle = 'rgba(0, 243, 255, 0.04)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < 800; x += 40) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 600);
      }
      for (let y = 0; y < 600; y += 40) {
        ctx.moveTo(0, y);
        ctx.lineTo(800, y);
      }
      ctx.stroke();

      // 2. 透過属性バックグラウンド (プレイヤー＝左、敵＝右)
      const pAttr = this.battleManager.プレイヤーギア.部位属性.ブレード;
      const eAttr = this.battleManager.エネミーギア.部位属性.ブレード;
      
      let pColor = 'rgba(0, 243, 255, 0.06)';
      if (pAttr === '火') pColor = 'rgba(255, 0, 85, 0.08)';
      else if (pAttr === '風') pColor = 'rgba(57, 255, 20, 0.06)';
      else if (pAttr === '土') pColor = 'rgba(255, 170, 0, 0.08)';
      
      let eColor = 'rgba(255, 0, 85, 0.06)';
      if (eAttr === '水') eColor = 'rgba(0, 243, 255, 0.08)';
      else if (eAttr === '風') eColor = 'rgba(57, 255, 20, 0.06)';
      else if (eAttr === '土') eColor = 'rgba(255, 170, 0, 0.08)';

      // 左半分 (プレイヤー側)
      ctx.fillStyle = pColor;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(440, 0);
      ctx.lineTo(360, 600);
      ctx.lineTo(0, 600);
      ctx.closePath();
      ctx.fill();

      // 右半分 (エネミー側)
      ctx.fillStyle = eColor;
      ctx.beginPath();
      ctx.moveTo(440, 0);
      ctx.lineTo(800, 0);
      ctx.lineTo(800, 600);
      ctx.lineTo(360, 600);
      ctx.closePath();
      ctx.fill();

      // 3. スプリットのネオン境界線
      ctx.strokeStyle = '#00f3ff';
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#00f3ff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(440, -10);
      ctx.lineTo(360, 610);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 4. 巨大対決ギアの位置計算
      let drawPX = 200;
      let drawPY = 200; // コマンド選択中は下部メニューを避けるために上寄りに配置
      let drawEX = 600;
      let drawEY = 200;
      let isCloseupSelecting = false;

      if (this.battleManager.現在フェーズ === 'コマンド' && !this.isClashAnimationActive) {
        isCloseupSelecting = true;
      }

      if (this.isClashAnimationActive) {
        // 激突中のみ背景をクリアしてスピードライン背景を描画する (GBA対決アニメーション背景)
        ctx.fillStyle = '#060a12';
        ctx.fillRect(0, 0, 800, 600);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 1.5;
        // 毎フレーム12本のランダムな横スピードラインを描画
        for (let i = 0; i < 12; i++) {
          const y = Math.random() * 600;
          const len = 100 + Math.random() * 250;
          const x = Math.random() * 800;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + len, y);
          ctx.stroke();
        }

        if (this.clashAnimFrame < 25) {
          // 突進 (0〜25F)
          const t = this.clashAnimFrame / 25;
          const easeIn = t * t * t;

          if (this.clashResultType === 'evade') {
            // 回避成功時は、回避側が斜めに避ける残像軌道を描く
            if (this.clashPendingSide === 'プレイヤー') {
              // プレイヤーが回避 (左下へ避ける) / エネミーが突撃
              drawPX = 200 + (100 - 200) * easeIn;
              drawPY = 200 + (360 - 200) * easeIn;
              drawEX = 600 + (300 - 600) * easeIn;
              drawEY = 200 + (220 - 200) * easeIn;
            } else {
              // エネミーが回避 (右上へ避ける) / プレイヤーが突撃
              drawPX = 200 + (500 - 200) * easeIn;
              drawPY = 200 + (380 - 200) * easeIn;
              drawEX = 600 + (700 - 600) * easeIn;
              drawEY = 200 + (200 - 200) * easeIn;
            }
          } else if (this.clashResultType === 'counter') {
            // カウンター成功時：両者が同時に中央へ向かって激突突進！(「相手も突っ込んできた！」の演出)
            drawPX = 200 + (400 - 55 - 200) * easeIn;
            drawPY = 200 + (300 - 41 - 200) * easeIn;
            drawEX = 600 - (600 - (400 + 55)) * easeIn;
            drawEY = 200 + (300 + 41 - 200) * easeIn;
          } else {
            // 通常被弾 (hit) または ガード (guard) 時：
            // 攻撃側のみが中央へ突進し、防御側は中央でじっと身構えて待ち受ける
            if (this.clashPendingSide === 'プレイヤー') {
              // プレイヤーが防御側（中央待機）、エネミーが攻撃側（突撃）
              drawPX = 400 - 55;
              drawPY = 300 - 41;
              drawEX = 600 - (600 - (400 + 55)) * easeIn;
              drawEY = 200 + (300 + 41 - 200) * easeIn;
            } else {
              // エネミーが防御側（中央待機）、プレイヤーが攻撃側（突撃）
              drawPX = 200 + (400 - 55 - 200) * easeIn;
              drawPY = 200 + (300 - 41 - 200) * easeIn;
              drawEX = 400 + 55;
              drawEY = 300 + 41;
            }
          }

          // 突進風エナジーラインの描画 (回避時はなし)
          if (this.clashResultType !== 'evade') {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            
            // カウンターの時、またはプレイヤーが攻撃する時に、プレイヤー側にラインを引く
            if (this.clashResultType === 'counter' || this.clashPendingSide === 'エネミー') {
              ctx.moveTo(drawPX - 80, drawPY - 60);
              ctx.lineTo(drawPX - 20, drawPY - 15);
            }
            // カウンターの時、またはエネミーが攻撃する時に、エネミー側にラインを引く
            if (this.clashResultType === 'counter' || this.clashPendingSide === 'プレイヤー') {
              ctx.moveTo(drawEX + 80, drawEY + 60);
              ctx.lineTo(drawEX + 20, drawEY + 15);
            }
            ctx.stroke();
          }
        } else if (this.clashAnimFrame >= 25 && this.clashAnimFrame < 45) {
          if (this.clashResultType === 'evade') {
            // すれ違いのままスライド進行（25Fでの到達地点から、じわじわ離れていく）
            const t = (this.clashAnimFrame - 25) / 20;
            if (this.clashPendingSide === 'プレイヤー') {
              drawPX = 100 + (80 - 100) * t;
              drawPY = 360 + (380 - 360) * t;
              drawEX = 300 + (240 - 300) * t;
              drawEY = 220 + (190 - 220) * t;
            } else {
              drawPX = 500 + (560 - 500) * t;
              drawPY = 380 + (410 - 380) * t;
              drawEX = 700 + (720 - 700) * t;
              drawEY = 200 + (180 - 200) * t;
            }
          } else {
            // せめぎ合い (25〜45F) - ガリガリ摩擦振動
            const shakeX = (Math.random() - 0.5) * 8;
            const shakeY = (Math.random() - 0.5) * 8;
            drawPX = 400 - 55 + shakeX;
            drawPY = 300 - 41 + shakeY;
            drawEX = 400 + 55 + shakeX;
            drawEY = 300 + 41 + shakeY;
          }
        } else {
          // 激突後ノックバック (45〜60F)
          if (this.clashResultType === 'evade') {
            // 回避成功 ➔ 元の位置（プレイヤー: 200, 200、エネミー: 600, 200）へスムーズに戻る
            const t = (this.clashAnimFrame - 45) / 15;
            const easeOut = Math.sin(t * Math.PI * 0.5);
            if (this.clashPendingSide === 'プレイヤー') {
              drawPX = 80 + (200 - 80) * easeOut;
              drawPY = 380 + (200 - 380) * easeOut;
              drawEX = 240 + (600 - 240) * easeOut;
              drawEY = 190 + (200 - 190) * easeOut;
            } else {
              drawPX = 560 + (200 - 560) * easeOut;
              drawPY = 410 + (200 - 410) * easeOut;
              drawEX = 720 + (600 - 720) * easeOut;
              drawEY = 180 + (200 - 180) * easeOut;
            }
          } else if (this.clashResultType === 'guard') {
            // 防御成功 ➔ 被ダメージ側のノックバックを極小にし、攻撃側を大きく弾く
            const t = (this.clashAnimFrame - 45) / 15;
            const kb = Math.sin(t * Math.PI * 0.5) * 160;
            if (this.clashPendingSide === 'プレイヤー') {
              // プレイヤーがガード ➔ プレイヤーは耐えて、エネミーが弾き飛ぶ
              drawPX = 400 - 55 - kb * 0.25;
              drawPY = 300 - 41 - kb * 0.15;
              drawEX = 400 + 55 + kb * 1.0;
              drawEY = 300 + 41 + kb * 0.6;
            } else {
              // エネミーがガード ➔ エネミーは耐えて、プレイヤーが弾き飛ぶ
              drawPX = 400 - 55 - kb * 1.0;
              drawPY = 300 - 41 - kb * 0.6;
              drawEX = 400 + 55 + kb * 0.25;
              drawEY = 300 + 41 + kb * 0.15;
            }
          } else if (this.clashResultType === 'counter') {
            // カウンター成功 ➔ 攻撃した側が猛烈に吹き飛ぶ
            const t = (this.clashAnimFrame - 45) / 15;
            const kb = Math.sin(t * Math.PI * 0.5) * 200; // 吹き飛び大
            if (this.clashPendingSide === 'プレイヤー') {
              // プレイヤーがカウンター ➔ エネミー（攻撃側）が爆速で吹き飛ぶ
              drawPX = 400 - 55 - kb * 0.15; // プレイヤーは耐える
              drawPY = 300 - 41 - kb * 0.1;
              drawEX = 400 + 55 + kb * 1.4;  // エネミーが吹き飛ぶ
              drawEY = 300 + 41 + kb * 0.9;
            } else {
              // エネミーがカウンター ➔ プレイヤー（攻撃側）が爆速で吹き飛ぶ
              drawPX = 400 - 55 - kb * 1.4;  // プレイヤーが吹き飛ぶ
              drawPY = 300 - 41 - kb * 0.9;
              drawEX = 400 + 55 + kb * 0.15; // エネミーは耐える
              drawEY = 300 + 41 + kb * 0.1;
            }
          } else {
            // 通常被弾
            const t = (this.clashAnimFrame - 45) / 15;
            const kb = Math.sin(t * Math.PI * 0.5) * 160;
            if (this.clashPendingSide === 'プレイヤー') {
              drawPX = 400 - 55 - kb * 1.1;
              drawPY = 300 - 41 - kb * 0.65;
              drawEX = 400 + 55 + kb * 0.45;
              drawEY = 300 + 41 + kb * 0.25;
            } else {
              drawPX = 400 - 55 - kb * 0.45;
              drawPY = 300 - 41 - kb * 0.25;
              drawEX = 400 + 55 + kb * 1.1;
              drawEY = 300 + 41 + kb * 0.65;
            }
          }
        }
      }

      // コマンド選択中の「選択中ギア」周囲のオーラエフェクト演出
      if (isCloseupSelecting) {
        ctx.save();
        ctx.strokeStyle = 'var(--color-neon-blue)';
        ctx.shadowBlur = 20;
        ctx.shadowColor = 'var(--color-neon-blue)';
        ctx.lineWidth = 3;
        
        // プレイヤーギアの周囲に光るネオンリングを明滅回転させる
        ctx.beginPath();
        const pulse = 100 + Math.sin(Date.now() * 0.008) * 8;
        ctx.arc(drawPX, drawPY, pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 5. 巨大化した対決ギアの描画 (コマンド選択中は少し大きめの半径85px)
      const gearRadius = isCloseupSelecting ? 85 : 75;

      // 回避成功時の残像描画 (突進中: 5〜25F のみ)
      if (this.isClashAnimationActive && this.clashResultType === 'evade' && this.clashAnimFrame >= 5 && this.clashAnimFrame < 25) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        const tPrev = Math.max(0, (this.clashAnimFrame - 4) / 25);
        const easeInPrev = tPrev * tPrev * tPrev;
        if (this.clashPendingSide === 'プレイヤー') {
          const ghostPX = 200 + (100 - 200) * easeInPrev;
          const ghostPY = 200 + (360 - 200) * easeInPrev;
          this.drawGear(ctx, ghostPX, ghostPY, gearRadius, this.battleManager.プレイヤーギア, this.playerRotation * 2.5);
        } else {
          const ghostEX = 600 + (700 - 600) * easeInPrev;
          const ghostEY = 200 + (200 - 200) * easeInPrev;
          this.drawGear(ctx, ghostEX, ghostEY, gearRadius, this.battleManager.エネミーギア, this.enemyRotation * 2.5);
        }
        ctx.restore();
      }

      this.drawGear(ctx, drawPX, drawPY, gearRadius, this.battleManager.プレイヤーギア, this.playerRotation * 2.5);
      this.drawGear(ctx, drawEX, drawEY, gearRadius, this.battleManager.エネミーギア, this.enemyRotation * 2.5);

      // 防御成功時のネオンヘキサゴンシールド描画 (25〜55Fの間)
      if (this.isClashAnimationActive && this.clashResultType === 'guard' && this.clashAnimFrame >= 25 && this.clashAnimFrame <= 55) {
        const shieldX = this.clashPendingSide === 'プレイヤー' ? drawPX : drawEX;
        const shieldY = this.clashPendingSide === 'プレイヤー' ? drawPY : drawEY;
        
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 243, 255, 0.85)';
        ctx.fillStyle = 'rgba(0, 243, 255, 0.08)';
        ctx.lineWidth = 4;
        ctx.shadowBlur = 18;
        ctx.shadowColor = '#00f3ff';
        
        ctx.beginPath();
        const shieldRadius = gearRadius + 15; // ギアより一回り大きく
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3 + (this.clashAnimFrame * 0.03); // 回転させる
          const sx = shieldX + Math.cos(angle) * shieldRadius;
          const sy = shieldY + Math.sin(angle) * shieldRadius;
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // GBA風の太い斜め分割スプリット境界線を上に重ねて描画する (ハザードイエロー)
      // コマンド選択中（静止中）は非表示にし、激突演出中（スピードライン中）のみ描画して迫力を出す
      if (this.isClashAnimationActive) {
        ctx.save();
        ctx.strokeStyle = '#ffd800';
        ctx.lineWidth = 12;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ffd800';
        ctx.beginPath();
        ctx.moveTo(-50, 480);
        ctx.lineTo(850, 120);
        ctx.stroke();
        ctx.restore();
      }

      // 6. 各種エフェクト（衝撃波・奥義必殺・火花）の描画
      this.particles.forEach(p => p.draw(ctx));
      this.shockwaves.forEach(s => s.draw(ctx));
      this.skillParticles.forEach(sp => sp.draw(ctx));

      // 7. 衝突瞬間 (45〜50F) の全画面ホワイトアウト閃光フラッシュ
      if (this.isClashAnimationActive && this.clashAnimFrame >= 45 && this.clashAnimFrame <= 50) {
        const flashAlpha = 1.0 - (this.clashAnimFrame - 45) / 5;
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha * 0.95})`;
        ctx.fillRect(0, 0, 800, 600);
      }

      // 7.5. バトル結果判定「デカ文字ネオンスライド」演出 (45〜75Fの間) (パッケージ4)
      if (this.isClashAnimationActive && this.clashAnimFrame >= 45 && this.clashAnimFrame <= 75) {
        let text = 'HIT!!';
        let color = '#ff0055'; // 赤 (デフォルト)

        if (this.clashResultType === 'evade') {
          text = 'EVADE!!';
          color = '#39ff14'; // 緑
        } else if (this.clashResultType === 'counter') {
          text = 'COUNTER!!';
          color = '#ffaa00'; // オレンジ
        } else if (this.clashResultType === 'guard') {
          text = 'DEFENDED!!';
          color = '#00f3ff'; // 水色
        } else {
          // 通常ヒット時：奥義かどうかで変化
          const isOsugi = this.clashPendingChoice && this.clashPendingChoice.includes('奥義');
          text = isOsugi ? 'SPECIAL!!' : 'HIT!!';
          color = isOsugi ? '#ff007f' : '#ff0055';
        }

        ctx.save();
        ctx.font = 'italic 900 72px "Impact", "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const frame = this.clashAnimFrame;
        let x = 400;
        let alpha = 1.0;

        if (frame < 52) {
          // 爆速スライドイン (45Fから52Fで中央へ)
          const t = (frame - 45) / 7;
          x = 850 - 450 * t;
        } else if (frame > 70) {
          // 左へフェードアウト (70Fから75Fでスライド退場)
          const t = (frame - 70) / 5;
          x = 400 - 150 * t;
          alpha = 1.0 - t;
        }

        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 10;
        ctx.lineJoin = 'miter';
        ctx.miterLimit = 2;

        ctx.shadowBlur = 25;
        ctx.shadowColor = color;
        ctx.fillStyle = color;

        // 白い光る縁取りとネオンの塗りを重ねて立体感を出す
        ctx.strokeText(text, x, 300);
        ctx.fillText(text, x, 300);

        ctx.restore();
      }

      ctx.restore();
      return;
    }

    // ----------------------------------------------------
    // 通常のリアルタイムスタジアム描画
    // ----------------------------------------------------
    ctx.fillStyle = '#05060b';
    ctx.fillRect(0, 0, 800, 600);

    const centerPointX = (pX + eX) / 2;
    const centerPointY = (pY + eY) / 2;
    const distance = this.battleManager.get現在の間合い();
    
    let targetScale = 1.0;
    targetScale = 1.4 - (distance / 600);
    targetScale = Math.max(0.6, Math.min(1.3, targetScale));
    this.battleCamera.x = this.battleCamera.x * 0.9 + centerPointX * 0.1;
    this.battleCamera.y = this.battleCamera.y * 0.9 + centerPointY * 0.1;
    
    this.battleCamera.scale = this.battleCamera.scale * 0.9 + targetScale * 0.1;

    ctx.translate(400, 300);
    ctx.scale(this.battleCamera.scale, this.battleCamera.scale);
    ctx.translate(-this.battleCamera.x, -this.battleCamera.y);

    // スタジアムの描画
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.15)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(400, 300, 250, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 243, 255, 0.05)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(400, 300, 150, 0, Math.PI * 2);
    ctx.stroke();

    // プレイヤーのレンジサークルの描画
    if (this.battleManager.現在フェーズ === 'ディスタンス') {
      const pRange = this.battleManager.getレンジサークル半径(this.battleManager.プレイヤーギア.ステータス.レンジ);
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.1)';
      ctx.fillStyle = 'rgba(0, 243, 255, 0.02)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(pX, pY, pRange, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // エフェクトの描画
    this.particles.forEach(p => p.draw(ctx));
    this.shockwaves.forEach(s => s.draw(ctx));
    this.skillParticles.forEach(sp => sp.draw(ctx));

    // ギアの描画
    this.drawGear(ctx, pX, pY, 25, this.battleManager.プレイヤーギア, this.playerRotation);
    this.drawGear(ctx, eX, eY, 25, this.battleManager.エネミーギア, this.enemyRotation);

    ctx.restore();
  }

  // ==========================================
  // 8. ADV演出エンジン
  // ==========================================
  public playScenario(scenarioId: string, onComplete: () => void) {
    try {
      const steps = this.シナリオマスタ
        .filter(s => s.シナリオID === scenarioId)
        .sort((a, b) => Number(a.ステップ) - Number(b.ステップ));

      if (steps.length === 0) {
        this.showSystemModal('シナリオ再生エラー', `シナリオ「${scenarioId}」のステップがマスタデータに見つかりません。マスタが空の可能性があります。`);
        onComplete();
        return;
      }

      const avatarLeft = document.getElementById('talk-avatar-left');
      const avatarRight = document.getElementById('talk-avatar-right');

      const queue = steps.map(step => {
        return {
          speaker: step.話者名,
          text: step.テキスト,
          onComplete: () => {
            // 演出効果 (shake / flash)
            if (step.演出 === 'shake') {
              const advBox = document.querySelector('.talk-box');
              if (advBox) {
                advBox.classList.add('shake-active');
                setTimeout(() => advBox.classList.remove('shake-active'), 400);
              }
            }
            if (step.演出 === 'flash') {
              const overlay = document.getElementById('talk-dialog');
              if (overlay) {
                overlay.classList.add('flash-active');
                setTimeout(() => overlay.classList.remove('flash-active'), 250);
              }
            }

            // 立ち絵アバター表示更新
            const illustId = step.イラストID;
            const pos = step.立ち位置; // "left" | "right" | "center"

            if (illustId) {
              const avatarClass = `avatar-${illustId}`;
              if (pos === 'left' && avatarLeft) {
                avatarLeft.className = `talk-avatar left active ${avatarClass}`;
                if (avatarRight) {
                  avatarRight.classList.remove('active');
                  avatarRight.classList.add('inactive');
                }
              } else if (pos === 'right' && avatarRight) {
                avatarRight.className = `talk-avatar right active ${avatarClass}`;
                if (avatarLeft) {
                  avatarLeft.classList.remove('active');
                  avatarLeft.classList.add('inactive');
                }
              }
            } else {
              if (avatarLeft) avatarLeft.className = 'talk-avatar left';
              if (avatarRight) avatarRight.className = 'talk-avatar right';
            }
          }
        };
      });

      this.startTalk(queue, () => {
        // 終了時の後片付け
        if (avatarLeft) avatarLeft.className = 'talk-avatar left';
        if (avatarRight) avatarRight.className = 'talk-avatar right';
        onComplete();
      });
    } catch (err: any) {
      this.showSystemModal('エラー', `playScenario内で例外が発生しました: ${err.message}`);
      console.error(err);
      onComplete();
    }
  }

  public startTalk(queue: { speaker: string; text: string; onComplete?: () => void }[], onCompleteAll?: () => void) {
    this.talkQueue = queue;
    this.currentTalkIndex = 0;
    this.talkOnCompleteAll = onCompleteAll || null;
    
    const dialog = document.getElementById('talk-dialog');
    if (dialog) dialog.classList.add('active');

    this.renderCurrentTalk();
  }

  private renderCurrentTalk() {
    if (this.currentTalkIndex >= this.talkQueue.length) {
      document.getElementById('talk-dialog')?.classList.remove('active');
      if (this.talkOnCompleteAll) {
        this.talkOnCompleteAll();
        this.talkOnCompleteAll = null;
      }
      return;
    }

    const current = this.talkQueue[this.currentTalkIndex];
    
    const speakerEl = document.getElementById('talk-speaker-name');
    const textEl = document.getElementById('talk-text-content');
    
    if (speakerEl) speakerEl.textContent = current.speaker;
    if (textEl) textEl.textContent = current.text;

    // 現在のステップの演出や立ち絵のコールバックを発火
    if (current.onComplete) {
      current.onComplete();
    }
  }

  private nextTalk() {
    this.currentTalkIndex++;
    this.renderCurrentTalk();
  }

  // ==========================================
  // 9. システムモーダルダイアログ
  // ==========================================
  private showSystemModal(title: string, content: string) {
    const modal = document.getElementById('system-modal');
    const titleEl = document.getElementById('modal-title');
    const contentEl = document.getElementById('modal-content');

    if (titleEl) titleEl.textContent = title;
    if (contentEl) contentEl.textContent = content;

    modal?.classList.add('active');
  }

  // ==========================================
  // 10. タイトルデモ背景衝突演出 (パッケージ1)
  // ==========================================
  private titleDemoAnimId: number | null = null;
  private initTitleDemo() {
    const canvas = document.getElementById('title-bg-canvas') as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    this.stopTitleDemo(); // 重複防止

    // ダミーのギアアセンブルデータを作成 (アタック型赤ブレードと、スピード型緑ブレード)
    const dummy1 = アセンブル実行('c001', 'b104_f', 'w108_a', 's106_a', 1, this.パーツマスタ, this.チップマスタ, this.奥義マスタ);
    const dummy2 = アセンブル実行('c001', 'b108_a', 'w106_n', 's102_w', 1, this.パーツマスタ, this.チップマスタ, this.奥義マスタ);

    let angle1 = 0;
    let angle2 = 0;
    
    // 2枚のギアがぶつかるアニメーションパラメータ
    let time = 0;
    
    // 火花パーティクル
    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      maxLife: number;
      color: string;
    }
    const particles: Particle[] = [];

    const spawnSpark = (x: number, y: number, color: string) => {
      for (let i = 0; i < 8; i++) {
        particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 6,
          vy: (Math.random() - 0.5) * 6 - 2, // 上方向へ
          life: 0,
          maxLife: 20 + Math.random() * 15,
          color
        });
      }
    };

    const loop = () => {
      if (!ctx || this.currentScreenId !== 'title-screen') return;

      const w = canvas.width;
      const h = canvas.height;

      // 濃いサイバー系の背景
      ctx.fillStyle = '#06070d';
      ctx.fillRect(0, 0, w, h);

      // グリッド線の描画 (SF感)
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.04)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let lx = 0; lx < w; lx += gridSize) {
        ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, h); ctx.stroke();
      }
      for (let ly = 0; ly < h; ly += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(w, ly); ctx.stroke();
      }

      // 2台のギアの位置計算 (サイン波で往復接近させる)
      const centerX = w / 2;
      const centerY = h / 2;
      
      // レスポンシブに最大オフセットを計算
      const maxOffset = Math.min(w, h) * 0.28;
      
      // オフセット計算 (ぶつかる距離)
      const cycle = Math.sin(time) * maxOffset;
      const g1X = centerX - Math.abs(cycle) - 30;
      const g2X = centerX + Math.abs(cycle) + 30;

      // 回転角
      angle1 += 0.08;
      angle2 -= 0.08;
      time += 0.015;

      // 衝突判定 (距離が100px以下になった瞬間)
      const dist = g2X - g1X;
      const collisionDistance = 100; // ギア半径50px * 2
      if (dist <= collisionDistance && Math.sin(time) > 0 && Math.cos(time) > 0.9) {
        // 衝突の瞬間に火花を散らす
        spawnSpark(centerX, centerY, '#ff0055'); // ギア1の火花
        spawnSpark(centerX, centerY, '#39ff14'); // ギア2の火花
      }

      // パーティクルの更新と描画
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12; // 重力
        p.life++;
        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
        } else {
          ctx.fillStyle = p.color;
          ctx.shadowBlur = 8;
          ctx.shadowColor = p.color;
          ctx.globalAlpha = 1.0 - (p.life / p.maxLife);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2 + Math.random() * 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1.0;
          ctx.shadowBlur = 0;
        }
      }

      // ギアの描画 (直径100px)
      this.drawGear(ctx, g1X, centerY, 50, dummy1, angle1);
      this.drawGear(ctx, g2X, centerY, 50, dummy2, angle2);

      this.titleDemoAnimId = requestAnimationFrame(loop);
    };

    loop();
  }

  private stopTitleDemo() {
    if (this.titleDemoAnimId) {
      cancelAnimationFrame(this.titleDemoAnimId);
      this.titleDemoAnimId = null;
    }
  }
}

// アプリケーション起動
new GameApp();
