attribute float a_id;

uniform vec2 u_res;
uniform float u_time;
uniform float u_volume;
uniform float u_volume_smooth;
uniform float u_peak;
uniform vec2 u_orient;
uniform float u_complexity;
uniform sampler2D u_camera; // 準備接入相機
uniform float u_useCamera;
uniform float u_darkGlow;      // 暗部輝光強度 (0~1)
uniform float u_bpm;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDir;
varying float vNoise;
varying float vLife; // 傳遞生命週期進度
varying vec2 vScreenUv;

float hash(float n) { return fract(sin(n) * 43758.5453123); }

// 定義一個簡單的 2D 旋轉函數
mat2 rotate(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

void main() {
	float aspect = u_res.x / u_res.y;
    float s1 = hash(a_id);
    float s2 = hash(a_id + 0.5);
    
    // 1. 生命週期：每個粒子都有不同的出生偏移
    // 用 mod 讓它們循環：0.0 是剛出生，1.0 是消失
    float life = mod(u_time * 0.3 + s1, 1.0); 
    vLife = life;

    // 2. 誕生路徑：從中心噴出
    // 剛出生時 (life 靠近 0)，它們只是隨機噴發的點
    // 隨著 life 增加，它們被強迫吸附到球面上
    float phi = acos(2.0 * s1 - 1.0);
    float theta = s2 * 6.283185;
    
    // 理想球體座標
    vec3 spherePos = vec3(sin(phi)*cos(theta), sin(phi)*sin(theta), cos(phi)) * sqrt((u_volume * 0.7 + 0.3));
    
    // 噴射邏輯：
    // 初期：半徑從 0 快速擴大
    // 中期：形成球體 (r=1.0)
    // 隨音量震盪
    float r = smoothstep(0.0, 0.4, life) * (0.5 + u_volume_smooth * 0.5);
    
    // 加上一點噴射時的抖動
    vec3 noise = vec3(hash(s1), hash(s2), hash(s1+s2)) * u_peak * 0.2 * (1.0 - life);
    vec3 pos = spherePos * r + noise;
	
	pos.yz *= rotate(u_orient.y * 1.5 + u_time * 0.2); // 繞 X 軸轉
    pos.xz *= rotate(u_orient.x * 1.5 + u_time * 0.1); // 繞 Y 軸轉
	pos.xy *= rotate(u_time * 0.1); // 繞 Y 軸轉

    // 3. 視角運算
    vNormal = normalize(spherePos) * u_complexity; // 始終向外
    vViewDir = normalize(vec3(0.0, 0.0, 1.5) - pos);

    // 將 pos.z 傳給 gl_Position 的 z 分量
	// 0.0 到 1.0 之間是 GPU 的標準深度範圍
	// 我們把球體的 -1~1 對應到 0~1
	float depthForGPU = pos.z * 0.5 + 0.5; 
	
	// 1. 基礎位移：讓球體中心隨 u_orient 偏移
    // 乘以 0.5 是為了讓動作細微，不至於跑出螢幕
    vec3 offsetPos = pos;
    //offsetPos.xy += u_orient; 

    // 2. 視差增強（關鍵！）：
    // 讓靠近相機的點（pos.z 大）移動多一點，遠處的點移動少一點
    // 這會讓球體在移動時看起來像「立體的」在晃，而不是一張扁平的照片
	offsetPos.x /= aspect;
    offsetPos.xy += u_orient * pos.z * 0.2;

	gl_Position = vec4(offsetPos.xy * 1.2, depthForGPU, 1.0);

	// 計算 3D 遠近感的大小衰減
	// 這裡假設一個虛擬的相機距離為 2.0
	float perspective = 1.5 / (2.5 - pos.z); 
	// 剛噴出時點很小，成形時變大，消失前變薄
    float sizeGrowth = smoothstep(0.0, 0.5, vLife); 
	gl_PointSize = (2.0 + sizeGrowth * 1.0) * perspective;
	
	// 將 [-1, 1] 的裁剪空間轉為 [0, 1] 的螢幕空間
    vScreenUv = gl_Position.xy * 0.5 + 0.5;

}

