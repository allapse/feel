precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform float u_volume;
uniform float u_volume_smooth;
uniform float u_peak;
uniform vec2 u_orient;      // x: 左右旋轉, y: 縮放
uniform float u_intensity;  
uniform float u_complexity; 
uniform float u_speed;
uniform float u_darkGlow;
uniform sampler2D u_camera;
uniform float u_useCamera;

// 偽隨機函數
vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123) * u_intensity * u_complexity * u_speed * u_volume * u_peak;
}

// 梯度噪點 (Gradient Noise)
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f) * 1.2 ;
    return mix(mix(dot(hash(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
                   dot(hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
               mix(dot(hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                   dot(hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
}

// 核心：分形扭曲 (Domain Warping)
float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    // 複雜度 (u_complexity) 決定細節層數
    int octaves = int(3.0 +  pow(5.0, u_complexity * 5.0)); 
    for (int i = 0; i < 8; i++) {
        if (i >= octaves) break;
        v += a * noise(p);
        p *= 2.0;
        a *= 0.5;
    }
    return v;
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_res / 3.0;
    uv.x *= u_res.x / u_res.y;

    // 陀螺儀影響
    uv += u_orient * 0.2;

    // 領域扭曲邏輯：讓空間自己扭動
    vec2 q = vec2(0.0);
    q.x = fbm(uv + 0.1 * u_time);
    q.y = fbm(uv + vec2(1.0));

    vec2 r = vec2(0.0);
    // u_volume 影響扭曲的深度
    r.x = fbm(uv + 1.0 * q + vec2(1.7, 9.2) + 0.15 * u_time);
    r.y = fbm(uv + 1.0 * q + vec2(8.3, 2.8) + 0.126 * u_time);

    float f = fbm(uv + r);

    // 顏色設計
    vec3 colorA, colorB;
    
    if (u_darkGlow > 0.5) {
        // 模式 1：深淵黑金 (Dark Mode)
        colorA = vec3(0.02, 0.02, 0.05);
        colorB = vec4(vec3(0.8, 0.5, 0.2) * u_intensity, 1.0).rgb; // 金色受重心影響
    } else {
        // 模式 2：大理石白 (Light Mode)
        colorA = vec3(0.95, 0.95, 1.0);
        colorB = vec3(0.4, 0.5, 0.6) * (1.0 - u_intensity); // 翡翠色
    }

    // 最終混合
    vec3 col = mix(colorA, colorB, clamp((f * f) * 4.0, 0.0, 1.0));

    // 加入 Peak 閃光：當重音來時，裂紋發光
    col += (f * f * f * 1.5) * u_peak * vec3(1.0, 0.9, 0.7);

    // 邊緣壓暗 (Vignette) 受 volume 影響
    float vgn = smoothstep(1.5, 0.5 - u_volume * 0.2, length(uv));
    col *= vgn;
	
	// 2. 處理現實世界的畫面
    vec3 sceneColor;
	// 3. 融合法則 (The Manifestation Rule)
    // 我們讓大理石的「裂縫」(f 的高值處) 透出現實世界的畫面
    vec3 marbleBase = mix(colorA, colorB, f); 
    // --- 尋找隱藏的窗格 ---
    // 使用 f 的平方來增強對比度，這會讓大理石的紋路邊界變得很清晰
    // 這就是你看到的「窗格玻璃」邊緣
    float kaleidoscopeMask = pow(f, 2.0) * 2.0; 
    kaleidoscopeMask = clamp(kaleidoscopeMask, 0.0, 1.0);
    
    // --- 2. 處理現實世界的畫面與融合 ---
    vec3 finalCol;
    
    // 找到大理石的「窗口」：讓鏡頭畫面只出現在特定紋理區域
    float mask = smoothstep(0.4, 0.7, f); 

    if (u_useCamera > 0.5) {
        vec2 camUV = gl_FragCoord.xy / u_res;
        camUV.x = 1.0 - camUV.x; // 翻轉
        
        // 讓鏡頭畫面產生「折射」
        // 使用 r (你代碼中最後一層扭曲) 來偏移鏡頭 UV
        // 這樣鏡頭看起來會像是隔著你那層「窗格玻璃」看出去的
        vec2 refractUV = camUV + r * 0.05 * u_volume;
        vec3 cam = texture2D(u_camera, refractUV).rgb;
        
        // 處理鏡頭顏色
        //vec3 sceneColor = mix(vec3(dot(cam, vec3(0.299, 0.587, 0.114))), cam, u_intensity);

        // --- 核心融合：讓鏡頭成為大理石的「質地」 ---
        // 我們不只是蓋上去，而是讓大理石顏色與鏡頭顏色「相乘 (Multiply)」
        // 這樣鏡頭會出現在大理石亮部，且帶有大理石的色澤
        //vec3 blended = mix(marbleBase, sceneColor * colorB * 2.0, kaleidoscopeMask);
		
		finalCol = marbleBase + cam * 0.5;
        
        // 疊加模式 (Additive) 讓 Peak 來時更有衝擊力
        //finalCol = blended + (sceneColor * u_peak * 0.5);
    } else {
        finalCol = col;
    }

    gl_FragColor = vec4(finalCol, 1.0);
}
