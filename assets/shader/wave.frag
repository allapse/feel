precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_volume;
uniform float u_volume_smooth;
uniform vec2 u_orient;

mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

// 修正後的 Map：加入時間取模防止溢位
float map(vec3 p) {
    // 讓 z 軸在一個循環內，防止手機計算大數值崩潰
    float zLoop = mod(p.z, 62.83); 
    float tunnel = -(length(p.xy) - (1.5 + u_volume_smooth * 0.5)); 
    
    // 牆面波紋
    float wave = sin(p.xy.x * 2.0) * sin(zLoop * 0.5 + u_time * 2.0) * 0.1;
    return tunnel + wave;
}

void main() {
    // 1. 座標歸一化，並加入極小值防止除以零
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_res.xy) / (min(u_res.y, u_res.x) + 0.001);
    
    // 2. 限制 u_orient 的範圍，防止偏移過大導致射線崩潰
    vec2 look = clamp(u_orient, -2.0, 2.0);
    
    // 3. 設定相機
    float timeMod = mod(u_time, 1000.0); // 防止時間過大
    vec3 ro = vec3(0.0, 0.0, timeMod * 5.0);
    
    // 視線向量 rd：確保 z 軸不為 0
    vec3 rd = normalize(vec3(uv + look * 1.5, 1.2)); 
    
    // 手機側翻效果
    rd.xy *= rot(look.x * 0.4);

    // 4. Raymarching 步進
    float t = 0.0;
    float glow = 0.0;
    
    for(int i = 0; i < 30; i++) { // 減少次數以提升手機相容性
        vec3 p = ro + rd * t;
        float d = map(p);
        
        // 累積亮度
        glow += 0.04 / (abs(d) + 0.04);
        
        // 如果距離太小或太大就停止
        if (d < 0.01 || t > 15.0) break;
        t += d * 0.7; 
    }
    
    // 5. 著色邏輯：增加基礎亮度，確保手機不會全黑
    vec3 col = vec3(0.0);
    vec3 baseCol = mix(vec3(0.1, 0.4, 0.8), vec3(0.6, 0.1, 0.8), sin(t * 0.2 + timeMod) * 0.5 + 0.5);
    
    // 結合亮度和音樂
    col = baseCol * (glow * (0.2 + u_volume_smooth));
    
    // 增加一個「霧氣」效果，讓遠處不要黑得太生硬
    col = mix(col, vec3(0.01, 0.02, 0.05), smoothstep(0.0, 15.0, t));

    gl_FragColor = vec4(col, 1.0);
}