// Runtime configuration from the URL query string, so one build serves every setup:
//
//   (default)            phone: front camera, mirrored, draws player shadows on screen
//   ?mode=projector      rear/USB camera beside the projector lens; real shadows, none drawn
//   ?source=sim          simulated players, no camera (desktop dev)
//   ?players=1           number of simulated players
//   ?calibrate=1         tap the 4 corners of the projected image (projector mode)
//   ?hands=0             turn off hand tracking (fists grab and throw orbs)
//   ?debug=1             fps, inference time, landmarks
//   ?autostart=1         skip the tap-to-start screen (kiosk with autoplay allowed)
//   ?round=60            round length in seconds
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
    debug: flag('debug', false),
    autostart: flag('autostart', false),
    roundSeconds: num('round', 60),
    maxPlayers: 2,
  };
}
