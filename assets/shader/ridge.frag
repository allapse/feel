precision highp float;

// 你的控制面板
uniform vec2 u_res;
uniform float u_time;
uniform float u_volume;
uniform float u_intensity;   
uniform float u_complexity;
uniform float u_speed;
uniform sampler2D u_camera;
uniform sampler2D u_prevFrame;
uniform vec2 u_orient;
uniform float u_darkGlow;
uniform float u_peak;

// 1. 關鍵的雜訊函數 (生成山脈的基礎)
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    
    // 使用 Hermite 插值 (讓過渡更平滑)
    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(mix(hash(i + vec2(0.0, 0.0)), 
                   hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), 
                   hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// 將沙子變成山脈的核心函數
float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    // 使用你的 u_complexity (Flatness) 來決定細節度，避免像沙子
    int octaves = int(mix(8.0, 3.0, u_complexity)); 
    
    for (int i = 0; i < 8; i++) {
        v += amp * noise(p);
        p *= 2.0;    // 頻率翻倍
        amp *= 0.5;  // 振幅衰減
    }
    return v;
}

// 修正後的 FBM：產生尖銳的山脊
float ridgeFBM(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 7; i++) {
        // 核心改動：取絕對值的反轉，製造尖銳感
        float n = noise(p);
        v += amp * (1.0 - abs(n * 2.0 - 1.0));
        p *= 2.2;
        amp *= 0.5;
    }
    return v;
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_res.xy;
    vec3 finalCol = vec3(0.0);

    // --- 1. 餘暉迴圈 (Atmospheric Glow) ---
    // 利用 u_intensity (重心) 讓紅色層層堆疊
    vec3 skyBase = vec3(0.02, 0.02, 0.1); // 深夜底色
    vec3 sunset = vec3(0.7, 0.2, 0.7 * u_darkGlow) * u_intensity;
    for(int i = 0; i < 9; i++) {
        float offset = float(i) * 0.2;
        float grad = pow(1.0 - uv.y + offset, 2.0);
        skyBase = mix(skyBase, sunset, grad * 0.05);
    }
    finalCol = skyBase;

    // --- 2. 山脈迴圈 (Mountain Range - 中景) ---
    // 速度慢，稜線尖銳
    for(int i = 1; i <= 7; i++) {
        float fi = float(i);
        float speed = u_time * (0.05 * fi); // 視差
        float scale = 1.0 + fi * 0.2;
        // 取得尖銳山脊雜訊
        float h = ridgeFBM(vec2(uv.x * scale + speed, sqrt(fi * 12.3))) * (0.4 / fi);
        float mask = step(uv.y, h + 0.2 + (0.01 * fi));
        
        // 顏色隨層數變深 (大氣透視)
        vec3 mCol = mix(vec3(0.05, 0.02, 0.1), vec3(0.15, 0.075, 0.15), fi * 0.2);
        finalCol = mix(finalCol, mCol, mask);
		
		if (u_darkGlow > 0.5) {
			// 在山脊邊緣產生暗色光暈
			float edge = smoothstep(h + 0.2, h + 0.22, uv.y);
			finalCol += vec3(0.1, 0.1, 0.2) * (1.0 - edge) * u_volume;
		}
    }
	
    // --- 3. 森林迴圈 (Forest/Foreground - 近景) ---
    // 速度快，形狀碎，用 u_complexity (流量) 增加擾動
    for(int i = 1; i <= 3; i++) {
        float fi = float(i);
        float speed = u_time * (0.4 + fi * 0.2); // 飛速後移
        float forestScale = 5.0 + fi * 0.3;
        // 森林用一般的雜訊疊加，看起來比較碎
        float h = fbm(vec2(uv.x * forestScale + speed, fi * 23.7)) * (0.4 / fi);
        
        // 加入音樂抖動 (u_complexity)
        h += u_complexity * 0.01 * fi; 
        
        float mask = step(uv.y, h + 0.05 * fi);
        
        // 近景幾乎是純黑影
        vec3 fCol = vec3(0.05  + u_darkGlow * 0.5, 0.15, 0.1) * (1.0 / fi);
        finalCol = mix(finalCol, fCol, mask);
		
		if (u_darkGlow > 0.5) {
			// 在山脊邊緣產生暗色光暈
			float edge = smoothstep(h + 0.2, h + 0.22, uv.y);
			finalCol += vec3(0.1, 0.1, 0.2) * (1.0 - edge) * u_volume;
		}
    }
	
	if (u_peak == 1.0) {
		// 建立一個傾斜的座標系
		float angle = 0.78 + u_complexity - u_speed; // 約 45 度
		mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
		
		for(int j = 0; j < 2; j++) {
			float fj = float(j);
			// 隨機軌道：利用 hash 讓每一顆的位置與出現時間不同
			vec2 seed = vec2(fj * 1.0, floor(u_time * 0.2));
			float randPos = hash(seed);
			
			// 計算流星位置：x 隨時間移動，y 隨 x 偏移
			vec2 meteorPos = uv;
			meteorPos.x += u_time * 2.0; // 移動速度
			meteorPos.y += u_time * 2.0 * u_peak; 
			meteorPos += vec2(randPos * u_intensity, randPos * u_complexity); // 隨機初始位置
			
			vec2 p = fract(meteorPos * (0.3 + u_peak * 0.1)) - 0.5; // 局部座標
			p = rot * p; // 旋轉讓它朝向正確

			// 隕石核心 (Head)
			float head = smoothstep(0.001, 0.0, length(p - vec2(0.0, 0.0)));
			
			// 燃燒拖尾 (Fire Trail)
			// 利用 noise 加上 u_complexity 讓尾巴晃動
			float fireNoise = noise(vec2(p.x * 10.0 - u_time * 20.0, p.y * 5.0));
			float trail = smoothstep(0.5, -0.5, p.x) * smoothstep(0.1 + fireNoise * 0.1, 0.0, abs(p.y));
			trail *= u_peak; // 越噴越長

			// 顏色混色：白心 -> 橙紅邊 -> 煙霧黑
			vec3 fireCol = mix(vec3(0.2, 0.02, 0.0) + u_darkGlow, vec3(1.0, 0.9, 0.5) * (1.0 - u_darkGlow), head);
			finalCol += fireCol * (head + trail * 0.8) * u_peak;
		}
	}

    vec3 processedCol = finalCol;

	// 模式 1：冰封雪夜 (Cyan/Blue)
	if (u_darkGlow + u_peak == 2.0) {
		processedCol = vec3(dot(finalCol, vec3(0.299, 0.587, 0.114))); // 先轉灰階
		processedCol *= vec3(0.4, 0.7, 1.0); // 染上冰藍色
	} 
	// 模式 2：賽博荒野 (Green/Purple)
	else if (u_darkGlow + u_peak == 1.0) {
		processedCol.rb = finalCol.br; // 交換紅藍通道，產生異界感
		processedCol *= vec3(0.8, 1.2, 0.8);
	}
	else {
		processedCol = finalCol;
	}

	// 效能關鍵：最後補一個簡單的對比度強化，這比在迴圈裡算好幾次強
	processedCol = smoothstep(0.0, 1.0, processedCol);

	// --- 5. 終極後處理與復古特效 ---
	vec3 finalEffectCol = processedCol;

	// A. 掃描線 (Scanlines)：利用 uv.y 的正弦波產生
	float scanline = sin(uv.y * u_res.y * 1.5) * 0.04;
	finalEffectCol -= scanline;

	// B. 螢幕暗角 (Vignette)：讓邊緣變暗，增加壓抑感
	float vignette = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
	vignette = pow(vignette * 15.0, 0.25);
	finalEffectCol *= vignette;

	// C. 隨機噪點 (Grain)：讓畫面像老電影
	float grain = (hash(uv + u_time) - 0.5) * 0.05;
	finalEffectCol += grain;

	// D. 色彩飽和度增益 (利用 u_peak)：重音來時畫面會稍微閃白
	finalEffectCol += vec3(0.05, 0.02, 0.0) * u_peak;

	// E. 最終對比度優化 (防止過曝)
	finalEffectCol = pow(finalEffectCol, vec3(1.1));
	
	// --- 1. 色散偏移 (Chromatic Aberration) ---
    // 當 peak 為 1.0 時，紅藍通道會震開，產生視覺衝擊
    float aberration = u_peak * 0.0005;
    vec3 col;
    // 這裡我們暫時用簡化邏輯模擬，實務上需多次採樣，但在單次 pass 中我們用偏移座標代替
    vec2 uvR = uv + vec2(aberration, 0.0);
    vec2 uvB = uv - vec2(aberration, 0.0);
    
    // --- 2. 核心繪製：三層視差山脈與森林 (簡化流程) ---
    // [此處承接之前的 3 個 for 迴圈邏輯，並使用 uvR/uvB 混合]
    // 為了效能，我們直接在計算結果上疊加
    
    vec2 eyePos = uv - vec2(0.5, 0.7);
    float eyeDist = length(eyePos);
    float eyeSize = 0.05 + u_peak * 0.1;
    float eyeGlow = smoothstep(eyeSize, 0.0, eyeDist);
    vec3 eyeCol = vec3(1.0, 0.0, 0.0) * eyeGlow * (u_intensity + 0.5);

	gl_FragColor = vec4(finalEffectCol + eyeCol, 1.0);

}

