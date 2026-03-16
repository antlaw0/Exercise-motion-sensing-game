/* public/js/game.js – Phaser 3 boxing game */
'use strict';

// ═══════════════════════════════════════════════════════════════════
// AUDIO MANAGER  (Web Audio API + Speech Synthesis)
// ═══════════════════════════════════════════════════════════════════
class AudioManager {
  constructor() {
    this._ctx = null;
    this._synth = window.speechSynthesis;
    this._voice = null;
    this.volume = 1.0;
    this.speechRate = 1.1;
    this._initVoice();
  }

  _initVoice() {
    const pick = () => {
      const voices = this._synth.getVoices();
      this._voice =
        voices.find((v) => v.lang === 'en-US' && v.name.includes('Google')) ||
        voices.find((v) => v.lang.startsWith('en-US')) ||
        voices.find((v) => v.lang.startsWith('en')) ||
        voices[0] ||
        null;
    };
    pick();
    if (typeof this._synth.onvoiceschanged !== 'undefined') {
      this._synth.onvoiceschanged = pick;
    }
  }

  /** Must be called after a user gesture to unlock AudioContext */
  unlock() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  /** Speak text. Pass interrupt=true to cancel current speech first. */
  speak(text, interrupt = false) {
    if (interrupt) this._synth.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = this.speechRate;
    utt.volume = this.volume;
    if (this._voice) utt.voice = this._voice;
    this._synth.speak(utt);
  }

  _ctx2() { return this._ctx; }

  /** Short thud sound for a landed punch */
  playPunch(force = 0.7) {
    const ctx = this._ctx2();
    if (!ctx) return;
    const dur = 0.08;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) * force;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 150 + force * 220;
    const gain = ctx.createGain();
    gain.gain.value = 0.9;
    src.connect(filt);
    filt.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  }

  /** Clank for a successful block */
  playBlock() {
    const ctx = this._ctx2();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(420, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  }

  /** Bell chime for round start / KO */
  playBell() {
    const ctx = this._ctx2();
    if (!ctx) return;
    [880, 1100, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.06;
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
      osc.start(t);
      osc.stop(t + 2.0);
    });
  }

  /** Body-hit impact */
  playHit() {
    const ctx = this._ctx2();
    if (!ctx) return;
    const dur = 0.12;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 0.4) * 0.85;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 220;
    filt.Q.value = 1.5;
    const gain = ctx.createGain();
    gain.gain.value = 1.0;
    src.connect(filt);
    filt.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  }
}

// Shared instances
let audio = null;    // AudioManager
let gameWS = null;   // WebSocket to server

// ═══════════════════════════════════════════════════════════════════
// MENU SCENE
// ═══════════════════════════════════════════════════════════════════
class MenuScene extends Phaser.Scene {
  constructor() { super({ key: 'MenuScene' }); }

