precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform float u_speed;
uniform float u_intensity;   // 顏色能量
uniform float u_complexity;  // 表面複雜度
uniform float u_volume;      // 光照強度
uniform float u_volume_smooth;
uniform float u_peak;        // 鍵結斷裂觸發
uniform vec2 u_orient;
uniform float u_darkGlow;    // 模式切換
uniform sampler2D u_camera;
uniform float u_useCamera;
uniform sampler2D u_prevFrame;

// ---- 基本 SDF ----
float sphereSdf(vec3 p, float r) {
    return length(p) - r;
}

// 簡單噪聲 (代替 FBM)
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(105.7, 68.1))) * 0.2);
}

vec2 noise2(vec2 p) {
    return vec2(hash(p), hash(p*1.3));
}

// 光照計算
vec3 lighting(vec3 p, vec3 normal, vec3 baseColor) {
    vec3 lightDir = normalize(vec3(0.5, 0.8, 0.3));
    float diff = max(dot(normal, lightDir), 0.0);
    vec3 col = baseColor * (0.5 + u_intensity);
    col += diff * vec3(1.0, 0.9, 0.8) * u_volume;
    return col;
}

float cylinderSdf(vec3 p, vec3 a, vec3 b, float r) { 
	vec3 pa = p - a; vec3 ba = b - a; 
	float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); 
	return length(pa - ba * h) - r; 
}

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

void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_res.xy) / min(u_res.x, u_res.y) * 5.0;
    uv.x *= u_res.x / u_res.y;

    vec3 ro = vec3(0.0, 0.0, 8.0);
    vec3 rd = normalize(vec3(uv, -1.5));

    float t = 0.0;
    float h = 0.0;
    vec3 p;
    int maxSteps = 100;
    float maxDist = 30.0;
    float prec = 0.001;

    // ---- Raymarch ----
	int materialID = -1; // 0=碳, 1=氫, 2=C–H 鍵, 3=H–H 殼
	vec3 col = vec3(0.0);
    for (int i = 0; i < maxSteps; i++) {
        p = ro + rd * t;

        // 初始距離設大
        float d = 100.0;
		vec3 carbon2 = vec3(0.0);
		
        // 多分子 (例如 5 顆)
        for (int m = 0; m < 20; m++) {
            // 用噪聲決定分子中心位置
            vec2 n = noise2(vec2(float(m), u_time*0.02));
			mat3 rot = rotateY(float(m) /40.0 + u_time * (u_complexity * 0.01 + 0.49)); // 隨時間旋轉
			mat3 rot2 = rotateX(float(m) /30.0 + u_time * (u_complexity * 0.02 + 0.38)); // 隨時間旋轉
            vec3 carbon = rot * rot2 * vec3(n.x*10.0-5.0, n.y*5.0-2.5, sin(u_time*0.2+float(m))*5.0);
			
			
            // 碳球
            float dC = sphereSdf(p - carbon, 0.15); 
			if (dC < d) { 
				d = dC; materialID = 0; 
			}
			
			vec3 hydrogens[4]; 
			hydrogens[0] = carbon + rot2 * rot * normalize(vec3( 0.5, 0.5, 0.5)) * (3.25 - u_complexity + float(m) * 0.001); 
			hydrogens[1] = carbon + rot2 * rot * normalize(vec3( 0.5, -0.5, -0.5)) * (3.3 - u_complexity + float(m) * 0.001); 
			hydrogens[2] = carbon + rot2 * rot * normalize(vec3(-0.5, 0.5, -0.5)) * (3.35 - u_complexity + float(m) * 0.001); 
			hydrogens[3] = carbon + rot2 * rot * normalize(vec3(-0.5, -0.5, 0.5)) * (3.4 - u_complexity + float(m) * 0.001);

            // 氫原子 + C–H 鍵 
			for (int j = 0; j < 4; j++) { 
				float dH = sphereSdf(p - hydrogens[j], 0.1); 
				if (dH < d) { 
					d = dH; materialID = 1; 
				} 
				float distCH = distance(carbon, hydrogens[j]); 
				if (distCH < 2.5) {
					float dCH = cylinderSdf(p, carbon, hydrogens[j], 0.05); 
					if (dCH < d) { 
						d = dCH; materialID = 2; 
					} 
				}
			}

            // H–H 殼 
			for (int j = 0; j < 4; j++) { 
				for (int k = j+1; k < 4; k++) { 
					float distCH = distance(carbon, hydrogens[j]); 
					if (distCH < 2.5) {
						float dHH = cylinderSdf(p, hydrogens[j], hydrogens[k], 0.025); 
						if (dHH < d) { 
							d = dHH; materialID = 3; 
						} 
					}
				} 
			}
			
			// ---- 聚合檢查 ---- 
			for (int k = m+1; k < 40; k++) { 
				float distC = distance(carbon, carbon2); 
				if (distC < 3.68) { 
					// 新增 C–C 鍵 (用 glow 表現) 
					float bondGlow = exp(-abs(distC - length(p-carbon))*0.02) * u_peak; 
					float dCC = cylinderSdf(p, carbon, carbon2, 0.0125); 
					if (dCC < d) { 
						d = dCC; materialID = 4; 
					} 
				} 
			}
			
			carbon2 = carbon;
        }

        h = d;
        if (h < prec || t > maxDist) break;
        t += h;
    }

    if (h < prec) { 
		vec3 normal = normalize(p); 
		// 不同 materialID 給不同顏色 
		vec3 baseColor; 
		if (materialID == 0) 
		baseColor = vec3(0.5, 0.5, 1.0); 
		else if (materialID == 1) baseColor = vec3(0.0, 5.0, 1.0);
		else if (materialID == 2) baseColor = vec3(1.0, 1.0, 1.0); 
		else if (materialID == 3) baseColor = vec3(0.3, 1.0, 0.3); 
		else if (materialID == 4) baseColor = vec3(1.0, 0.0, 0.0); 
		else baseColor = vec3(0.5); 
		
		col = lighting(p, normal, baseColor); 
		
		// glow 效果：由 u_peak 控制 
		float glow = exp(-length(p) * 0.3) * u_peak; 
		col += glow * vec3(1.0, 0.3, 0.2); 
	}

	vec2 uvTex = gl_FragCoord.xy / u_res;
	vec3 past = texture2D(u_prevFrame, uvTex).rgb;
	vec3 currentFrame = col;
	float glow = 0.5 + 0.5 * sin(u_speed);
	vec3 finalColor = vec3(0.0);

	if (u_darkGlow > 0.5) {
		finalColor = mix(currentFrame, past, 0.9) * glow * 1.2;

	} else {
		finalColor = mix(currentFrame, past, 0.7);
	}

	gl_FragColor = vec4(finalColor, 1.0);
}

