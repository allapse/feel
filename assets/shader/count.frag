precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_volume_smooth;
uniform vec2 u_orient;
uniform float u_intensity;  
uniform float u_complexity; 

float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    // --- 1. 空間扭曲層 (Warping Layer) ---
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_res.xy) / min(u_res.y, u_res.x);
    float distToCenter = length(uv);
    
    // 建立一個受音量驅動的衝擊波，扭曲 UV 座標
    float shock = sin(distToCenter * 15.0 - u_time * 5.0) * u_volume_smooth * 0.15;
    uv += normalize(uv) * shock; // 讓空間隨波紋震動
    
    // --- 2. 物理場與粒子參數 ---
    float gravity = -0.5;
    float explosion = pow(u_volume_smooth, 2.2) * 3.0;
    float grid = 65.0;
    
    // --- 3. 渲染循環與色彩分離 (Chromatic Aberration) ---
    vec3 finalCol = vec3(0.0);
    
    // 模擬 RGB 三色在空間扭曲下的微小偏移
    for(int i = 0; i < 4; i++) {
        float tOffset = float(i) * 0.12;
        float fade = 1.0 - (float(i) / 4.0);
        
        // 每個顏色通道略微不同的採樣點 (色散)
        vec2 shiftUv = uv + (float(i) * 0.005 * u_volume_smooth);
        vec2 id = floor(shiftUv * grid);
        vec2 gv = fract(shiftUv * grid) - 0.5;
        float seed = hash21(id);
        
        // 力的計算
        float wave = sin(shiftUv.x * (5.0 + u_intensity * 10.0)) * cos(shiftUv.y * 5.0);
        vec2 force = mix(
            vec2(dFdx(wave), dFdy(wave) + gravity * (1.0 - u_volume_smooth)), 
            normalize(shiftUv + (seed - 0.5)) * explosion, 
            clamp(explosion, 0.0, 1.0)
        );
        
        float d = length(gv - force * (1.0 + tOffset));
        float p = smoothstep(0.25 * fade * (1.0 + u_volume_smooth), 0.0, d);
        
        // 色彩分配：隨著時間殘影改變色相
        vec3 chanCol = vec3(0.0);
        if(i == 0) chanCol = vec3(1.0, 0.3, 0.3); // R
        if(i == 1) chanCol = vec3(0.3, 1.0, 0.3); // G
        if(i == 2) chanCol = vec3(0.3, 0.3, 1.0); // B
        
        finalCol += p * chanCol * fade;
    }

    // --- 4. 最終光效 ---
    // 根據中心距離增加漸層色，讓扭曲處有「能量透鏡」的感覺
    finalCol += vec3(0.1, 0.0, 0.2) * (1.0 / (distToCenter + 0.5)) * u_volume_smooth;
    
    // 邊界微弱閃爍
    finalCol *= (0.9 + 0.1 * sin(u_time * 20.0));

    gl_FragColor = vec4(finalCol, 1.0);
}