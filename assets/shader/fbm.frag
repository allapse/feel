precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_volume;
uniform float u_volume_smooth;
uniform vec2 u_orient; // -1 to 1
uniform float u_intensity;
uniform float u_complexity;
uniform float u_speed;
uniform float u_darkGlow;

#define PI 3.14159265359

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 6; i++) {
        v += noise(p) * amp;
        p *= 2.1;
        amp *= 0.5;
    }
    return v;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_res.xy) / min(u_res.y, u_res.x);
    
    // --- 1. 引力透鏡核心邏輯 (Gravitational Lensing) ---
    vec2 lensCenter = u_orient * 0.5; // 透鏡位置由手機傾斜決定
    vec2 delta = uv - lensCenter;
    float dist = length(delta);
    
    // 引力公式：靠近中心時產生極大的座標拉伸
    // 強度由 u_intensity 控制，並隨音量跳動
    float strength = (u_intensity * 0.2) + (u_volume_smooth * 0.1);
    float lensEffect = strength / (dist + 0.001);
    
    // 扭曲座標：就像光線經過黑洞邊緣被彎曲
    vec2 warpedUV = uv + normalize(delta) * lensEffect;
    
    // 2. 旋轉變形 (加強時空扭曲感)
    float angleRot = lensEffect * 2.0;
    mat2 rotMat = mat2(cos(angleRot), -sin(angleRot), sin(angleRot), cos(angleRot));
    warpedUV = warpedUV * rotMat;

    // 3. 進入隧道深度計算
    float r = length(warpedUV);
    float angle = atan(warpedUV.y, warpedUV.x);
    
    // 鏡像與隧道感
    float mirrorAngle = abs(angle - PI * 0.5);
    float zoom = 1.0 / (r + 0.01);
    vec2 p = vec2(mirrorAngle * 2.0 / PI, zoom + u_time * (u_speed * 15.0 + 2.0));

    // 4. 生成圖樣 (Domain Warping)
    vec2 shift = vec2(fbm(p), fbm(p + 1.0));
    float pattern = fbm(p + shift + u_time * 0.1);

    // --- 5. 渲染輸出 ---
    vec3 finalCol = vec3(0.0);
    
    // 基礎顏色：帶有一點「愛因斯坦環」的色散感
    float ring = smoothstep(0.1, 0.0, abs(dist - strength * 2.0)); // 模擬引力環
    
    if (u_darkGlow > 0.5) {
        // 模式 A：深邃星雲
        vec3 col1 = vec3(0.1, 0.0, 0.3);
        vec3 col2 = vec3(0.0, 0.8, 1.0);
        finalCol = mix(col1, col2, pattern);
        finalCol *= pow(pattern, 2.0) * 3.0;
        finalCol += ring * vec3(0.5, 0.2, 1.0) * u_volume_smooth; // 加入引力環發光
    } else {
        // 模式 B：數位矩陣
        float grid = step(0.9, fract(p.x * 5.0)) + step(0.9, fract(p.y * 5.0));
        finalCol = vec3(pattern * 0.1, pattern, pattern * 0.5) + grid * 0.2;
    }

    // 6. 中心奇點與邊緣處理
    float singularity = 0.02 / (r + 0.001);
    finalCol += vec3(0.9, 0.9, 1.0) * singularity * (1.0 + u_volume * 2.0);
    
    // 暗角與消散
    finalCol *= smoothstep(1.5, 0.5, length(uv)); 

    gl_FragColor = vec4(finalCol, 1.0);
}
