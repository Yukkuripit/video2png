(function() {
    'use strict';

    // ----- DOM 参照 -----
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const videoPlayer = document.getElementById('videoPlayer');
    const previewSection = document.getElementById('previewSection');

    const videoName = document.getElementById('videoName');
    const videoDuration = document.getElementById('videoDuration');
    const videoResolution = document.getElementById('videoResolution');
    const fpsInfo = document.getElementById('fpsInfo');

    const extractBtn = document.getElementById('extractBtn');
    const downloadAllBtn = document.getElementById('downloadAllBtn');
    const clearBtn = document.getElementById('clearBtn');
    const statusText = document.getElementById('statusText');
    const progressWrap = document.getElementById('progressWrap');
    const progressBar = document.getElementById('progressBar');
    const frameGrid = document.getElementById('frameGrid');
    const frameCountLabel = document.getElementById('frameCountLabel');

    const frameCountSlider = document.getElementById('frameCountSlider');
    const frameCountValue = document.getElementById('frameCountValue');

    // 利用規約モーダル
    const termsModal = document.getElementById('termsModal');
    const termsBtn = document.getElementById('termsBtn');
    const termsCloseBtn = document.getElementById('termsCloseBtn');
    const termsCloseBtn2 = document.getElementById('termsCloseBtn2');

    // ----- テーマ切替 -----
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = document.getElementById('themeIcon');

    function getPreferredTheme() {
        const saved = localStorage.getItem('video2png-theme');
        if (saved) return saved;
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    function setTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark-theme');
            themeIcon.className = 'fas fa-sun';
        } else {
            document.documentElement.classList.remove('dark-theme');
            themeIcon.className = 'fas fa-moon';
        }
        localStorage.setItem('video2png-theme', theme);
    }

    function toggleTheme() {
        const isDark = document.documentElement.classList.contains('dark-theme');
        setTheme(isDark ? 'light' : 'dark');
    }

    setTheme(getPreferredTheme());
    themeToggle.addEventListener('click', toggleTheme);

    if (window.matchMedia) {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        media.addEventListener('change', (e) => {
            if (!localStorage.getItem('video2png-theme')) {
                setTheme(e.matches ? 'dark' : 'light');
            }
        });
    }

    // ----- スライダー連動 -----
    frameCountSlider.addEventListener('input', () => {
        frameCountValue.textContent = frameCountSlider.value;
        if (videoPlayer.duration && videoPlayer.duration > 0) {
            const count = parseInt(frameCountSlider.value, 10);
            const fps = count / videoPlayer.duration;
            fpsInfo.textContent = `⚙️ FPS: ${fps.toFixed(2)} → ${count}枚`;
        }
    });

    // ----- 利用規約モーダル制御 -----
    function openTermsModal() {
        termsModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeTermsModal() {
        termsModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    termsBtn.addEventListener('click', openTermsModal);
    termsCloseBtn.addEventListener('click', closeTermsModal);
    termsCloseBtn2.addEventListener('click', closeTermsModal);

    // モーダル外クリックで閉じる
    termsModal.addEventListener('click', (e) => {
        if (e.target === termsModal) {
            closeTermsModal();
        }
    });

    // ESCキーで閉じる
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && termsModal.classList.contains('active')) {
            closeTermsModal();
        }
    });

    // ----- 状態 -----
    let currentFile = null;
    let extractedFrames = [];
    let isExtracting = false;

    // ----- ユーティリティ -----
    function formatDuration(sec) {
        if (!sec || sec < 0) return '0';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return m > 0 ? `${m}m${s}s` : `${s}s`;
    }

    function setStatus(msg, isGood = true) {
        statusText.textContent = msg;
        statusText.style.color = isGood ? 'var(--text-badge)' : '#b22234';
    }

    function setProgress(pct) {
        progressWrap.classList.add('active');
        progressBar.style.width = Math.min(100, Math.max(0, pct)) + '%';
        if (pct >= 100) {
            setTimeout(() => {
                progressWrap.classList.remove('active');
                progressBar.style.width = '0%';
            }, 500);
        }
    }

    // ----- 有効フレーム判定 -----
    function isFrameValid(imageData) {
        const data = imageData.data;
        let sum = 0;
        let sumSq = 0;
        const pixelCount = data.length / 4;

        let allBlack = true;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            if (r > 5 || g > 5 || b > 5) {
                allBlack = false;
                break;
            }
        }
        if (allBlack) return false;

        for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
            sum += gray;
            sumSq += gray * gray;
        }
        const avg = sum / pixelCount;
        const variance = (sumSq / pixelCount) - avg * avg;
        const stdDev = Math.sqrt(variance);

        return stdDev >= 1.5;
    }

    // ----- フレーム抽出 -----
    async function extractFrames(videoFile, targetCount) {
        if (isExtracting) return;

        targetCount = Math.min(50, Math.max(1, Math.floor(targetCount)));
        if (targetCount < 1) targetCount = 1;

        isExtracting = true;
        extractBtn.disabled = true;
        downloadAllBtn.disabled = true;
        setStatus('⏳ 読み込み中…');

        clearFrames();

        const url = URL.createObjectURL(videoFile);
        videoPlayer.src = url;

        await new Promise((resolve, reject) => {
            videoPlayer.onloadedmetadata = resolve;
            videoPlayer.onerror = () => reject(new Error('動画読み込みエラー'));
            if (videoPlayer.readyState >= 1) resolve();
        });

        const duration = videoPlayer.duration;
        if (!duration || duration <= 0) {
            setStatus('❌ 動画の長さが取得できません', false);
            isExtracting = false;
            extractBtn.disabled = false;
            return;
        }

        const initialFps = targetCount / duration;
        fpsInfo.textContent = `⚙️ FPS: ${initialFps.toFixed(2)} → ${targetCount}枚`;
        setStatus(`⏳ 抽出中… 0 / ${targetCount}`);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = videoPlayer.videoWidth || 640;
        canvas.height = videoPlayer.videoHeight || 360;

        const frames = [];
        let collected = 0;
        const interval = duration / targetCount;
        let currentTime = interval * 0.5;
        let attempts = 0;
        const maxAttempts = targetCount * 20;

        // 第1フェーズ：有効フレームを収集
        while (collected < targetCount && currentTime < duration && attempts < maxAttempts) {
            const t = Math.min(currentTime, duration - 0.01);
            videoPlayer.currentTime = t;

            await new Promise((resolve) => {
                const onSeeked = () => {
                    videoPlayer.removeEventListener('seeked', onSeeked);
                    resolve();
                };
                videoPlayer.addEventListener('seeked', onSeeked);
                if (Math.abs(videoPlayer.currentTime - t) < 0.01) {
                    videoPlayer.removeEventListener('seeked', onSeeked);
                    resolve();
                }
            });

            ctx.drawImage(videoPlayer, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            if (isFrameValid(imageData)) {
                const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
                const frameUrl = URL.createObjectURL(blob);
                frames.push({ blob, url: frameUrl, time: t, index: collected + 1 });
                collected++;
                currentTime += interval;
            } else {
                currentTime += interval * 0.15;
            }
            attempts++;

            setProgress((collected / targetCount) * 100);
            setStatus(`⏳ 抽出中… ${collected} / ${targetCount}`);
        }

        // 第2フェーズ：強制補完
        if (collected < targetCount) {
            const remaining = targetCount - collected;
            const fallbackInterval = duration / (targetCount + 1);
            let fallbackTime = fallbackInterval * 0.5;
            const existingTimes = new Set(frames.map(f => Math.round(f.time * 100)));
            let fallbackAttempts = 0;

            while (collected < targetCount && fallbackTime < duration && fallbackAttempts < remaining * 5) {
                const t = Math.min(fallbackTime, duration - 0.01);
                const rounded = Math.round(t * 100);
                if (!existingTimes.has(rounded)) {
                    videoPlayer.currentTime = t;
                    await new Promise((resolve) => {
                        const onSeeked = () => {
                            videoPlayer.removeEventListener('seeked', onSeeked);
                            resolve();
                        };
                        videoPlayer.addEventListener('seeked', onSeeked);
                        if (Math.abs(videoPlayer.currentTime - t) < 0.01) {
                            videoPlayer.removeEventListener('seeked', onSeeked);
                            resolve();
                        }
                    });

                    ctx.drawImage(videoPlayer, 0, 0, canvas.width, canvas.height);
                    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
                    const frameUrl = URL.createObjectURL(blob);
                    frames.push({ blob, url: frameUrl, time: t, index: collected + 1 });
                    collected++;
                    existingTimes.add(rounded);
                }
                fallbackTime += fallbackInterval;
                fallbackAttempts++;
                setProgress((collected / targetCount) * 100);
                setStatus(`⏳ 補完中… ${collected} / ${targetCount}`);
            }
        }

        extractedFrames = frames;
        renderFrames(frames);

        if (frames.length === 0) {
            setStatus('❌ フレームが抽出できませんでした（動画が破損の可能性）', false);
            downloadAllBtn.disabled = true;
        } else {
            const msg = frames.length < targetCount
                ? `⚠️ ${frames.length} 枚（有効フレーム不足のため補完）`
                : `✅ ${frames.length} 枚（有効フレームのみ）`;
            setStatus(msg);
            downloadAllBtn.disabled = false;
        }

        frameCountLabel.textContent = `抽出フレーム: ${frames.length}`;
        const finalFps = frames.length / duration;
        fpsInfo.textContent = `⚙️ FPS: ${finalFps.toFixed(2)} → ${frames.length}枚`;

        videoPlayer.currentTime = 0;
        isExtracting = false;
        extractBtn.disabled = false;
        URL.revokeObjectURL(url);
    }

    // ----- レンダリング -----
    function renderFrames(frames) {
        frameGrid.innerHTML = '';
        if (!frames || frames.length === 0) {
            frameGrid.innerHTML = `<p class="empty"><i class="fas fa-film"></i> 抽出されたフレームがありません</p>`;
            return;
        }

        const fragment = document.createDocumentFragment();
        frames.forEach((f) => {
            const card = document.createElement('div');
            card.className = 'card';

            const img = document.createElement('img');
            img.src = f.url;
            img.alt = `frame ${f.index}`;
            img.loading = 'lazy';

            const info = document.createElement('div');
            info.className = 'info';
            info.innerHTML = `
                <span class="idx">#${f.index}</span>
                <span class="time">${f.time.toFixed(1)}s</span>
                <button class="dl-btn" data-index="${f.index}"><i class="fas fa-download"></i></button>
            `;

            info.querySelector('.dl-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                downloadSingleFrame(f);
            });

            card.appendChild(img);
            card.appendChild(info);
            fragment.appendChild(card);
        });

        frameGrid.appendChild(fragment);
    }

    // ----- クリア -----
    function clearFrames() {
        extractedFrames.forEach((f) => URL.revokeObjectURL(f.url));
        extractedFrames = [];
        renderFrames([]);
        downloadAllBtn.disabled = true;
        frameCountLabel.textContent = '抽出フレーム: 0';
        setProgress(0);
        progressWrap.classList.remove('active');
    }

    // ----- ダウンロード -----
    function downloadSingleFrame(frame) {
        const a = document.createElement('a');
        a.href = frame.url;
        a.download = `video2png_${String(frame.index).padStart(3, '0')}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    async function downloadAllFrames() {
        if (extractedFrames.length === 0) return;
        if (typeof JSZip === 'undefined') {
            alert('JSZipが読み込まれていません。インターネット接続を確認してください。');
            return;
        }

        downloadAllBtn.disabled = true;
        setStatus('📦 ZIP作成中…');

        try {
            const zip = new JSZip();
            const folder = zip.folder('frames');
            const baseName = currentFile ? currentFile.name.replace(/\.[^.]+$/, '') : 'video2png';

            for (const f of extractedFrames) {
                const fileName = `${baseName}_${String(f.index).padStart(3, '0')}.png`;
                folder.file(fileName, f.blob);
            }

            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${baseName}_frames.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 5000);

            setStatus(`✅ ZIPダウンロード完了 (${extractedFrames.length}枚)`);
        } catch (err) {
            console.error(err);
            setStatus('❌ ZIP作成に失敗しました', false);
        } finally {
            downloadAllBtn.disabled = false;
        }
    }

    // ----- ファイルアップロード -----
    function handleFile(file) {
        if (!file || !file.type.startsWith('video/')) {
            alert('動画ファイルを選択してください（MP4, WebM, OGGなど）');
            return;
        }

        currentFile = file;
        videoName.textContent = file.name;
        previewSection.classList.add('active');

        const url = URL.createObjectURL(file);
        videoPlayer.src = url;
        videoPlayer.load();

        videoPlayer.onloadedmetadata = () => {
            const dur = videoPlayer.duration;
            videoDuration.textContent = formatDuration(dur);
            videoResolution.textContent = `${videoPlayer.videoWidth || '?'}×${videoPlayer.videoHeight || '?'}`;

            const count = parseInt(frameCountSlider.value, 10);
            const fps = count / dur;
            fpsInfo.textContent = `⚙️ FPS: ${fps.toFixed(2)} → ${count}枚`;
            setStatus('⏳ 動画を読み込みました。「抽出」を押してください');
            extractBtn.disabled = false;
        };

        videoPlayer.onerror = () => {
            setStatus('❌ 動画の読み込みに失敗しました', false);
            extractBtn.disabled = true;
        };

        clearFrames();
        downloadAllBtn.disabled = true;
    }

    // ----- イベント -----
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
        e.target.value = '';
    });

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    extractBtn.addEventListener('click', async () => {
        if (!currentFile) {
            setStatus('❌ 動画がアップロードされていません', false);
            return;
        }
        if (isExtracting) return;
        const count = parseInt(frameCountSlider.value, 10);
        await extractFrames(currentFile, count);
    });

    downloadAllBtn.addEventListener('click', downloadAllFrames);

    clearBtn.addEventListener('click', () => {
        clearFrames();
        if (videoPlayer.src) {
            URL.revokeObjectURL(videoPlayer.src);
            videoPlayer.src = '';
        }
        previewSection.classList.remove('active');
        currentFile = null;
        videoName.textContent = '—';
        videoDuration.textContent = '0';
        videoResolution.textContent = '—';
        fpsInfo.textContent = '⚙️ FPS: —';
        setStatus('準備完了');
        extractBtn.disabled = true;
        downloadAllBtn.disabled = true;
        frameCountLabel.textContent = '抽出フレーム: 0';
    });

    // 初期状態
    extractBtn.disabled = true;
    downloadAllBtn.disabled = true;
    setStatus('動画をアップロードしてください');

})();
