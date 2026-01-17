precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform float u_volume;
uniform float u_volume_smooth; // 控制亮度
uniform float u_peak;          // 控制震動 (需確保 JS 有傳入此 Uniform)
uniform vec2 u_orient;
uniform float u_intensity;     // 控制顏色
uniform float u_complexity;    // 控制形狀/網格密度
uniform float u_speed;         // 控制時間流速
uniform float u_darkGlow;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
    // 1. 座標基礎設定
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_res) / min(u_res.x, u_res.y) * 3.0;
    
    // --- PEAK 控制震動 ---
    // 利用 peak 產生瞬間的縮放與位移感
    float vibration = u_peak * 0.95; 
    uv += (hash(uv + u_time) - 0.5) * vibration; // 隨機震盪
    uv *= 1.0 - vibration; // 瞬間縮放
    
    // 陀螺儀重心偏移
    vec2 drift = u_orient * 0.4;
    vec2 p = uv - drift;
    float d = length(p);

    // --- SPEED 控制時間 ---
    float time = u_time * 0.1;

    // --- COMPLEXITY 控制形狀 ---
    // 網格密度隨 complexity 變化，並產生扭曲
    float shapeNoise = sin(d * 5.0 - time) + pow(u_complexity * 10.0, 3.0);
    float gridFactor = 8.0 + pow(u_complexity * 10.0, 3.0);
	// 讓 gridFactor 會隨音樂 Peak 抖動
	gridFactor *= (1.0 + u_peak * 1.5);
    
    // 旋轉矩陣
    float rot = time * 0.2 + d * u_complexity;
    mat2 m = mat2(cos(rot), -sin(rot), sin(rot), cos(rot));
    p *= m;

    // 在 p *= m; 旋轉之後，計算網格 id 之前加入：
	// 這會打破完美的同心圓，讓它變成「螺旋狀的數位廢墟」
	float spiral = sin(d * 20.0 - u_time * 5.0) * u_complexity;
	p += (p / d) * spiral * 0.1; 

	vec2 g_id = floor(p * gridFactor);
    vec2 g_uv = fract(p * gridFactor) - 0.5;
	float distortion = sin(u_time * u_speed + d * 10.0) * u_peak;
	p += (g_uv * distortion * u_intensity);
	

    // --- VOL 控制亮度 ---
    float h = hash(g_id);
    float flicker = pow(u_volume * 3.0, 2.0) * 0.5;
	float brightness = smoothstep(0.9 - flicker, 1.0, h);
    
    // 粒子形狀
    float circ = smoothstep(0.4, 0.0, length(g_uv));
    
    // --- INTENSITY 控制顏色 ---
    // 從青藍色 (Low) 到 亮橘紅色 (High)
    vec3 colA = vec3(0.0, 0.5, 1.0); // 冷
    vec3 colB = vec3(1.0, 0.2, 0.0); // 熱
    vec3 baseCol = mix(colA, colB, u_intensity);
    
    // 最終色彩計算
    vec3 finalCol;
    if (u_darkGlow > 0.5) {
        // --- 亮模式修正：強化侵蝕刻痕 ---
    
		// 1. 強制放大粒子感 (讓微小的點也能被看見)
		// 即使 gridFactor 極大，我們也讓點的邊緣變硬
		float edge = 0.5 + u_complexity * 0.4; 
		float stroke = smoothstep(edge, edge - 0.2, length(g_uv));
		
		// 2. 增加顯現機率 (讓 brightness 不要那麼邊緣)
		// 當 complexity 高時，讓更多粒子參與減法
		float coverage = 0.6 - u_complexity * 0.4; // 越複雜，覆蓋率越高
		float visibleSource = smoothstep(coverage, coverage + 0.05, h);
		
		// 3. 減法運算 (這就是你的侵蝕色彩)
		// 我們讓 baseCol 決定「挖出來的洞是什麼顏色」
		vec3 erosionColor = stroke * visibleSource * (vec3(1.0) - baseCol * 0.8);
		
		// 4. 增加 Peak 震動導致的「污漬感」
		float pulseDirty = u_peak * 0.2;
		
		// 最終混合：底色 - (侵蝕深度)
		finalCol = vec3(0.95) - (erosionColor * (1.0 + u_volume_smooth));
		finalCol -= d * (0.15 + pulseDirty); // 邊緣陰影隨震動擴散
    } else {
        // 暗模式 (發光感)
        finalCol = circ * brightness * baseCol * (1.5 + u_volume_smooth);
        finalCol += baseCol * (0.05 / d) * u_volume_smooth; // 中心光暈
    }

    gl_FragColor = vec4(finalCol, 1.0);

}
