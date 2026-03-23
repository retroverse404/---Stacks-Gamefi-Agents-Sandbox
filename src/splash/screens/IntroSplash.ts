/**
 * Intro splash screen – click anywhere to begin.
 */
import type { SplashScreen, SplashScreenCallbacks } from "../SplashTypes.ts";
import "./IntroSplash.css";

export interface IntroSplashProps extends SplashScreenCallbacks {}

export function createIntroSplash(props: IntroSplashProps): SplashScreen {
  const el = document.createElement("div");
  el.className = "intro-splash";

  const title = document.createElement("h1");
  title.className = "intro-title";
  title.textContent = "Tiny Realms";

  const tagline = document.createElement("p");
  tagline.className = "intro-tagline";
  tagline.textContent = "A persistent shared world";

  const prompt = document.createElement("p");
  prompt.className = "intro-prompt";
  prompt.textContent = "Click anywhere to begin";

  const disclaimer = document.createElement("p");
  disclaimer.className = "intro-disclaimer";
  disclaimer.textContent =
    "* Educational R&D preview only. Not financial, investment, or trading advice.";

  el.append(title, tagline, prompt, disclaimer);
  el.addEventListener("click", () => props.onClose());

  return {
    el,
    destroy() { el.remove(); },
  };
}
