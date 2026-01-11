precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_volume;
uniform float u_volume_smooth;
uniform float u_last_volume;
uniform vec2 u_orient;
uniform float u_intensity;
uniform float u_complexity;
uniform float u_speed;
uniform float u_darkGlow;

// --- 工具函數 ---
mat2 rot(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
}

float map(vec3 p) {
    float tunnel = -(length(p.xy) - 1.5);
    tunnel += sin(p.z * 5.0 - u_time * 10.0) * u_volume_smooth * 0.2;
    float grid = sin(atan(p.y, p.x) * 10.0) * sin(p.z * 2.0) * 0.1;
    return tunnel + grid;
}

void main() {

    vec2 uv = (gl_FragCoord.xy * 2.0 - u_res.xy) / min(u_res.x, u_res.y);

    vec3 ro = vec3(0.0, 0.0, u_time * 5.0);

    vec3 rd = normalize(vec3(uv + u_orient * 1.2, 1.0));

    // ✅ 正確矩陣乘法（手機關鍵）
    rd.xy = rot(u_orient.x * 0.5) * rd.xy;

    float t = 0.0;
    float glow = 0.0;

    for (int i = 0; i < 40; i++) {
        vec3 p = ro + rd * t;
        float d = map(p);

        float layerGlow = 0.05 / max(abs(d) + 0.05, 0.001);
        glow += layerGlow * (0.1 + u_volume_smooth);

        if (d < 0.01 || t > 12.0) break;
        t += d * 0.6;
    }

    vec3 baseCol = mix(
        vec3(0.0, 0.8, 1.0),
        vec3(0.8, 0.0, 1.0),
        sin(t * 0.1 + u_time) * 0.5 + 0.5
    );

    float lines = smoothstep(
        0.9,
        1.0,
        sin(atan(rd.y, rd.x) * 20.0 + u_time * 20.0)
    );

    vec3 col = baseCol * glow * 0.2;
    col += baseCol * lines * u_volume * 0.5;

    col *= smoothstep(1.2, 0.2, length(uv + u_orient));

    gl_FragColor = vec4(col, 1.0);
}
