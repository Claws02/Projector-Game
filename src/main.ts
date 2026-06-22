import { App } from "./app";

// Browsers require a user gesture before opening the camera (and before
// autoplaying video), so the themed "wake the forest" overlay doubles as that
// gesture. One touch and the room comes alive.
const canvas = document.getElementById("stage") as HTMLCanvasElement;
const video = document.getElementById("source") as HTMLVideoElement;
const invite = document.getElementById("invite") as HTMLDivElement;

const app = new App(canvas, video);

async function begin(): Promise<void> {
  invite.classList.add("gone");
  try {
    await app.start();
  } catch (err) {
    console.error(err);
  }
}

invite.addEventListener("click", begin, { once: true });
// Allow keyboard or touch to wake it too.
window.addEventListener(
  "keydown",
  (e) => {
    if (e.key === "Enter" || e.key === " ") begin();
  },
  { once: true }
);
