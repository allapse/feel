
class MapSlider extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();
    }

    render() {
		this.shadowRoot.innerHTML = `
			<style>
				.control-group { margin-bottom: 20px; }
				
				label { 
					font-size: 9px; display: block; margin-bottom: 8px; 
					text-transform: uppercase; color: #999; 
					letter-spacing: 1px;
				}

				input[type=range] { -webkit-appearance: none; width: 142px; background: transparent; mix-blend-mode: difference !important;}
				input[type=range]:focus { outline: none; }
				input[type=range]::-webkit-slider-runnable-track { width: 100%; height: 1px; background: #999; }

				input[type=range]::-webkit-slider-thumb {
					-webkit-appearance: none; 
					height: 15px; width: 15px; 
					margin-top: -6.5px;
					border-radius: 5px;
					border: 1px solid #999;
					
					background: rgb(
						calc(128 + var(--flash) * 175), 
						calc(128 + var(--flash) * 175), 
						calc(128 + var(--flash) * 175)
					);
				}
				
				/* 讓軌道能顯示 Peak 區間 */
				input[type=range]::-webkit-slider-runnable-track {
					width: 100%; height: 1px;
					background: linear-gradient(to right, 
						rgba(51,51,51, 1) 0%, 
						rgba(255,255,255, 1) calc(var(--peak, 0) * 100%), 
						#555 calc(var(--peak, 0) * 100%), 
						#555 100%);
						will-change: mix-blend-mode;
						transform: translateZ(0);
				}
			</style>
			<div class="control-group" id="group" style="--flash: 0;">
				<label>${this.getAttribute('label') || ''}</label>
				<input type="range" id="inner-input" 
					min="${this.getAttribute('min') || 0}" 
					max="${this.getAttribute('max') || 1}" 
					step="${this.getAttribute('step') || 0.01}" 
					value="${this.getAttribute('value') || 0.5}">
			</div>
		`;
	}

	// 供外部 JS 每幀調用
	flash(value) {
		this.shadowRoot.getElementById('group').style.setProperty('--flash', value);
	}

    // 關鍵接口：讓 AudioMap 可以透過 customEl.input 抓到裡面的滑桿
    get input() {
        return this.shadowRoot.getElementById('inner-input');
    }
}

// 註冊組件
if (!customElements.get('map-slider')) {
    customElements.define('map-slider', MapSlider);
}

class AudioMap {
    constructor() {
		this.root = null;
		this.audio = null;
		this.source = null;
		this.analyser = null;
		this.audioContext = null;
		this.panner = null;
		this.dataArray = null;
		this.fxFilter = null;
		this.eqList = null;
		this.material = null;
		
		// 1. 建立兩個緩衝區 (像兩面鏡子互相對照)
		this.targetA = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
		this.targetB = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
		this.params = { intensity: 0, speed: 0, complexity: 0 };
		
		this.orient = { x: 0.0, y: 0.0 };
		this.isGyroLocked = true;
		this.lockGyro = null;
		
		this.audioMappings = [];
		this.smoothedVolume = null;
		this.lastVolume = null;
		
		// BPM 鎖定邏輯相關變數
		this.isBPMLocked = false;
		this.lockedInterval = 1000; // 預設 60 BPM (1000ms)
		this.lastFlashTime = 0;
		this.beatValue = 0;
		this.beatHistory = []; // 用來紀錄前幾拍的間隔
		
		this.darkGlowMode = false;
		this.idleTimer = null;
		this.currentShaderIndex = 0;
		
		this.cameraManager = null;
		this.useCamera = null;
		this.canCam = false;
	}
	
