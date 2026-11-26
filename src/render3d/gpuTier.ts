// ============================================================================
// GPU TIER
//
// A browser with no usable graphics card still offers WebGL, drawn on the CPU
// (SwiftShader, llvmpipe, Microsoft Basic Render). The full arena - shadows,
// reflections, ambient occlusion, a seating bowl - takes tens of seconds to
// draw its first frame there and then crawls. Board3D asks this once and
// drops to the light tier on such a device, whatever the frame-time tier
// says, so a coach without a GPU still gets a responsive 3D view.
// ============================================================================

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;

let cached: boolean | null = null;

/** Whether WebGL in this browser is software-rendered. False when it can't tell. */
export function isSoftwareRenderer(): boolean {
  if (cached !== null) return cached;
  cached = false;
  if (typeof document === 'undefined') return cached;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return cached;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    cached = SOFTWARE.test(renderer);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
}

/** For tests. */
export function resetGpuTierForTests(): void {
  cached = null;
}
