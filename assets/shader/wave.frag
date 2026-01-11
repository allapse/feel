precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_volume;
uniform float u_volume_smooth;
uniform float u_last_volume;
uniform vec2 u_orient;
uniform float u_intensity;
uniform float u_complexity;
uniform float u_speed;
uniform float u_darkGlow;

mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

// 核心修改：使用參數控制扭曲
float map(vec3 p) {
    float timeMod = u_time * (u_speed * 2.0 + 1.0);
    float zLoop = mod(p.z, 62.83); 
    
    // 1. 基礎隧道半徑，受音量影響擴張
    float tunnel = -(length(p.xy) - (1.5 + u_volume * 0.5)); 
    
    // 2. 邊緣扭曲邏輯
    // u_complexity: 增加頻率，讓波紋變細碎
    float freq = 2.0 + u_complexity * 10.0;
    // u_intensity: 增加振幅，讓扭曲高度變大
    float amp = 0.05 + u_intensity * 0.4;
    
    // 多層波紋疊加 (使用 complexity 影響第二層細節)
    float wave = sin(atan(p.y, p.x) * freq + timeMod) * cos(p.z * 0.5);
    wave += sin(p.z * freq * 0.2 + timeMod) * 0.5; // 縱向波紋
    
    return tunnel + (wave * amp);
}

void main() {
    // 1. 座標歸一化
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_res.xy) / (min(u_res.y, u_res.x) + 0.001);
    
    // 2. 限制偏移
    vec2 look = clamp(u_orient, -2.0, 2.0);
    
    // 3. 設定相機
    float timeMod = mod(u_time, 1000.0);
    // 前進速度受 u_speed 影響
    vec3 ro = vec3(0.0, 0.0, u_time * (u_speed * 5.0 + 2.0));
    vec3 rd = normalize(vec3(uv + look * 1.5, 1.2)); 
    
    // 手機側翻效果
    rd.xy *= rot(look.x * 0.4);

    // 4. Raymarching 步進
    float t = 0.0;
    float glow = 0.0;
    
    for(int i = 0; i < 30; i++) {
        vec3 p = ro + rd * t;
        float d = map(p);
        
        // 累積亮度：受 u_intensity 影響，讓扭曲處更有光澤感
        glow += 0.04 / (abs(d) + 0.04);
        
        if (d < 0.01 || t > 15.0) break;
        t += d * 0.7; 
    }
    
    // 5. 著色邏輯
    vec3 baseCol = mix(vec3(0.1, 0.4, 0.8), vec3(0.6, 0.1, 0.8), sin(t * 0.2 + timeMod) * 0.5 + 0.5);
    
    // 結合亮度和音樂 (修正變數名為 u_volume)
    vec3 finalCol = baseCol * (glow * (0.2 + u_volume));
    
    // 增加霧氣感
    finalCol = mix(finalCol, vec3(0.01, 0.02, 0.05), smoothstep(0.0, 15.0, t));

    // 6. DarkGlow 模式切換
    // 注意：原代碼最後判斷 logic 有誤，已修正為符合邏輯的寫法
    if (u_darkGlow > 0.5) {
        float luminance = dot(finalCol, vec3(0.2126, 0.7152, 0.0722));
        // 反相效果：創造一種「霓虹暗光」感
        finalCol = vec3(pow(1.0 - luminance, 2.0)) * vec3(1.0, 0.4, 0.8);
    }

    gl_FragColor = vec4(finalCol, 1.0);
}