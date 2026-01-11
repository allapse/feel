precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_volume_smooth;
uniform vec2 u_orient;

void main() {
    // 1. 座標歸一化
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_res.xy) / min(u_res.y, u_res.x);
    
    // 2. 視角偏移 (Gliding 核心)
    // 這裡直接把 uv 偏移，模擬視角轉向
    vec2 look = u_orient * 0.8;
    vec2 p = uv + look;

    // 3. 極坐標轉換 (Log-Polar Transformation)
    // 這是模擬「隧道」的神奇數學：把平面轉成圓柱透視
    float r = length(p);
    float angle = atan(p.y, p.x);
    
    // 深度感：1.0/r 讓越中心的東西看起來越遠
    float depth = 1.0 / (r + 0.01); 
    
    // 4. 建立滑翔紋理
    // 使用 depth 加上時間，產生往前衝的感覺
    float forward = depth + u_time * 5.0;
    
    // 牆面網格紋理
    float stripes = sin(angle * 10.0 + u_time) * sin(forward);
    float pattern = smoothstep(0.4, 0.5, stripes);
    
    // 5. 色彩與光暈
    // 越中心（越深）越亮
    vec3 col = mix(vec3(0.0, 0.4, 0.8), vec3(0.8, 0.1, 0.6), sin(depth * 0.2 + u_time) * 0.5 + 0.5);
    
    // 結合音樂震動
    float pulse = 1.0 + u_volume_smooth * 0.5;
    col *= pattern * pulse;
    
    // 中心發光 (如同隧道的盡頭)
    col += vec3(0.2, 0.6, 1.0) * (0.1 / (r + 0.05));
    
    // 邊緣壓暗
    col *= smoothstep(1.2, 0.2, r);

    gl_FragColor = vec4(col, 1.0);
}