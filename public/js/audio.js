// FINAL OVERRIDE — Robust Morse Audio Engine (Dual Engine: HTML5 Audio + Web Audio API)

class MorsePlayer {
  constructor() {
    this.audioElement = null;
    this.audioCtx = null;
    this.isPlaying = false;
    this.flashTimer = null;
    this.resetFlashTimer = null;
    this.currentSource = null;
  }

  // Pre-unlock AudioContext on user interaction
  async unlockAudio() {
    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
    } catch (_) {}
  }

  // Generate PCM AudioBuffer dynamically from pattern (as instant fallback)
  createMorseBuffer(pattern, speedFactor = 1.0) {
    if (!this.audioCtx) return null;
    const sampleRate = this.audioCtx.sampleRate || 44100;
    const freq = 700;
    const baseUnit = 0.12 * speedFactor;
    const volume = 0.45;

    let totalDuration = 0;
    for (const item of pattern) {
      totalDuration += item.u * baseUnit;
    }

    const numSamples = Math.ceil(totalDuration * sampleRate);
    const buffer = this.audioCtx.createBuffer(1, numSamples, sampleRate);
    const data = buffer.getChannelData(0);

    let currentSample = 0;
    for (const item of pattern) {
      const duration = item.u * baseUnit;
      const itemSamples = Math.round(duration * sampleRate);
      const endSample = Math.min(currentSample + itemSamples, numSamples);

      if (item.tone) {
        const rampSamples = Math.min(Math.round(0.005 * sampleRate), Math.floor(itemSamples / 2));
        for (let i = currentSample; i < endSample; i++) {
          const t = (i - currentSample) / sampleRate;
          let env = 1.0;
          const offset = i - currentSample;
          const fromEnd = endSample - 1 - i;
          if (offset < rampSamples) {
            env = offset / rampSamples;
          } else if (fromEnd < rampSamples) {
            env = fromEnd / rampSamples;
          }
          data[i] = Math.sin(2 * Math.PI * freq * t) * volume * env;
        }
      }
      currentSample = endSample;
    }

    return buffer;
  }

  // Play using HTML5 Audio (Primary & most reliable across all devices)
  playAudioElement(src, speedFactor, onProgress) {
    return new Promise((resolve) => {
      this.stop();
      this.isPlaying = true;

      const audio = new Audio(src);
      this.audioElement = audio;
      audio.preload = 'auto';
      if (speedFactor && speedFactor !== 1.0) {
        audio.playbackRate = 1.0 / speedFactor;
      }

      // Decoy visual flash timing: ~2.0s into the message (scaled by speed)
      const flashAtMs = Math.round(2000 * speedFactor);
      this.flashTimer = setTimeout(() => {
        if (this.isPlaying && onProgress) {
          onProgress('flash');
          this.resetFlashTimer = setTimeout(() => {
            if (this.isPlaying && onProgress) onProgress('reset-flash');
          }, 350);
        }
      }, flashAtMs);

      audio.onended = () => {
        this.isPlaying = false;
        this.clearTimers();
        if (onProgress) onProgress('done');
        resolve(true);
      };

      audio.onerror = () => {
        this.isPlaying = false;
        this.clearTimers();
        resolve(false); // Signal fallback needed
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          this.isPlaying = false;
          this.clearTimers();
          resolve(false); // Autoplay blocked or failed, trigger fallback
        });
      }
    });
  }

  // Play using Web Audio API buffer (Fallback engine)
  async playWebAudio(pattern, speedFactor, onProgress) {
    await this.unlockAudio();
    if (!this.audioCtx) {
      if (onProgress) onProgress('done');
      return;
    }

    this.stop();
    this.isPlaying = true;

    const buffer = this.createMorseBuffer(pattern, speedFactor);
    if (!buffer) {
      this.isPlaying = false;
      if (onProgress) onProgress('done');
      return;
    }

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioCtx.destination);
    this.currentSource = source;

    const flashAtMs = Math.round(2000 * speedFactor);
    this.flashTimer = setTimeout(() => {
      if (this.isPlaying && onProgress) {
        onProgress('flash');
        this.resetFlashTimer = setTimeout(() => {
          if (this.isPlaying && onProgress) onProgress('reset-flash');
        }, 350);
      }
    }, flashAtMs);

    source.onended = () => {
      this.isPlaying = false;
      this.clearTimers();
      if (onProgress) onProgress('done');
    };

    source.start(0);
  }

  // Main playback entry point
  async playPattern(pattern, speedFactor = 1.0, onProgress = null) {
    await this.unlockAudio();

    // Select the pre-rendered audio asset based on selected speed
    const audioUrl = '/assets/signal.mp3';

    // Attempt HTML5 Audio first
    const played = await this.playAudioElement(audioUrl, speedFactor, onProgress);
    if (!played && pattern) {
      // Fall back to Web Audio API synthesis
      await this.playWebAudio(pattern, speedFactor, onProgress);
    }
  }

  clearTimers() {
    if (this.flashTimer) { clearTimeout(this.flashTimer); this.flashTimer = null; }
    if (this.resetFlashTimer) { clearTimeout(this.resetFlashTimer); this.resetFlashTimer = null; }
  }

  stop() {
    this.isPlaying = false;
    this.clearTimers();

    if (this.audioElement) {
      try {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
      } catch (_) {}
      this.audioElement = null;
    }

    if (this.currentSource) {
      try {
        this.currentSource.stop(0);
      } catch (_) {}
      this.currentSource = null;
    }
  }
}

window.morsePlayer = new MorsePlayer();
