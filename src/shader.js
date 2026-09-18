export const MAX_LAYERS = 3

export const VERT = `#version 300 es
void main() {
  gl_Position = vec4(vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4.0 - 1.0, 0.0, 1.0);
}`

const COMMON = `#version 300 es
precision highp float;

float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

// Filmic tone map, gamma, and a dither that keeps dark gradients from banding.
vec3 finish(vec3 c, vec2 pixel) {
  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  return pow(c, vec3(1.0 / 2.2)) + (ign(pixel) - 0.5) / 255.0;
}`

// Tone-maps the accumulated linear light onto the canvas.
export const RESOLVE = `${COMMON}
uniform sampler2D uAccum;
out vec4 outColor;
void main() {
  outColor = vec4(finish(texelFetch(uAccum, ivec2(gl_FragCoord.xy), 0).rgb, gl_FragCoord.xy), 1.0);
}`

export const FRAG = `${COMMON}
uniform vec2 uRes, uView;
uniform float uTime, uFrame;
uniform vec3 uLight, uLightU, uLightV, uAxis;
uniform vec2 uCone;
uniform float uWallNorm, uDistance2;
uniform int uLayers, uEdge, uSamples, uShape, uSurface, uDirect, uInvert;
uniform vec3 uC[${MAX_LAYERS}], uN[${MAX_LAYERS}], uU[${MAX_LAYERS}], uV[${MAX_LAYERS}];
uniform sampler2D uCookie;
uniform vec3 uWall, uLightColor;
uniform float uAmbient, uHaze, uHazeDepth, uThreshold, uBlur, uRelief;
out vec4 outColor;

const float GOLDEN_ANGLE = 2.39996323;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const int HAZE_STEPS = 16;
const int PROBES = 12;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1) * 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  vec2 e = vec2(0.0, 1.0);
  return mix(
    mix(mix(hash(i + e.xxx), hash(i + e.yxx), f.x), mix(hash(i + e.xyx), hash(i + e.yyx), f.x), f.y),
    mix(mix(hash(i + e.xxy), hash(i + e.yxy), f.x), mix(hash(i + e.xyy), hash(i + e.yyy), f.x), f.y), f.z);
}

float smoke(vec3 p) { return 0.57 * noise(p) + 0.29 * noise(p * 2.1) + 0.14 * noise(p * 4.3); }

// Height of the wall surface: 1 plaster, 2 linen, 3 concrete.
float height(vec2 q) {
  if (uSurface == 1) return smoke(vec3(q * 7.0, 0.0)) + 0.3 * noise(vec3(q * 70.0, 1.0));
  if (uSurface == 2) return 0.5 * sin(q.x * 380.0) * cos(q.y * 380.0) + 0.4 * noise(vec3(q * 24.0, 2.0));
  return 0.7 * noise(vec3(q * 150.0, 3.0)) + smoke(vec3(q * 3.0, 4.0));
}

// Premultiplied texels make 1 - a + rgb equal to 1 - a * (1 - straight rgb), and keep it filterable.
// Per channel, so a colour slide tints the light the way a gel or stained glass does.
vec3 through(vec3 p, vec3 d) {
  vec3 t = vec3(1.0);
  for (int i = 0; i < uLayers; i++) {
    float k = dot(uC[i] - p, uN[i]) / dot(d, uN[i]);
    if (k >= 1.0) continue;
    // Behind the cookie plane: the wall a window sits in goes on, a free-standing cookie does not.
    if (k <= 0.0) {
      t *= uEdge == 0 ? 0.0 : 1.0;
      continue;
    }
    vec3 hit = p + d * k - uC[i];
    vec2 uv = vec2(dot(hit, uU[i]), dot(hit, uV[i])) * 0.5 + 0.5;
    if (uEdge < 2 && (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0))))) {
      t *= float(uEdge);
      continue;
    }
    vec4 c = textureLod(uCookie, uv, uBlur);
    vec3 pass = clamp(1.0 - c.a + c.rgb, 0.0, 1.0);
    if (uInvert == 1) pass = 1.0 - pass;
    // A threshold turns the picture into a hard mask, which has no colour left.
    t *= uThreshold > 0.0 ? vec3(smoothstep(uThreshold - 0.02, uThreshold + 0.02, dot(pass, LUMA))) : pass;
  }
  return t;
}

// A point on the lamp: 0 disc, 1 square, 2 ring. j shifts the whole pattern per pixel and per frame, in both axes.
vec3 lightSample(float i, float n, vec2 j) {
  vec2 s;
  if (uShape == 1) {
    s = fract(vec2(0.7548776662, 0.5698402910) * (i + 1.0) + j) * 2.0 - 1.0;
  } else {
    float r = uShape == 2 ? mix(0.8, 1.0, fract(i * 0.618034 + j.y)) : sqrt((i + j.y) / n);
    float a = i * GOLDEN_ANGLE + j.x * 6.2831853;
    s = r * vec2(cos(a), sin(a));
  }
  return uLight + uLightU * s.x + uLightV * s.y;
}

// Radiant intensity arriving at p from one point of the lamp, before the receiver's own cosine.
// t reports how much of that point the cookie lets through, per channel.
float beam(vec3 p, vec3 s, out vec3 l, out vec3 t) {
  vec3 d = s - p;
  float r2 = dot(d, d);
  l = d * inversesqrt(r2);
  float c = dot(-l, uAxis);
  float cone = smoothstep(uCone.x, uCone.y, c);
  t = cone > 0.0 ? through(p, d) : vec3(0.0);
  return cone * c / r2;
}

void main() {
  vec2 q = (gl_FragCoord.xy / uRes * 2.0 - 1.0) * uView;
  vec2 seed = gl_FragCoord.xy + 5.588238 * uFrame;
  vec2 j = vec2(ign(seed), ign(seed.yx + 17.0));
  float n = float(uSamples);
  vec3 l;

  vec3 normal = vec3(0.0, 0.0, 1.0);
  float grain = 1.0;
  if (uSurface > 0) {
    const float E = 0.002;
    float h = height(q);
    normal = normalize(vec3((h - vec2(height(q + vec2(E, 0.0)), height(q + vec2(0.0, E)))) * uRelief * 0.06 / E, 1.0));
    grain = 1.0 - 0.3 * uRelief * (1.0 - h);
  }

  // Most pixels see all of the lamp or none of it. A few probes spread over the lamp find those, and only the
  // penumbra pays for every sample.
  vec3 wall = vec3(0.0), t, lo = vec3(1.0), hi = vec3(0.0);
  for (int i = 0; i < PROBES; i++) {
    float b = beam(vec3(q, 0.0), lightSample((float(i) + 0.5) * n / float(PROBES), n, j), l, t);
    wall += t * b * max(dot(l, normal), 0.0);
    lo = min(lo, t);
    hi = max(hi, t);
  }
  vec3 spread = hi - lo;
  if (max(spread.r, max(spread.g, spread.b)) < 0.01 || uSamples <= PROBES) {
    wall *= uWallNorm / float(PROBES);
  } else {
    wall = vec3(0.0);
    for (int i = 0; i < uSamples; i++) {
      float b = beam(vec3(q, 0.0), lightSample(float(i), n, j), l, t);
      wall += t * b * max(dot(l, normal), 0.0);
    }
    wall *= uWallNorm / n;
  }

  vec3 scatter = vec3(0.0);
  if (uHaze > 0.0) {
    vec3 wind = uTime * vec3(0.05, 0.02, 0.03);
    for (int i = 0; i < HAZE_STEPS; i++) {
      vec3 p = vec3(q, uHazeDepth * (float(i) + j.x) / float(HAZE_STEPS));
      float b = beam(p, lightSample(float(i), float(HAZE_STEPS), j), l, t);
      scatter += t * b * (0.3 + 1.4 * smoke(p * 1.3 + wind));
    }
    scatter *= 0.1 * uHaze * uDistance2 * uHazeDepth / float(HAZE_STEPS);
  }

  vec3 c = uWall * grain * (uAmbient + uLightColor * wall) + uLightColor * scatter;
  outColor = vec4(uDirect == 1 ? finish(c, gl_FragCoord.xy) : c, 1.0);
}`
