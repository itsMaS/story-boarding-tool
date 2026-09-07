import type { SlideSound } from '../model/types';

/** Decoded audio buffer cache keyed by data URL. */
const buffers = new Map<string, Promise<AudioBuffer>>();
let ctx: AudioContext | null = null;

export function audioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function decodeSound(src: string): Promise<AudioBuffer> {
  let p = buffers.get(src);
  if (!p) {
    p = fetch(src)
      .then((r) => r.arrayBuffer())
      .then((ab) => audioContext().decodeAudioData(ab));
    buffers.set(src, p);
  }
  return p;
}

/** Plays sounds for a slide; returns a stop function. `startOffset` skips into the slide. */
export function playSlideSounds(sounds: SlideSound[], startOffset = 0, rate = 1): () => void {
  const ac = audioContext();
  if (ac.state === 'suspended') void ac.resume();
  const nodes: AudioBufferSourceNode[] = [];
  let stopped = false;
  for (const s of sounds) {
    void decodeSound(s.src).then((buffer) => {
      if (stopped) return;
      const when = (s.offset - startOffset) / rate;
      const node = ac.createBufferSource();
      node.buffer = buffer;
      node.playbackRate.value = rate;
      const gain = ac.createGain();
      gain.gain.value = s.volume;
      node.connect(gain).connect(ac.destination);
      if (when >= 0) node.start(ac.currentTime + when);
      else if (-when * rate < buffer.duration) node.start(ac.currentTime, -when * rate);
      nodes.push(node);
    });
  }
  return () => {
    stopped = true;
    for (const n of nodes) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
  };
}

export function previewSound(src: string, volume = 1): () => void {
  return playSlideSounds([{ id: 'preview', name: '', src, volume, offset: 0 }]);
}
