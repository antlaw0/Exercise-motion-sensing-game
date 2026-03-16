# Exercise Motion-Sensing Game – Boxing Trainer 🥊

A **web-based, accessibility-first** exercise boxing game that uses smartphones strapped to each wrist to track arm movements. Built with **Phaser 3** for the gameplay layer and **Node.js + WebSockets** for the local server and phone communication. All game events are announced via **speech synthesis** for full audio accessibility.

---

## Features

| Feature | Details |
|---|---|
| 🥊 Boxing gameplay | 3-round boxing match with AI opponent |
| 📱 Phone controllers | Strap a phone to each wrist; punch detection via `DeviceMotionEvent` |
| 🛡 Guard system | Raise arm / hold guard button to block incoming attacks |
| 🔊 Full audio | Every event announced via Web Speech API (screen-reader friendly) |
| ⌨ Keyboard fallback | Play on desktop without phones: `Q`/`E` punch, `A`/`D` guard |
| 🌐 Local server | Node.js Express + WebSocket server, no internet required |

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Start the server
```bash
npm start
```

Output:
```
🥊 Boxing Trainer server running
   Game:       http://localhost:3000
   Game (LAN): http://192.168.x.x:3000
   Phone ctrl: http://192.168.x.x:3000/controller.html
```

### 3. Open the game
Open **`http://localhost:3000`** in a desktop browser.

### 4. Connect phone controllers (optional)
1. Connect your phones to the **same WiFi** as your computer.
2. Open `http://<LAN-IP>:3000/controller.html` on each phone.
3. Select **LEFT HAND** or **RIGHT HAND**.
4. Strap the phone to your wrist (screen facing outward).
5. **Swing your arm** to punch — the accelerometer detects the motion automatically.
6. **Hold the GUARD button** to block incoming attacks.

---

## Controls

### Keyboard (desktop testing)
| Key | Action |
|-----|--------|
| `Q` | Left punch |
| `E` | Right punch |
| `A` (hold) | Left guard |
| `D` (hold) | Right guard |
| `Space` | Start / menu |

### Phone (motion-based)
| Motion | Action |
|--------|--------|
| Swing arm forward | **Punch** (auto-detected via accelerometer) |
| Hold GUARD button | **Block** incoming attacks |

---

## Game Rules

1. **3 rounds** of boxing.
2. The opponent telegraphs every attack with an audio announcement (e.g. *"JAB!"*, *"CROSS!"*, *"BODY SHOT!"*).
3. You have **1.5 seconds** to react:
   - **Guard** on the correct side → full block.
   - **Punch** during the telegraph window → **counter-punch** (double damage).
   - Do nothing → take full damage.
4. **KO** the opponent before your health reaches zero.
5. Winning a round gives a **+100 point bonus**.

---

## Project Structure

```
.
├── server.js              # Express + WebSocket server
├── package.json
├── public/
│   ├── index.html         # Game page (Phaser canvas)
│   ├── controller.html    # Phone motion controller UI
│   ├── vendor/
│   │   └── phaser.min.js  # Phaser 3 (vendored, no CDN needed)
│   ├── js/
│   │   ├── game.js        # Phaser 3 game (Menu → Fight → GameOver)
│   │   └── motion.js      # MotionDetector class (phone-side)
│   └── css/
│       └── style.css
└── README.md
```

---

## Accessibility

All major game events are read aloud via the **Web Speech API**:
- Round countdown and start bell
- Opponent attack warnings (*"LEFT HOOK!"*)
- Hit feedback (*"Ouch! 12 damage. Health 68 percent."*)
- Block confirmation (*"Blocked!"*)
- Counter-punch announcements
- Round and game results

The game is fully playable without looking at the screen.

---

## Roadmap

- [x] Prototype: arm-only boxing game with phone accelerometer
- [ ] Phase 2: Webcam full-body tracking (MediaPipe Pose)
- [ ] Multiplayer: two players on the same LAN
- [ ] Additional exercise modes (cardio, shadow boxing)

