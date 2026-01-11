precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_volume;
uniform vec2 u_orient;
uniform float u_intensity;
uniform float u_complexity;
uniform float u_speed;
uniform float u_darkGlow;

#define PI 3.14159265359

mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

float hash(float n) { return fract(sin(n) * 43758.5453); }

float map(vec3 p) {
    // 1. 防止 zLoop 數值過大
    float zLoop = mod(p.z, 6.28318);
    float timeMod = u_time * (u_speed * 2.0 + 1.0);

    // 2. 防止 atan(0,0) 崩潰，加上一個極小值
    float angle = atan(p.y, p.x + 0.00001);
    
    // 兩倍鏡像
    float mirrorAngle = abs(angle);
    mirrorAngle = abs(mirrorAngle - PI * 0.5);

    // 3. 基礎隧道：確保 length(p.xy) 不會因為等於 0 而出錯
    float d_xy = length(p.xy + 0.00001);
    float tunnel = -(d_xy - (1.8 + u_volume * 0.5));

    // 4. 扭曲邏輯
    float freq = 2.0 + u_intensity * 10.0;
    float amp = 0.05 + u_complexity * 0.03;

    float wave = sin(mirrorAngle * freq + timeMod) * cos(zLoop * 2.0);
    float noise = hash(floor(p.z * 5.0 + 0.5)) * u_complexity;
    wave += sin(mirrorAngle * (freq * 1.5) - timeMod + noise) * 0.5;

    return tunnel + (wave * amp);
}

void main() {
    // 修正 1：確保 u_res 不為 0 導致除以零
    vec2 res = u_res + 0.01;
    vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.y, res.x);
    
    // 修正 2：確保 look 初始值為中心
    vec2 look = (u_orient - 0.5); 
    
    // 修正 3：相機 ro 與 射線 rd
    vec3 ro = vec3(0.0, 0.0, u_time * (u_speed * 3.0 + 1.0));
    
    // 修正 4：防止 normalize 零向量，並適度縮小 look 影響力
    vec3 dir = vec3(uv + look * 0.5, 1.0);
    vec3 rd = normalize(dir + 0.00001); 
    
    // 手機側翻
    rd.xy *= rot(look.x * 0.5);

    float t = 0.01; // 從微小距離開始步進
    float glow = 0.0;
    
    // 修正 5：步進次數調至手機最安全的 30 次
    for(int i = 0; i < 30; i++) {
        vec3 p = ro + rd * t;
        float d = map(p);
        
        // 累積亮度
        glow += 0.01 / (abs(d) + 0.015);
        
        // 修正 6：放寬碰撞距離，手機精度低，0.002 太難達成
        if (d < 0.02 || t > 20.0) break;
        t += d * 0.5;
    }
    
    vec3 baseCol = mix(vec3(0.1, 0.4, 0.8), vec3(0.6, 0.1, 0.8), sin(t * 0.2 + u_time) * 0.5 + 0.5);
    vec3 finalCol = baseCol * (glow * (0.4 + u_volume));
    finalCol = mix(finalCol, vec3(0.01, 0.02, 0.05), smoothstep(2.0, 15.0, t));

    if (u_darkGlow < 0.5) {
        float luminance = dot(finalCol, vec3(0.2126, 0.7152, 0.0722));
        finalCol = vec3(pow(1.0 - luminance, 2.0)) * vec3(0.4, 0.4, 0.0);
    }

    gl_FragColor = vec4(finalCol, 1.0);
}
