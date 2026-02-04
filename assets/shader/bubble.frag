uniform sampler2D u_camera;
uniform float u_useCamera;
uniform float u_darkGlow;
uniform float u_intensity;
uniform float u_speed;
uniform sampler2D u_prevFrame;

varying vec3 vNormal;
varying vec3 vViewDir;
varying float vNoise;
varying vec2 vUv;
varying float vLife;
varying vec2 vScreenUv;

void main() {
    // 1. 調整點的形狀：從模糊變銳利
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    
    // 讓邊緣更銳利：使用 pow 或 smoothstep 而非單純的 (1.0 - d)
    // 這樣粒子會看起來像紮實的小珍珠而非光暈
    float sharpCircle = smoothstep(0.5, 0.45, d); 

    // 2. 菲涅耳與彩虹
    float fresnel = pow(1.0 - dot(vNormal, vViewDir), 5.0);
    vec3 rainbow = 0.5 + 0.5 * cos(6.28 * (vNormal.y + vLife + vec3(0.0, 0.1, 0.2)));
    vec3 dustColor = vec3(1.0 - u_intensity, u_speed, u_intensity);
    
    // 讓顏色轉換更快一點，減少中心「白沫」的時間
    vec3 color = mix(dustColor, rainbow, smoothstep(0.05, 0.2, vLife));
	
	// 3. 高光修正：泡泡的亮點要夠白
    float spec = pow(1.0 - d * 2.0, 20.0);
	
    if (u_useCamera > 0.5) {
		// 1. 使用螢幕位置作為基礎，加上法線帶來的折射偏移
		// fresnel * 0.1 讓邊緣折射更強，中心更透明
		vec2 distortUv = vScreenUv + vNormal.xy * fresnel * 0.05;
		
		// 2. 移除 0.5 的限制，確保能採樣到完整鏡頭範圍
		// 加上 clamp 防止超出 0~1 邊界
		vec3 cam = texture2D(u_camera, clamp(distortUv, 0.0, 1.0)).rgb;
		
		// 3. 混合：讓泡泡中心更透明（看清鏡頭），邊緣彩虹感更強
		color = mix(cam, rainbow, 0.2 + fresnel * 0.4);
		
		// 4. 亮度補強：泡泡通常會讓背景稍微亮一點
		color += spec * 0.5; 
	}

    // 4. 透明度修正：
    // 修改消失邏輯，讓它在生命週期中後段保持強健，最後才快速消失
    float fadeOut = 1.0 - pow(vLife, 10.0); 
    float bubbleAlpha = (fresnel * 0.8 + 0.2) * fadeOut;
    
    // 修正你的 finalAlpha 邏輯，確保最大值能接近 1.0
    float finalAlpha = bubbleAlpha * smoothstep(0.0, 0.1, vLife);
	
	// 讀取過去
    vec3 past = texture2D(u_prevFrame, vUv).rgb;
    color = mix(color + spec * 0.8, past, 0.7);

    gl_FragColor = vec4(color, finalAlpha * sharpCircle);
}