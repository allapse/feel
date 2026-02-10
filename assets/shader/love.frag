precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform float u_volume;
uniform float u_volume_smooth;
uniform float u_peak;
uniform vec2 u_orient;
uniform float u_intensity;
uniform float u_complexity;
uniform float u_speed;
uniform float u_darkGlow;
uniform sampler2D u_camera;
uniform float u_useCamera;

mat3 rotateX(float a) { 
	float c = cos(a), 
	s = sin(a); 
	return mat3(1.0, 0.0, 0.0, 0.0, c, s,  0.0, -s, c); 
}

mat3 rotateY(float a) { 
	float c = cos(a), 
	s = sin(a); 
	return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); 
}

// 隨機數函數
float random(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// 主函數
void main() {
	// 基礎座標校正
    vec2 uv = gl_FragCoord.xy / u_res.xy;
    vec2 p = (uv - 0.5) * 2.0;
    p.x *= u_res.x / u_res.y; // 修正比例

    // 設定模擬的 Z 軸深度 (givz)
    // 這裡我們把 givz 當作一個動態的深度基礎
    float givz = 5.0 - (0.1 + pow(u_complexity * 0.9, 3.0)) * 5.0;

    // 定義兩個粒子的 3D 位置
    vec3 pos1 = vec3(sin(u_time), cos(u_time * 0.5), sin(u_time * 0.7));
    vec3 pos2 = vec3(cos(u_time * 0.7), sin(u_time * 0.5), cos(u_time));

    // 進行 3D 旋轉 (繞 Y 軸和 X 軸)
    mat3 rot = rotateY(u_orient.x + u_time*0.1) * rotateX(u_orient.y + u_time*0.2);
    pos1 *= rot;
    pos2 *= -rot;

    // --- 關鍵步驟：透視投影 ---
    // 計算粒子旋轉後的 Z 值，並影響縮放
    // 越遠 (Z 越大) 的粒子，在螢幕上的投影位置越靠近中心
    float z1 = givz + pos1.z;
    float z2 = givz - pos2.z;
    
    vec2 proj1 = pos1.xy / z1; 
    vec2 proj2 = pos2.xy / z2;

    // 計算當前像素到投影點的距離
    // z 軸也可以影響粒子的大小 (點擴散感)
    float dist1 = length(p - proj1) * z1; 
    float dist2 = length(p - proj2) * z2;

    // 3. 共振效果（加入深度感）
    float resonance = sin(dist1 * 20.0) * sin(dist2 * 20.0) * (0.1 + 0.9 * u_intensity);

    // 3. 脆弱效果（閃爍/裂紋）
    float fragility = step(u_peak, random(uv + u_time)) * u_volume;
    resonance *= 1.0 - fragility * 0.5;

    // 4. 融合顏色（u_darkGlow 控制模式）
    vec3 color1 = vec3(1.0, 0.3, 0.3); // 溫暖（愛）
    vec3 color2 = vec3(0.3, 0.3, 1.0); // 冷靜（距離）
    vec3 mixedColor = mix(color1, color2, resonance * 0.5 + 0.5);
    if (u_darkGlow > 0.5) {
		mixedColor = mix(color1, color2, resonance);
        mixedColor += fragility; // 紫色（融合）
    }

    // 5. 攝影機紋理干擾（u_useCamera）
    vec3 camColor = texture2D(u_camera, uv).rgb;
    mixedColor = mix(mixedColor, camColor, u_useCamera * u_volume_smooth);

    // 6. 最終輸出（加入 u_volume 影響亮度）
    float brightness = 0.5 + u_volume * 0.5;
    gl_FragColor = vec4(mixedColor * brightness, 1.0);
}

