precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform float u_volume_smooth;
uniform float u_peak;
uniform float u_intensity;   
uniform float u_complexity;  
uniform float u_speed;       
uniform vec2 u_orient;
uniform float u_darkGlow;    // 模式切換
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
    
    // 1. 將迭代次數改為浮點數，不使用 floor
    float targetIter = 2.0 + u_complexity * 7.0;
    
    float orbit = 0.0;
    for(float i = 0.0; i < 15.0; i++) {
		// 計算每一層的貢獻權重，讓第 N+1 層慢慢浮現
		float weight = clamp(targetIter - i, 0.0, 1.0);
		if(weight <= 0.0) break; 

		if(u_darkGlow < 0.5) {
			// 保護措施：防止 dot(uv, uv) 趨近於 0 導致的畫面瞬間噴發
			uv = abs(uv) / (dot(uv, uv) + 0.01) - (p1.xy / p2.xy);
		}
		else {
			uv = abs(uv) / (dot(uv, uv)) - (p1.xy / p2.xy);
		}
		
		uv *= rot(u_time * 0.01 + i * 1.618 + u_orient.x);
		
		// 軌跡捕捉也乘上權重
		orbit += log(length(uv) + 1.1) * weight;
	}

    // 3. 現實映射：讓聲音的「厚度」決定相機畫面的「折射深度」
    // 使用 fract(orbit) 創造出類似等高線的視覺效果，這能反映質數分布的細節
    float shade = fract(orbit * 0.5 + u_time * 0.1);
    
    // 4. 顏色：不再用預設顏色，讓質數向量 p1, p2 決定色彩通道
    vec3 color = sin(p1 * orbit * 0.1 + u_intensity * 6.28) * 0.5 + 0.5;
    color *= shade;

    // 結合相機：相機畫面只在「能量邊界」出現
    vec3 cam = texture2D(u_camera, oriUV + uv * 0.01).rgb;
    vec3 finalColor = mix(cam, color, u_volume_smooth * 0.5 + 0.5);
    
    // 5. 強度修正：讓 Peak 決定最後的「數學清晰度」
    finalColor += (1.0 - smoothstep(0.0, 0.1, abs(shade - 0.5))) * u_peak;
	
    gl_FragColor = vec4(1.0 - exp(-finalColor * 2.0), 1.0);
}