	async buildMainUI(overlayText, linkText, url, audioPath) {
		// 1. 建立一個唯一的根容器
		const rootId = 'allgivz-ui';
		this.root = document.getElementById(rootId);
		if (!this.root) {
			this.root = document.createElement('div');
			this.root.id = rootId;
			document.body.prepend(this.root); // 或是 appendChild
		}

		// 2. 使用更安全的 CSS 寫法 (限制在 root 內)
		this.root.innerHTML = `
			<style>
				#${rootId} {
					/* 這裡放原本寫在 body 的全域設定，但限制在 root 內 */
					font-family: ui-monospace, Consolas, "Microsoft JhengHei", monospace;
					-webkit-font-smoothing: antialiased;
					-moz-osx-font-smoothing: grayscale;
					touch-action: manipulation;
					-webkit-touch-callout: none;
					-webkit-user-select: none;
					user-select: none;
				}

				#${rootId} #container {
					position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
					z-index: 1; pointer-events: none; /* 讓 container 穿透，看需求調整 */
					touch-action: none;
				}

				#${rootId} #overlay {
					position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
					text-align: center; color: #999; cursor: pointer; z-index: 100;
					padding: 30px; border: 0px solid #000; transition: 0.4s; letter-spacing: 4px; font-size: 12px;
					background: rgba(0, 0, 0, 0.6);
					overflow: hidden; display: flex; align-items: center; justify-content: center;
				}
				#${rootId} #overlay:hover { background: rgba(0, 0, 0, 0.7); color: #fff; }
				
				/* 這是「外圍發光層」 */
				#${rootId} #overlay::before {
					content: '';
					position: absolute;
					/* 關鍵：設定寬高，並確保它比 overlay 大，光暈才明顯 */
					top: -50%;
					left: -50%;
					width: 200%;
					height: 200%;
					
					/* 旋轉的漸層：這裡用稍微亮一點的灰白，模擬幽光 */
					background: conic-gradient(
						from 0deg,
						transparent 0%,
						rgba(0, 0, 0, 1.0) 15%, /* 這是流光的中心點 */
						transparent 40%
					);
					
					/* 【關鍵】大幅度模糊，讓它看起來是「暈」出來的，而不是一條線 */
					filter: blur(30px);
					
					/* 執行旋轉動畫 */
					animation: rotate-glow 6s linear infinite;
					
					/* 放在 overlay 背景的下方 */
					z-index: -1;
					border-radius: 50%; 
				}

				@keyframes rotate-glow {
					from { transform: rotate(0deg); }
					to { transform: rotate(360deg); }
				}

				#${rootId} #ui-layer {
					position: fixed; top: 50%; left: 50%;
					z-index: 1100; pointer-events: auto; touch-action: auto;
					opacity: 0; transform: translate(-50%, -50%) scale(0.9); filter: blur(10px);
					mix-blend-mode: difference;
				}
				
				#${rootId} #ui-layer.show {
					opacity: 1;
					transform: translate(-50%, -50%) scale(1);
					filter: blur(0px);
					transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); /* 帶點彈性的曲線 */
				}
				
				#${rootId} #ui-layer.hide {
					opacity: 0;
					transform: translate(50%, 50%) scale(0.9);
					filter: blur(10px);
					transition: all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); /* 帶點彈性的曲線 */
				}
				
				#link, #lockGyro, #useCamera{
					transition: all 0.3s;
					mix-blend-mode: difference;
				}
			</style>
			
			<div id="container"></div>
			<div id="overlay" style="white-space: pre;">${overlayText}</div>
			<div id="ui-layer" style="display: none;"></div>
			<div id="useCamera" style="position:fixed; top:20px; left:20px; z-index:1200; cursor:pointer; color:#999; font-size:10px; display: none;">CAMERA</div>
			<div id="lockGyro" style="position:fixed; top:20px; right:20px; z-index:1200; cursor:pointer; color:#fff; font-size:10px; display: none;">LOCK GYRO</div>
			<div id="link" style="position:fixed; bottom:20px; left:20px; z-index:1200; cursor:pointer; color:#999; font-size:10px;">${linkText}</div>
		`;

		// 3. 邏輯綁定 (改用 root.querySelector 避免抓錯人)
		this.overlay = this.root.querySelector('#overlay');
		const uiLayer = document.getElementById('ui-layer');
		this.overlay.addEventListener('click', async () => {
			try {
				// 啟動邏輯...
				await Promise.allSettled([
					this.initGyro({ range: 20 }, (data) => {
						this.orient.x = data.x * 1.5;
						this.orient.y = data.y * 1.5;
						
						
						if(this.panner){
							const t = this.audioContext.currentTime;
							const factor = 10.0;
							// 左右
							this.panner.positionX.setTargetAtTime(this.orient.x * factor, t, 0.15);

							// 上下（可選）
							this.panner.positionY.setTargetAtTime(this.orient.y * factor, t, 0.15);

							// 前後：固定在聽者前方一點點
							this.panner.positionZ.setTargetAtTime(this.orient.y * factor * 2.0, t, 0.15);
						}
					}),
					this.initAudio(audioPath)
				]);
				
				// 1. UI 與 陀螺儀 (保持不變)
				this.overlay.style.display = 'none';
				const uiElements = ['ui-layer', 'mode-hint', 'link', 'lockGyro', 'useCamera', 'hideUI'];
				uiElements.filter(id => !(id === 'useCamera' && !this.canCam)).forEach(id => {
					const el = document.getElementById(id);
					if (el) el.style.display = 'block';
				});
				
				// 1. 先把 display 設回 auto/block (這時它是透明的)
				uiLayer.style.display = 'block';

				// 2. 稍微延遲一點點 (讓瀏覽器反應過來)，然後加上動畫 Class
				requestAnimationFrame(() => {
					// 第二層：確保在下一幀才加上 class，從而觸發 transition
					requestAnimationFrame(() => {
						uiLayer.classList.add('show');
					});
				});
				
			} catch (e) {
				console.error("啟動失敗", e);
			}
		});

		const link = this.root.querySelector('#link');
		link.addEventListener('click', () => window.location.assign(url));
		
		this.lockGyro = this.root.querySelector('#lockGyro');
		this.lockGyro.addEventListener('click', async () => {
			await this.unlockGyro();
		});
		
		this.useCamera = this.root.querySelector('#useCamera');
		this.useCamera.addEventListener('click', async () => {
			if(!this.cameraManager) this.cameraManager = new CameraManager();
			
			const isActive = await this.cameraManager.toggleCamera();
			this.useCamera.style.color = isActive ? "#fff" : "#999";
			
			// 直接更新值，不需判斷 if(!this.material.uniforms.u_camera)
			if (isActive) {
				// 更新為 VideoTexture
				this.material.uniforms.u_camera.value = new THREE.VideoTexture(this.cameraManager.video);
				this.material.uniforms.u_useCamera.value = 1.0;
			} else {
				this.material.uniforms.u_useCamera.value = 0.0;
			}
			
			this.material.needsUpdate = true;
		});
		
		document.addEventListener("visibilitychange", () => {
			if (document.hidden) {
				//console.log("進入虛空：暫停計算與鏡頭");
				// 暫停鏡頭以省電
				if (this.cameraManager && this.cameraManager.isCameraActive) {
					this.cameraManager.stop(); 
				}
				
				if(this.audioContext){
					// 也可以暫停音訊
					this.audioContext.suspend();
				}
				
			} else {
				//console.log("重回現實：恢復對齊");
				if(this.audioContext) this.audioContext.resume();
				// 這裡可以選擇不自動重開鏡頭，保護隱私也省電
				if (this.userWantsCamera) {
					this.cameraManager.toggleCamera();
				}
			}
		});
		
		
	}
	
	async unlockGyro(){
		// 切換布林值狀態
		this.isGyroLocked = !this.isGyroLocked;

		// 根據狀態切換顏色
		// 鎖定時（true）顯示灰色 #999，解鎖時（false）顯示白色 #fff
		if(this.lockGyro) this.lockGyro.style.color = this.isGyroLocked ? "#fff" : "#999";
		//console.log(`Gyro locked: ${this.isGyroLocked}`);
	}

