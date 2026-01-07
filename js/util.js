/**
 * Universe UI & Audio Utility
 * 整合 Web Components 與音訊反應邏輯
 */

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
                font-family: 'Courier New', Courier, monospace; letter-spacing: 1px;
            }
            input[type=range] { -webkit-appearance: none; width: 180px; background: transparent; }
            input[type=range]:focus { outline: none; }
            input[type=range]::-webkit-slider-runnable-track { width: 100%; height: 1px; background: #999; }
            input[type=range]::-webkit-slider-thumb {
                -webkit-appearance: none; height: 12px; width: 12px; 
                background: #999; cursor: pointer; margin-top: -5.5px;
                border-radius: 0; border: 1px solid #fff;
            }
        </style>
        <div class="control-group">
            <label>${this.getAttribute('label') || ''}</label>
            <input type="range" id="inner-input" 
                min="${this.getAttribute('min') || 0}" 
                max="${this.getAttribute('max') || 1}" 
                step="${this.getAttribute('step') || 0.01}" 
                value="${this.getAttribute('value') || 0.5}">
        </div>`;
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
        this.params = params; // 引用外部 params 物件
        this.audioMappings = [];
    }

    /**
     * 生成 UI 並綁定邏輯
     * @param {string} containerId - 容器的 ID (如 'ui-layer')
     * @param {Array} configs - Slider 的配置陣列
     */
    buildUI(containerId, configs) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // A. 動態生成 HTML
        container.innerHTML = configs.map(cfg => `
            <map-slider 
                id="${cfg.id}" 
                label="${cfg.label}" 
                min="${cfg.min}" 
                max="${cfg.max}" 
                step="${cfg.step}" 
                value="${this.params[cfg.key]}">
            </map-slider>
        `).join('');

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

		this.audioMappings.forEach(mapping => {
			const el = mapping.el;
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
			const min = parseFloat(el.min);
			const max = parseFloat(el.max);
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
		// 1. UI 顯示切換
		document.getElementById('overlay').style.display = 'none';
		const uiElements = ['ui-layer', 'mode-hint', 'link'];
		uiElements.forEach(id => {
			const el = document.getElementById(id);
			if (el) el.style.display = 'block';
		});

		// 2. 陀螺儀授權 (針對 iOS 13+)
		if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
			try {
				const permission = await DeviceOrientationEvent.requestPermission();
				if (permission === 'granted') {
					window.addEventListener('deviceorientation', handleOrientation);
				}
			} catch (e) { console.error("Gyro permission denied", e); }
		} else {
			window.addEventListener('deviceorientation', handleOrientation);
		}

		// 3. 初始化 AudioContext
		const audioContext = new (window.AudioContext || window.webkitAudioContext)();
		this.analyser = audioContext.createAnalyser();
		this.analyser.fftSize = 256;

		// 4. 根據參數決定來源 (路徑為空則吃 Mic)
		if (!audioPath) {
			// --- 麥克風模式 ---
			try {
				const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
				const source = audioContext.createMediaStreamSource(stream);
				this.analyser.smoothingTimeConstant = 0.8; // 麥克風建議滑順一點
				source.connect(this.analyser);
				console.log("Mode: Microphone Input");
			} catch (err) {
				console.error("Mic access failed", err);
				alert("無法存取麥克風，請檢查權限設定。");
				return;
			}
		} else {
			// --- MP3 模式 ---
			const audio = new Audio(audioPath);
			audio.crossOrigin = "anonymous";
			audio.loop = true;
			const source = audioContext.createMediaElementSource(audio);
			source.connect(this.analyser);
			this.analyser.connect(audioContext.destination);
			audio.play();
			console.log("Mode: MP3 File - " + audioPath);
		}

		// 5. 準備數據陣列
		this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
		
		if (audioContext.state === 'suspended') {
			await audioContext.resume();
		}
	}
}
