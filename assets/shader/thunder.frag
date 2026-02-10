precision highp float;

varying vec2 v_uv;
varying vec2 v_centered_uv;

uniform vec2 u_res;
uniform float u_time;
uniform float u_volume;
uniform float u_volume_smooth;
uniform float u_peak;
uniform float u_intensity;
uniform vec2 u_orient;
uniform float u_complexity;
uniform float u_darkGlow;
uniform float u_speed;
uniform sampler2D u_camera;
uniform float u_useCamera;
uniform sampler2D u_prevFrame;

mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

// 熱力圖配色函數：輸入 0~1，輸出彩虹色
vec3 heatmap(float t) {
    // 經典的偏振/熱力圖公式
    return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.67, 0.33, 0.0)));
}

void main() {
    // 增加不合理點 1：視線扭曲
    // 讓視線在邊緣產生輕微的魚眼畸變
    // 1. 極座標轉換 (不合理的第一步)
    float r = length(v_centered_uv);
    float a = atan(v_centered_uv.y, v_centered_uv.x);
    
    // 讓半徑產生隨音量震動的「黑洞引力」
    r = pow(r, 0.5 + u_volume_smooth * 0.5); 
    
    // 把極座標轉回類 3D 空間視線
    vec3 rd = normalize(vec3(cos(a) * r, sin(a) * r, 1.0));
    vec3 ro = vec3(0.0, 0.0, -1.0);
    
    // 模擬擺弄：旋轉空間（加入隨機微震動）
    float shake = u_peak * 0.1;
    rd.yz *= rot(u_orient.y * 1.3 + u_time * 0.05 + shake);
    rd.xz *= rot(u_orient.x * 1.5 + u_time * 0.03);
    
    vec3 finalCol = vec3(0.0);
    
    // 2. 無限反射迭代
    for (float i = 0.0; i < 6.0 + 18.0 * u_speed; i++) {
        float fi = float(i);
        vec3 p = ro + rd * (fi * 0.12);
        
        // 增加不合理點 2：呼吸摺疊
        // foldSize 隨音量與時間擺動
        float foldSize = (0.4 + u_intensity * 0.4) + sin(u_time * 0.5) * 0.1;
        foldSize += u_volume_smooth * 0.2; 

        for (float j = 0.0; j < 3.0 + 4.0 * u_speed; j++) { 
            p = mix(abs(p), vec3(1.0), (1.0 - sqrt(u_complexity)) * 0.5) - foldSize;
            // 增加不合理點 3：非線性旋轉
            // 越深層的空間旋轉越快，產生螺旋感
            p.xy *= rot(u_time * 0.03 + fi * 0.005 + float(j) * 0.03);
            p.yz *= rot(u_time * 0.05 + fi * 0.003 + float(j) * 0.05);
            
            // 加入空間畸變：讓線條不是直的
            p += sin(p.zxy * 2.0 + u_time) * 0.05;
        }
        
        // 線條計算
        float d = min(length(p.xy), min(length(p.yz), length(p.xz)));
        float thickness = 0.003 + u_volume * 0.02;
        float glow = thickness / (d + 0.004);
        
        vec3 col;
		float beam = 0.01 / abs(p.x * p.y);
		vec3 neon = vec3(0.2, 0.6, 1.0) * (0.5 + 0.5 * sin(u_time + float(i)));
		col = neon * beam * (0.1 + u_volume_smooth) * 2.0;
		
        if (u_useCamera > 0.5) {
            vec2 camUV = fract(p.xy + 0.5);
            col *= (1.0 - texture2D(u_camera, camUV).rgb);
		}
        
        float fade = pow(0.88, fi);
        
        // 色散模擬：對 RGB 進行微小的位置偏移
        finalCol.r += col.r * fade * 1.1;
        finalCol.g += col.g * fade;
        finalCol.b += col.b * fade * 0.9;
		
		if(u_darkGlow > 0.5){
			float lineMatch = smoothstep(0.2, 0.0, d);
			float colorIndex = fi * 0.2 + d * 2.0 - u_time * 0.2;
            finalCol += pow(heatmap(colorIndex) * lineMatch, vec3(0.8));
		}
        
        if (fade < 0.02) break; 
    }
    
    // 5. 後處理
    float vignette = smoothstep(1.2, 0.3, length(v_centered_uv));
    finalCol *= (vignette);
	
    // 增加不合理點 5：時間殘影拖累
    // 這裡我們不只混色，我們讓過去的畫面帶有一點點色彩偏移
    vec3 past = texture2D(u_prevFrame, v_uv).rgb;
    finalCol = mix(finalCol, past, 0.3 + pow(u_speed, 3.0) * 0.2); 
    
    gl_FragColor = vec4(finalCol * (0.3 + 0.3 * u_intensity), 1.0);
}