precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform float u_volume_smooth;
uniform float u_peak;
uniform float u_intensity;   
uniform float u_complexity;  
uniform float u_speed;       
uniform vec2 u_orient;
uniform sampler2D u_camera;

// 利用質數構造的非週期性向量 (Primes: 13, 17, 19, 23, 29...)
const vec3 p1 = vec3(13.1, 17.3, 19.7);
const vec3 p2 = vec3(23.9, 29.1, 31.7);

mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.y, u_res.x);
    vec2 oriUV = gl_FragCoord.xy / u_res;
    
    // 1. 動態步長：利用質數與聲音重心建立「空間步長」
    // 這讓每一秒鐘的空間結構都因為質數的干涉而不重複
    float step_factor = mix(p1.x, p2.z, u_intensity);
    
    // 2. 完全動態迭代：讓聲音的「複雜度」直接定義「空間維度」
    // 我們不寫死迭代次數，而是讓它在 5 到 15 之間隨音樂性質浮動
    float iter = 5.0 + floor(u_complexity * 10.0);
    
    float orbit = 0.0;
    float dist = length(uv);

    for(float i = 0.0; i < 15.0; i++) {
        if(i >= iter) break;

        // 空間反轉與質數偏移
        // 這裡不再用 0.5，而是用質數的比例，徹底打破「格子」
        uv = abs(uv) / dot(uv, uv) - (p1.xy / p2.xy) * u_speed;
        
        // 旋轉：旋轉量由 i 加上重心與方向共同決定
        // 質數 1.618 (黃金比例近似) 配合 u_orient 讓對稱軸不斷飄移
        uv *= rot(u_time * 0.01 + i * 1.618 + u_orient.x);
        
        // 軌跡捕捉：捕捉每一次迭代中空間的「張力」
        orbit += log(length(uv) + 1.1);
    }

    // 3. 現實映射：讓聲音的「厚度」決定相機畫面的「折射深度」
    // 使用 fract(orbit) 創造出類似等高線的視覺效果，這能反映質數分布的細節
    float shade = fract(orbit * 0.5 + u_time * 0.1);
    
    // 4. 顏色：不再用預設顏色，讓質數向量 p1, p2 決定色彩通道
    vec3 color = sin(p1 * orbit * 0.1 + u_intensity * 6.28) * 0.5 + 0.5;
    color *= shade;

    // 結合相機：相機畫面只在「能量邊界」出現
    vec3 cam = texture2D(u_camera, oriUV + uv * 0.01).rgb;
    vec3 finalRGB = mix(cam, color, u_volume_smooth);
    
    // 5. 強度修正：讓 Peak 決定最後的「數學清晰度」
    finalRGB += (1.0 - smoothstep(0.0, 0.1, abs(shade - 0.5))) * u_peak;

    gl_FragColor = vec4(1.0 - exp(-finalRGB * 2.0), 1.0);
}