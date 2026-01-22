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
uniform sampler2D u_prevFrame;

varying vec2 vUv;

// 簡單旋轉矩陣
mat3 rotateY(float a){
    float c = cos(a);
    float s = sin(a);
    return mat3(
        c, 0.0, -s,
        0.0,1.0,0.0,
        s,0.0,c
    );
}
mat3 rotateX(float a){
    float c = cos(a);
    float s = sin(a);
    return mat3(
        1.0,0.0,0.0,
        0.0,c,-s,
        0.0,s,c
    );
}

// 將 float -> N 級數位化
float quantize(float x, float levels){
    float q = floor(x * levels) / levels;
    return q + 2.0/levels; // 保留最小亮度
}
vec3 quantizeVec3(vec3 v, float levels){
    return vec3(quantize(v.r, levels),
                quantize(v.g, levels),
                quantize(v.b, levels));
}

// Main
void main() {
    vec2 uv = gl_FragCoord.xy / u_res * 1.0;
	float qLevel = pow(0.1 + 0.9 * u_intensity * u_complexity, 3.0) * 256.0;

    // --- Camera / Past feedback ---
    vec3 cam = texture2D(u_camera, uv).rgb;
    vec3 past = texture2D(u_prevFrame, uv).rgb;; // 可以改成單獨 u_prevFrame
    vec3 camDigital = quantizeVec3(cam, qLevel);
    vec3 pastDigital = quantizeVec3(past, qLevel);

    // --- Mic 音量數位化 ---
    float micDigital = quantize(u_volume_smooth, qLevel);

    // --- orientation rotation ---
    mat3 rot = rotateY(u_orient.x + u_time * 0.1) *
               rotateX(u_orient.y + u_time * 0.2);

    // --- 粒子位置（模擬分子雲） ---
    vec3 particle = rot * normalize(vec3(uv - 0.5, 1.0)) * (0.5 + pow(u_complexity * 1.2, 2.0));

    // --- 數位化顏色計算 ---
    vec3 color = vec3(0.0);
	
    if(u_darkGlow>0.5){
		float attention = clamp(pow(length(camDigital - pastDigital)*2.0, 1.5), 0.0, 1.0);
		color = mix(camDigital, pastDigital, attention); // 大腦「選擇性加強」
	} else {
		color = camDigital * 0.2 + pastDigital * 0.8;
	}
	
	color += micDigital * u_volume; // 音量控制亮度
	
     // 非線性數位化
    color = quantizeVec3(pow(color, vec3(0.8)), qLevel);

    gl_FragColor = vec4(abs(particle) * normalize(color),1.0);
}
