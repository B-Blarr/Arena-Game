import {
  HalfFloatType,
  NoToneMapping,
  PerspectiveCamera,
  Scene,
  Vector2,
  WebGLRenderer,
} from 'three';
import {
  BloomEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';

/** Basis-Offset der Chromatic Aberration (nur Bildrand, Mitte bleibt scharf). */
const CA_BASE = 0.0006;
/** Zusatz-Offset bei vollem Kick (Boss-Tod). */
const CA_KICK = 0.0035;
const CA_KICK_DECAY_TIME = 0.35;

/**
 * WebGLRenderer + pmndrs-postprocessing-Composer.
 * Bloom: Mipmap-Blur (Kawase-artig), deutlich schneller als UnrealBloomPass.
 * Tone-Mapping laeuft als Effekt NACH dem Bloom — so erreichen HDR-Farben
 * (> 1) den Luminanz-Threshold, bevor ACES sie komprimiert.
 * Chromatic Aberration ist in DENSELBEN EffectPass gemergt (kein Extra-Pass).
 * pixelRatio-Cap 1.5 ist der wichtigste Performance-Hebel auf 4K-Laptops.
 */
export class Renderer {
  readonly renderer: WebGLRenderer;
  readonly composer: EffectComposer;
  /** "Effekte reduzieren": daempft CA-Basis und -Kicks (Game.applySettings). */
  fxIntensity = 1;
  private caKick = 0;
  private readonly ca: ChromaticAberrationEffect;
  private readonly onResize: () => void;

  constructor(canvas: HTMLCanvasElement, scene: Scene, camera: PerspectiveCamera) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false, // AA uebernimmt das Multisampling des Composers
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = NoToneMapping;

    this.composer = new EffectComposer(this.renderer, {
      frameBufferType: HalfFloatType,
      multisampling: 2,
    });
    this.composer.addPass(new RenderPass(scene, camera));

    const bloom = new BloomEffect({
      mipmapBlur: true,
      intensity: 0.9,
      luminanceThreshold: 0.6,
      luminanceSmoothing: 0.2,
    });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    this.ca = new ChromaticAberrationEffect({
      offset: new Vector2(CA_BASE, CA_BASE),
      radialModulation: true,
      modulationOffset: 0.2,
    });
    const vignette = new VignetteEffect({ offset: 0.28, darkness: 0.55 });
    this.composer.addPass(new EffectPass(camera, bloom, tone, this.ca, vignette));

    this.onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this.onResize);
  }

  /** Kurzer CA-Stoss (Boss-Tod 1.0, Spieler-Treffer 0.5, Dash 0.35). */
  kickAberration(v: number): void {
    this.caKick = Math.max(this.caKick, Math.min(1, v));
  }

  render(deltaSec: number): void {
    if (this.caKick > 0) this.caKick = Math.max(0, this.caKick - deltaSec / CA_KICK_DECAY_TIME);
    // quadratisch: kleiner Kick kaum sichtbar, grosser Kick knallt kurz
    const o = (CA_BASE + this.caKick * this.caKick * CA_KICK) * this.fxIntensity;
    this.ca.offset.set(o, o);
    this.composer.render(deltaSec);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.composer.dispose();
    this.renderer.dispose();
  }
}
