precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform float u_volume_smooth;
uniform float u_intensity;   
uniform float u_complexity;  
uniform float u_speed;       
uniform vec2 u_orient;
uniform float u_darkGlow;    // 模式切換
uniform sampler2D u_camera;
uniform sampler2D u_prevFrame;

// 旋轉函數
mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.y, u_res.x) *5.0;
    vec2 oriUV = gl_FragCoord.xy / u_res;

    // 1. 建立「無偏見」的初始場
    // 我們將聲音的三個維度映射為空間的三個軸 (x, y, 扭曲度)
    // 讓音樂自己去決定座標系的彎曲方式
    float angle = u_intensity * 6.2831 + u_orient.x;
    vec2 dir = vec2(cos(angle), sin(angle));
    
    // 2. 核心：全頻率波形干涉 (Interference Pattern)
    // 這裡我們不疊加固定次數，而是讓聲音的「飽滿度 (speed)」決定疊加的密度
    float d = 0.0;
    float layers = 5.0 + u_speed * 10.0; 
    
    for(float i = 1.0; i < 16.0; i++) {
        if(i > layers) break;
        
        // 這是最底層的物理：平面波干涉
        // 每一層的波長由 u_intensity 決定，擾動由 u_complexity 決定
        float freq = i * (u_intensity * 0.9 + 0.1) * 5.0;
		vec2 p = uv * rot(u_orient.y + i * 0.3);
        float wave = sin(dot(p, dir) * freq + u_time);
        
        // 讓波隨複雜度產生「相位破碎」
        wave += sin(uv.x * 10.0 * u_complexity) * u_complexity;
        
        // 能量疊加
        d += wave / i;
        
        // 旋轉座標系，讓下一層波從不同角度進入
        uv *= mat2(0.707, 0.707, -0.707, 0.707); // 45度固定旋轉，確保公平覆蓋
		
		// 讓音樂的「飽滿度」去推動鏡像的偏移距離
		uv = abs(uv) - (u_volume_smooth * 0.5);
    }

    // 3. 呈現：音樂的「張力圖」
    // d 是所有波干涉後的結果，它直接代表了這首歌在該點的「能量勢能」
    float final_map = sin(d + u_volume_smooth * 10.0);
    
    // 4. 顏色：純粹的能量映射
    // 我們不定義顏色，而是定義「光譜偏移」
    vec3 color = 0.5 + 0.5 * cos(vec3(0,2,4) + d * 2.0 + u_intensity * 5.0);
    
    // 5. 現實融合：讓現實畫面被這股「勢能」扭曲
    vec2 distortion = uv * final_map * 0.05 * u_volume_smooth;
    vec3 scene = texture2D(u_camera, oriUV + distortion).rgb;
	
	// 讀取過去
    vec3 past = texture2D(u_prevFrame, oriUV).rgb;
    
    // 這裡就是「值得」的地方：
    // 如果 mix 比例是 0.9，舊畫面會慢慢淡去，形成流動感
    // 如果加上一點點位移，畫面就會像液體一樣擴散
	vec3 emission = color * abs(final_map) * (u_volume_smooth * 0.8 + 0.2) * 5.0;
	// 將新顏色與場景先融合，再與過去的畫面做混合
	vec3 currentFrame = mix(scene, emission, 0.5); 
	vec3 finalColor = mix(currentFrame, past, 0.95);
	
	if(u_darkGlow > 0.5) {
		// Step A: 提高對比度，讓暗部深邃
		finalColor *= finalColor * 2.0; 
		
		// Step B: 定義發光色彩（根據 intensity 動態偏移）
		vec3 neon = vec3(u_intensity, 0.4, 1.0 - u_intensity);
		
		// Step C: 讓 final_map 變成銳利的發光點
		float glow = smoothstep(0.2, 0.8, abs(final_map));
		
		// Step D: 結合，並將沒發光的地方壓黑
		finalColor = finalColor * neon * glow * 5.0;
		
		// Step E: 最終曝光壓縮，維持發光質感
		finalColor = 1.0 - exp(-finalColor * 3.0);
	}

    // 最終輸出：當音樂強烈時，干涉條紋清晰且明亮；當音樂溫柔時，條紋會變寬、變慢
    gl_FragColor = vec4(finalColor, 1.0);
}
