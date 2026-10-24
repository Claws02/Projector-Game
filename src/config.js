// Runtime configuration from the URL query string, so one build serves every setup:
//
//   (default)            phone: front camera, mirrored, draws player shadows on screen
//   ?mode=projector      rear/USB camera beside the projector lens; real shadows, none drawn
//   ?source=sim          simulated players, no camera (desktop dev)
//   ?players=1           number of simulated players
//   ?calibrate=1         tap the 4 corners of the projected image (projector mode)
//   ?hands=0             turn off hand tracking (fists grab and throw orbs)
//   ?model=lite|full     pose model (default: full, auto-switching to lite if too slow)
//   ?worker=0            run tracking on the main thread instead of a worker
//   ?delegate=cpu        run the vision models on the CPU (WASM) instead of the GPU
//   ?gpu=0               draw shadows on the CPU instead of WebGL
//   ?debug=1             fps, inference time, landmarks
//   ?autostart=1         skip the tap-to-start screen (kiosk with autoplay allowed)
//   ?guide=1             open the pattern guide whenever the home screen wakes
//   ?round=20            override every game's round length (testing)
//   ?game=<id>           skip the home screen and loop one game (orbs, keepup, storm,
//                        volley, smash, paint, simon)
//   ?mirror=0|1  ?shadows=0|1  ?cam=user|environment   override mode defaults

export function parseConfig(search) {
  const p = new URLSearchParams(search);
  const flag = (key, fallback) => (p.has(key) ? p.get(key) !== '0' : fallback);
  const num = (key, fallback) => {
    const n = Number(p.get(key));
    return p.has(key) && Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const mode = p.get('mode') === 'projector' ? 'projector' : 'phone';
  const phone = mode === 'phone';
  return {
    mode,
    source: p.get('source') === 'sim' ? 'sim' : 'camera',
    simPlayers: Math.min(2, num('players', 2)),
    mirror: flag('mirror', phone),
    drawShadows: flag('shadows', phone),
    facingMode: p.get('cam') === 'environment' || p.get('cam') === 'user' ? p.get('cam') : phone ? 'user' : 'environment',
    calibrate: flag('calibrate', false),
    hands: flag('hands', true),
    model: ['lite', 'full'].includes(p.get('model')) ? p.get('model') : 'auto',
    worker: flag('worker', true) ? 'auto' : 'off',
    delegate: p.get('delegate') === 'cpu' ? 'cpu' : 'auto',
    gpu: flag('gpu', true),
    debug: flag('debug', false),
    autostart: flag('autostart', false),
    game: p.get('game') || null,
    guide: flag('guide', false),
    roundSeconds: num('round', 0),
    maxPlayers: 2,
  };
}
