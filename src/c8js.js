/**
 * C8.(js) Project.
 * Emulating CHIP-8 everywhere?
 * 
 * Author: EduardoPlayss121
 * Licensed under the MIT License.
 * Date: 2025-04-01
 * Version: 1.0.0 beta
 */

class C8JS {
    /**
     * Creates a new C8JS Emulator Instance
     * @param {String} canvasId - HTML Canvas ID (default="c8js-screen")
     * @param {Number} scale - Screen Scale. (default=10)
     * @param {Boolean} debugMode - Debug Mode (logs almost everything, default=false)
     */
    constructor(canvasId="c8js-screen", scale=10, debugMode=false) {
        this.scale = scale;
        this.cols = 64;
        this.rows = 32;
        this.memory = new Uint8Array(4096); // 4kb memory
        this.v = new Uint8Array(16);
        this.stack = [];
        this.display = new Array(this.cols * this.rows).fill(0);
        this.keypad = new Array(16).fill(false);
        this.debugMode = debugMode;

        this.audioCtx = null;
        this.oscillator = null;

        this.pc = 0x200; // default
        this.i = 0;
        this.delayTimer = 0;
        this.soundTimer = 5;
        this.drawFlag = false;
        this.waitingForKey = false;
        this.waitingRegister = 0;

        this.halted = false;
        this.turbo = false;
        this.turboSpeed = 10;

        this.fontSet = [
            0xF0, 0x90, 0x90, 0x90, 0xF0, // 0
            0x20, 0x60, 0x20, 0x20, 0x70, // 1
            0xF0, 0x10, 0xF0, 0x80, 0xF0, // 2
            0xF0, 0x10, 0xF0, 0x10, 0xF0, // 3
            0x90, 0x90, 0xF0, 0x10, 0x10, // 4
            0xF0, 0x80, 0xF0, 0x10, 0xF0, // 5
            0xF0, 0x80, 0xF0, 0x90, 0xF0, // 6
            0xF0, 0x10, 0x20, 0x40, 0x40, // 7
            0xF0, 0x90, 0xF0, 0x90, 0xF0, // 8
            0xF0, 0x90, 0xF0, 0x10, 0xF0, // 9
            0xF0, 0x90, 0xF0, 0x90, 0x90, // A
            0xE0, 0x90, 0xE0, 0x90, 0xE0, // B
            0xF0, 0x80, 0x80, 0x80, 0xF0, // C
            0xE0, 0x90, 0x90, 0x90, 0xE0, // D
            0xF0, 0x80, 0xF0, 0x80, 0xF0, // E
            0xF0, 0x80, 0xF0, 0x80, 0x80  // F
        ];
        for (let j = 0; j < this.fontSet.length; j++) this.memory[j] = this.fontSet[j];

        this.canvas = null;
        this.ctx = null;
        try {
            this.canvas = document.getElementById(canvasId);
            this.ctx = this.canvas.getContext('2d');
        } catch (err) {
            console.error("[C8JS] Error when trying to set canvas:", err);
            this.halted = true;
        }

        setInterval(() => {
            if (this.delayTimer > 0) this.delayTimer--;
            if (this.soundTimer > 0) {
                this.soundTimer--;
                this.startBeep();
            } else {
                this.stopBeep();
            }
        }, 1000 / 60); // 60fps?

        document.addEventListener("keydown", (e) => {
            const key = "1234qwerasdfzxcv".indexOf(e.key);
            if (key !== -1) {
                this.keypad[key] = true;
                if (this.waitingForKey) {
                    this.v[this.waitingRegister] = key;
                    this.waitingForKey = false;
                }
            }
        });

        document.addEventListener("keyup", (e) => {
            const key = "1234qwerasdfzxcv".indexOf(e.key);
            if (key !== -1) this.keypad[key] = false;
        });
    }

