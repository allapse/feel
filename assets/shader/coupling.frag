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
    // 找到大理石的「暗部」或「紋路深處」作為窗口
	// 1.0 - f 會選取 fbm 的低值區
	float mask = smoothstep(0.4, 0.7, f); 

	if (u_useCamera > 0.5) {
		// 讓鏡頭畫面不要只是單純疊加，而是像「浮雕」一樣被刻在紋理裡
		// 我們用 sceneColor 取代原本 marbleBase 的一部分
		vec3 mixedScene = mix(sceneColor, marbleBase * sceneColor * 2.0, 0.5); // Multiply 模式增加質感
		finalCol = mix(marbleBase, mixedScene, mask);
	} else {
		finalCol = col; // 使用你原本計算好的 col
	}

    // 4. 最後加上 Peak 的光芒
    finalCol += u_peak * 0.2 * sceneColor;

    gl_FragColor = vec4(finalCol, 1.0);
}
