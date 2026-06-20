/**
 * Web Audio API Sound Effects Engine
 * Generates custom electronic retro sound effects without external file dependencies.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    // Standard AudioContext or Webkit equivalent
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  
  // Resume context if suspended (browser security policy)
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch((err) => console.log('Could not resume audio context:', err));
  }
  
  return audioCtx;
}

/**
 * Short, cute, playful reaction sound (bloop/pop)
 */
export function playReactionSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    
    // Play a delightful two-tone quick melody (arpeggio blip)
    // Tone 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(523.25, now); // C5
    osc1.frequency.exponentialRampToValueAtTime(783.99, now + 0.08); // G5
    
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    
    osc1.start(now);
    osc1.stop(now + 0.13);

    // Tone 2 (shifted slightly for stereophonic rhythm)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, now + 0.03); // E5
    osc2.frequency.exponentialRampToValueAtTime(1046.50, now + 0.11); // C6
    
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0.08, now + 0.03);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    
    osc2.start(now + 0.03);
    osc2.stop(now + 0.16);
  } catch (e) {
    console.warn('Web Audio reaction sound failed:', e);
  }
}

/**
 * Triumphant major scale heroic win sound (glorious fanfare chord)
 */
export function playWinSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    
    // A beautiful major pentatonic triumph chord sequence: C4 -> E4 -> G4 -> C5 -> E5 -> G5
    const notes = [
      { freq: 261.63, delay: 0.0, duration: 0.4, type: 'triangle' as OscillatorType, vol: 0.12 }, // C4
      { freq: 329.63, delay: 0.08, duration: 0.45, type: 'sine' as OscillatorType, vol: 0.1 },  // E4
      { freq: 392.00, delay: 0.16, duration: 0.5, type: 'triangle' as OscillatorType, vol: 0.1 }, // G4
      { freq: 523.25, delay: 0.24, duration: 0.6, type: 'sine' as OscillatorType, vol: 0.11 },  // C5
      { freq: 659.25, delay: 0.32, duration: 0.7, type: 'sine' as OscillatorType, vol: 0.08 },  // E5
      { freq: 1046.50, delay: 0.44, duration: 0.9, type: 'sine' as OscillatorType, vol: 0.09 }, // C6
    ];

    notes.forEach((note) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = note.type;
      osc.frequency.setValueAtTime(note.freq, now + note.delay);
      
      // Vibrato effect for extra retro flair on the high notes
      if (note.freq > 500) {
        osc.frequency.linearRampToValueAtTime(note.freq + 5, now + note.delay + 0.1);
        osc.frequency.linearRampToValueAtTime(note.freq - 5, now + note.delay + 0.2);
        osc.frequency.linearRampToValueAtTime(note.freq + 5, now + note.delay + 0.3);
      }

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(note.vol, now + note.delay + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.delay + note.duration);
      
      osc.start(now + note.delay);
      osc.stop(now + note.delay + note.duration);
    });
  } catch (e) {
    console.warn('Web Audio victory sound failed:', e);
  }
}