    async buildUI(containerId, configs, jsonPath, canSelectView = false) {
        const container = document.getElementById(containerId);
		
        if (!container) return;
		
		if(!configs)
			configs = [
				{ id: 'ui-intensity', key: 'intensity', label: 'Distortion', min: 0, max: 1, step: 0.01 },
				{ id: 'ui-speed', key: 'speed', label: 'Evolution', min: 0, max: 1, step: 0.01 },
				{ id: 'ui-complexity', key: 'complexity', label: 'Complexity', min: 0, max: 1, step: 0.01 },
			];

        // 動態生成 HTML
        let slidersHtml = configs.map(cfg => `
            <map-slider 
                id="${cfg.id}" 
                label="${cfg.label}" 
                min="${cfg.min}" 
                max="${cfg.max}" 
                step="${cfg.step}" 
                value="${this.params[cfg.key]}">
            </map-slider>
        `).join('');
		
		// 讀取音樂清單 JSON
		let musicList = [];
		try {
			const response = await fetch('assets/audio/list.json?t='+Date.now());
			musicList = await response.json();
		} catch (e) {
			console.error("讀取音樂清單失敗:", e);
			// 備用方案
			//musicList = [{ name: "預設音樂", path: "./music/default.mp3" }];
		}
		
		let optionsHtml = musicList.map(m => 
			`<option value="${m.path}">${m.name}</option>`
		).join('');
		
		this.fragList = [];
		try {
			const response = await fetch('assets/shader/list.json?t='+Date.now());
			this.fragList = await response.json();
		} catch (e) {
			console.error("讀取視覺清單失敗:", e);
			// 備用方案
			//fragList = [{ name: "預設視覺", path: "./shader/default.frag" }];
		}
		
		let shadersHtml = this.fragList.map(m => {
			const displayName = m.canCam ? `${m.name} (CAM)` : m.name;
			
			return `<option value="${m.path}">${displayName}</option>`;
		}).join('');
		
		try {
			const response = await fetch('assets/audio/eq.json?t='+Date.now());
			this.eqList = await response.json();
		} catch (e) {
			console.error("讀取視覺清單失敗:", e);
		}
		
		let eqHtml = this.eqList.map((preset, index) => 
			`<option value="${index}">${preset.name}</option>`
		).join('');
		
		container.innerHTML = `
			<style>
				.pro-audio-rack {
					display: flex;
					align-items: stretch;
					background: transparent;
				}
				.main-vu-side {
					display: flex;
					flex-direction: column;
					align-items: center;
					min-width: 10px; /* 給予足夠寬度容納文字標籤 */
					flex-shrink: 0;   /* 強制不許縮小 */
					gap: 1px;
				}
				.vertical-large {
					height: 90%;
					width: 5px;
					background: #555;
					position: relative;
				}
				.sliders-center {
					display: flex;
					flex-direction: column;
					justify-content: space-between;
				}
				/* 這裡記得把 MapSlider 內部的 vu-meter 樣式刪掉或設為 display:none */
				
				/* 放在你的 <style> 標籤內 */
				#main-vol-bar, #main-peak-bar {
					width: 100%;
					background: linear-gradient(to top, 
						rgba(255, 255, 255, 0.0) 0%,
						rgba(255, 255, 255, 0.30) 50%,						
						rgba(255, 255, 255, 1.0) 100%
					);
					position: absolute;
					bottom: 0;
					left: 0;
					/* 初始高度為 0 */
					height: 0%;			
					/* 如果想要絲滑一點，可以加極短的過渡 */
					
				}
				
				.side-label-bottom {
					width: 18px;
					font-size: 9px;
					color: #999;
					letter-spacing: 1.0px;
					text-align: center;
					text-transform: uppercase;
					/* 讓文字水平顯示 */
					white-space: nowrap; 
				}
			</style>
			<div class="pro-audio-rack">
				<div class="main-vu-side">
					<div class="vu-meter vertical-large">
						<div class="vu-bar" id="main-vol-bar" style="transition: height 0.3s ease-out;"></div>
					</div>
					<div class="side-label-bottom">VOL</div>
				</div>

				<div class="sliders-stack">
					${slidersHtml}
				</div>

				<div class="main-vu-side">
					<div class="vu-meter vertical-large">
						<div id="main-peak-bar" style="transition: height 0.1s ease-out;"></div>
					</div>
					<div class="side-label-bottom">PEAK</div>
				</div>
			</div>
			
			<style>
				.music-group { margin-top: 20px; width: 180px; position: relative; }
				.music-select {
					width: 100%; background: transparent; color: #999;
					border: none; border-bottom: 1px solid #999;
					font-size: 9px; outline: none; letter-spacing: 1px;
					-webkit-appearance: none; padding: 0px; cursor: pointer;
					 margin-left: 2px; 
				}
				.music-group::after { content: '▼'; font-size: 8px; color: #999; position: absolute; right: 0; bottom: 8px; pointer-events: none; }
				.music-select option { font-size: 9px; background: #000; color: #999;}
			</style>
			<div class="music-group">
				<select id="music-select" class="music-select">
					<option value="" disabled selected>INPUT</option>
					${optionsHtml}
				</select>
			</div>
			<style>
				.shader-group { margin-top: 20px; width: 180px; position: relative; display: ${canSelectView ? 'block' : 'none'};}
				.shader-select {
					width: 100%; background: transparent; color: #999;
					border: none; border-bottom: 1px solid #999;
					font-size: 9px; outline: none; letter-spacing: 1px;
					-webkit-appearance: none; padding: 0px; cursor: pointer;
					 margin-left: 2px; 
				}
				.shader-group::after { content: '▼'; font-size: 8px; color: #999; position: absolute; right: 0; bottom: 8px; pointer-events: none; }
				.shader-select option { font-size: 9px; background: #000; color: #999;}
			</style>
			<div class="shader-group">
				<select id="shader-select" class="shader-select">
					<option value="" disabled selected>VISUALIZER</option>
					${shadersHtml}
				</select>
			</div>
			<style>
				.eq-group { margin-top: 20px; width: 180px; position: relative; }
				.eq-select {
					width: 100%; background: transparent; color: #999;
					border: none; border-bottom: 1px solid #999;
					font-size: 9px; outline: none; letter-spacing: 1px;
					-webkit-appearance: none; padding: 0px; cursor: pointer;
					 margin-left: 2px; 
				}
				.eq-group::after { content: '▼'; font-size: 8px; color: #999; position: absolute; right: 0; bottom: 8px; pointer-events: none; }
				.eq-select option { font-size: 9px; background: #000; color: #999;}
			</style>
			<div class="eq-group">
				<select id="eq-select" class="eq-select">
					<option value="" disabled selected>EQUALIZER</option>
					${eqHtml}
				</select>
			</div>
		`;
		
		const gyroUI = document.createElement('div');
		gyroUI.id = 'gyro-debug-ui';
		gyroUI.innerHTML = `
			<style>
				#gyro-debug-ui {
					position: fixed; top: 0; left: 0; width: 100%; height: 100%;
					pointer-events: none; z-index: 9999;
					mix-blend-mode: difference;
				}
			
				.gyro-indicator {
					position: absolute; background: transparent;
					display: none;  color: #999; padding: 5px; font-weight: bold;
					pointer-events: auto; cursor:pointer;
				}
				#gyro-up    { top: 13px; left: 50%; transform: translateX(-50%); }
				#gyro-down  { bottom: 13px; left: 50%; transform: translateX(-50%); }
				#gyro-left  { left: 13px; top: 50%; transform: translateY(-50%); }
				#gyro-right { right: 13px; top: 50%; transform: translateY(-50%); }
				
				#mode-hint {
					position: absolute; bottom: 10%; left: 50%; transform: translateX(-50%); font-size: 9px; color: #999;
					letter-spacing: 1px; pointer-events: auto; display: none; z-index: 1200; cursor:pointer;
				}
			</style>
			<div id="indicators" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%;">
				<div id="gyro-up" class="gyro-indicator">+</div>
				<div id="gyro-down" class="gyro-indicator">+</div>
				<div id="gyro-left" class="gyro-indicator">+</div>
				<div id="gyro-right" class="gyro-indicator">+</div>
			</div>
			
			<div id="mode-hint" style="display: none; cursor: pointer; transition: all 0.3s; white-space: pre;"> TAP TO GLOW</div>
			<div id="hideUI" style="position: absolute; bottom: 20px; right: 20px; z-index:1200; pointer-events: auto; cursor:pointer; color:#999; font-size:10px; display: none;">HIDE UI</div>
		`;
		
		if(this.root)
			this.root.appendChild(gyroUI);
		else
			document.body.appendChild(gyroUI);

        // 定義綁定邏輯的函式
		const bindLogic = () => {
			this.audioMappings = configs.map(cfg => {
				const customEl = document.getElementById(cfg.id);
				// 關鍵：如果組件還沒準備好，customEl.input 會是 undefined
				const el = customEl ? customEl.input : null;

				if (!el) return null; // 這一輪沒抓到，先回傳 null

				el.addEventListener('mousedown', () => el.dataset.isDragging = "true");
				el.addEventListener('touchstart', () => el.dataset.isDragging = "true");
				window.addEventListener('mouseup', () => el.dataset.isDragging = "false");
				window.addEventListener('touchend', () => el.dataset.isDragging = "false");

				el.oninput = (e) => {
					this.params[cfg.key] = parseFloat(e.target.value);
				};

				return { ...cfg, el, peak: 0.1 };
			}).filter(m => m !== null);

			// 監聽事件
			['click', 'touchend'].forEach(eventType => {
				window.addEventListener(eventType, (e) => {
					// 攔截邏輯
					if (this.overlay && this.overlay.style.display !== 'none') return;
					if (e.target.closest('#ui-layer') || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
					if (e.target.id === 'overlay' || e.target.closest('#link') || e.target.closest('#lockGyro') 
						|| e.target.closest('#useCamera') || e.target.closest('#hideUI') || e.target.id.startsWith('gyro-')) return;

					this.toggleDarkGlow();
					
					// 手機版防止重複觸發 (如果是 touchend 就停止後續模擬的 click)
					if (eventType === 'touchend' && e.cancelable) {
						// e.preventDefault(); // 視情況決定是否開啟
					}
				}, { passive: true });
			});
			
			const hideUI = document.getElementById('hideUI');
			const uiLayer = document.getElementById('ui-layer');
			hideUI.addEventListener('click', () => {
				const uiElements = ['ui-layer', 'mode-hint', 'link', 'lockGyro', 'useCamera', 'indicators'];

				if (!uiLayer.classList.contains('show')) {
					// --- 顯示過程 ---
					uiElements.filter(id => !(id === 'useCamera' && !this.canCam)).forEach(id => {
						const el = document.getElementById(id);
						if (el) el.style.display = 'block';
					});
					
					// 2. 稍微延遲（讓瀏覽器意識到 display 變了），再觸發動畫
					requestAnimationFrame(() => {
						uiLayer.classList.remove('hide');
						uiLayer.classList.add('show');
					});
					
					hideUI.style.color = "#999";
					hideUI.textContent = "HIDE UI";
				} else {
					// --- 隱藏過程 ---
					uiLayer.classList.remove('show');
					uiLayer.classList.add('hide'); // 1. 先跑動畫
					
					// 2. 等動畫跑完 (0.2s = 1200ms) 再隱藏 display
					setTimeout(() => {
						if (uiLayer.classList.contains('hide')) {
							uiElements.forEach(id => {
								const el = document.getElementById(id);
								if (el) el.style.display = 'none';
							});
						}
					}, 150); 
					
					hideUI.style.color = "#fff";
					hideUI.textContent = "▲";
				}
			});
			
			
			// --- 綁定音樂選單 (新增邏輯) ---
			const musicSelect = document.getElementById('music-select');
			if (musicSelect) {
				// 這裡使用 change 事件來實時切換
				musicSelect.onchange = async (e) => {
					await this.switchTrack(e.target.value);
				};
			}
			
			// --- 綁定視覺選單 (新增邏輯) ---
			// --- 綁定 Shader 選單 ---
			this.shaderSelect = document.getElementById('shader-select');
			if (this.shaderSelect) {
				this.shaderSelect.onchange = async (e) => {
					const shaderPath = e.target.value;
					if (!shaderPath) return;

					try {
						await this.loadShader(shaderPath);
					} catch (err) {
						console.error('Failed to switch shader:', err);
					}
				};
			}

			const eqSelect = document.getElementById('eq-select');
			if (eqSelect) {
				// 使用箭頭函數確保 this 指向你的主程式物件
				eqSelect.onchange = (e) => {
					this.changeEQ(e.target.value);
				};
			}

			// 如果還有 config 沒綁定成功，隔 50ms 再試一次 (直到抓到為止)
			if (this.audioMappings.length < configs.length) {
				setTimeout(bindLogic, 50);
			} else {
				//console.log("Universe UI 綁定成功");
			}
		};

		// 開始嘗試綁定
		bindLogic();
		
		//this.updateIdleMode(3000);
    }
	
	toggleDarkGlow(chance) {
		if (chance && Math.random() > chance) return; 
		
		// 切換布林值
		this.darkGlowMode = !this.darkGlowMode;
		
		if(this.material)
			this.material.uniforms.u_darkGlow.value = this.darkGlowMode ? 1.0 : 0.0;
		
		const hint = document.getElementById('mode-hint');
		
		// 更新 UI
		if (hint) {
			if (this.darkGlowMode) {
				hint.style.color = "#fff";
			} else {
				hint.style.color = "#999";
			}
		}
		//console.log("Glow Mode:", this.darkGlowMode);
	};
	
	changeEQ(index){
		// 檢查基礎環境
		if (!this.audioContext || !this.source || !this.analyser) {
			console.error("音訊元件未就緒");
			return;
		}
		
		const preset = this.eqList[index]; 
		if (!preset) return;

		const now = this.audioContext.currentTime;

		// 確保濾波器存在並串接
		if (!this.fxFilter) {
			this.fxFilter = this.audioContext.createBiquadFilter();
			this.source.disconnect();
			this.source.connect(this.panner);
			this.panner.connect(this.fxFilter);
			this.fxFilter.connect(this.analyser);
			this.analyser.connect(this.audioContext.destination);
		}

		// --- 關鍵：根據 JSON 設定參數 ---
		this.fxFilter.type = preset.type; // 如 'lowpass', 'highpass'
		
		// 使用平滑過渡避免爆音
		this.fxFilter.frequency.setTargetAtTime(preset.freq, now, 0.1);
		this.fxFilter.Q.setTargetAtTime(preset.q || 1, now, 0.1);
		
		// 如果 JSON 有設定 gain (例如 peaking 濾波器需要)
		if (preset.gain !== undefined) {
			this.fxFilter.gain.setTargetAtTime(preset.gain, now, 0.1);
		}

		// UI 視覺連動
		const selector = document.getElementById('eq-selector');
		
		//console.log(`維度切換成功: ${preset.name}`, preset);
	}
	
	async loadShader(path){
		try {
			// 找到當前 Shader 的配置
			const config = this.fragList.find(s => s.path === path);
			
			// 如果該 Shader 不支援鏡頭，就強制關閉鏡頭以節省效能
			if (config) {
				this.canCam = config.canCam;
				if(this.overlay.style.display === "none"){
					if(path.includes('void')){
						this.audio.pause();
					}
					
					if(!this.canCam){
						if (this.cameraManager && this.cameraManager.isCameraActive) {
							await this.cameraManager.toggleCamera();
						}
						// 更新 UI 狀態
						this.useCamera.style.display = "none"; 
					} else {
						this.useCamera.style.display = "block"; 
					}
				} 
			}
			
			// 從 assets 路徑抓取新的片段著色器
			const response = await fetch(`${path}?t=${Date.now()}`);
			if (!response.ok) throw new Error('Shader file not found');
			
			const newFragCode = await response.text();

			// 假設你的 ShaderMaterial 存放在 this.material
			if (this.material) {
				this.material.fragmentShader = newFragCode;
				
				// 關鍵：通知 Three.js 重新編譯此材質
				this.material.needsUpdate = true;
				
				//console.log(`Successfully switched to shader: ${path}`);
			}
		} catch (err) {
			console.error('Failed to switch shader:', err);
		}
	}

    updateAudioReaction() {
        if (!this.dataArray || !this.audioMappings.length) return;
		this.analyser.getByteFrequencyData(this.dataArray);
		
		this.handleVol();
		
		const now = Date.now();

		if (!this.isBPMLocked) {
			let bassAvg = (this.dataArray[0] + this.dataArray[1] + this.dataArray[2]) / 3;
			
			// 1. 偵測門檻：0.3~1秒對應 300ms ~ 1000ms
			if (bassAvg > 200 && (now - this.lastFlashTime) > 300) {
				if (this.lastFlashTime !== 0) {
					let interval = now - this.lastFlashTime;

					// 2. 強制約束在 0.3s ~ 1s 之間
					interval = Math.max(300, Math.min(1000, interval));

					// 3. 計算 BPM 並做平滑處理 (取5的倍數，讓節奏更穩)
					const rawBPM = 60000 / interval;
					const roundedBPM = Math.round(rawBPM / 5) * 5; 
					
					// 4. 反推回精確的間隔時間
					this.lockedInterval = 60000 / roundedBPM;
					this.isBPMLocked = true;
					
					//console.log(`BPM Locked: ${roundedBPM}, Interval: ${this.lockedInterval}ms`);
				}
				this.lastFlashTime = now;
				this.beatValue = 1.0;
			}
		} else {
			// 鎖定後循環邏輯
			if (now - this.lastFlashTime >= this.lockedInterval) {
				this.beatValue = 1.0;
				this.lastFlashTime = now;
			}
		}

		// 每一幀都讓能量衰減 (0.9 代表較長的餘暉，0.8 代表短促的閃爍)
		this.beatValue *= 0.92; 
		if (this.beatValue < 0.01) this.beatValue = 0;

		this.audioMappings.forEach(mapping => {
			const customEl = document.getElementById(mapping.id); // 抓取 MapSlider 本體
			const el = mapping.el;
			
			// --- 計算目前滑桿的「開度百分比」 ---
			const min = parseFloat(el.min);
			const max = parseFloat(el.max);
			const val = parseFloat(el.value);
			
			// 算出 0.0 ~ 1.0 的比例
			const percent = (val - min) / (max - min);

			// 執行閃爍 (門檻設為 1% 的開度)
			if (customEl && customEl.flash) {
				// 只有當開度 > 1% 且 beatValue 真的有值時才閃
				if (percent > 0.01) {
					customEl.flash(this.beatValue);
				} else {
					customEl.flash(0);
				}
			}
			
			if (el.dataset.isDragging === "true") {
				const currentVal = parseFloat(el.value);
				this.params[mapping.key] = currentVal; // 同步最新數值
				
				const uKey = "u_" + mapping.key;
				if (this.material && this.material.uniforms[uKey]) {
					this.material.uniforms[uKey].value = currentVal;
				}
				return; // 跳過下方的音訊計算，但 Uniform 已經更新了
			}
			
			if(mapping.range)
				this.handleLegacy(mapping, min, max);
			else
				this.handleGivz(mapping, min, max);
			
			el.value = this.params[mapping.key];

			// --- 更新 Material Uniforms ---
			if (this.material && this.material.uniforms) {
				const uKey = "u_" + mapping.key;
				if (this.material.uniforms[uKey]) {
					this.material.uniforms[uKey].value = this.params[mapping.key];
				}
			}
		});
    }
	
	handleVol() {
		let sum = 0;
		let peak = 0;
		const len = this.dataArray.length;

		for (let i = 0; i < len; i++) {
			const val = this.dataArray[i];
			sum += val;
			// 計算峰值
			if (val > peak) peak = val;
		}
		
		const currentTarget = sum / len / 255.0;
		let currentPeak = peak / 255;
		

		// 平滑化處理
		this.smoothedVolume += (currentTarget - this.smoothedVolume) * 0.15;

		if(this.material){
			const lastPeak = this.material.uniforms.u_peak.value;
			// 擾動
			let jp = 1;
			for(let i=0; i<6; i++){
				if(peak === 255 && lastPeak === 1-(0.002 * i)){
					jp = lastPeak - 0.002;
					break;
				}
			}
			currentPeak = (jp !== 1 ? jp : peak / 255.0);
			
			// 更新 Uniforms
			this.material.uniforms.u_volume.value = currentTarget;
			this.material.uniforms.u_volume_smooth.value = Math.pow(this.smoothedVolume, 1.5) * 1.5;
			this.material.uniforms.u_last_volume.value = this.lastVolume;
			
			// 如果你有預留峰值的 Uniform
			if(this.material.uniforms.u_peak) {
				this.material.uniforms.u_peak.value = currentPeak;
			}
		}
		
		// 取得 DOM 並更新
		const volBar = document.getElementById('main-vol-bar');
		const peakBar = document.getElementById('main-peak-bar');

		if (volBar) {
			const uiVol = Math.sqrt(currentTarget * 1.3);
			// 將 0~1 轉換為 0%~100%
			volBar.style.height = `${uiVol * 100}%`;
		}
		if (peakBar) {
			const uiPeak = Math.pow(currentPeak, 3);
			peakBar.style.height = `${uiPeak * 100}%`;
		}

		// 儲存本次狀態供下次循環使用
		this.lastVolume = currentTarget;

		// 回傳一個 Map 或物件，方便後續擴充 (例如做動態縮放)
		return {
			average: currentTarget,
			smooth: this.smoothedVolume,
			peak: currentPeak
		};
	}
	
	handleLegacy(mapping, min, max){
		// --- 核心計算邏輯 (平均值、峰值、Power 縮放) ---
		let sum = 0;
		for (let i = mapping.range[0]; i <= mapping.range[1]; i++) sum += this.dataArray[i];
		let currentAvg = Math.max(0, (sum / (mapping.range[1] - mapping.range[0] + 1)));
		
		// 強化：扣除底噪門檻 (讓數值更有「空間」呼吸)
		const noiseFloor = 30; 
		currentAvg = Math.max(0, currentAvg - noiseFloor);

		// 強化：動態峰值 (快速上升，極慢下降)
		if (currentAvg > mapping.peak) mapping.peak += (currentAvg - mapping.peak) * 0.2;
		else mapping.peak *= 0.995;
		
		mapping.el.style.setProperty('--peak', mapping.peak / (255 - noiseFloor));
		
		let ratio = Math.pow(currentAvg / Math.max(mapping.peak, 50), 1.5);

		// --- 更新數據與 UI ---
		const targetVal = min + (max - min) * ratio;

		// 核心：更新這個被引用的 params 物件
		this.params[mapping.key] += (targetVal - this.params[mapping.key]) * 0.1;
	}
	
	handleGivz(mapping, min, max) {
		const data = this.dataArray;
		const N = data.length;
		let result = 0;

		// 先算總振幅判斷是否有訊號
		let totalAmp = 0;
		for(let i=0; i<N; i++) totalAmp += data[i];
		const hasSignal = totalAmp > 1.0; 

		// 各項特徵計算 (你原本的 Switch 內容)
		switch (mapping.key) {
			case 'intensity': // 全域重心 (Spectral Centroid)
				let weightedSum = 0;
				let totalAmplitude = 0;
				for (let i = 0; i < N; i++) {
					weightedSum += i * data[i];
					totalAmplitude += data[i];
				}
				result = totalAmplitude > 0 ? (weightedSum / totalAmplitude) / N : 0;
				break;

			case 'speed': // 全域飽滿度 (Spectral Flatness)
				let sumLog = 0;
				let sumArithmetic = 0;
				for (let i = 0; i < N; i++) {
					const val = data[i];
					const cleanVal = Math.max(val, 0.0001); 
					sumLog += Math.log(cleanVal);
					sumArithmetic += val;
				}
				// 計算算術平均 (Arithmetic Mean)
				const am = sumArithmetic / N;
				
				// 計算幾何平均 (Geometric Mean) -> 使用 Exp(Avg(Log))
				const gm = Math.exp(sumLog / N);

				// 計算平坦度 (0.0 ~ 1.0)
				// 如果 am 為 0，平坦度設為 0
				result = am > 0 ? (gm / am) : 0;
				break;

			case 'complexity': // 全域複雜度 (Spectral Flux)
				if (!this.prevDataArray) this.prevDataArray = new Uint8Array(N);
				let flux = 0;
				for (let i = 0; i < N; i++) {
					const diff = data[i] - this.prevDataArray[i];
					flux += Math.max(0, diff);
				}
				this.prevDataArray.set(data);

				let rawComplexity = Math.min(flux / (N * 8), 1.0); 
				let processedComplexity = Math.sqrt(rawComplexity); 

				this.lastComplexity = (this.lastComplexity || 0) * 0.9 + processedComplexity * 0.1;
				result = this.lastComplexity;
				break;
		}

		// 初始化狀態對象 (防止 undefined 報錯)
		if (!mapping.state) {
			mapping.state = { min: result, max: result };
		}

		// 動態觀察範圍 (僅在有訊號時更新)
		if (hasSignal) {
			// 正常的 Min 更新
			mapping.state.min = Math.min(mapping.state.min, result) * 0.999 + result * 0.001;
			
			// 改進的 Max 更新：如果目前的結果大於紀錄，快速跟進；
			// 如果目前的結果小於紀錄，則緩慢下降（防止被舊的高點鎖死）
			if (result > mapping.state.max) {
				mapping.state.max = result; // 瞬間跟進最高點
			} else {
				mapping.state.max = mapping.state.max * 0.995 + result * 0.005; // 稍微加快下降速度 (0.001 -> 0.005)
			}
		}

		// 區間對映與非線性縮放
		let range = mapping.state.max - mapping.state.min;
		let normalized = range > 0.0001 ? (result - mapping.state.min) / range : 0.5;
		
		// 增加一點張力
		result = Math.sqrt(Math.max(0, normalized)); 

		// 更新 Peak (快升慢降)
		if (result > (mapping.peak || 0)) {
			mapping.peak = result;
		} else {
			mapping.peak *= 0.992; // 稍快一點的下降，視覺較俐落
		}

		// 映射回 User 設定的 min/max 並平滑化輸出
		const targetVal = min + (max - min) * result;
		this.params[mapping.key] += (targetVal - this.params[mapping.key]) * 0.15; // 增加反應速度

		// 更新 UI (CSS Variable)
		if (mapping.el) {
			mapping.el.value = this.params[mapping.key];
			mapping.el.style.setProperty('--peak', mapping.peak);
		}
	}
	
	async initAudio(audioPath = null) {
		// UI 與 陀螺儀 (保持不變) for legacy page
		document.getElementById('overlay').style.display = 'none';
		const uiElements = ['ui-layer', 'mode-hint', 'link', 'lockGyro', 'hideUI'];
		uiElements.forEach(id => {
			const el = document.getElementById(id);
			if (el) el.style.display = 'block';
		});
		
		// 初始化核心組件 (只做一次)
		if (!this.audioContext) {
			this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
			this.analyser = this.audioContext.createAnalyser();
			this.analyser.fftSize = 256;
			this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
			
			// ⭐ 新增 Panner
			this.panner = this.audioContext.createPanner();
			this.panner.panningModel = 'HRTF';     // 立體空間感
			this.panner.distanceModel = 'inverse';
			this.panner.refDistance = 1;
			this.panner.maxDistance = 100;
			this.panner.rolloffFactor = 0.1;
		}

		// 模式切換邏輯
		if (audioPath === 'mic') {
			// --- 進入麥克風模式 ---
			
			// 停止並斷開 MP3
			if (this.audio) {
				this.audio.pause();
				// 如果有 MP3 source，斷開它與分析器的連線
				if (this.source) this.source.disconnect();
			}

			try {
				const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
				// 建立麥克風 Source
				this.micSource = this.audioContext.createMediaStreamSource(stream);
				this.analyser.smoothingTimeConstant = 0.8;
				this.micSource.connect(this.analyser);
				//this.analyser.connect(this.panner);
				
				// 注意：麥克風不要接 destination，否則會出現恐怖的迴授音(嘯叫)
				this.analyser.disconnect();
				
				//console.log("Mode: Microphone Input");
			} catch (err) {
				console.error("Mic access failed", err);
				return;
			}
		} else {
			// --- 進入 MP3 模式 ---
			
			// 斷開麥克風連線
			if (this.micSource) {
				this.micSource.disconnect();
				this.micSource = null;
			}

			// 初始化或更新 MP3 播放器
			if (!this.audio) {
				this.audio = new Audio();
				this.audio.crossOrigin = "anonymous";
				this.audio.loop = true;
				this.source = this.audioContext.createMediaElementSource(this.audio);
			}

			// 重新連接連線並導向喇叭
			this.source.connect(this.panner);
			this.panner.connect(this.analyser);
			this.analyser.connect(this.audioContext.destination);

			// 換歌並播放
			this.dataArray.fill(0)
			this.audio.src = audioPath;
			await this.audio.play();
			this.isBPMLocked = false;
			this.lastFlashTime = 0;  // 關鍵：歸零
			this.lockedInterval = 0;
			//console.log("Mode: MP3 File - " + audioPath);
		}

		if (this.audioContext.state === 'suspended') {
			await this.audioContext.resume();
		}
	}
	
	// 在你的 AudioMap 類別內
	async switchTrack(audioPath) {
		// 清理舊的 audio 物件
		if (this.audio) {
			this.audio.pause();
			this.audio.src = "";
			this.audio.load();
			// 註：MediaElementSource 建立後通常無法中斷，
			// 建議維持同一個 Context，只換 Audio 物件的 src。
		}

		// 重新呼叫 initAudio
		this.isReady = false; 
		await this.initAudio(audioPath);
	}
	
	/**
	 * 啟動陀螺儀
	 * @param {Object} config - 設定參數 { range: 45 }
	 * @param {Function} onUpdate - 更新時的回呼 (data) => {}
	 */
	async initGyro(config = {}, onUpdate = null) {
		const settings = { range: config.range || 45, ...config };
		
		// 將這些變數存在閉包內，確保 reset 後能重新校準
		let baseQ = null;
		let startOffset = { x: 0, y: 0 };
		let firstFrameProcessed = false;

		// 權限請求 (iOS 專用)
		let granted = false;
		if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
			try {
				const permission = await DeviceOrientationEvent.requestPermission();
				granted = (permission === 'granted');
			} catch (e) {
				granted = false;
			}
		} else {
			granted = true; 
		}

		if (!granted) return { success: false };

		const eulerToQuaternion = (alpha, beta, gamma) => {
			const _x = (beta || 0) * (Math.PI / 180);
			const _y = (gamma || 0) * (Math.PI / 180);
			const _z = (alpha || 0) * (Math.PI / 180);
			const cX = Math.cos(_x / 2), sX = Math.sin(_x / 2);
			const cY = Math.cos(_y / 2), sY = Math.sin(_y / 2);
			const cZ = Math.cos(_z / 2), sZ = Math.sin(_z / 2);
			// Z-X-Y 順序
			return [
				sX * cY * cZ - cX * sY * sZ,
				cX * sY * cZ + sX * cY * sZ,
				cX * cY * sZ + sX * sY * cZ,
				cX * cY * cZ - sX * sY * sZ
			];
		};
		
		// 在 handleOrientation 外部定義狀態，用來保存上一次的平滑值
		let smoothX = 0;
		let smoothY = 0;
		const lerpFactor = 0.05; // 防手震強度：0.01 ~ 0.1 之間。越小越穩，但延遲感會增加。

		// --- 抽離出的重置函數 ---
		const resetBase = (currentQ, dx, dy) => {
			baseQ = currentQ;
			startOffset.x = dx;
			startOffset.y = dy;
			
			// 同步重置平滑值，避免重置後畫面「彈跳」回中央
			smoothX = 0;
			smoothY = 0;
			
			//console.log("Gyro Base Reset!");
		};
		
		const handleOrientation = (event) => {
			if (event.beta === null || event.gamma === null || (this.isGyroLocked && baseQ !== null)) return;

			const currentQ = eulerToQuaternion(event.alpha, event.beta, event.gamma);
			const [qx, qy, qz, qw] = currentQ;

			const dx = 2 * (qx * qz + qw * qy);
			const dy = 2 * (qy * qz - qw * qx);

			// 第一次執行或手動重置後會進來
			if (baseQ === null) {
				resetBase(currentQ, dx, dy);
				//return;
			}

			const sensitivity = 90 / settings.range;

			// 這是本次採樣得到的「目標值」
			let targetX = (dx - startOffset.x) * sensitivity;
			let targetY = (dy - startOffset.y) * sensitivity;

			// --- 防手震核心：線性插值 (Lerp) ---
			// Formula: Current = Current + (Target - Current) * Factor
			smoothX += (targetX - smoothX) * lerpFactor;
			smoothY += (targetY - smoothY) * lerpFactor;

			if (onUpdate) {
				onUpdate({
					// 使用平滑後的數值，並進行邊界限制
					x: Math.max(-1, Math.min(1, smoothX)),
					y: Math.max(-1, Math.min(1, smoothY))
				});
			}
		};


		window.addEventListener('deviceorientation', handleOrientation);
		
		const indicators = document.querySelectorAll('.gyro-indicator');
		indicators.forEach(el => {
			el.addEventListener('click', () => {
				// 將 baseQ 設為 null，下次 handleOrientation 執行時就會觸發 resetBase
				baseQ = null;
				this.updateGyroUI();
				
				// 可加入視覺回饋，讓使用者知道有點到
				el.style.color = '#fff';
				setTimeout(() => el.style.color = '#999', 300);
			});
		});
		
		await this.unlockGyro();
		
		return {
			success: true,
			reset: () => { 
				baseQ = null; 
				//console.log("Gyro Recalibrated");
			},
			stop: () => window.removeEventListener('deviceorientation', handleOrientation)
		};
	}

