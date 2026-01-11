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

void main() {
    // 1. 座標歸一化
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_res.xy) / min(u_res.y, u_res.x);
    
    // --- 視角偏轉優化版 ---
	vec2 look = (u_orient - 0.5) * 0.8; 

	// 讓 uv 根據 look 產生透視形變
	vec2 p = uv;
	float r = length(p);
	p.x += look.x * (r * 0.5) * 2.0; // 越往外圈偏越多
	p.y += look.y * (r * 0.5) * 2.0;

	float angle = atan(p.y, p.x);

	// 加上旋轉感：根據 look.x 讓整個隧道產生輕微傾斜
	angle += look.x * 0.2;
    float depth = 1.0 / (r + 0.01); 
	
	// 這裡模擬視角轉向：離中心越遠（depth 越小），位移量越大
	p += look * (depth * 0.5); 
    
    // 4. 建立紋理與控制參數
    float forward = depth + u_time * (u_speed * 10.0 + 5.0);
    
    // 使用 u_complexity 控制隧道壁的瓣數
    float sides = floor(6.0 + u_intensity * 20.0);
    
    // 使用 u_intensity 控制花紋的分散/銳利度
    float spread = 0.5 - (u_complexity * 0.03);
    
	float symmetryAngle = abs(angle);
	float noise = sin(angle * 2.0) * u_time;
    float stripes = sin(symmetryAngle * sides + u_time + noise) * sin(forward);
	float stripes2 = sin(symmetryAngle * (sides * 2.0) - u_time * 0.5) * 0.5;
    float pattern = smoothstep(spread, spread + 0.1, stripes + stripes2);
    
    // 5. 色彩計算 (原本的 col)
    vec3 baseCol = mix(vec3(0.0, 0.4, 0.8), vec3(0.8, 0.1, 0.6), sin(depth * 0.2 + u_time) * 0.5 + 0.5);
    
    // 結合音量與圖案
    float pulse = 1.0 + u_volume_smooth * 0.8;
    vec3 finalCol = baseCol * pattern * pulse;
    
    // 6. 模擬光暈 (glow)
    // 這裡我們手動計算一個中心發光效果來代替原本未定義的 glow
    float centerGlow = pow((0.1 / (r + 0.05)),2.0)+ u_complexity * 0.1;
    finalCol += vec3(0.2, 0.6, 1.0) * centerGlow;
    
    // 邊緣壓暗 (Vignette)
	float outerEdge = 1.2 + u_intensity * 0.4;
    finalCol *= smoothstep(1.9, 0.01, r);

    // 7. DarkGlow 模式切換
    // 注意：這裡改成 u_darkGlow > 0.5 表示開啟特殊模式
    if (u_darkGlow < 0.5) {
		// 1. 計算灰階亮度 (標準權重：綠色佔比最高，因為人眼對綠色最敏感)
		float luminance = dot(finalCol, vec3(0.2126, 0.7152, 0.0722));
		
		// 2. 反相並調整對比度
		float invLum = pow(1.0 - luminance, 2.5); // 提高到 2.5 讓黑色更純，綠色更亮
		
		// 3. 設定為駭客綠：
		// R: 0.0, G: 1.0, B: 0.2 (帶一點點青色的螢光綠最像)
		finalCol = vec3(invLum) * vec3(0.0, 1.0, 0.3);
		
		// 加分項目：增加一點點掃描線感
		finalCol *= 0.8 + 0.2 * sin(gl_FragCoord.y * 1.5 + u_time * 10.0);
	}

    gl_FragColor = vec4(finalCol, 1.0);
}
