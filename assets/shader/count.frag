precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_volume;
uniform float u_volume_smooth;
uniform vec2 u_orient;      // x: 左右旋轉, y: 垂直位移/縮放
uniform float u_intensity;  
uniform float u_complexity; 

// 旋轉矩陣函數
mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    // --- 1. 基礎坐標與視角控制 ---
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_res.xy) / min(u_res.y, u_res.x);
    
    // 視角旋轉：使用 u_orient.x 進行全平面旋轉
    uv *= rot(u_orient.x * 3.14159);
    
    // 視角位移：使用 u_orient.y 進行上下位移
    uv.y += u_orient.y;

    float distToCenter = length(uv);
    
    // --- 2. 空間扭曲層 (Warping Layer) ---
    // 衝擊波現在會隨著你的視角轉動而同步位移
    float shock = 0.01 + sin(distToCenter * 15.0 - u_time * 5.0) * u_volume_smooth * u_intensity;
    uv += normalize(uv) * shock; 
    
    // --- 3. 物理場與粒子參數 ---
    float gravity = -0.5;
    float explosion = pow(u_volume, 2.2) * 6.0;
    float grid = 65.0;
    
    // --- 4. 渲染循環與色彩分離 ---
    vec3 finalCol = vec3(0.0);
    
    for(int i = 0; i < 4; i++) {
        float tOffset = float(i) * 0.12;
        float fade = 1.0 - (float(i) / 4.0);
        
        // 色散偏移
        vec2 shiftUv = uv + (float(i) * 0.005 * u_volume);
        vec2 id = floor(shiftUv * grid);
        vec2 gv = fract(shiftUv * grid) - 0.5;
        float seed = hash21(id);
        
        // 力的計算：加入 u_complexity 影響的波動頻率
        float wave = sin(shiftUv.x * (5.0 * u_complexity)) * cos(shiftUv.y * 5.0);
        
        // 力的向量受旋轉後的 UV 影響，會產生跟隨視角的動態感
        vec2 force = mix(
            vec2(dFdx(wave), dFdy(wave) + gravity * (1.0 - u_volume)), 
            normalize(shiftUv + (seed - 0.5)) * explosion, 
            clamp(explosion, 0.0, 1.0)
        );
        
        float d = length(gv - force * (1.0 + tOffset));
        float p = smoothstep(0.25 * fade * (1.0 + u_volume_smooth), 0.0, d);
        
        // 色彩分配
        vec3 chanCol = vec3(0.0);
        if(i == 0) chanCol = vec3(1.0, 0.3, 0.3); // R
        if(i == 1) chanCol = vec3(0.3, 1.0, 0.3); // G
        if(i == 2) chanCol = vec3(0.3, 0.3, 1.0); // B
        
        finalCol += p * chanCol * fade;
    }

    // --- 5. 最終光效 ---
    // 能量中心會隨著 uv 中心移動
    finalCol += vec3(0.1, 0.0, 0.2) * (1.0 / (distToCenter + 0.5)) * u_volume_smooth;
    
    // 增加邊緣整體的質感與環境光
    finalCol *= (0.9 + 0.1 * sin(u_time * 20.0));

    gl_FragColor = vec4(finalCol, 1.0);
}