	updateGyroUI() {
		const { x, y } = this.orient; // 這是你處理後的 -1 ~ 1 數值
		
		// 更新數值顯示
		const valDisplay = document.getElementById('gyro-values');
		if (valDisplay) valDisplay.innerText = `X: ${x.toFixed(2)}, Y: ${y.toFixed(2)}`;

		// 取得元件
		const up = document.getElementById('gyro-up');
		const down = document.getElementById('gyro-down');
		const left = document.getElementById('gyro-left');
		const right = document.getElementById('gyro-right');

		if (!up) return;

		// 邏輯：值 > 0 顯示 (根據你的座標定義，Y 通常是前後，X 是左右)
		// 這裡假設 Y 負值為上，正值為下；X 負值為左，正值為右
		up.style.display    = (y > 0.1) ? 'block' : 'none'; // 向上傾斜
		down.style.display  = (y < -0.1)  ? 'block' : 'none'; // 向後傾斜
		left.style.display  = (x < -0.1) ? 'block' : 'none'; // 向左傾斜
		right.style.display = (x > 0.1)  ? 'block' : 'none'; // 向右傾斜
	}
	
	async startEngine(shaderPath) {
		// 將 init 的邏輯搬進來
		this.scene = new THREE.Scene();
		this.camera = new THREE.Camera();
		this.renderer = new THREE.WebGLRenderer({ antialias: true });
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		document.getElementById('container').appendChild(this.renderer.domElement);

		// 設定 Material (使用 this.params)
		this.material = new THREE.ShaderMaterial({
			uniforms: {
				u_res: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
				u_time: { value: 0.0 },
				u_volume: { value: 0.0 },
				u_volume_smooth: { value: 0.0 },
				u_last_volume: { value: 0.0 },
				u_peak: { value: 0.0 },
				u_orient: { value: new THREE.Vector2(0.5, 0.5) },
				// --- 加入 UI 參數 ---
				u_intensity: { value: this.params.intensity },
				u_complexity: { value: this.params.complexity },
				u_speed: { value: this.params.speed },
				u_darkGlow: { value: 0.0 },
				u_progress: { value: 0.0 },
				u_camera: { value: new THREE.Texture() }, // 先給一個空紋理佔位
				u_useCamera: { value: 0.0 },
				u_prevFrame: { value: new THREE.Texture() },
			},
			vertexShader: `void main() { gl_Position = vec4(position, 1.0); }`,
			fragmentShader: `void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }`
		});

		await this.loadShader(shaderPath);
		const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
		this.scene.add(mesh);
		
		// 啟動渲染迴圈
		const animate = () => {
			requestAnimationFrame(animate);
			
			if (document.hidden) return;
			
			this.internalUpdate(); // 處理音訊、時間、Uniforms 同步
		};
		animate();
		
		// 處理 Resize
		window.addEventListener('resize', () => {
			this.renderer.setSize(window.innerWidth, window.innerHeight);
			this.material.uniforms.u_res.value.set(window.innerWidth, window.innerHeight);
		});
	}
	
