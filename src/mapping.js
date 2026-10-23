// Camera <-> world coordinate mapping.
//
// Spaces:
//   cam   (u, v)  normalized camera frame, [0,1]^2, unmirrored, origin top-left.
//   world (s, t)  normalized display, [0,1]^2, what gets drawn on screen / projected.
//
// Every mapping is a 3x3 homography H (row-major, length 9) taking cam -> world.
// Phone mode uses an affine "cover" fit of the video into the screen (optionally
// mirrored). Projector mode uses a homography solved from 4 calibration corners.

export const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function applyH(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

export function invertH(H) {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error('Homography is singular');
  const k = 1 / det;
  return [
    A * k, -(b * i - c * h) * k, (b * f - c * e) * k,
    B * k, (a * i - c * g) * k, -(a * f - c * d) * k,
    C * k, -(a * h - b * g) * k, (a * e - b * d) * k,
  ];
}

// Solve H such that applyH(H, src[k]) ~= dst[k] for 4 point pairs [[x,y],...].
export function solveHomography(src, dst) {
  if (src.length !== 4 || dst.length !== 4) throw new Error('Need exactly 4 point pairs');
  const M = [];
  for (let k = 0; k < 4; k++) {
    const [x, y] = src[k];
    const [u, v] = dst[k];
    M.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    M.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Gaussian elimination with partial pivoting on the 8x9 augmented matrix.
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) throw new Error('Degenerate calibration points');
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c < 9; c++) M[r][c] -= f * M[col][c];
    }
  }
  const h = M.map((row, r) => row[8] / row[r]);
  return [...h, 1];
}

const UNIT_CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];

// corners: where the projected image's TL, TR, BR, BL appear in the camera frame.
export function homographyFromCorners(corners) {
  return solveHomography(corners, UNIT_CORNERS);
}

// Affine "object-fit: cover" of a videoW x videoH frame into a viewW x viewH view.
export function coverFit(videoW, videoH, viewW, viewH, mirror) {
  const k = Math.max(viewW / videoW, viewH / videoH);
  const dw = videoW * k;
  const dh = videoH * k;
  const ox = (viewW - dw) / 2;
  const oy = (viewH - dh) / 2;
  const a = (mirror ? -dw : dw) / viewW;
  const c = (ox + (mirror ? dw : 0)) / viewW;
  return [a, 0, c, 0, dh / viewH, oy / viewH, 0, 0, 1];
}

// Affine part of H (drops perspective). Exact for coverFit; an approximation
// for projector homographies, which is fine for debug drawing.
export function affineOf(H) {
  const n = H[8];
  return { a: H[0] / n, b: H[3] / n, c: H[1] / n, d: H[4] / n, e: H[2] / n, f: H[5] / n };
}
