// GPU shadow renderer: the wall and the player shadows, drawn by one WebGL
// fragment shader at full screen resolution.
//
// Each player's soft segmentation mask is uploaded as a small 8-bit texture.
// Per pixel, the shader maps the screen point back into camera space through
// the inverse homography, samples the mask with a bicubic B-spline (smooth,
// rounded contours instead of bilinear corners), and thresholds it with
// fwidth()-based anti-aliasing: an edge exactly one screen pixel wide, so the
// shadow is crisp at any size. The 2D canvas with everything else is layered
// on top with a transparent background.
//
// Returns null when WebGL is unavailable; render.js then uses its CPU path.

const VERT = `
attribute vec2 aPos;
varying vec2 vST;
void main() {
  vST = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5); // world-normalized, top-left origin
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
#ifdef GL_OES_standard_derivatives
#extension GL_OES_standard_derivatives : enable
#endif
precision highp float;
varying vec2 vST;
uniform sampler2D uMask0;
uniform sampler2D uMask1;
uniform vec2 uSize0;
uniform vec2 uSize1;
uniform float uAlpha0;
uniform float uAlpha1;
uniform mat3 uInvH;      // world-normalized (s, t) -> camera (u, v)
uniform vec3 uWall;
uniform vec3 uInk;
uniform float uInkAlpha;
uniform float uThreshold;

// Cubic B-spline weights; bicubic filtering from 4 bilinear taps (GPU Gems 2, ch. 20).
vec4 cubic(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x;
  float y = s.y - 4.0 * s.x;
  float z = s.z - 4.0 * s.y + 6.0 * s.x;
  return vec4(x, y, z, 6.0 - x - y - z) * (1.0 / 6.0);
}

float bicubic(sampler2D tex, vec2 uv, vec2 size) {
  vec2 inv = 1.0 / size;
  uv = uv * size - 0.5;
  vec2 f = fract(uv);
  uv -= f;
  vec4 xc = cubic(f.x);
  vec4 yc = cubic(f.y);
  vec4 c = uv.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
  vec4 off = (c + vec4(xc.yw, yc.yw) / s) * inv.xxyy;
  float s0 = texture2D(tex, off.xz).r;
  float s1 = texture2D(tex, off.yz).r;
  float s2 = texture2D(tex, off.xw).r;
  float s3 = texture2D(tex, off.yw).r;
  float sx = s.x / (s.x + s.y);
  float sy = s.z / (s.z + s.w);
  return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
}

float coverage(sampler2D tex, vec2 uv, vec2 size) {
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  float v = bicubic(tex, uv, size);
#ifdef GL_OES_standard_derivatives
  float w = max(fwidth(v) * 0.7, 1e-4);
#else
  float w = 0.04;
#endif
  return smoothstep(uThreshold - w, uThreshold + w, v);
}

void main() {
  vec3 c = uInvH * vec3(vST, 1.0);
  vec2 uv = c.xy / c.z;
  float cov = 0.0;
  if (uAlpha0 > 0.0) cov = max(cov, coverage(uMask0, uv, uSize0) * uAlpha0);
  if (uAlpha1 > 0.0) cov = max(cov, coverage(uMask1, uv, uSize1) * uAlpha1);
  gl_FragColor = vec4(mix(uWall, uInk, cov * uInkAlpha), 1.0);
}`;

export function createShadowGL(canvas) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false });
  if (!gl) return null;
  const derivatives = gl.getExtension('OES_standard_derivatives');

  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  };
  let prog;
  try {
    // The #ifdef guards above only see the macro if the extension is enabled.
    const frag = derivatives ? FRAG : FRAG.replace(/#ifdef GL_OES_standard_derivatives[\s\S]*?#endif\n/, '');
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (err) {
    console.warn('Shadow shader failed; using CPU shadows', err);
    return null;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = (name) => gl.getUniformLocation(prog, name);
  const loc = {
    mask: [u('uMask0'), u('uMask1')], size: [u('uSize0'), u('uSize1')], alpha: [u('uAlpha0'), u('uAlpha1')],
    invH: u('uInvH'), wall: u('uWall'), ink: u('uInk'), inkAlpha: u('uInkAlpha'), threshold: u('uThreshold'),
  };

  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  const textures = [0, 1].map((k) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + k);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 1, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array(1));
    gl.uniform1i(loc.mask[k], k);
    return { tex: t, w: 1, h: 1, bytes: new Uint8Array(1) };
  });

  function upload(k, grid) {
    const t = textures[k];
    const n = grid.w * grid.h;
    if (t.bytes.length !== n) t.bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) t.bytes[i] = Math.max(0, Math.min(255, grid.data[i] * 255));
    gl.activeTexture(gl.TEXTURE0 + k);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    if (t.w === grid.w && t.h === grid.h) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, grid.w, grid.h, gl.LUMINANCE, gl.UNSIGNED_BYTE, t.bytes);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, grid.w, grid.h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, t.bytes);
      t.w = grid.w;
      t.h = grid.h;
    }
    gl.uniform2f(loc.size[k], grid.w, grid.h);
  }

  return {
    resize(w, h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    },

    // wall: [r, g, b] 0-255. slots: [{ id, det: { shape, alpha } }]. invH: world-normalized -> cam.
    draw({ wall, slots, invH, drawShadows }) {
      gl.uniform3f(loc.wall, wall[0] / 255, wall[1] / 255, wall[2] / 255);
      gl.uniform3f(loc.ink, 18 / 255, 16 / 255, 14 / 255);
      gl.uniform1f(loc.inkAlpha, 0.92);
      gl.uniform1f(loc.threshold, 0.45); // B-spline slightly erodes thin limbs; compensate
      // GLSL mat3 is column-major; invH is row-major.
      gl.uniformMatrix3fv(loc.invH, false, [invH[0], invH[3], invH[6], invH[1], invH[4], invH[7], invH[2], invH[5], invH[8]]);
      for (const k of [0, 1]) {
        const det = drawShadows ? slots[k]?.det : null;
        const grid = det?.shape ?? det?.mask;
        if (grid) upload(k, grid);
        gl.uniform1f(loc.alpha[k], grid ? det.alpha ?? 1 : 0);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}