  create() {
    audio = new AudioManager();

    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    // Background gradient fill
    this.add.rectangle(W / 2, H / 2, W, H, 0x0d0d1a);

    // Title
    this.add.text(W / 2, H * 0.18, '🥊 BOXING TRAINER', {
      fontFamily: 'Arial Black, Arial',
      fontSize: '44px',
      color: '#FFD700',
      stroke: '#000000',
      strokeThickness: 5,
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.30, 'Accessible Motion-Sensing Exercise Game', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#aaaaaa',
    }).setOrigin(0.5);

    // Connection status
    this._statusTxt = this.add.text(W / 2, H * 0.42, 'Connecting to server…', {
      fontFamily: 'Arial',
      fontSize: '15px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Phone URL placeholder
    this._urlTxt = this.add.text(W / 2, H * 0.50, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#88ccff',
    }).setOrigin(0.5);

    // QR canvas (filled in after WS connects)
    this._qrImg = null;

    // Keyboard instructions
    const instructions = [
      '⌨  Keyboard (desktop testing)',
      'Q = Left Punch    E = Right Punch',
      'A = Left Guard    D = Right Guard',
      '',
      '📱 Phone controllers',
      'Open the controller URL on each phone.',
      'Swing your wrist forward to PUNCH.',
      'Hold the GUARD button to block.',
    ].join('\n');

    this.add.text(W / 2, H * 0.67, instructions, {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#cccccc',
      align: 'center',
      lineSpacing: 5,
    }).setOrigin(0.5);

    // Start button
    const startBtn = this.add.text(W / 2, H * 0.91, '[ PRESS SPACE OR CLICK TO START ]', {
      fontFamily: 'Arial Black, Arial',
      fontSize: '22px',
      color: '#00ff88',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    startBtn.on('pointerover', () => startBtn.setColor('#88ffcc'));
    startBtn.on('pointerout',  () => startBtn.setColor('#00ff88'));
    startBtn.on('pointerdown', () => this._startGame());
    this.input.keyboard.on('keydown-SPACE', () => this._startGame());

    // Pulsing effect on start button
    this.tweens.add({
      targets: startBtn,
      alpha: 0.5,
      duration: 900,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    this._connectWS();

    // Announce
    this.time.delayedCall(600, () => {
      audio.speak(
        'Boxing Trainer. Accessible exercise game. ' +
        'Use keyboard Q and E to punch, A and D to guard. ' +
        'Or connect your phone. Press Space to start.',
        true
      );
    });
  }

  _connectWS() {
    try {
      const url = `ws://${window.location.host}`;
      gameWS = new WebSocket(url);

      gameWS.addEventListener('open', () => {
        gameWS.send(JSON.stringify({ type: 'register', role: 'game' }));
        this._statusTxt.setText('✓ Server connected  |  Waiting for phone controllers…');
        this._showControllerURL();
      });

      gameWS.addEventListener('message', (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'controller_connected') {
            this._statusTxt.setText(`✓ ${msg.hand.toUpperCase()} hand controller connected!`);
            audio.speak(`${msg.hand} hand controller connected.`, false);
          } else if (msg.type === 'controller_disconnected') {
            this._statusTxt.setText(`${msg.hand} controller disconnected`);
          }
        } catch (_) {}
      });

      gameWS.addEventListener('error', () => {
        this._statusTxt.setText('⚠ Server not reachable – keyboard-only mode');
      });

      gameWS.addEventListener('close', () => {
        this._statusTxt.setText('⚠ Server disconnected – keyboard-only mode');
      });
    } catch (e) {
      this._statusTxt.setText('⚠ WebSocket not available – keyboard-only mode');
    }
  }

  _showControllerURL() {
    const ctrlURL = `http://${window.location.host}/controller.html`;
    this._urlTxt.setText(`Phone: ${ctrlURL}`);

    if (typeof QRCode !== 'undefined') {
      const canvas = document.createElement('canvas');
      QRCode.toCanvas(canvas, ctrlURL, { width: 100, color: { dark: '#ffffff', light: '#0d0d1a' } }, (err) => {
        if (!err) {
          const W = this.cameras.main.width;
          try {
            this.textures.addCanvas('qr_code', canvas);
            this._qrImg = this.add.image(W / 2, this.cameras.main.height * 0.57, 'qr_code');
          } catch (_) { /* texture may already exist on scene restart */ }
        }
      });
    }
  }

  _startGame() {
    audio.unlock();
    audio.speak('Starting!', true);
    this.scene.start('GameScene', { ws: gameWS });
  }
}

// ═══════════════════════════════════════════════════════════════════
// GAME SCENE
// ═══════════════════════════════════════════════════════════════════

// Default HP bar colours (also used when HP is above warning thresholds)
const PLAYER_BAR_COLOR = 0xe74c3c;
const ENEMY_BAR_COLOR  = 0x2471a3;

class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  init(data) {
    this._ws         = data.ws || gameWS;
    this.playerHP    = 100;
    this.enemyHP     = 100;
    this.score       = 0;
    this.round       = 1;
    this.maxRounds   = 3;
    this.gameState   = 'countdown'; // countdown | fighting | roundEnd | gameOver
    this.enemyState  = 'idle';      // idle | telegraphing
    this.leftGuard   = false;
    this.rightGuard  = false;
    this._pendingAtk = null;        // current telegraphed attack object
    this._atkTimer   = null;
  }

  create() {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;
    this.W = W;
    this.H = H;

    this._buildRing();
    this._buildBoxers();
    this._buildHUD();
    this._setupKeyboard();
    this._setupWS();
    this._countdown();
  }

  // ── Ring visuals ──────────────────────────────────────────────
  _buildRing() {
    const W = this.W, H = this.H;
    this.add.rectangle(W / 2, H / 2, W, H, 0x0d0d1a);               // arena bg
    this.add.rectangle(W / 2, H * 0.60, W * 0.82, H * 0.62, 0x3b2a18); // canvas

    const gfx = this.add.graphics();
    // Ring ropes
    [H * 0.20, H * 0.26, H * 0.32].forEach((y) => {
      gfx.lineStyle(3, 0xffffff, 0.35);
      gfx.beginPath();
      gfx.moveTo(W * 0.09, y);
      gfx.lineTo(W * 0.91, y);
      gfx.strokePath();
    });
    // Corner posts
    [W * 0.09, W * 0.91].forEach((x) => {
      gfx.fillStyle(0x777777, 1);
      gfx.fillRect(x - 5, H * 0.15, 10, H * 0.22);
    });
  }

  // ── Boxer construction ────────────────────────────────────────
  _makeBoxer(x, y, bodyColor, gloveColor) {
    const c = this.add.container(x, y);
    const leftLeg   = this.add.rectangle(-11, 42, 13, 44, bodyColor);
    const rightLeg  = this.add.rectangle( 11, 42, 13, 44, bodyColor);
    const body      = this.add.rectangle(  0,  2, 38, 56, bodyColor);
    const shorts    = this.add.rectangle(  0, 22, 38, 22, Phaser.Display.Color.IntegerToColor(bodyColor).darken(30).color);
    const leftGlove = this.add.circle(-30, -8, 13, gloveColor);
    const rightGlove= this.add.circle( 30, -8, 13, gloveColor);
    const head      = this.add.circle(  0,-52, 20, bodyColor);
    const leftArm   = this.add.rectangle(-22,-8, 22, 10, bodyColor);
    const rightArm  = this.add.rectangle( 22,-8, 22, 10, bodyColor);

    c.add([leftLeg, rightLeg, body, shorts, leftArm, rightArm, leftGlove, rightGlove, head]);

    // Idle bob tween
    this.tweens.add({
      targets: c,
      y: c.y - 7,
      duration: 600 + Phaser.Math.Between(-80, 80),
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    return { container: c, leftGlove, rightGlove, leftArm, rightArm, head };
  }

  _buildBoxers() {
    const W = this.W, H = this.H;
    this.playerBoxer = this._makeBoxer(W * 0.25, H * 0.58, 0xc0392b, 0xff7777);
    this.enemyBoxer  = this._makeBoxer(W * 0.75, H * 0.58, 0x2471a3, 0x77aaff);

    this.add.text(W * 0.25, H * 0.58 + 85, 'YOU',      { fontFamily:'Arial', fontSize:'14px', color:'#e74c3c' }).setOrigin(0.5);
    this.add.text(W * 0.75, H * 0.58 + 85, 'OPPONENT', { fontFamily:'Arial', fontSize:'14px', color:'#3498db' }).setOrigin(0.5);
  }

  // ── HUD ───────────────────────────────────────────────────────
  _buildHUD() {
    const W = this.W, H = this.H;
    const barW = W * 0.27;

    // Player HP
    this.add.text(W * 0.04, H * 0.03, 'YOU', { fontFamily:'Arial Bold', fontSize:'13px', color:'#e74c3c' });
    this.add.rectangle(W * 0.04 + barW / 2, H * 0.065, barW, 18, 0x333333);
    this._playerHPBar = this.add.rectangle(W * 0.04, H * 0.065, barW, 18, PLAYER_BAR_COLOR).setOrigin(0, 0.5);

    // Enemy HP
    this.add.text(W * 0.96, H * 0.03, 'OPP', { fontFamily:'Arial Bold', fontSize:'13px', color:'#3498db' }).setOrigin(1, 0);
    this.add.rectangle(W * 0.96 - barW / 2, H * 0.065, barW, 18, 0x333333);
    this._enemyHPBar = this.add.rectangle(W * 0.69, H * 0.065, barW, 18, ENEMY_BAR_COLOR).setOrigin(0, 0.5);

    // Score
    this._scoreTxt = this.add.text(W / 2, H * 0.03, 'SCORE: 0', {
      fontFamily: 'Arial Black, Arial', fontSize: '16px', color: '#FFD700',
    }).setOrigin(0.5, 0);

    // Round
    this._roundTxt = this.add.text(W / 2, H * 0.10, 'ROUND 1', {
      fontFamily: 'Arial Black, Arial', fontSize: '20px', color: '#ffffff',
    }).setOrigin(0.5);

    // Big centre message (countdown / FIGHT / KO)
    this._centerMsg = this.add.text(W / 2, H * 0.37, '', {
      fontFamily: 'Arial Black, Arial', fontSize: '72px', color: '#FFD700',
      stroke: '#000000', strokeThickness: 7,
    }).setOrigin(0.5);

    // Attack warning
    this._warnMsg = this.add.text(W / 2, H * 0.47, '', {
      fontFamily: 'Arial Black, Arial', fontSize: '26px', color: '#ff4444',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);

    // Guard indicators
    this._leftGuardIcon  = this.add.text(W * 0.04, H * 0.82, '🛡 L-GUARD', {
      fontFamily: 'Arial', fontSize: '18px', color: '#555555',
    });
    this._rightGuardIcon = this.add.text(W * 0.96, H * 0.82, 'R-GUARD 🛡', {
      fontFamily: 'Arial', fontSize: '18px', color: '#555555',
    }).setOrigin(1, 0);

    // Action log (latest event)
    this._logTxt = this.add.text(W / 2, H * 0.91, '', {
      fontFamily: 'Arial', fontSize: '17px', color: '#aaffaa',
    }).setOrigin(0.5);
  }

  // ── Keyboard input ────────────────────────────────────────────
  _setupKeyboard() {
    const kb = this.input.keyboard;
    kb.on('keydown-Q', () => this._playerPunch('left',  0.7));
    kb.on('keydown-E', () => this._playerPunch('right', 0.7));
    kb.on('keydown-A', () => { this.leftGuard  = true;  this._refreshGuardUI(); });
    kb.on('keyup-A',   () => { this.leftGuard  = false; this._refreshGuardUI(); });
    kb.on('keydown-D', () => { this.rightGuard = true;  this._refreshGuardUI(); });
    kb.on('keyup-D',   () => { this.rightGuard = false; this._refreshGuardUI(); });
  }

  _refreshGuardUI() {
    this._leftGuardIcon.setColor(this.leftGuard   ? '#00ff88' : '#555555');
    this._rightGuardIcon.setColor(this.rightGuard  ? '#00ff88' : '#555555');
  }

  // ── WebSocket messages from controllers ───────────────────────
  _setupWS() {
    if (!this._ws) return;
    this._ws.onmessage = (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch (_) { return; }

      if (msg.type === 'action') {
        switch (msg.action) {
          case 'punch':
            this._playerPunch(msg.hand, msg.force || 0.7);
            break;
          case 'guard_on':
            if (msg.hand === 'left')  { this.leftGuard  = true;  this._refreshGuardUI(); }
            if (msg.hand === 'right') { this.rightGuard = true;  this._refreshGuardUI(); }
            break;
          case 'guard_off':
            if (msg.hand === 'left')  { this.leftGuard  = false; this._refreshGuardUI(); }
            if (msg.hand === 'right') { this.rightGuard = false; this._refreshGuardUI(); }
            break;
          default: break;
        }
      }
    };
  }

  // ── Countdown ─────────────────────────────────────────────────
  _countdown() {
    this.gameState = 'countdown';
    let n = 3;
    const tick = () => {
      if (n > 0) {
        this._centerMsg.setText(String(n));
        audio.speak(String(n), true);
        n--;
        this.time.delayedCall(1000, tick);
      } else {
        this._centerMsg.setText('FIGHT!');
        audio.playBell();
        audio.speak('Fight!', true);
        this.time.delayedCall(900, () => {
          this._centerMsg.setText('');
          this.gameState = 'fighting';
          this._scheduleEnemyAttack();
        });
      }
    };
    tick();
  }

  // ── Enemy AI ──────────────────────────────────────────────────
  _scheduleEnemyAttack() {
    if (this.gameState !== 'fighting') return;

    // Attack frequency increases with round
    const minMs = Math.max(2200 - (this.round - 1) * 500, 1000);
    const maxMs = Math.max(4500 - (this.round - 1) * 1000, 2200);
    const delay = Phaser.Math.Between(minMs, maxMs);

    this._atkTimer = this.time.delayedCall(delay, () => this._telegraphAttack());
  }

  _telegraphAttack() {
    if (this.gameState !== 'fighting') return;

    const attacks = [
      { label: 'JAB!',        side: 'left',  dmg: 8  },
      { label: 'CROSS!',      side: 'right', dmg: 12 },
      { label: 'LEFT HOOK!',  side: 'left',  dmg: 15 },
      { label: 'RIGHT HOOK!', side: 'right', dmg: 15 },
      { label: 'BODY SHOT!',  side: 'both',  dmg: 10 },
    ];
    if (this.round >= 2) {
      attacks.push({ label: 'COMBO!', side: 'both', dmg: 20 });
    }

    const atk = Phaser.Utils.Array.GetRandom(attacks);
    this._pendingAtk = atk;
    this.enemyState  = 'telegraphing';

    // Warn the player (visual + audio)
    this._warnMsg.setText(`⚡ ${atk.label}`);
    audio.speak(atk.label, true);

    // Enemy lunge animation
    const ex = this.enemyBoxer.container.x;
    this.tweens.add({
      targets: this.enemyBoxer.container,
      x: ex - 18,
      duration: 280,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: 1,
    });

    // Resolve after reaction window (1.5 s)
    this.time.delayedCall(1500, () => this._resolveEnemyAttack(atk));
  }

  _resolveEnemyAttack(atk) {
    if (this.gameState !== 'fighting') return;
    if (this._pendingAtk !== atk) return; // was cancelled by counter-punch

    this._warnMsg.setText('');
    this.enemyState = 'idle';

    const fullBlock =
      (atk.side === 'left'  && this.leftGuard)  ||
      (atk.side === 'right' && this.rightGuard) ||
      (atk.side === 'both'  && this.leftGuard && this.rightGuard);

    const halfBlock =
      !fullBlock && atk.side === 'both' && (this.leftGuard || this.rightGuard);

    if (fullBlock) {
      audio.playBlock();
      audio.speak('Blocked!');
      this._log('BLOCKED! +5', '#00ff88');
      this.score += 5;
    } else {
      const dmg = halfBlock ? Math.ceil(atk.dmg * 0.5) : atk.dmg;
      this.playerHP = Math.max(0, this.playerHP - dmg);
      audio.playHit();
      audio.speak(`Ouch! ${dmg} damage. Health ${Math.round(this.playerHP)} percent.`);
      this._log(`-${dmg} HP`, '#ff4444');

      this.cameras.main.shake(180, 0.009);
      const px = this.playerBoxer.container.x;
      this.tweens.add({
        targets: this.playerBoxer.container,
        x: px - 14,
        duration: 90,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: 1,
      });
    }

    this._updateHUD();
    if (!this._checkRoundEnd() && this.gameState === 'fighting') {
      this._scheduleEnemyAttack();
    }
  }

  // ── Player punch ──────────────────────────────────────────────
  _playerPunch(hand, force) {
    if (this.gameState !== 'fighting') return;

    const glove = hand === 'left' ? this.playerBoxer.leftGlove : this.playerBoxer.rightGlove;
    const dir   = hand === 'left' ? -1 : 1;
    this.tweens.add({
      targets: glove,
      x: glove.x + dir * 55,
      duration: 140,
      ease: 'Power2',
      yoyo: true,
    });

    let dmg = Math.max(5, Math.round(force * 16));
    let logColor = '#ffff00';

    if (this.enemyState === 'telegraphing' && this._pendingAtk) {
      // Counter-punch: double damage, cancel incoming attack
      dmg = Math.round(dmg * 2);
      this._pendingAtk  = null;
      this.enemyState   = 'idle';
      this._warnMsg.setText('');
      audio.speak(`Counter! ${dmg} damage!`, true);
      logColor = '#ff8800';
      this._log(`COUNTER! -${dmg}`, logColor);
    } else {
      audio.speak(`${hand} punch!`);
      this._log(`${hand.toUpperCase()} PUNCH -${dmg}`, logColor);
    }

    audio.playPunch(force);
    this.enemyHP = Math.max(0, this.enemyHP - dmg);
    this.score  += dmg;

    // Enemy recoil
    const ex = this.enemyBoxer.container.x;
    this.tweens.add({
      targets: this.enemyBoxer.container,
      x: ex + 16,
      duration: 100,
      ease: 'Sine.easeInOut',
      yoyo: true,
    });

    this._updateHUD();
    this._checkRoundEnd();
  }

  // ── HUD update ────────────────────────────────────────────────
  _updateHUD() {
    const maxW = this.W * 0.27;
    this._playerHPBar.setSize(Math.max(0, maxW * (this.playerHP / 100)), 18);
    this._enemyHPBar .setSize(Math.max(0, maxW * (this.enemyHP  / 100)), 18);
    this._scoreTxt.setText(`SCORE: ${this.score}`);

    // HP bar colour
    const hpColor = (hp) => hp < 30 ? 0xff2222 : hp < 60 ? 0xff8800 : null;
    const pc = hpColor(this.playerHP);
    const ec = hpColor(this.enemyHP);
    if (pc) this._playerHPBar.setFillStyle(pc); else this._playerHPBar.setFillStyle(PLAYER_BAR_COLOR);
    if (ec) this._enemyHPBar .setFillStyle(ec); else this._enemyHPBar .setFillStyle(ENEMY_BAR_COLOR);
  }

  _log(msg, color = '#ffffff') {
    this._logTxt.setText(msg).setColor(color);
    this.time.delayedCall(2200, () => {
      if (this._logTxt.text === msg) this._logTxt.setText('');
    });
  }

  // ── Round/game end ────────────────────────────────────────────
  _checkRoundEnd() {
    if (this.playerHP <= 0) { this._endRound('loss'); return true; }
    if (this.enemyHP  <= 0) { this._endRound('win');  return true; }
    return false;
  }

  _endRound(result) {
    this.gameState = 'roundEnd';
    if (this._atkTimer) { this._atkTimer.remove(); this._atkTimer = null; }
    this._warnMsg.setText('');

    const won = result === 'win';
    this._centerMsg.setText(won ? 'K.O.!' : 'DOWN!');
    audio.playBell();
    if (won) {
      this.score += 100;
      audio.speak(`Knockout! Round ${this.round} won! Score: ${this.score}.`, true);
    } else {
      audio.speak(`You went down in round ${this.round}! Score: ${this.score}.`, true);
    }
    this._updateHUD();

    this.time.delayedCall(2600, () => {
      if (this.round >= this.maxRounds || !won) {
        this.scene.start('GameOverScene', { score: this.score, won, ws: this._ws });
      } else {
        this.round++;
        this.playerHP = 100;
        this.enemyHP  = 100;
        this._roundTxt.setText(`ROUND ${this.round}`);
        this._updateHUD();
        this._countdown();
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════════
// GAME-OVER SCENE
// ═══════════════════════════════════════════════════════════════════
class GameOverScene extends Phaser.Scene {
  constructor() { super({ key: 'GameOverScene' }); }

  init(data) {
    this.finalScore = data.score || 0;
    this.won        = data.won   || false;
    this._ws        = data.ws    || gameWS;
  }

  create() {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    this.add.rectangle(W / 2, H / 2, W, H, 0x080814);

    const title = this.won ? '🏆  WINNER!' : '💀  K.O.!';
    const tColor = this.won ? '#FFD700' : '#ff4444';

    this.add.text(W / 2, H * 0.22, title, {
      fontFamily: 'Arial Black, Arial', fontSize: '58px',
      color: tColor, stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.43, `FINAL SCORE\n${this.finalScore}`, {
      fontFamily: 'Arial Black, Arial', fontSize: '44px',
      color: '#ffffff', align: 'center',
    }).setOrigin(0.5);

    const grade = this._grade(this.finalScore);
    this.add.text(W / 2, H * 0.63, grade.text, {
      fontFamily: 'Arial', fontSize: '22px', color: grade.color,
    }).setOrigin(0.5);

    const again = this.add.text(W / 2, H * 0.81, '[ PLAY AGAIN — SPACE / CLICK ]', {
      fontFamily: 'Arial Black, Arial', fontSize: '26px',
      color: '#00ff88', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    again.on('pointerover', () => again.setColor('#88ffcc'));
    again.on('pointerout',  () => again.setColor('#00ff88'));
    again.on('pointerdown', () => this.scene.start('MenuScene'));
    this.input.keyboard.on('keydown-SPACE', () => this.scene.start('MenuScene'));
    this.input.keyboard.on('keydown-ENTER', () => this.scene.start('MenuScene'));

    this.tweens.add({
      targets: again, alpha: 0.45, duration: 850,
      ease: 'Sine.easeInOut', yoyo: true, repeat: -1,
    });

    const msg = `${this.won ? 'You win!' : 'Game over.'} ` +
      `Final score: ${this.finalScore}. ${grade.text}. ` +
      `Press Space to play again.`;
    audio.speak(msg, true);
  }

  _grade(score) {
    if (score >= 400) return { text: '⭐⭐⭐  Champion!',      color: '#FFD700' };
    if (score >= 250) return { text: '⭐⭐  Great fighter!',  color: '#C0C0C0' };
    if (score >= 100) return { text: '⭐  Keep training!',   color: '#CD7F32' };
    return               { text: 'Practice makes perfect!', color: '#aaaaaa' };
  }
}

// ═══════════════════════════════════════════════════════════════════
// PHASER GAME CONFIG
// ═══════════════════════════════════════════════════════════════════
window.addEventListener('load', () => {
  new Phaser.Game({
    type: Phaser.AUTO,
    width:  800,
    height: 500,
    backgroundColor: '#0d0d1a',
    parent: 'game-container',
    scene: [MenuScene, GameScene, GameOverScene],
    scale: {
      mode:       Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  });
});
