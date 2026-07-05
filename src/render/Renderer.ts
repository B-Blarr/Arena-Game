import {
  HalfFloatType,
  NoToneMapping,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';

/**
 * WebGLRenderer + pmndrs-postprocessing-Composer.
 * Bloom: Mipmap-Blur (Kawase-artig), deutlich schneller als UnrealBloomPass.
 * Tone-Mapping laeuft als Effekt NACH dem Bloom — so erreichen HDR-Farben
 * (> 1) den Luminanz-Threshold, bevor ACES sie komprimiert.
 * pixelRatio-Cap 1.5 ist der wichtigste Performance-Hebel auf 4K-Laptops.
 */
export class Renderer {
  readonly renderer: WebGLRenderer;
  readonly composer: EffectComposer;
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
    const vignette = new VignetteEffect({ offset: 0.28, darkness: 0.55 });
    this.composer.addPass(new EffectPass(camera, bloom, tone, vignette));

    this.onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this.onResize);
  }

  render(deltaSec: number): void {
    this.composer.render(deltaSec);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.composer.dispose();
    this.renderer.dispose();
  }
}
