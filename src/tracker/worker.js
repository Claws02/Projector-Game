// Tracking worker: runs the vision models off the main thread so rendering
// never waits on inference.
//
// main -> worker  { type: 'init', maxPlayers, model, hands }
//                 { type: 'frame', seq, ts, bitmap }      (bitmap is transferred)
//                 { type: 'model', model }
// worker -> main  { type: 'ready', name, handName } | { type: 'error', message }
//                 { type: 'result', seq, ts, detections, handObs, inferMs, handMs }

import { createEngine } from './engine.js';

let engine = null;

function gridBuffers(detections) {
  const out = [];
  for (const d of detections) {
    if (d.mask) out.push(d.mask.data.buffer);
    if (d.shape) out.push(d.shape.data.buffer);
  }
  return out;
}

self.onmessage = async ({ data: msg }) => {
  try {
    if (msg.type === 'init') {
      engine = await createEngine(msg);
      self.postMessage({ type: 'ready', name: engine.name, handName: engine.handName });
    } else if (msg.type === 'model') {
      await engine.setModel(msg.model);
      self.postMessage({ type: 'ready', name: engine.name, handName: engine.handName });
    } else if (msg.type === 'frame') {
      const { bitmap, seq, ts } = msg;
      const out = engine.run(bitmap, bitmap.width, bitmap.height, ts);
      bitmap.close();
      self.postMessage({ type: 'result', seq, ts, ...out }, gridBuffers(out.detections));
    }
  } catch (err) {
    msg.bitmap?.close?.();
    self.postMessage({ type: 'error', message: String(err?.message ?? err), seq: msg.seq });
  }
};
