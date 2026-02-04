uniform sampler2D u_camera;
uniform float u_useCamera;
uniform float u_darkGlow;
uniform float u_intensity;
uniform float u_speed;

varying vec3 vNormal;
varying vec3 vViewDir;
varying float vNoise;
varying vec2 vUv;
varying float vLife;

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
	
    if (u_useCamera > 0.5) {
        // 邊緣扭曲強烈，模擬厚膜折射
        vec2 distortUv = vUv + vNormal.xy * fresnel * 0.2;
        vec3 cam = texture2D(u_camera, clamp(distortUv, 0.0, 1.0)).rgb;
        color = mix(cam, rainbow, 0.3 + fresnel * 0.5);
    }
    
    // 3. 高光修正：泡泡的亮點要夠白
    float spec = pow(1.0 - d * 2.0, 20.0);

    // 4. 透明度修正：
    // 修改消失邏輯，讓它在生命週期中後段保持強健，最後才快速消失
    float fadeOut = 1.0 - pow(vLife, 10.0); 
    float bubbleAlpha = (fresnel * 0.8 + 0.2) * fadeOut;
    
    // 修正你的 finalAlpha 邏輯，確保最大值能接近 1.0
    float finalAlpha = bubbleAlpha * smoothstep(0.0, 0.1, vLife);

    gl_FragColor = vec4(color + spec * 0.8, finalAlpha * sharpCircle);
}