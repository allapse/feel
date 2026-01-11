precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_volume;
uniform float u_volume_smooth;
uniform vec2 u_orient; // 我們辛苦搞定的四元數 XY

// --- 工具函數 ---
mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

// 讓形狀隨音樂扭動的 SDF
float map(vec3 p) {
    // 建立一個無限的管狀空間
    // p.xy 是橫截面，p.z 是前進方向
    float tunnel = -(length(p.xy) - 1.5); 
    
    // 加上音樂波紋
    tunnel += sin(p.z * 5.0 - u_time * 10.0) * u_volume_smooth * 0.2;
    
    // 加上細微的格線凸起
    float grid = sin(atan(p.y, p.x) * 10.0) * sin(p.z * 2.0) * 0.1;
    return tunnel + grid;
}

void main() {
    // 1. 座標歸一化 (-1 ~ 1)
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_res.xy) / min(u_res.y, u_res.x);
    
    // 2. 視角控制 (Gliding 核心)
    // 利用手機數據 u_orient 來偏轉「相機目標」
    vec3 ro = vec3(0.0, 0.0, u_time * 5.0); // 相機位置 (隨時間前進)
    
    // 視線方向 (Ray Direction)
    // 這裡的 0.5 是廣角感，u_orient.x/y 負責俯衝與轉向
    vec3 rd = normalize(vec3(uv + u_orient * 1.2, 1.0)); 
    
    // 模擬滑翔機側傾：根據手機左右傾斜 (u_orient.x) 旋轉整個視界
    rd.xy *= rot(u_orient.x * 0.5);
    
    // 3. 簡單的 Raymarching 渲染隧道
    float t = 0.0;
    vec3 col = vec3(0.0);
    float glow = 0.0;
    
    for(int i = 0; i < 40; i++) {
        vec3 p = ro + rd * t;
        float d = map(p);
        
        // 為了效能，我們不求精確交點，而是累積光流 (Glow)
        // 音樂越大，光流越強
        float layerGlow = 0.05 / (abs(d) + 0.05);
        glow += layerGlow * (0.1 + u_volume_smooth);
        
        if (d < 0.01 || t > 10.0) break;
        t += d * 0.6; // 步進
    }
    
    // 4. 色彩與後處理
    // 基於深度的顏色變幻：越遠越紫，越近越青
    vec3 baseCol = mix(vec3(0.0, 0.8, 1.0), vec3(0.8, 0.0, 1.0), sin(t * 0.1 + u_time) * 0.5 + 0.5);
    
    // 加入速度感亮條 (Speed Lines)
    float lines = smoothstep(0.9, 1.0, sin(atan(rd.y, rd.x) * 20.0 + u_time * 20.0));
    col = baseCol * glow * 0.2;
    col += baseCol * lines * u_volume * 0.5;
    
    // 加上中心的深邃感
    col *= smoothstep(0.0, 0.5, length(uv + u_orient));
    
    // 5. 輸出
    gl_FragColor = vec4(col, 1.0);
}