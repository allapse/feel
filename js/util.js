/**
 * Universe UI & Audio Utility
 * 整合 Web Components 與音訊反應邏輯
 */

class MapSlider extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
		this.audio = null;
		this.source = null;
		this.analyser = null;
		this.audioContext = null;
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

			input[type=range] { -webkit-appearance: none; width: 180px; background: transparent; }
            input[type=range]:focus { outline: none; }
			input[type=range]::-webkit-slider-runnable-track { width: 100%; height: 1px; background: #999; }

			input[type=range]::-webkit-slider-thumb {
				-webkit-appearance: none; 
				height: 15px; width: 15px; 
				margin-top: -6.5px;
				border-radius: 5px;
				border: 1px solid #999;
				
				/* 核心：JS 傳入 1.0 時是純白 + 爆亮，0.0 時是暗灰 */
				background: rgb(
					calc(128 + var(--flash) * 175), 
					calc(128 + var(--flash) * 175), 
					calc(128 + var(--flash) * 175)
				);
			}
		</style>
		<div class="control-group" id="group" style="--flash: 0;">
			<label>${this.getAttribute('label') || ''}</label>
            <input type="range" id="inner-input" 
                min="${this.getAttribute('min') || 0}" 
                max="${this.getAttribute('max') || 1}" 
                step="${this.getAttribute('step') || 0.01}" 
                value="${this.getAttribute('value') || 0.5}">
        </div>`;
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
    constructor(params) {
		this.params = params;
		this.audioMappings = [];
		
		// BPM 鎖定邏輯相關變數
		this.isBPMLocked = false;
		this.lockedInterval = 1000; // 預設 60 BPM (1000ms)
		this.lastFlashTime = 0;
		this.beatValue = 0;
		this.beatHistory = []; // 用來紀錄前幾拍的間隔
	}

    /**
     * 生成 UI 並綁定邏輯
     * @param {string} containerId - 容器的 ID (如 'ui-layer')
     * @param {Array} configs - Slider 的配置陣列
     */
    async buildUI(containerId, configs, jsonPath) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // A. 動態生成 HTML
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
		
			// 1. 讀取音樂清單 JSON
		let musicList = [];
		try {
			const response = await fetch('assets/audio/list.json');
			musicList = await response.json();
		} catch (e) {
			console.error("讀取音樂清單失敗:", e);
			// 備用方案
			//musicList = [{ name: "預設音樂", path: "./music/default.mp3" }];
		}
		
		let optionsHtml = musicList.map(m => 
			`<option value="${m.path}">${m.name}</option>`
		).join('');

		container.innerHTML = `
			${slidersHtml}
			<style>
				.music-group { margin-top: 20px; width: 180px; position: relative; }
				.music-label { font-size: 9px; color: #999; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 8px; }
				.music-select {
					width: 100%; background: transparent; color: #999;
					border: none; border-bottom: 1px solid #999;
					font-size: 11px; outline: none;
					-webkit-appearance: none; padding: 0px; cursor: pointer;
					 margin-left: 2px; 
				}
				.music-group::after { content: '▼'; font-size: 8px; color: #999; position: absolute; right: 0; bottom: 8px; pointer-events: none; }
				.music-select option { font-size: 11px; background: #000; color: #999;}
			</style>
			<div class="music-group">
				<select id="music-select" class="music-select">
					<option value="" disabled selected></option>
					${optionsHtml}
				</select>
			</div>
		`;

        // B. 定義綁定邏輯的函式
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

				return { ...cfg, el, peak: 100 };
			}).filter(m => m !== null);
			
			// --- 2. 綁定音樂選單 (新增邏輯) ---
			const musicSelect = document.getElementById('music-select');
			if (musicSelect) {
				// 這裡使用 change 事件來實時切換
				musicSelect.onchange = async (e) => {
					await this.switchTrack(e.target.value);
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
    }

    /**
     * 在 animate 循環中更新音訊反應
     * @param {Uint8Array} dataArray - 分析器傳出的頻率數據
     * @param {Object} material - Three.js 的 ShaderMaterial
     */
    updateAudioReaction(dataArray, material) {
        if (!dataArray || !this.audioMappings.length) return;
		
		const now = Date.now();

		// --- A. 節拍邏輯 (固定節奏) ---
		if (!this.isBPMLocked) {
			let bassAvg = (dataArray[0] + dataArray[1] + dataArray[2]) / 3;
			if (bassAvg > 200 && (now - this.lastFlashTime) > 300) {
				if (this.lastFlashTime !== 0) {
					const interval = now - this.lastFlashTime;
					const roundedBPM = Math.round((60000 / interval) / 5) * 3;
					this.lockedInterval = 60000 / roundedBPM;
					this.isBPMLocked = true;
				}
				this.lastFlashTime = now;
				this.beatValue = 1.0;
			}
		} else {
			// 鎖定後，時間到了就重置為 1.0
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

			// 1. 執行閃爍 (門檻設為 1% 的開度)
			if (customEl && customEl.flash) {
				// 只有當開度 > 1% 且 beatValue 真的有值時才閃
				if (percent > 0.01) {
					customEl.flash(this.beatValue);
				} else {
					customEl.flash(0);
				}
			}
			
			if (!el || el.dataset.isDragging === "true") return;

			// --- 1~4. 你的核心計算邏輯 (平均值、峰值、Power 縮放) ---
			let sum = 0;
			for (let i = mapping.range[0]; i <= mapping.range[1]; i++) sum += dataArray[i];
			let currentAvg = Math.max(0, (sum / (mapping.range[1] - mapping.range[0] + 1)));
			
			// 2. 強化：扣除底噪門檻 (讓數值更有「空間」呼吸)
			const noiseFloor = 30; 
			currentAvg = Math.max(0, currentAvg - noiseFloor);

			// 3. 強化：動態峰值 (快速上升，極慢下降)
			if (currentAvg > mapping.peak) mapping.peak += (currentAvg - mapping.peak) * 0.2;
			else mapping.peak *= 0.99995;

			let ratio = Math.pow(currentAvg / Math.max(mapping.peak, 50), 1.5);

			// --- 5. 更新數據與 UI ---
			const targetVal = min + (max - min) * ratio;

			// 核心：更新這個被引用的 params 物件
			this.params[mapping.key] += (targetVal - this.params[mapping.key]) * 0.1;
			el.value = this.params[mapping.key];
			
			// --- 6. 條件式更新 Material (僅在傳入 material 時執行) ---
			if (material && material.uniforms) {
				const uKey = "u_" + mapping.key;
				if (material.uniforms[uKey]) {
					material.uniforms[uKey].value = this.params[mapping.key];
				}
			}
		});
    }
	
	async initAudio(audioPath = null) {
		// 1. UI 與 陀螺儀 (保持不變)
		document.getElementById('overlay').style.display = 'none';
		const uiElements = ['ui-layer', 'mode-hint', 'link'];
		uiElements.forEach(id => {
			const el = document.getElementById(id);
			if (el) el.style.display = 'block';
		});

		// 2. 初始化核心組件 (只做一次)
		if (!this.audioContext) {
			this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
			this.analyser = this.audioContext.createAnalyser();
			this.analyser.fftSize = 256;
			this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
		}

		// 3. 模式切換邏輯
		if (audioPath === 'mic') {
			// --- 進入麥克風模式 ---
			
			// A. 停止並斷開 MP3
			if (this.audio) {
				this.audio.pause();
				// 如果有 MP3 source，斷開它與分析器的連線
				if (this.source) this.source.disconnect();
			}

			try {
				const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
				// B. 建立麥克風 Source
				this.micSource = this.audioContext.createMediaStreamSource(stream);
				this.analyser.smoothingTimeConstant = 0.8;
				this.micSource.connect(this.analyser);
				
				// 注意：麥克風不要接 destination，否則會出現恐怖的迴授音(嘯叫)
				this.analyser.disconnect(this.audioContext.destination);
				
				console.log("Mode: Microphone Input");
			} catch (err) {
				console.error("Mic access failed", err);
				return;
			}
		} else {
			// --- 進入 MP3 模式 ---
			
			// A. 斷開麥克風連線
			if (this.micSource) {
				this.micSource.disconnect();
				this.micSource = null;
			}

			// B. 初始化或更新 MP3 播放器
			if (!this.audio) {
				this.audio = new Audio();
				this.audio.crossOrigin = "anonymous";
				this.audio.loop = true;
				this.source = this.audioContext.createMediaElementSource(this.audio);
			}

			// C. 重新連接連線並導向喇叭
			this.source.connect(this.analyser);
			this.analyser.connect(this.audioContext.destination);

			// D. 換歌並播放
			this.audio.src = audioPath;
			await this.audio.play();
			this.isBPMLocked = false;
			this.lastFlashTime = 0;  // 關鍵：歸零
			this.lockedInterval = 0;
			console.log("Mode: MP3 File - " + audioPath);
		}

		if (this.audioContext.state === 'suspended') {
			await this.audioContext.resume();
		}
	}
	
	// 在你的 AudioMap 類別內
	async switchTrack(audioPath) {
		// 1. 清理舊的 audio 物件
		if (this.audio) {
			this.audio.pause();
			this.audio.src = "";
			this.audio.load();
			// 註：MediaElementSource 建立後通常無法中斷，
			// 建議維持同一個 Context，只換 Audio 物件的 src。
		}

		// 2. 重新呼叫 initAudio
		this.isReady = false; 
		await this.initAudio(audioPath);
	}
	
	// util.js

	/**
	 * 啟動陀螺儀
	 * @param {Object} config - 設定參數 { range: 45 }
	 * @param {Function} onUpdate - 更新時的回呼 (data) => {}
	 */
	async initGyro(config = {}, onUpdate = null) {
		const settings = {
			range: config.range || 45, // 傾斜幾度會達到 1 或 -1
			...config
		};

		let baseGamma = null;
		let baseBeta = null;

		const handleOrientation = (event) => {
			const x = event.gamma || 0;
			const y = event.beta || 0;

			// 1. 紀錄基準點
			if (baseGamma === null) {
				baseGamma = x;
				baseBeta = y;
			}

			// 2. 計算偏移量
			const deltaX = x - baseGamma;
			const deltaY = y - baseBeta;

			// 3. 歸一化處理 (輸出 -1 到 1)
			const data = {
				x: Math.max(-1, Math.min(1, deltaX / settings.range)),
				y: Math.max(-1, Math.min(1, deltaY / settings.range)),
				raw: { deltaX, deltaY }
			};

			if (onUpdate) onUpdate(data);
		};

		// iOS 授權邏輯
		let granted = false;
		if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
			try {
				const permission = await DeviceOrientationEvent.requestPermission();
				granted = (permission === 'granted');
			} catch (e) {
				console.error("Gyro permission denied", e);
			}
		} else {
			granted = true; // Android 或電腦模擬
		}

		if (granted) {
			window.addEventListener('deviceorientation', handleOrientation);
		}

		return {
			success: granted,
			reset: () => { baseGamma = null; baseBeta = null; },
			stop: () => window.removeEventListener('deviceorientation', handleOrientation)
		};
	}
}
