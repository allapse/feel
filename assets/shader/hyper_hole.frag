varying float vDist;
varying float vAlpha;
varying vec3 vColor;
varying vec2 vUv;
varying float vMode;

uniform sampler2D u_camera;
uniform float u_useCamera;

void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;

    // 核心黑洞區域
    float hole = smoothstep(0.04, 0.07, vDist);
    
    // 根據模式調整發光質感
    // 模式 1 (darkGlow 開) 讓光點更銳利且有過曝感
    float glowExp = mix(3.0, 5.0, vMode);
    float glow = pow(1.0 - d * 2.0, glowExp);
    
    vec3 finalColor = vColor;
    
    // 接入相機
    if (u_useCamera > 0.5) {
        vec3 cam = texture2D(u_camera, vUv).rgb;
        // 如果是模式 1，增加相機畫面的對比度與色偏
        if (vMode > 0.5) cam = pow(cam, vec3(1.5)) * vec3(1.2, 0.8, 0.5);
        finalColor = mix(finalColor, cam, 0.6);
    }
    
    // 模式 1 增加邊緣白熱化
    if (vMode > 0.5) {
        finalColor += (1.0 - smoothstep(0.0, 0.1, vDist)) * 0.5;
    }

    gl_FragColor = vec4(finalColor * glow, vAlpha * glow * hole);
}
