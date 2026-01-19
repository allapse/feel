precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform float u_volume;
uniform float u_volume_smooth;
uniform float u_peak;
uniform float u_intensity;   // 0.0 (深海低音) -> 1.0 (尖銳高音)
uniform float u_complexity;  // 0.0 (純音) -> 1.0 (噪訊)
uniform float u_speed;       // 飽滿度
uniform float u_darkGlow;    // 模式切換
uniform sampler2D u_camera;
uniform float u_useCamera;
uniform vec2 u_orient;       // x, y 旋轉或偏移

// 虹彩函數
vec3 spectrum(float t) {
    vec3 a = vec3(0.5, 0.5, 0.5);
    vec3 b = vec3(0.5, 0.5, 0.5);
    vec3 c = vec3(1.0, 1.0, 1.0);
    vec3 d = vec4(0.0, 0.33, 0.67, 0.1).rgb;
    return a + b * cos(6.28318 * (c * t + d + u_intensity));
}

// 旋轉矩陣
mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

void main() {
    // 基礎座標縮放
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.y, u_res.x) * 25.0;
    vec2 oriUV = gl_FragCoord.xy / u_res;
    
    // --- 加入 u_orient ---
    // 將方向參數映射到座標偏移，讓你有種「撥動」格子的感覺
    uv += u_orient * 10.0; 
    // 初始旋轉受方向影響
    uv *= rot(u_orient.x * 0.5 + u_orient.y * 0.5);
    
    // 1. 空間扭曲
    float strength = u_volume + u_peak;
    // 加上微小的數值防止除以 0
    uv *= 1.0 - (strength / (length(uv) + 0.001));
    
    // 2. 維度碎片 (7次疊加)
    // 這裡是產生「波動格子」的核心
	float fade = 1.0;
	float iterLimit = mix(7.0, 21.0, u_complexity * u_intensity * u_speed);
    for(float i = 0.0; i < iterLimit; i++) {
        uv = abs(uv) - u_complexity;
        // 旋轉隨時間與音樂重心變化
        uv *= rot(u_time * 0.1 + u_intensity * i);
		fade *= 0.95; // 每多摺疊一次，亮度衰減 20%
    }

    // 3. 核心形狀
    float ring = abs(length(uv) * u_intensity);
    float glow = (u_volume) / (ring + 0.01) * fade;
    
    // 4. 混合相機
    vec3 backColor = vec3(0.0);
    if(u_useCamera > 0.5) {
        // 讓相機畫面也參與分形的扭曲
        vec2 distortUV = oriUV + uv * u_complexity * 0.02;
        backColor = texture2D(u_camera, distortUV).rgb;
        if(u_darkGlow > 0.5) backColor *= 0.2; 
    }

    // 5. 最終演色
	// 在計算最終顏色前，把 glow 限制住
	float safeGlow = 1.0 - exp(-glow * 1.5); // 這會讓亮度在接近 1.0 時平滑下來
	vec3 soundColor = spectrum(length(uv) + u_time) * safeGlow;
    
    // 模式切換邏輯
    if(u_darkGlow < 0.5) {
        soundColor = 1.0 - exp(-soundColor * 0.8);
        soundColor *= vec3(u_intensity, 0.5, 1.0 - u_intensity);
    }

    soundColor += u_peak * 0.1 * spectrum(u_intensity);

    gl_FragColor = vec4(backColor + soundColor, 1.0);
}