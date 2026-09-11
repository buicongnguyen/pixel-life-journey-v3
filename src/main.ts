import "./style.css";
import { Game } from "./engine";

const mount = document.getElementById("app");
if (mount) {
  const game = new Game(mount);
  const button = document.createElement("button");
  button.className = "plj-view-toggle";
  button.textContent = "◇ Live 3D";
  button.title = "Explore the detailed Blender models, materials, and lighting";
  mount.querySelector(".plj-hud-top")?.append(button);
  let close3D: (() => void) | undefined;
  button.onclick = async () => {
    if (close3D) { close3D(); return; }
    button.disabled = true;
    button.textContent = "Loading 3D…";
    try {
      const { open3D } = await import("./view3d");
      close3D = await open3D(game, () => { close3D = undefined; button.textContent = "◇ Live 3D"; });
      button.textContent = "Close 3D";
    } catch {
      button.textContent = "3D unavailable · retry";
      button.title = "Could not load 3D assets or initialize WebGL 2. Check your connection and retry. The original game is still available.";
    } finally { button.disabled = false; button.blur(); }
  };
}