    /**
     * Enables Audio (for beep)
     */
    enableAudio() {
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            console.log("[C8JS] Audio Context created successfully!");
        } catch (err) {
            console.error("[C8JS] Error when creating audio context:", err);
        }
    }

    /**
     * Starts beeping. (if audio enabled)
     */
    startBeep() {
        if (!this.oscillator) {
            if (this.audioCtx) {
                try {
                    this.oscillator = this.audioCtx.createOscillator();
                    this.oscillator.type = 'square';
                    this.oscillator.frequency.setValueAtTime(440, this.audioCtx.currentTime); // 440Hz = A4
                    this.oscillator.connect(this.audioCtx.destination);
                    this.oscillator.start();
                } catch (err) {
                    console.error("[C8JS] Error when creating beep sound:", err);
                }
            }
        }
    }

    /**
     * Stops beeping. (if oscillator exists)
     */
    stopBeep() {
        if (this.oscillator) {
            try {
                this.oscillator.stop();
                this.oscillator.disconnect();
                this.oscillator = null;
            } catch (err) {
                console.error("[C8JS] Error when stopping beeping:", err);
            }
        }
    }

    /**
     * Loads a rom to memory from a array buffer.
     * @param {ArrayBuffer} buffer
     */
    loadROM(buffer) {
        const rom = new Uint8Array(buffer);
        this.reset();          // we need to reset the emulator.
        this.memory.set(rom, 0x200);
        // this.pc = 0x200;    // resseting already does that
        // this.clearScreen(); // resseting already does that
    }

    /**
     * Draws the screen
     */
    drawScreen() {
        try {
            this.ctx.fillStyle = "black";
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            for (let y = 0; y < this.rows; y++) {
                for (let x = 0; x < this.cols; x++) {
                    if (this.display[y * this.cols + x]) {
                        this.ctx.fillStyle = "lime"; // can be other color
                        this.ctx.fillRect(x * this.scale, y * this.scale, this.scale, this.scale);
                    }
                }
            }
        } catch (err) {
            console.error("[C8JS] Error when rendering screen:", err);
            this.halted = true;
        }
    }

    /**
     * Fullscreen method.
     * When clicking or double clicking the canvas, it will be fullscreen
     * Ex: "<canvas id='c8js-screen' ondblclick='emu.fullScreen(this)'></canvas>"
     */
    fullScreen(e){
        var d = document;
        if (null!=(d.fullscreenElement || d.mozFullScreenElement || d.webkitFullscreenElement || d.msFullscreenElement)) {
            (d.exitFullscreen || d.mozCancelFullScreen || d.webkitExitFullscreen || d.msExitFullscreen).apply(d);
        } else {
            (e.requestFullscreen || e.mozRequestFullScreen || e.webkitRequestFullscreen || e.msRequestFullscreen || (()=>{})).apply(e);
        }
    }

    /**
     * Clears the Screen
     */
    clearScreen() {
        this.display = new Array(this.cols * this.rows).fill(0);
    }

    /**
     * Resets the emulator
     */
    reset() {
        this.memory = new Uint8Array(4096); // 4kb memory
        this.v = new Uint8Array(16);
        this.stack = [];
        this.display = new Array(this.cols * this.rows).fill(0);
        this.keypad = new Array(16).fill(false);

        this.pc = 0x200;
        this.i = 0;
        this.delayTimer = 0;
        this.soundTimer = 0;
        this.drawFlag = false;
        this.waitingForKey = false;
        this.waitingRegister = 0;
        this.turbo = false;

        // reload the font set
        for (let j = 0; j < this.fontSet.length; j++) this.memory[j] = this.fontSet[j];

        if (this.debugMode) console.warn("[C8JS] Emulator Reseted!");
        
        this.clearScreen();
    }

    /**
     * Step the emulator.
     */
    step() {
        if (this.waitingForKey) return;
        if (this.halted) return;

        const opcode = (this.memory[this.pc] << 8) | this.memory[this.pc + 1];
        const x = (opcode & 0x0F00) >> 8;
        const y = (opcode & 0x00F0) >> 4;
        const nnn = opcode & 0x0FFF;
        const nn = opcode & 0x00FF;
        const n = opcode & 0x000F;

        // if (this.debugMode) console.log(`[C8JS] PC=0x${this.pc} | RAW OPCODE=0x${opcode} | I=0x${this.i} | STACK: ${this.stack}\n| REGISTERS: ${this.v}\n`);

        this.pc += 2; // increment pc

        switch (opcode & 0xF000) {
            case 0x0000:
                if (opcode === 0x00E0) this.display.fill(0);
                else if (opcode === 0x00EE) this.pc = this.stack.pop();
                break;
            case 0x1000: this.pc = nnn; break;
            case 0x2000: this.stack.push(this.pc); this.pc = nnn; break;
            case 0x3000: if (this.v[x] === nn) this.pc += 2; break;
            case 0x4000: if (this.v[x] !== nn) this.pc += 2; break;
            case 0x5000: if (this.v[x] === this.v[y]) this.pc += 2; break;
            case 0x6000: this.v[x] = nn; break;
            case 0x7000: this.v[x] = (this.v[x] + nn) & 0xFF; break;
            case 0x8000:
                switch (n) {
                    case 0x0: this.v[x] = this.v[y]; break;
                    case 0x1: this.v[x] |= this.v[y]; break;
                    case 0x2: this.v[x] &= this.v[y]; break;
                    case 0x3: this.v[x] ^= this.v[y]; break;
                    case 0x4: {
                        const sum = this.v[x] + this.v[y];
                        this.v[0xF] = sum > 0xFF ? 1 : 0;
                        this.v[x] = sum & 0xFF;
                        break;
                    }
                    case 0x5:
                        this.v[0xF] = this.v[x] > this.v[y] ? 1 : 0;
                        this.v[x] = (this.v[x] - this.v[y]) & 0xFF;
                        break;
                    case 0x6:
                        this.v[0xF] = this.v[x] & 0x1;
                        this.v[x] >>= 1;
                        break;
                    case 0x7:
                        this.v[0xF] = this.v[y] > this.v[x] ? 1 : 0;
                        this.v[x] = (this.v[y] - this.v[x]) & 0xFF;
                        break;
                    case 0xE:
                        this.v[0xF] = (this.v[x] & 0x80) >> 7;
                        this.v[x] = (this.v[x] << 1) & 0xFF;
                        break;
                }
                break;
            case 0x9000: if (this.v[x] !== this.v[y]) this.pc += 2; break;
            case 0xA000: this.i = nnn; break;
            case 0xB000: this.pc = nnn + v[0]; break;
            case 0xC000: this.v[x] = Math.floor(Math.random() * 256) & nn; break;
            case 0xD000: {
                this.v[0xF] = 0;
                for (let row = 0; row < n; row++) {
                    const sprite = this.memory[this.i + row];
                    for (let col = 0; col < 8; col++) {
                        const pixel = (sprite >> (7 - col)) & 1;
                        const px = (this.v[x] + col) % this.cols;
                        const py = (this.v[y] + row) % this.rows;
                        const idx = py * this.cols + px;
                        if (pixel) {
                            if (this.display[idx]) this.v[0xF] = 1;
                            this.display[idx] ^= 1;
                        }
                    }
                }
                this.drawFlag = true;
                break;
            }
            case 0xE000:
                if (nn === 0x9E && this.keypad[this.v[x]]) this.pc += 2;
                if (nn === 0xA1 && !this.keypad[this.v[x]]) this.pc += 2;
                break;
            case 0xF000:
                switch (nn) {
                    case 0x07: this.v[x] = this.delayTimer; break;
                    case 0x0A:
                        this.waitingForKey = true;
                        this.waitingRegister = x;
                        break;
                    case 0x15: this.delayTimer = this.v[x]; break;
                    case 0x18: this.soundTimer = this.v[x]; break;
                    case 0x1E: this.i = (this.i + this.v[x]) & 0xFFFF; break;
                    case 0x29: this.i = this.v[x] * 5; break;
                    case 0x33:
                        this.memory[this.i] = Math.floor(this.v[x] / 100);
                        this.memory[this.i + 1] = Math.floor((this.v[x] % 100) / 10);
                        this.memory[this.i + 2] = this.v[x] % 10;
                        break;
                    case 0x55: for (let j = 0; j <= x; j++) this.memory[this.i + j] = this.v[j]; break;
                    case 0x65: for (let j = 0; j <= x; j++) this.v[j] = this.memory[this.i + j]; break;
                }
                break;
        }

        if (this.drawFlag) {
            this.drawScreen();
            this.drawFlag = false;
        }
    }

    /**
     * Pauses the emulator if running
     * Resume with `resume()`
     */
    pause() {
        if (this.halted) return;
        this.halted = true;
        console.warn("[C8JS] Emulator Paused!");
    }

    /**
     * Resumes the emulator if paused.
     * Pause with `pause()`
     */
    resume() {
        if (!this.halted) return;
        this.halted = false;
        console.warn("[C8JS] Emulator Resumed!");
    }

    /**
     * Toggles turbo mode. (ONLY WORKS WITH `run()`)
     */
    toggleTurbo() {
        this.turbo = !this.turbo;
        console.log(`[C8JS] Turbo mode ${this.turbo ? "ON" : "OFF"}`);
    }

    /**
     * Sets the turbo mode speed. (default=10)
     * @param {Number} speed 
     */
    setTurboSpeed(speed=10) {
        this.turboSpeed = speed;
        if (speed > 40 || speed == 40) {
            console.warn("[C8JS] Turbo speed is too high — this might cause lag.");
        }
    }

    /**
     * Runs the emulator. (makes a unstoppable loop)
     * Turbo mode only works with this!
     */
    run() {
        const loop = () => {
            //this.halted = false;
            if (this.turbo) {
                for (let i = 0; i < this.turboSpeed; i++) {
                    this.step();
                }
            } else {
                this.step();
            }
            requestAnimationFrame(loop);
        };
        loop();
    }
}

/**
 * Keyboard Mappings!
 * 
 * 1 2 3 C     =>     1 2 3 4
 * 4 5 6 D     =>     Q W E R
 * 7 8 9 E     =>     A S D F
 * A 0 B F     =>     Z X C V
 */
