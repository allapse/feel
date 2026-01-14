precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_volume;
uniform vec2 u_orient;
uniform float u_intensity;
uniform float u_complexity;
uniform float u_speed;
uniform float u_peak;
uniform float u_darkGlow;

#define PI 3.14159265359

mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

float hash(float n) { return fract(sin(n) * 43758.5453); }

float map(vec3 p) {
    // 速度影響 Z 軸相位，增加流動感
    float zLoop = mod(p.z + u_time, 6.28318);
    
    float angle = atan(p.y, p.x + 0.00001);
    float mirrorAngle = abs(abs(angle) - PI * 0.5);

    // 基礎隧道半徑
    float tunnel = -(length(p.xy + 0.00001) - 1.8);

    // Complexity (形狀): 影響波形的複雜度與振幅
    float freq = 2.0 + u_complexity * 4.0; 
    float amp = 0.05 + u_complexity * 0.4;

    float wave = sin(mirrorAngle * freq + u_time) * cos(zLoop * 2.0);
    
    // 增加細節扭曲
    float noise = hash(floor(p.z * 4.0)) * u_complexity * 2.0;
    wave += sin(mirrorAngle * freq * 1.5 - u_time + noise) * 0.5;

    return tunnel + (wave * amp);
}

void main() {
    vec2 res = u_res + 0.01;
    // Peak (震動): 在 UV 層級加入基於峰值的隨機抖動
    float shake = (hash(u_time) - 0.5) * u_peak * 0.05;
    vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.y, res.x) + shake;
    
    vec2 look = (u_orient - 0.5); 
    
    // ro 與 rd
    vec3 ro = vec3(0.0, 0.0, u_time);
    vec3 dir = vec3(uv + look * 0.5, 1.0);
    vec3 rd = normalize(dir + 0.00001); 
    rd.xy *= rot(look.x * 0.5);

    float t = 0.01;
    float glow = 0.0;
    
    for(int i = 0; i < 30; i++) {
        vec3 p = ro + rd * t;
        float d = map(p);
        
        // Volume (亮度): 影響光暈的厚度
        float glowDensity = 0.008 + u_volume * 0.012;
        glow += glowDensity / (abs(d) + 0.015);
        
        if (d < 0.02 || t > 20.0) break;
        t += d * 0.5;
    }
    
    // Intensity (顏色): 控制顏色區間的切換
    // 0.0 是深藍色調，1.0 是紫色/桃紅色調
    vec3 colA = vec3(0.05, 0.2, 0.8); // 深藍
    vec3 colB = vec3(0.8, 0.1, 0.4); // 桃紅
    
    float colorMix = clamp(u_intensity + sin(t * 0.1) * 0.2, 0.0, 1.0);
    vec3 baseCol = mix(colA, colB, colorMix);
    
    // 結合 Volume 的最終曝光
    vec3 finalCol = baseCol * (glow * (0.5 + u_volume * 1.5));
    
    // 距離衰減 (霧氣)
    finalCol *= smoothstep(20.0, 5.0, t);

    // DarkGlow 模式處理
    if (u_darkGlow < 0.5) {
        float luminance = dot(finalCol, vec3(0.2126, 0.7152, 0.0722));
        finalCol = vec3(pow(max(0.0, 1.0 - luminance), 3.0)) * vec3(0.3, 0.3, 0.1);
    }

    gl_FragColor = vec4(finalCol, 1.0);
}
