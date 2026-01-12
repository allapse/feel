precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_volume;
uniform float u_volume_smooth;
uniform vec2 u_orient;
uniform float u_intensity;
uniform float u_complexity;
uniform float u_speed;
uniform float u_darkGlow;

// 純粹邏輯：複數疊代與位元運算
void main() {
    // 1. 基礎座標與視角
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_res.xy) / min(u_res.y, u_res.x);
    vec2 look = u_orient * 0.5;
    
    // 2. 捕捉「此刻」的脈衝
    // 利用 volume 與 last_volume 的差值，捕捉「變化的瞬間」
    float pulse = abs(u_volume - u_last_volume) * 10.0;
    
    // 3. 螺旋演化 (代表時間的流動)
    float r = length(uv - look);
    float angle = atan(uv.y - look.y, uv.x - look.x);
    
    // 讓公式在「此刻」產生扭曲
    // u_complexity 在這裡代表你按下按鍵時，思考的密度
    float spiral = sin(1.0 / (r + 0.1) + u_time * u_speed + angle * u_complexity);
    
    // 4. 色彩的「瞬間性」
    // 混合此刻的音量與長期的平滑音量，產生一種視覺上的「呼吸感」
    vec3 momentCol = mix(vec3(0.2, 0.4, 0.9), vec3(1.0, 0.2, 0.5), pulse);
    
    // 5. 消失點的處理：模擬「按下」的那一刻，光線向中心塌縮
    float glow = (0.05 + pulse * 0.1) / (r + 0.01);
    vec3 finalCol = momentCol * spiral * glow;
    
    // 6. 加入「時間的塵埃」
    // 模擬此時此刻之後，一切都會歸於沉靜的消散感
    finalCol *= smoothstep(1.2, 0.0, r + sin(u_time * 0.5) * 0.2);

    gl_FragColor = vec4(finalCol, 1.0);
}