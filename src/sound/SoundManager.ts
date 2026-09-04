export class SoundManager {
  private static instance: SoundManager | null = null;
  private ctx: AudioContext | null = null;
  private bgmIntervalId: any = null;
  private bgmStep: number = 0;

  private bgmVolume: number = 0.5;
  private seVolume: number = 0.8;

  // 高品質SEのメモリキャッシュと多重発音管理
  private seBufferCache: { [filename: string]: AudioBuffer } = {};
  private seLoadingPromises: { [filename: string]: Promise<AudioBuffer | null> } = {};

  private constructor() {
    // ユーザーの最初の操作（クリック/キー/タッチ）で自動再生ブロックを自然に解除するグローバルリスナー
    const unlockAudio = () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      this.initContext();
      this.resumeContext();
      // もし保留中の外部BGMがあり、未再生なら再開
      if (this.currentAudio && this.currentAudio.paused && this.targetBgmFilename) {
        this.currentAudio.play().catch(() => {});
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('click', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });
      window.addEventListener('touchstart', unlockAudio, { passive: true });
    }
  }

  public static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  public setBgmVolume(val: number) {
    this.bgmVolume = Math.max(0, Math.min(1, val));
  }

  public setSeVolume(val: number) {
    this.seVolume = Math.max(0, Math.min(1, val));
  }

  public getBgmVolume(): number { return this.bgmVolume; }
  public getSeVolume(): number { return this.seVolume; }

  // ユーザーの最初のクリックアクション等で呼び出してオーディオコンテキストをロック解除する
  public initContext() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.preloadAllSE();
    } catch (e) {
      console.warn("Web Audio API is not supported in this browser:", e);
    }
  }

  // SEアセットの非同期プリロード＆AudioBufferデコードキャッシュ
  public async loadSE(filename: string): Promise<AudioBuffer | null> {
    if (filename in this.seBufferCache) return this.seBufferCache[filename];
    if (filename in this.seLoadingPromises) return this.seLoadingPromises[filename];

    this.initContext();
    if (!this.ctx) return null;

    this.seLoadingPromises[filename] = (async () => {
      try {
        const res = await fetch(`/sounds/se/${filename}`);
        if (!res.ok) return null;
        const arrayBuf = await res.arrayBuffer();
        const audioBuf = await this.ctx!.decodeAudioData(arrayBuf);
        this.seBufferCache[filename] = audioBuf;
        return audioBuf;
      } catch (e) {
        console.warn(`[SoundManager] Failed to load SE: ${filename}`, e);
        return null;
      } finally {
        delete this.seLoadingPromises[filename];
      }
    })();

    return this.seLoadingPromises[filename];
  }

  // 全主要SEの一括先行ロード
  public preloadAllSE() {
    const files = [
      'se_hit.wav',
      'se_damage.wav',
      'se_guard.wav',
      'se_counter.wav',
      'se_dodge.wav',
      'se_explosion.wav',
      'se_charge.wav',
      'se_click.wav',
      'se_bleep.wav'
    ];
    files.forEach(f => this.loadSE(f));
  }

  // キャッシュされたAudioBufferによる超低遅延・高ポリフォニー再生
  public playSE(filename: string, volumeScale: number = 1.0): boolean {
    this.initContext();
    this.resumeContext();
    if (!this.ctx) return false;

    const buffer = this.seBufferCache[filename];
    if (buffer) {
      try {
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        const gainNode = this.ctx.createGain();
        gainNode.gain.setValueAtTime(this.seVolume * volumeScale, this.ctx.currentTime);
        source.connect(gainNode);
        gainNode.connect(this.ctx.destination);
        source.start(0);
        return true;
      } catch (e) {
        return false;
      }
    }

    // まだキャッシュされていない場合はロードを開始してフォールバック
    this.loadSE(filename);
    return false;
  }

  private resumeContext() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // 歪みエフェクト用カーブ生成
  private makeDistortionCurve(amount = 50) {
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  // UI選択音 (心地よく抜けるピコッ音)
  public playBleep() {
    if (this.playSE('se_bleep.wav', 0.5)) return;

    this.initContext();
    this.resumeContext();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, time);
    osc.frequency.exponentialRampToValueAtTime(1600, time + 0.04);

    gain.gain.setValueAtTime(0.06, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.045);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + 0.05);
  }

  // UI決定音 / シャッター開閉音 (きらびやかなピシィーン音)
  public playClick() {
    if (this.playSE('se_click.wav', 0.7)) return;

    this.initContext();
    this.resumeContext();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // 金属的響きを出すための高周波サイン波とマイルドな三角波
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(580, time);
    osc1.frequency.exponentialRampToValueAtTime(2200, time + 0.12);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(290, time);
    osc2.frequency.exponentialRampToValueAtTime(1100, time + 0.12);

    gain.gain.setValueAtTime(0.08, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + 0.15);
    osc2.stop(time + 0.15);
  }

  // 通常ヒット音 / 被弾金属音 (カキィィン！という硬質で迫力のあるリアルな金属打撃音)
  public playHit() {
    if (this.playSE('se_hit.wav', 0.9)) return;

    this.initContext();
    this.resumeContext();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const duration = 0.18;

    // 1. 不協和音FM金属ベル合成 (複数の非倍音をブレンドして金属感を作る)
    const freqs = [880, 1180, 1650, 2240];
    const oscs: OscillatorNode[] = [];
    const hitGain = this.ctx.createGain();

    hitGain.gain.setValueAtTime(0.14, time);
    hitGain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    freqs.forEach((freq) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      // ピッチを瞬時にスイープさせて衝突の硬さを出す
      osc.frequency.exponentialRampToValueAtTime(freq * 0.8, time + 0.05);
      
      osc.connect(hitGain);
      oscs.push(osc);
    });

    hitGain.connect(this.ctx.destination);

    // 2. 金属の擦れ合い・火花のハイパスノイズ (バシッというアタック音)
    const bufferSize = this.ctx.sampleRate * 0.05; // 0.05秒の摩擦
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const hpFilter = this.ctx.createBiquadFilter();
    hpFilter.type = 'highpass';
    hpFilter.frequency.setValueAtTime(5500, time);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.1, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.045);

    noise.connect(hpFilter);
    hpFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    // 同時再生開始
    oscs.forEach(osc => osc.start(time));
    noise.start(time);

    oscs.forEach(osc => osc.stop(time + duration + 0.02));
    noise.stop(time + 0.06);
  }

  // 防御/ガード金属音 (キィィン！という硬質シールド音)
  public playGuard() {
    if (this.playSE('se_guard.wav', 0.85)) return;

    this.initContext();
    this.resumeContext();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const duration = 0.22;
    const freqs = [1200, 1800, 2400];
    const oscs: OscillatorNode[] = [];
    const gain = this.ctx.createGain();

    gain.gain.setValueAtTime(0.12, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    freqs.forEach(f => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, time);
      osc.connect(gain);
      oscs.push(osc);
    });

    gain.connect(this.ctx.destination);
    oscs.forEach(o => o.start(time));
    oscs.forEach(o => o.stop(time + duration + 0.02));
  }

  // 回避/ドッジ風切り音 (シュッ！という高速回避音)
  public playDodge() {
    if (this.playSE('se_dodge.wav', 0.8)) return;

    this.initContext();
    this.resumeContext();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const duration = 0.12;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3000, time);
    filter.frequency.exponentialRampToValueAtTime(500, time + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(time);
    noise.stop(time + duration);
  }

  // 被弾/重ダメージ音 (ガツゥン！というヘビーインパクト)
  public playDamage() {
    if (this.playSE('se_damage.wav', 0.95)) return;

    this.initContext();
    this.resumeContext();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const duration = 0.25;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(35, time + duration);

    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + duration);
  }

  // カウンター閃光撃砕音 (バシィィン！という強烈な反撃音)
  public playCounter() {
    if (this.playSE('se_counter.wav', 0.9)) return;

    this.initContext();
    this.resumeContext();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const duration = 0.3;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400, time);
    osc.frequency.exponentialRampToValueAtTime(300, time + duration);

    gain.gain.setValueAtTime(0.22, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + duration);

    this.playHit();
  }

  // 激突大爆発音 (サチュレートされた歪み ＆ 腹に響く45Hzサブベースによるドズゥゥン音)
  public playExplosion() {
    if (this.playSE('se_explosion.wav', 1.0)) return;

    this.initContext();
    this.resumeContext();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const duration = 0.5;

    // 1. ノイズソースの作成 (爆風)
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    // 2. 音圧を強烈にサチュレートするディストーション (歪み)
    const distortion = this.ctx.createWaveShaper();
    distortion.curve = this.makeDistortionCurve(70);
    distortion.oversample = '4x';

    // 3. ローパスフィルター (2000Hzから40Hzへ急降下)
    const lpFilter = this.ctx.createBiquadFilter();
    lpFilter.type = 'lowpass';
    lpFilter.frequency.setValueAtTime(1500, time);
    lpFilter.frequency.exponentialRampToValueAtTime(40, time + 0.4);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.15, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    // ノイズのルーティング: Source ➔ 歪み ➔ フィルタ ➔ Gain ➔ 出力
    noise.connect(distortion);
    distortion.connect(lpFilter);
    lpFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    // 4. 重低音を補強する 45Hz サブベースサイン波 (地響き)
    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(45, time);
    subOsc.frequency.linearRampToValueAtTime(10, time + 0.35);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.45, time); // 強い重低音
    subGain.gain.exponentialRampToValueAtTime(0.001, time + 0.38);

    subOsc.connect(subGain);
    subGain.connect(this.ctx.destination);

    // 爆発開始
    noise.start(time);
    subOsc.start(time);
    
    noise.stop(time + duration + 0.02);
    subOsc.stop(time + 0.4);
  }

  // 奥義発動チャージ音 (ウワウワキュィィィン)
  public playOsugiCharge() {
    if (this.playSE('se_charge.wav', 0.9)) return;

    this.initContext();
    this.resumeContext();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const duration = 1.2;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    // 220Hz (A3) ➔ 1760Hz (A6) に対数スイープ
    osc.frequency.setValueAtTime(220, time);
    osc.frequency.exponentialRampToValueAtTime(1760, time + duration);

    // LFO（振幅のゆらぎ）を乗せて「ウワウワ」させる
    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(12, time); // 12Hzのビブラート

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(120, time); // 周波数の揺れ幅

    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    gain.gain.setValueAtTime(0.01, time);
    gain.gain.linearRampToValueAtTime(0.18, time + duration * 0.8);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    lfo.start(time);
    osc.start(time);

    lfo.stop(time + duration);
    osc.stop(time + duration);
  }

  // ガチャハンドル回転音 (カチャ、カチャ、ガチャン)
  public playGachaSpin() {
    this.initContext();
    this.resumeContext();
    const ctx = this.ctx;
    if (!ctx) return;

    const time = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const startTime = time + i * 0.15;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, startTime);
      osc.frequency.linearRampToValueAtTime(50, startTime + 0.08);

      gain.gain.setValueAtTime(0.18, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.1);
    }
  }

  // カプセルバウンド ＆ パカッと割れるトイ音 (コロコロ…パカッ！)
  public playCapsuleDropOpen() {
    this.initContext();
    this.resumeContext();
    const ctx = this.ctx;
    if (!ctx) return;

    const time = ctx.currentTime;
    
    // コロコロバウンド
    for (let i = 0; i < 2; i++) {
      const bounceTime = time + i * 0.15;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(200 - i * 40, bounceTime);
      gain.gain.setValueAtTime(0.12, bounceTime);
      gain.gain.exponentialRampToValueAtTime(0.001, bounceTime + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(bounceTime);
      osc.stop(bounceTime + 0.08);
    }

    // パカッと割れる
    const openTime = time + 0.35;
    const oscOpen = ctx.createOscillator();
    const gainOpen = ctx.createGain();
    oscOpen.type = 'sine';
    oscOpen.frequency.setValueAtTime(320, openTime);
    oscOpen.frequency.exponentialRampToValueAtTime(550, openTime + 0.1);
    
    gainOpen.gain.setValueAtTime(0.18, openTime);
    gainOpen.gain.exponentialRampToValueAtTime(0.001, openTime + 0.1);
    
    oscOpen.connect(gainOpen);
    gainOpen.connect(ctx.destination);
    oscOpen.start(openTime);
    oscOpen.stop(openTime + 0.12);
  }

  // =================================================================
  // 外部音楽ファイル再生 ＆ フェードイン/アウト接続エンジン (パッケージ3)
  // =================================================================
  private currentAudio: HTMLAudioElement | null = null;
  private targetBgmFilename: string = "";
  private bgmRequestId: number = 0;

  private playExternalBGM(filename: string, loop: boolean = true): Promise<boolean> {
    const reqId = ++this.bgmRequestId;
    this.targetBgmFilename = filename;

    // 新しいBGMが要求された瞬間に、既存の外部Audio・シンセBGMを完全に停止・破棄
    this.stopExternalAudio();
    this.stopBGM();

    return new Promise((resolve) => {
      const audio = new Audio(`/sounds/${filename}`);
      audio.loop = loop;
      audio.volume = 0.45;
      this.currentAudio = audio;

      let hasResolved = false;

      const cleanupHandlers = () => {
        audio.onerror = null;
        audio.oncanplaythrough = null;
      };

      // エラー発生時のハンドラ (アセット未配置等の場合のみシンセにフォールバック)
      audio.onerror = () => {
        if (hasResolved) return;
        hasResolved = true;
        cleanupHandlers();

        // 別のBGMが既に要求されている場合はフォールバック不要（重複再生防止）
        if (this.bgmRequestId !== reqId || this.targetBgmFilename !== filename) {
          try { audio.pause(); audio.src = ''; } catch (e) {}
          resolve(true); // キャンセルされたためフォールバックシンセを発動させない
          return;
        }

        console.warn(`[SoundManager] BGM '/sounds/${filename}' not found. Fallback to Synth.`);
        this.stopExternalAudio();
        resolve(false);
      };

      audio.oncanplaythrough = () => {
        if (hasResolved) return;

        // ロード完了までに別のBGMが要求されていたら即時破棄して終了
        if (this.bgmRequestId !== reqId || this.targetBgmFilename !== filename) {
          hasResolved = true;
          cleanupHandlers();
          try { audio.pause(); audio.src = ''; } catch (e) {}
          resolve(true); // キャンセルされたためフォールバックシンセを発動させない
          return;
        }

        hasResolved = true;
        cleanupHandlers();
        this.stopBGM(); // 万が一シンセが動いていれば完全停止

        audio.play().then(() => {
          if (this.bgmRequestId === reqId) {
            resolve(true);
          } else {
            // 再生開始までに新しい要求が来ていたら即停止
            try { audio.pause(); audio.src = ''; } catch (e) {}
            resolve(true);
          }
        }).catch(err => {
          console.warn("[SoundManager] Autoplay blocked or failed:", err);
          if (this.bgmRequestId === reqId) {
            resolve(false);
          } else {
            resolve(true);
          }
        });
      };
    });
  }

  private stopExternalAudio() {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio.src = '';
      } catch (e) {}
      this.currentAudio = null;
    }
  }

  // なめらかなBGMフェードアウト遷移
  public fadeOutBGM(durationMs = 800): Promise<void> {
    return new Promise((resolve) => {
      if (this.currentAudio) {
        const audio = this.currentAudio;
        const startVolume = audio.volume;
        const startTime = Date.now();

        const timer = setInterval(() => {
          const elapsed = Date.now() - startTime;
          const pct = Math.max(0, 1.0 - elapsed / durationMs);
          audio.volume = startVolume * pct;

          if (pct <= 0) {
            clearInterval(timer);
            try {
              audio.pause();
            } catch (e) {}
            if (this.currentAudio === audio) {
              this.currentAudio = null;
            }
            resolve();
          }
        }, 30);
      } else {
        this.stopBGM();
        resolve();
      }
    });
  }

  // 各画面ごとのアセット音楽のトリガー (純粋な外部MP3ファイルを確実に再生)
  public startPrologueBGM() {
    this.playExternalBGM('prologue.mp3');
  }

  public startOpeningBGM() {
    this.playExternalBGM('opening.mp3');
  }

  public startLobbyBGM() {
    this.playExternalBGM('lobby.mp3');
  }

  public startGarageBGM() {
    this.playExternalBGM('garage.mp3');
  }

  public startCustomBGM() {
    this.playExternalBGM('custom.mp3');
  }

  public startStageSelectBGM() {
    this.playExternalBGM('stage_select.mp3');
  }

  public startVsMatchBGM() {
    this.playExternalBGM('vs_match.mp3', false);
  }

  public startShopBGM() {
    this.playExternalBGM('shop.mp3');
  }

  public startBattleBGM() {
    this.playExternalBGM('battle_normal.mp3');
  }

  public startBattleStage4BGM() {
    this.playExternalBGM('battle_stage4.mp3');
  }

  public startBattleStage5BGM() {
    this.playExternalBGM('battle_stage5.mp3');
  }

  public startBattleStage6BGM() {
    this.playExternalBGM('battle_stage6.mp3');
  }

  public startBattleBossBGM() {
    this.playExternalBGM('battle_boss.mp3');
  }

  public startResultsBGM() {
    this.playExternalBGM('results.mp3');
  }

  public startPinchBGM() {
    this.playExternalBGM('battle_pinch.mp3');
  }

  public stopAllBGM() {
    this.bgmRequestId++;
    this.targetBgmFilename = "";
    this.stopBGM();
    this.stopExternalAudio();
  }

  // ==========================================
  // シンセサイザー自動演奏BGM (フォールバック用)
  // ==========================================
  public startBattleBGM_Synth() {
    this.stopExternalAudio();
    this.initContext();
    this.resumeContext();
    if (!this.ctx) return;
    if (this.bgmIntervalId) this.stopBGM();

    const bpm = 135;
    const stepDuration = 60 / bpm / 2; // 八分音符の間隔 (秒)
    const baseScale = [130.8, 130.8, 164.8, 164.8, 196.0, 196.0, 220.0, 220.0];
    const melodyScale = [
      261.6, 329.6, 392.0, 523.3, 440.0, 392.0, 329.6, 0,
      293.7, 329.6, 392.0, 0, 440.0, 523.3, 392.0, 0,
      329.6, 293.7, 261.6, 220.0, 261.6, 0, 293.7, 329.6,
      392.0, 440.0, 523.3, 440.0, 392.0, 329.6, 261.6, 0
    ];

    this.bgmStep = 0;

    const playStep = () => {
      if (!this.ctx || this.ctx.state === 'suspended') return;
      const time = this.ctx.currentTime;
      const currentStep = this.bgmStep % 32;
      const baseIdx = Math.floor(currentStep / 2) % 8;
      const baseFreq = baseScale[baseIdx];

      if (baseFreq > 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(baseFreq, time);
        gain.gain.setValueAtTime(0.03, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + stepDuration * 0.95);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(time);
        osc.stop(time + stepDuration);
      }

      if (currentStep % 4 === 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(140, time);
        osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.12);
        gain.gain.setValueAtTime(0.12, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(time);
        osc.stop(time + 0.13);
      }

      if (currentStep % 4 === 2) {
        const bufferSize = this.ctx.sampleRate * 0.08;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1100, time);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.06, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(time);
        noise.stop(time + 0.09);
      }

      const melFreq = melodyScale[currentStep];
      if (melFreq && melFreq > 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(melFreq, time);
        gain.gain.setValueAtTime(0.04, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + stepDuration * 0.85);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(time);
        osc.stop(time + stepDuration);
      }
      this.bgmStep++;
    };

    this.bgmIntervalId = setInterval(playStep, stepDuration * 1000);
  }

  public startPinchBGM_Synth() {
    this.stopExternalAudio();
    this.initContext();
    this.resumeContext();
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.bgmIntervalId) this.stopBGM();

    const bpm = 165;
    const stepDuration = 60 / bpm / 2; // 八分音符の間隔 (約0.181秒)
    const baseScale = [130.8, 146.8, 164.8, 196.0, 220.0, 196.0, 164.8, 146.8];
    const melodyScale = [
      523.3, 587.3, 659.3, 784.0, 880.0, 784.0, 659.3, 587.3,
      659.3, 784.0, 880.0, 1046.5, 1174.7, 1046.5, 880.0, 784.0,
      0, 1046.5, 880.0, 0, 784.0, 659.3, 587.3, 523.3,
      587.3, 659.3, 784.0, 0, 880.0, 1046.5, 1174.7, 0
    ];

    this.bgmStep = 0;

    const playStep = () => {
      if (!ctx || ctx.state === 'suspended') return;
      const time = ctx.currentTime;
      const currentStep = this.bgmStep % 32;
      const baseIdx = currentStep % 8;
      const baseFreq = baseScale[baseIdx];

      if (baseFreq > 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(baseFreq * 1.2, time);
        gain.gain.setValueAtTime(0.04, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + stepDuration * 0.9);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + stepDuration);
      }

      if (currentStep % 4 === 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(160, time);
        osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.1);
        gain.gain.setValueAtTime(0.14, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + 0.11);
      }

      if (currentStep % 2 === 1) {
        const bufferSize = ctx.sampleRate * 0.03;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(7000, time);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.02, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start(time);
        noise.stop(time + 0.03);
      }

      if (currentStep % 8 === 4) {
        const bufferSize = ctx.sampleRate * 0.07;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1500, time);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.07, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start(time);
        noise.stop(time + 0.08);
      }

      const melFreq = melodyScale[currentStep];
      if (melFreq && melFreq > 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(melFreq, time);
        gain.gain.setValueAtTime(0.04, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + stepDuration * 0.85);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + stepDuration);
      }
      this.bgmStep++;
    };

    this.bgmIntervalId = setInterval(playStep, stepDuration * 1000);
  }

  public startLobbyBGM_Synth() {
    this.stopExternalAudio();
    this.initContext();
    this.resumeContext();
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.bgmIntervalId) this.stopBGM();

    const bpm = 105;
    const stepDuration = 60 / bpm / 2; // 八分音符の間隔
    const baseScale = [130.81, 146.83, 164.81, 196.00, 130.81, 146.83, 164.81, 196.00];
    const melodyScale = [
      261.63, 293.66, 329.63, 0, 392.00, 329.63, 293.66, 0,
      329.63, 392.00, 440.00, 0, 392.00, 440.00, 523.25, 0,
      0, 523.25, 440.00, 392.00, 329.63, 0, 293.66, 261.63,
      293.66, 329.63, 392.00, 293.66, 261.63, 0, 0, 0
    ];

    this.bgmStep = 0;

    const playStep = () => {
      if (!ctx || ctx.state === 'suspended') return;
      const time = ctx.currentTime;
      const currentStep = this.bgmStep % 32;
      const baseIdx = Math.floor(currentStep / 2) % 8;
      const baseFreq = baseScale[baseIdx];

      // ベース（柔らかい三角波）
      if (baseFreq > 0 && currentStep % 2 === 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(baseFreq * 0.75, time); // 低音オクターブ
        gain.gain.setValueAtTime(0.04, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + stepDuration * 1.8);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + stepDuration * 2);
      }

      // 静かなチクチクパーカッション (16分音符)
      if (currentStep % 4 === 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(1000, time);
        osc.frequency.linearRampToValueAtTime(10, time + 0.03);
        gain.gain.setValueAtTime(0.015, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + 0.04);
      }

      // ピコピコメロディ (サイン波でやさしい響き)
      const melFreq = melodyScale[currentStep];
      if (melFreq && melFreq > 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(melFreq, time);
        gain.gain.setValueAtTime(0.035, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + stepDuration * 1.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + stepDuration * 1.5);
      }
      this.bgmStep++;
    };

    this.bgmIntervalId = setInterval(playStep, stepDuration * 1000);
  }

  public stopBGM() {
    if (this.bgmIntervalId) {
      clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = null;
    }
    this.bgmStep = 0;
  }

  // 勝利ファンファーレジングル (アセットロード対応)
  public playVictoryJingle() {
    this.stopAllBGM();
    const audio = new Audio('/sounds/victory.mp3');
    audio.volume = 0.55;
    audio.play().catch(() => {
      // フォールバックシンセ
      this.playVictoryJingle_Synth();
    });
  }

  private playVictoryJingle_Synth() {
    this.initContext();
    this.resumeContext();
    const ctx = this.ctx;
    if (!ctx) return;

    const time = ctx.currentTime;
    const notes = [
      { f: 523.3, t: 0.0 }, { f: 659.3, t: 0.06 }, { f: 784.0, t: 0.12 },
      { f: 659.3, t: 0.18 }, { f: 784.0, t: 0.24 }, { f: 1046.5, t: 0.30 },
      { f: 1318.5, t: 0.42 }
    ];

    notes.forEach((note) => {
      const startTime = time + note.t;
      const duration = note.t === 0.42 ? 0.6 : 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(note.f, startTime);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2000, startTime);
      gain.gain.setValueAtTime(0.05, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    });
  }

  // 敗北ジングル (アセットロード対応)
  public playDefeatJingle() {
    this.stopAllBGM();
    const audio = new Audio('/sounds/defeat.mp3');
    audio.volume = 0.55;
    audio.play().catch(() => {
      this.playDefeatJingle_Synth();
    });
  }

  private playDefeatJingle_Synth() {
    this.initContext();
    this.resumeContext();
    const ctx = this.ctx;
    if (!ctx) return;

    const time = ctx.currentTime;
    const notes = [
      { f: 415.3, t: 0.0 }, { f: 392.0, t: 0.1 }, { f: 311.1, t: 0.2 },
      { f: 293.7, t: 0.3 }, { f: 233.1, t: 0.4 }
    ];

    notes.forEach((note) => {
      const startTime = time + note.t;
      const duration = note.t === 0.4 ? 0.8 : 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.f, startTime);
      gain.gain.setValueAtTime(0.08, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    });
  }

  // ステージクリアジングル (アセットロード対応)
  public playClearJingle() {
    const audio = new Audio('/sounds/clear.mp3');
    audio.volume = 0.55;
    audio.play().catch(() => {
      this.playClearJingle_Synth();
    });
  }

  private playClearJingle_Synth() {
    this.initContext();
    this.resumeContext();
    const ctx = this.ctx;
    if (!ctx) return;

    const time = ctx.currentTime;
    const chord = [523.3, 784.0, 1046.5, 1318.5, 1568.0];

    chord.forEach((freq, idx) => {
      const startTime = time + idx * 0.08;
      const duration = 1.0;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, startTime);
      const vibrato = ctx.createOscillator();
      vibrato.frequency.setValueAtTime(8, startTime);
      const vibGain = ctx.createGain();
      vibGain.gain.setValueAtTime(10, startTime);
      vibrato.connect(vibGain);
      vibGain.connect(osc.frequency);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1800, startTime);
      gain.gain.setValueAtTime(0.04, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      vibrato.start(startTime);
      osc.start(startTime);
      vibrato.stop(startTime + duration + 0.1);
      osc.stop(startTime + duration + 0.1);
    });
  }
}