	internalUpdate(){
		// 更新時間
		this.material.uniforms.u_time.value += 0.01 + this.params.speed * 0.02;

		if (this && this.analyser && this.dataArray) {
			
			this.updateAudioReaction();
			this.updateGyroUI();
			
			this.material.uniforms.u_progress.value = this.audio.currentTime / this.audio.duration;
			this.material.uniforms.u_orient.value.set(this.orient.x, this.orient.y);
		}
		
		// 2. 檢測：這個 Shader 到底需不需要「記憶」？
		// 檢查 fragmentShader 的原始碼字串
		const needsFeedback = this.material.fragmentShader.includes('u_prevFrame');
		
		if (needsFeedback) {
			// --- 走記憶模式 ---
			this.material.uniforms.u_prevFrame.value = this.targetB.texture;

			this.renderer.setRenderTarget(this.targetA);
			this.renderer.render(this.scene, this.camera);

			this.renderer.setRenderTarget(null);
			this.renderer.render(this.scene, this.camera);

			// 交換 A B
			let temp = this.targetA;
			this.targetA = this.targetB;
			this.targetB = temp;
		} else {
			// --- 走普通模式：直接畫在螢幕上 ---
			this.renderer.render(this.scene, this.camera);
		}
	}
	
	updateIdleMode(interval) {
		this.isShaderLoading = false; // 新增一個狀態鎖
		
		// 取得所有可用的 Shader 選項 (排除掉第一個 "VISUALIZER" 提示)
		const options = Array.from(this.shaderSelect.options).filter(opt => opt.value !== "");

		// 啟動或維持定時器
		if (!this.idleTimer) {
			this.idleTimer = setInterval(() => {
				// 檢查鎖定狀態：如果正在加載中，則跳過這一次循環
				if (this.isShaderLoading) return;
				
				// 只有在 overlay 顯示時才自動切換
				if (this.overlay.style.display !== 'none' && options.length > 0) {
					this.isShaderLoading = true; // 上鎖：開始信息重塑
					
					try {
						// 計算下一個索引
						this.currentShaderIndex = (this.currentShaderIndex + 1) % options.length;
						const nextShaderPath = options[this.currentShaderIndex].value;

						// 更新 select 的顯示狀態（讓使用者知道現在換到哪了）
						this.shaderSelect.value = nextShaderPath;

						// 執行加載
						//console.log("Idle Mode: Switching to", options[this.currentShaderIndex].innerText);
						Promise.allSettled([
							this.loadShader(nextShaderPath),
							this.toggleDarkGlow(0.33)
						]);
						
					} catch (err) {
						console.error("顯化失敗:", err);
					} finally {
						this.isShaderLoading = false; // 開鎖：完成信息對齊
					}
				} else if (this.overlay.style.display === 'none') {
					// 如果音樂開始了 (overlay 消失)，清除定時器省電
					clearInterval(this.idleTimer);
					this.idleTimer = null;
				}
			}, interval);
		}
	}
}

class CameraManager {
    constructor() {
        this.video = document.createElement('video');
        this.video.autoplay = true;
        this.video.muted = true;
        this.video.playsInline = true;
        this.stream = null;
        this.isCameraActive = false;
    }

    async toggleCamera() {
        if (this.isCameraActive) {
            this.stop();
            return false;
        }
        
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: "environment" } // 手機端預設前鏡頭，要拍風景改 "environment"
            });
            this.video.srcObject = this.stream;
            this.isCameraActive = true;
            return true;
        } catch (err) {
            this.useCamera.style.color="red";
            return false;
        }
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.isCameraActive = false;
        }
    }
}
