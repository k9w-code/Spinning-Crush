export class SoundManager {
  private static instance: SoundManager | null = null;
  private ctx: AudioContext | null = null;
  private bgmIntervalId: any = null;
  private bgmStep: number = 0;

  private constructor() {}

  public static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  // ユーザーの最初のクリックアクション等で呼び出してオーディオコンテキストをロック解除する
  public initContext() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.warn("Web Audio API is not supported in this browser:", e);
    }
  }

  private resumeContext() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // UI選択音 (ピッ)
  public playBleep() {
    this.initContext();
    this.resumeContext();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, time);
    osc.frequency.exponentialRampToValueAtTime(1400, time + 0.05);

    gain.gain.setValueAtTime(0.08, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + 0.06);
  }

  // UI決定音 / シャッター開閉音 (ピシィーン)
  public playClick() {
    this.initContext();
    this.resumeContext();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(600, time);
    osc1.frequency.exponentialRampToValueAtTime(1500, time + 0.12);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(300, time);
    osc2.frequency.exponentialRampToValueAtTime(900, time + 0.12);

    gain.gain.setValueAtTime(0.12, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + 0.15);
    osc2.stop(time + 0.15);
  }

  // 通常ヒット音 / 被弾金属音 (キーン)
  public playHit() {
    this.initContext();
    this.resumeContext();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // わずかに金属質な高周波
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, time);
    osc.frequency.exponentialRampToValueAtTime(2400, time + 0.1);

    gain.gain.setValueAtTime(0.15, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + 0.15);
  }

  // 激突大爆発音 (ドゴォォン)
  public playExplosion() {
    this.initContext();
    this.resumeContext();
    if (!this.ctx) return;

    const time = this.ctx.currentTime;

    // 1. ホワイトノイズの生成
    const bufferSize = this.ctx.sampleRate * 0.4; // 0.4秒
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    // 2. ローパスフィルターで低音に絞る (1000Hz ➔ 60Hzへ急減衰)
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, time);
    filter.frequency.exponentialRampToValueAtTime(50, time + 0.35);

    // 3. 超低音補強のオシレーター (鋸歯状波)
    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sawtooth';
    subOsc.frequency.setValueAtTime(65, time);
    subOsc.frequency.linearRampToValueAtTime(20, time + 0.3);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.2, time);
    subGain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

    subOsc.connect(subGain);
    subGain.connect(this.ctx.destination);

    // ノイズ音量エンベロープ
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.38);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    // 再生開始
    noise.start(time);
    subOsc.start(time);
    
    noise.stop(time + 0.4);
    subOsc.stop(time + 0.4);
  }

  // 奥義発動チャージ音 (ウワウワキュィィィン)
  public playOsugiCharge() {
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

  // バトル用チップチューンBGM自動生成ループ (明るく勇ましいCメジャー熱血トイアニメOP風)
  public startBattleBGM() {
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

      // 1. ベースライン (鋸歯状波)
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

      // 2. リズムドラム (4つ打ち)
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

      // スネア
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

      // 3. メロディライン (三角波)
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

  public stopBGM() {
    if (this.bgmIntervalId) {
      clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = null;
    }
  }

  // ピンチ用高速BGM (BPM 165)
  public startPinchBGM() {
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

      // 1. 高速ベース (鋸歯状波)
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

      // 2. 高速ドラム
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

      // 16ビートハイハット風スナッピーノイズ
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

      // スネア
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

      // 3. 高速メロディ (三角波)
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

  // 勝利ファンファーレジングル (ピロリロリ・ピロリロリ・パッパラー！)
  public playVictoryJingle() {
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

  // 敗北ゲームオーバー音 (テロロロ…プゥーン)
  public playDefeatJingle() {
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

  // ステージクリア大お祝いジングル
  public playClearJingle() {
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
