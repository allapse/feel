precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_volume;
uniform float u_volume_smooth;
uniform float u_last_volume;
uniform vec2 u_orient;      // 控制旋轉視角: x (左右), y (上下)
uniform float u_intensity;  
uniform float u_complexity; 
uniform float u_speed; 
uniform float u_darkGlow;

// 旋轉矩陣函數
mat2 rot(float a) {
    float s=sin(a), c=cos(a);
    return mat2(c, -s, s, c);
}

// 量子場雜訊：模擬亞原子粒子的不穩定性
float hash(vec3 p) {
    p  = fract(p * .1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
}

// 3D 距離函數：這個宇宙的「實體內容」
float map(vec3 p, float filteredVol) {
    float vol = filteredVol;
    float phase = u_speed;
    
    // 基礎扭曲：隨深度旋轉
    p.xy *= rot(p.z * 0.15);
    
    // 物態演化
    if (phase < 0.3) {
        // 固態：幾何分形
        for(int i=0; i<3; i++) {
            p = abs(p) - 0.4 * (1.0);
            p.xy *= rot(0.5 + phase);
            p.xz *= rot(0.8);
        }
    } else {
        // 液態/神經態：空間波動
        p += sin(p.zxy * 1.5 + u_time) * u_complexity * phase;
    }
    
    // 產生無限重複的粒子晶格
    vec3 q = mod(p, 2.0) - 1.0;
    return length(q) - (0.04 + 0.25);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_res.xy) / min(u_res.y, u_res.x);
	float filteredVol = 0.5 + u_last_volume + clamp(u_volume - u_last_volume, -0.000001, 0.000001);
    
    // --- 1. 時間與速度演化 ---
    float timeSpeed = mix(1.0, 0.05, pow(filteredVol, 3.0));
    float t_axis = u_time * 0.01;

    // --- 2. 攝像機設置 (Camera & Orientation) ---
    vec3 ro = vec3(0.0, 0.0, t_axis); // 攝像機位置 (隨時間推進)
    
    // 初始視線方向
    vec3 rd = normalize(vec3(uv, 1.2)); 

    // 【重要：視角轉動演化】
    // 使用 u_orient 控制 rd 的旋轉，模擬頭部轉動
    // x 控制 Yaw (左右), y 控制 Pitch (上下)
    rd.yz *= rot(u_orient.y * 1.5); // 上下仰望 (Pitch)
    rd.xz *= rot(u_orient.x * 3.14); // 左右環視 (Yaw - 支援 360 度感)

    // --- 3. Raymarching 核心渲染 ---
    float t = 0.0;
    float glow = 0.0;
    vec3 p;
    
    for(int i=0; i<18; i++) {
        p = ro + rd * t;
        float d = map(p, filteredVol);
        
        // 累積輝光：當光線靠近物體時，吸收能量
        glow += (1.0 / (d + 0.4)) * filteredVol;
        
        if(d < 0.001 || t > 15.0) break;
        t += d * 0.6;
    }

    // --- 4. 色彩與深度演化 ---
    float fog = 1.0 / (1.0 + t * t * 0.05);
    
    // 動態色譜：低強度為冷調，高強度為輻射橘
    vec3 baseCol = mix(vec3(0.1, 0.3, 0.9), vec3(1.0, 0.4, 0.1), u_intensity);
    
    // 增加一點隨深度變化的色相偏移
    baseCol.rb *= rot(t * 0.1); 
    
    vec3 col = baseCol * glow * 0.12 * fog;
    
    // 強力爆發感：當音量極大時，畫面過曝
    col += vec3(0.8, 0.9, 1.0) * pow(u_volume_smooth, 5.0) * fog;

    // 後處理：光暈補償
    col = pow(col, vec3(0.8)); // Gamma correction 模擬
	
	// 2. 量子採樣 (Raymarching + Chromatic Aberration)
    vec3 sceneCol = col;
    float t2 = 0.0;
    
    // 這裡進行 RGB 三次步進，模擬「量子色散」效果
    for(int j=0; j<3; j++) {
        t2 = 0.0;
        float glow = 0.0;
        // 每個顏色通道稍微偏移視線方向，產生邊緣色散
        vec3 channelRd = rd + (float(j) - 1.0) * 0.005 * u_volume_smooth;
        
        for(int i=0; i<45; i++) {
            vec3 p = ro + channelRd * t2;
            float d2 = map(p, filteredVol);
            glow += (1.0 / (d2 + 0.35)) * u_volume_smooth;
            if(d2 < 0.001 || t2 > 15.0) break;
            t2 += d2 * 0.6;
        }
        
        // 賦予三原色不同的權重
        float fog = 1.0 / (1.0 + t2 * t2 * 0.08);
        if(j == 0) sceneCol.r += glow * 0.15 * fog;
        if(j == 1) sceneCol.g += glow * 0.12 * fog;
        if(j == 2) sceneCol.b += glow * 0.18 * fog;
    }

    // 3. 量子色彩美化 (Quantum Color Grading)
    // 根據 intensity 混合冷色與暖色 (青綠色與紫紅色是量子領域的經典配色)
    vec3 cool = vec3(0.0, 1.0, 0.8); // 青色
    vec3 warm = vec3(1.0, 0.0, 0.5); // 紫紅
    vec3 colorBase = mix(cool, warm, u_intensity);
    
    sceneCol *= colorBase;
    
    // 4. 加上「亞原子雜訊」增加質感
    float noise = hash(vec3(uv * 500.0, u_time)) * 0.05;
    sceneCol += noise * u_volume_smooth;

    // 5. 終極光影：對比度強化與輝光溢出
    sceneCol = smoothstep(0.0, 1.2, sceneCol);
    sceneCol += pow(u_volume_smooth, 4.0) * 0.5; // 音量峰值閃光
	
	float d = map(p, filteredVol);

	if (u_darkGlow < 0.5) {
		// 透過極坐標或 P 座標產生掃描線感
		float scanline = smoothstep(0.05, 0.0, abs(fract(p.y * 10.0) - 0.5));
		float grid = smoothstep(0.05, 0.0, abs(fract(p.x * 10.0) - 0.5));
		col += (scanline + grid) * vec3(0.0, 1.0, 0.5) * fog;
		// 讓背景完全漆黑，只留綠色線條
		col *= 0.2; 
	}
    
    gl_FragColor = vec4(col, 1.0);

}
