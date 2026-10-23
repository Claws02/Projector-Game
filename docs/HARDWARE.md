# Hardware Plan

Labels: **[fact]** checked, **[assumption]** typical but unverified, **[rec]** recommendation.

## Stage 1 (now): phone only, $0

Open the GitHub Pages URL on the phone, tap **Start**, prop the phone up in portrait, and
step back about 6–8 ft so your whole body is in frame. The phone draws your silhouette as a
shadow, and that silhouette is what the orbs collide with.

## Stage 2: add a projector (target under $50)

**Honest expectations.** Projectors under $50 are generic "mini" LCD units.
- **[assumption]** Native resolution is usually 480p, even when the listing says "1080p supported".
- **[assumption]** Real brightness is roughly 50–150 ANSI lumens, whatever the listing claims (often thousands of "lumens").
- **[rec]** That is fine for this game in a dark or dim room, and unusable in daylight.
- **[rec]** Shadow games are forgiving because the art is dark shapes on a lit wall, so low resolution barely shows.

**Buying checklist:**
- HDMI input (required).
- A 1/4"-20 tripod thread on the bottom.
- Manual focus.
- Keystone correction (nice to have).
- Ignore the lumen claims. Read reviews for "watchable in a dim room".

**Image size versus your wall.** The wall is 5 ft wide by 8 ft tall (portrait), but projectors are 16:9 landscape.
- **[rec]** Start with a landscape band: 5 ft wide by about 2.8 ft tall, centered at chest and arm height. That's where hands and arms reach.
- Rotating the projector 90° to fill the wall is possible. **[assumption]** Many cheap units aren't designed to run on their side, so check that the vents stay clear.
- **[assumption]** Distance: typical throw ratio is about 1.3–1.5, so a 5 ft wide image needs the projector about 6.5–7.5 ft from the wall. Confirm against the listing's throw ratio or distance chart.

## Who runs the game ("the brain")

| Option | Cost | Verdict |
|---|---|---|
| **Phone + USB-C→HDMI adapter** | ~$10–15 | **[rec] First choice.** Same code you're already testing, and the phone's rear camera is the sensor. It only works if your phone supports video out. **[fact]** iPhone 15 and later (USB-C) do. **[assumption]** Many Samsung Galaxy S models and Pixel 8 and later do; check your exact model. |
| Old laptop + $25 USB webcam | $25 | Most horsepower. Good fallback if the phone can't output HDMI. |
| Raspberry Pi 5 (4 GB+) + USB webcam | ~$90+ with PSU and SD card | Fine as a long-term "passive device". **[speculation]** Expect about 10–15 fps from MediaPipe in Chromium on a Pi 5. That needs measuring before buying. |
| Raspberry Pi 4 or older | – | Not recommended for pose plus segmentation. |

The code already supports a Pi kiosk: launch Chromium full screen on
`.../?mode=projector&autostart=1` with `--autoplay-policy=no-user-gesture-required` and
`--use-fake-ui-for-media-stream` (auto-grants the camera). No tap is needed, and it wakes when someone walks in.

## Camera placement (this matters)

**[fact]** A shadow on the wall is your silhouette as seen from the projector lens. So if the
camera sits right beside the lens and points the same way, the silhouette the camera sees lines up with
the real shadow on the wall. That is why projector mode doesn't draw shadows: your real
shadow does the work, and the game reads it through the camera.

- Mount the camera as close to the lens as possible (directly above or beside it).
- Players stand between the stand and the wall, about 2–4 ft from the wall.
- Run `?mode=projector&calibrate=1` once per setup, then tap the 4 corners of the
  projected image in the camera view. The corners are saved on that device.

## Stand (quick setup, quick takedown)

- One light stand or tripod with a 1/4"-20 screw, plus a phone clamp. Total about $20–30.
- Projector on the screw, phone clamp mounted just above the lens.
- Tape a mark on the floor for the stand so the next calibration is optional.
- **[flag]** Cheap projectors run hot. Keep the vents clear and don't wrap them in a bag right after use.
