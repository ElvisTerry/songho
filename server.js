
    // CONSTANTES 
    const TOTAL_PITS = 14;
    const PITS_PER_PLAYER = 7;
    const INIT_SEEDS = 5;
    const WIN_SCORE = 40;
    const SOLIDARITY_GIFT = 7;

   
    //  ÉTAT GLOBAL 
   
    let board = new Array(TOTAL_PITS).fill(INIT_SEEDS);
    let scores = [0, 0];
    let currentPlayer = 0; // 0 = Sud, 1 = Nord
    let gameMode = 'twoPlayer';
    let aiDifficulty = 1;
    let gameActive = true;
    let waitingForAI = false;
    let isProcessing = false;
    let pendingMode = null;
    let gameStartTime = null;
    let currentGameGrains = 0;
    let moveHistory = [];
    let lastMoveText = '';

    let stats = {
      totalGames: 0,
      winsSolo: 0,
      winsDuo: 0,
      draws: 0,
      totalSeeds: 0,
      bestScore: 0
    };

    let soundEnabled = true;
    let audioCtx = null;

    // Éléments DOM
    let homeScreen, difficultyScreen, gameScreen;
    let rulesModal, statsModal, trophyModal, settingsModal, victoryOverlay;
    let boardDiv, nordSeeds, sudSeeds, nordIndicator, sudIndicator;
    let scoreNord, scoreSud, statusDot, statusText, lastMoveTextEl, historyList, historyArrow;
    let gameCode;

    
    //  MULTIJOUEUR EN LIGNE (WebRTC, signalisation manuelle) 
    

    // STUN public gratuit (Google) : aide à traverser la plupart des routeurs
    // domestiques. Sans serveur TURN (payant/à héberger), certains réseaux très
    // restrictifs (NAT symétrique, pare-feu d'entreprise strict) peuvent
    // empêcher la connexion directe entre les deux navigateurs.
    const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

    let peerConnection = null;
    let dataChannel = null;
    let onlineRole = null;        // 0 = hôte (Sud), 1 = invité (Nord)
    let onlinePlayerRole = null;  // rôle utilisé pendant la partie en cours
    let onlineConnected = false;

    function encodeSDP(desc) {
      return btoa(JSON.stringify(desc));
    }

    function decodeSDP(code) {
      return JSON.parse(atob(code.trim()));
    }

    function waitForIceGatheringComplete(pc) {
      return new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') { resolve(); return; }
        function check() {
          if (pc.iceGatheringState === 'complete') {
            pc.removeEventListener('icegatheringstatechange', check);
            resolve();
          }
        }
        pc.addEventListener('icegatheringstatechange', check);
      });
    }

    function setupDataChannelEvents(channel) {
      channel.onopen = () => {
        onlineConnected = true;
        const modal = document.getElementById('onlineModal');
        if (modal) modal.classList.add('hidden');
        startGame('online', 1, onlineRole);
      };
      channel.onclose = () => {
        onlineConnected = false;
        if (gameMode === 'online') {
          alert("Connexion perdue avec ton adversaire.");
          backToHome();
        }
      };
      channel.onerror = () => {
        onlineConnected = false;
      };
      channel.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch (e) { return; }
        if (msg.type === 'move') {
          executeMove(msg.player, msg.pit);
        } else if (msg.type === 'restart') {
          resetGame();
        } else if (msg.type === 'quit') {
          backToHome();
        }
      };
    }

    function sendOnlineMessage(msg) {
      if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(msg));
      }
    }

    function closeOnlineConnection() {
      if (dataChannel) { try { dataChannel.close(); } catch (e) {} }
      if (peerConnection) { try { peerConnection.close(); } catch (e) {} }
      dataChannel = null;
      peerConnection = null;
      onlineConnected = false;
    }

    // --- Hôte : crée l'offre ---
    async function createHostOffer() {
      closeOnlineConnection();
      peerConnection = new RTCPeerConnection(ICE_SERVERS);
      dataChannel = peerConnection.createDataChannel('songho');
      setupDataChannelEvents(dataChannel);

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await waitForIceGatheringComplete(peerConnection);

      onlineRole = 0;
      const field = document.getElementById('hostOfferCode');
      if (field) field.value = encodeSDP(peerConnection.localDescription);
    }

    // --- Hôte : applique le code réponse de l'invité ---
    async function connectHostWithAnswer(answerCode) {
      const statusEl = document.getElementById('hostStatusMsg');
      try {
        const answer = decodeSDP(answerCode);
        await peerConnection.setRemoteDescription(answer);
        if (statusEl) statusEl.innerText = 'Connexion en cours...';
      } catch (e) {
        if (statusEl) statusEl.innerText = 'Code invalide.';
      }
    }

    // --- Invité : reçoit l'offre, génère la réponse ---
    async function joinWithOffer(offerCode) {
      const statusEl = document.getElementById('joinStatusMsg');
      try {
        const offer = decodeSDP(offerCode);
        closeOnlineConnection();
        peerConnection = new RTCPeerConnection(ICE_SERVERS);
        peerConnection.ondatachannel = (event) => {
          dataChannel = event.channel;
          setupDataChannelEvents(dataChannel);
        };

        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        await waitForIceGatheringComplete(peerConnection);

        onlineRole = 1;
        const field = document.getElementById('joinAnswerCode');
        if (field) field.value = encodeSDP(peerConnection.localDescription);
        if (statusEl) statusEl.innerText = "Code généré : envoie-le à l'hôte, puis attends la connexion...";
      } catch (e) {
        if (statusEl) statusEl.innerText = 'Code invalide.';
      }
    }

    function updateInfoBar() {
      const codeEl = document.getElementById('gameCode');
      const linkEl = document.getElementById('linkStatus');
      if (!codeEl || !linkEl) return;

      if (gameMode === 'online') {
        codeEl.innerText = onlinePlayerRole === 0 ? 'HÔTE (Sud)' : 'INVITÉ (Nord)';
        linkEl.innerText = onlineConnected ? 'Connecté ✅' : 'Connexion...';
      } else if (gameMode === 'solo') {
        codeEl.innerText = 'SOLO';
        linkEl.innerText = 'IA locale';
      } else {
        codeEl.innerText = 'LOCAL';
        linkEl.innerText = 'Même écran';
      }
    }

    
    //  STATISTIQUES : EXPORT / IMPORT (transfert entre appareils) 
    

    function exportStats() {
      const blob = new Blob([JSON.stringify(stats, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'songho-stats.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    function importStatsFromFile(file) {
      const statusEl = document.getElementById('importStatsMsg');
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(reader.result);
          const requiredKeys = ['totalGames', 'winsSolo', 'winsDuo', 'draws', 'totalSeeds', 'bestScore'];
          const isValid = requiredKeys.every((k) => typeof imported[k] === 'number');
          if (!isValid) throw new Error('format invalide');

          stats = {
            totalGames: imported.totalGames,
            winsSolo: imported.winsSolo,
            winsDuo: imported.winsDuo,
            draws: imported.draws,
            totalSeeds: imported.totalSeeds,
            bestScore: imported.bestScore
          };
          saveStats();
          updateStatsUI();
          if (statusEl) statusEl.innerText = 'Statistiques importées avec succès.';
        } catch (e) {
          if (statusEl) statusEl.innerText = 'Fichier invalide.';
        }
      };
      reader.readAsText(file);
    }


    //  AUDIO 
    
    function initAudio() {
      try { audioCtx = new(window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }

    function playSeedSound() {
      if (!soundEnabled || !audioCtx) return;
      try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 700 + Math.random() * 300;
        gain.gain.value = 0.08;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.2);
        osc.stop(audioCtx.currentTime + 0.2);
      } catch (e) {}
    }

    function playCaptureSound() {
      if (!soundEnabled || !audioCtx) return;
      try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 400;
        gain.gain.value = 0.12;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.35);
        osc.stop(audioCtx.currentTime + 0.35);
      } catch (e) {}
    }

    function playVictorySound() {
      if (!soundEnabled || !audioCtx) return;
      try {
        [523, 659, 784, 1047].forEach((freq, i) => {
          setTimeout(() => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            gain.gain.value = 0.1;
            osc.start();
            gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.3);
            osc.stop(audioCtx.currentTime + 0.3);
          }, i * 150);
        });
      } catch (e) {}
    }

    
    // STATISTIQUES 
    
    function loadStats() {
      try {
        const saved = localStorage.getItem('songhoStatsV3');
        if (saved) stats = JSON.parse(saved);
      } catch (e) {}
      updateStatsUI();
    }

    function saveStats() {
      try { localStorage.setItem('songhoStatsV3', JSON.stringify(stats)); } catch (e) {}
    }

    function updateStatsUI() {
      document.getElementById('statTotal').innerText = stats.totalGames;
      document.getElementById('statWinsSolo').innerText = stats.winsSolo;
      document.getElementById('statWinsDuo').innerText = stats.winsDuo;
      document.getElementById('statDraws').innerText = stats.draws;
      document.getElementById('statSeeds').innerText = stats.totalSeeds;
      document.getElementById('statBest').innerText = stats.bestScore;
      document.getElementById('victorySolo').innerText = stats.winsSolo;
      document.getElementById('victoryDuo').innerText = stats.winsDuo;
    }

    function addGameResult(winnerIsPlayer1, isDraw = false, seedsCaptured = 0) {
      stats.totalGames++;
      if (isDraw) {
        stats.draws++;
      } else {
        if (gameMode === 'solo') {
          if (winnerIsPlayer1) stats.winsSolo++;
        } else {
          // 'twoPlayer' (local) et 'online' comptent tous deux comme du duo humain vs humain
          if (winnerIsPlayer1) stats.winsDuo++;
        }
      }
      stats.totalSeeds += seedsCaptured;
      if (seedsCaptured > stats.bestScore) stats.bestScore = seedsCaptured;
      saveStats();
      updateStatsUI();
    }


    //  THÈME 
    
    function applyTheme() {
      const isLight = document.getElementById('themeToggle').checked;
      document.body.classList.toggle('light-theme', isLight);
      localStorage.setItem('songhoThemeV3', isLight ? 'light' : 'dark');
    }

    function loadTheme() {
      const saved = localStorage.getItem('songhoThemeV3');
      document.getElementById('themeToggle').checked = saved === 'light';
      applyTheme();
    }

    
    //  UTILITAIRES 
    
    function sum(arr) { return arr.reduce((a, b) => a + b, 0); }

    function other(p) { return 1 - p; }

    function getPlayerName(p) { return p === 0 ? 'Sud' : 'Nord'; }

    function getPlayerShort(p) { return p === 0 ? 'S' : 'N'; }

    
    // MÉCANIQUES DE JEU 
    

    function isCampEmpty(player) {
      const start = player * PITS_PER_PLAYER;
      for (let i = start; i < start + PITS_PER_PLAYER; i++) {
        if (board[i] > 0) return false;
      }
      return true;
    }

    function applySolidarity() {
      const opponent = other(currentPlayer);
      if (isCampEmpty(opponent)) {
        let totalCurrent = 0;
        const start = currentPlayer * PITS_PER_PLAYER;
        for (let i = start; i < start + PITS_PER_PLAYER; i++) totalCurrent += board[i];
        if (totalCurrent >= SOLIDARITY_GIFT) {
          let toGive = SOLIDARITY_GIFT;
          for (let i = start; i < start + PITS_PER_PLAYER && toGive > 0; i++) {
            const take = Math.min(board[i], toGive);
            board[i] -= take;
            toGive -= take;
          }
          const oppStart = opponent * PITS_PER_PLAYER;
          board[oppStart] += SOLIDARITY_GIFT;
          setLastMove('🤝 Solidarité : 7 graines données');
          return true;
        } else {
          gameActive = false;
          const duration = Math.floor((Date.now() - gameStartTime) / 1000);
          addGameResult(false, true, currentGameGrains);
          showVictory('Match nul', scores[0], scores[1], sum(board), duration);
          return false;
        }
      }
      return true;
    }

    function performSowing(startPit, player, boardState) {
      let seeds = boardState[startPit];
      if (seeds === 0) return null;
      let newBoard = [...boardState];
      newBoard[startPit] = 0;
      let currentIdx = startPit;
      let fullRoundDone = false;
      const playerStart = player * PITS_PER_PLAYER;

      if (seeds <= 13) {
        let remaining = seeds;
        while (remaining > 0) {
          let next = currentIdx - 1;
          if (next < playerStart) break;
          currentIdx = next;
          newBoard[currentIdx]++;
          remaining--;
          if (remaining === 0) break;
        }
        if (remaining > 0) {
          const oppStart = other(player) * PITS_PER_PLAYER;
          const oppEnd = oppStart + PITS_PER_PLAYER;
          currentIdx = oppStart - 1;
          while (remaining > 0) {
            currentIdx++;
            if (currentIdx >= oppEnd) currentIdx = oppStart;
            newBoard[currentIdx]++;
            remaining--;
          }
        }
        return { newBoard, lastPit: currentIdx, fullRoundDone: false };
      } else {
        let remaining = seeds;
        let idx = startPit;
        while (remaining > 0) {
          idx = (idx + 1) % TOTAL_PITS;
          if (idx === startPit) fullRoundDone = true;
          newBoard[idx]++;
          remaining--;
          if (fullRoundDone && remaining > 0) {
            const oppStart = other(player) * PITS_PER_PLAYER;
            const oppEnd = oppStart + PITS_PER_PLAYER;
            let nextIdx = oppStart;
            while (remaining > 0) {
              if (nextIdx >= oppEnd) nextIdx = oppStart;
              newBoard[nextIdx]++;
              remaining--;
              nextIdx++;
            }
            break;
          }
        }
        return { newBoard, lastPit: idx, fullRoundDone };
      }
    }

    function applyCapture(lastPit, player, boardState, fullRoundDone) {
      let newBoard = [...boardState];
      let captured = 0;
      const isAdversary = (player === 0 && lastPit >= PITS_PER_PLAYER) || (player === 1 && lastPit < PITS_PER_PLAYER);
      if (!isAdversary) return { newBoard, captured };

      const finalSeeds = newBoard[lastPit];
      if (finalSeeds < 2 || finalSeeds > 4) return { newBoard, captured };

      const firstOppPit = other(player) * PITS_PER_PLAYER;
      if (fullRoundDone && lastPit === firstOppPit) {
        captured = 1;
        newBoard[lastPit] -= 1;
        return { newBoard, captured };
      }

      let pit = lastPit;
      const oppStart = other(player) * PITS_PER_PLAYER;
      const oppEnd = oppStart + PITS_PER_PLAYER;
      while (pit >= oppStart && pit < oppEnd && newBoard[pit] >= 2 && newBoard[pit] <= 4) {
        captured += newBoard[pit];
        newBoard[pit] = 0;
        pit--;
        if (pit < oppStart) break;
      }
      return { newBoard, captured };
    }

    function wouldEmptyOpponentCamp(boardAfter, player) {
      const opp = other(player);
      const start = opp * PITS_PER_PLAYER;
      let total = 0;
      for (let i = start; i < start + PITS_PER_PLAYER; i++) total += boardAfter[i];
      return total === 0;
    }

    function getPitLabel(idx) {
      const pos = { p: Math.floor(idx / PITS_PER_PLAYER), i: idx % PITS_PER_PLAYER };
      return getPlayerShort(pos.p) + (pos.i + 1);
    }

    
    //  PLANIFICATION DU COUP 
    
    function computeMovePlan(boardState, player, pitIndex) {
      const sim = [...boardState];
      const seeds = sim[pitIndex];
      if (seeds === 0) return null;
      sim[pitIndex] = 0;
      let curr = pitIndex;
      const path = [];
      let lastPos = null;
      for (let k = 0; k < seeds; k++) {
        curr = (curr + 1) % TOTAL_PITS;
        sim[curr]++;
        path.push(curr);
        if (k === seeds - 1) lastPos = curr;
      }
      let captureTarget = null;
      let capturePts = 0;
      if (lastPos !== null) {
        const lastP = { p: Math.floor(lastPos / PITS_PER_PLAYER), i: lastPos % PITS_PER_PLAYER };
        if (lastP.p === other(player)) {
          const pts = sim[lastPos];
          if ([2, 3, 4].includes(pts)) {
            const simBoard = [...sim];
            simBoard[lastPos] = 0;
            const oppStart = other(player) * PITS_PER_PLAYER;
            let totalOpp = 0;
            for (let i = oppStart; i < oppStart + PITS_PER_PLAYER; i++) totalOpp += simBoard[i];
            if (totalOpp > 0) {
              captureTarget = lastPos;
              capturePts = pts;
            }
          }
        }
      }
      return { seedsCount: seeds, path, captureTarget, capturePts, sourcePos: pitIndex };
    }

    
    // ANIMATION 
   
    function animateMove(player, pitIndex, plan) {
      return new Promise((resolve) => {
        const allPits = document.querySelectorAll('.pit');
        const srcEl = allPits[pitIndex];
        if (srcEl) srcEl.classList.add('highlight');

        const flyingSeeds = [];
        const rect = srcEl ? srcEl.getBoundingClientRect() : { left: 0, top: 0 };
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        for (let k = 0; k < plan.path.length; k++) {
          const el = document.createElement('div');
          el.className = 'flying-seed trail';
          el.style.left = (cx + (Math.random() - 0.5) * 30) + 'px';
          el.style.top = (cy + (Math.random() - 0.5) * 30) + 'px';
          document.body.appendChild(el);
          flyingSeeds.push(el);
        }

        let delay = 0;
        const stepDelay = 90;

        for (let k = 0; k < plan.path.length; k++) {
          const idx = plan.path[k];
          const targetEl = allPits[idx];
          if (!targetEl) continue;
          const rect2 = targetEl.getBoundingClientRect();
          const cx2 = rect2.left + rect2.width / 2;
          const cy2 = rect2.top + rect2.height / 2;

          setTimeout(() => {
            const el = flyingSeeds[k];
            if (el) {
              el.style.left = cx2 + 'px';
              el.style.top = cy2 + 'px';
              el.style.transform = 'scale(0.6)';
              targetEl.classList.add('light-effect');
              setTimeout(() => targetEl.classList.remove('light-effect'), 500);
              setTimeout(() => {
                el.remove();
                targetEl.classList.add('highlight');
                setTimeout(() => targetEl.classList.remove('highlight'), 300);
                renderBoard();
              }, 350);
            }
          }, delay);
          delay += stepDelay;
        }

        if (plan.captureTarget) {
          const capIdx = plan.captureTarget;
          const capEl = allPits[capIdx];
          if (capEl) {
            setTimeout(() => {
              capEl.classList.add('capture');
              playCaptureSound();
              capEl.style.boxShadow = '0 0 80px rgba(255,50,0,0.8), 0 0 160px rgba(255,50,0,0.3)';
              setTimeout(() => { capEl.style.boxShadow = ''; }, 600);

              for (let i = 0; i < plan.capturePts; i++) {
                const fly = document.createElement('div');
                fly.className = 'flying-seed captured';
                const r = capEl.getBoundingClientRect();
                fly.style.left = (r.left + r.width / 2 + (Math.random() - 0.5) * 30) + 'px';
                fly.style.top = (r.top + r.height / 2 + (Math.random() - 0.5) * 30) + 'px';
                document.body.appendChild(fly);

                const scoreEl = player === 0 ? sudSeeds : nordSeeds;
                const sr = scoreEl.getBoundingClientRect();
                setTimeout(() => {
                  fly.style.left = (sr.left + sr.width / 2) + 'px';
                  fly.style.top = (sr.top + sr.height / 2) + 'px';
                  fly.style.transform = 'scale(0.2)';
                  setTimeout(() => fly.remove(), 300);
                }, 80 + i * 60);
              }
              setTimeout(() => capEl.classList.remove('capture'), 600);
            }, delay + 80);
          }
        }

        const totalTime = delay + 800;
        setTimeout(() => {
          if (srcEl) srcEl.classList.remove('highlight');
          resolve();
        }, totalTime);
      });
    }

    
    //EXÉCUTION D'UN COUP 
    
    function setLastMove(text) {
      lastMoveText = text;
      if (lastMoveTextEl) lastMoveTextEl.innerText = text;
    }

    function addHistory(player, pit, captured, extra = '') {
      const label = getPitLabel(pit);
      const name = getPlayerName(player);
      let text = `${name} joue ${label}`;
      if (captured > 0) text += `, capture ${captured} graine(s)`;
      if (extra) text += `, ${extra}`;
      moveHistory.push({ turn: moveHistory.length + 1, text });
      updateHistory();
    }

    function updateHistory() {
      if (!historyList) return;
      const entries = moveHistory.slice(-20).reverse();
      historyList.innerHTML = entries.map((e, i) =>
        `<div class="entry"><span class="turn">${e.turn}.</span><span class="action">${e.text}</span></div>`
      ).join('');
      if (moveHistory.length === 0) {
        historyList.innerHTML = '<div class="entry"><span class="action">Début de la partie</span></div>';
      }
    }

    async function executeMove(player, pit) {
      if (!gameActive || isProcessing) return false;
      if ((player === 0 && pit >= PITS_PER_PLAYER) || (player === 1 && pit < PITS_PER_PLAYER)) return false;
      if (board[pit] === 0) return false;

      isProcessing = true;
      updateStatus('En cours...', 'waiting');

      if (!applySolidarity()) {
        isProcessing = false;
        return false;
      }

      const plan = computeMovePlan(board, player, pit);
      if (!plan) { isProcessing = false; return false; }

      const sowing = performSowing(pit, player, board);
      if (!sowing) { isProcessing = false; return false; }

      let newBoard = sowing.newBoard;
      let captureResult = applyCapture(sowing.lastPit, player, newBoard, sowing.fullRoundDone);
      newBoard = captureResult.newBoard;
      let captured = captureResult.captured;

      if (wouldEmptyOpponentCamp(newBoard, player)) {
        setLastMove(' Coup interdit : vous videriez le camp adverse !');
        isProcessing = false;
        return false;
      }

      await animateMove(player, pit, plan);

      board = newBoard;
      scores[player] += captured;
      currentGameGrains += captured;
      playSeedSound();

      let extra = '';
      if (scores[player] >= WIN_SCORE) {
        gameActive = false;
        const duration = Math.floor((Date.now() - gameStartTime) / 1000);
        addHistory(player, pit, captured, 'Fin par score de 40');
        addGameResult(player === 0, false, currentGameGrains);
        showVictory(getPlayerName(player), scores[0], scores[1], sum(board), duration);
        updateUI();
        isProcessing = false;
        return true;
      }

      if (sum(board) < 10) {
        gameActive = false;
        const duration = Math.floor((Date.now() - gameStartTime) / 1000);
        addHistory(player, pit, captured, 'Fin par manque de graines');
        addGameResult(false, true, currentGameGrains);
        showVictory('Match nul', scores[0], scores[1], sum(board), duration);
        updateUI();
        isProcessing = false;
        return true;
      }

      addHistory(player, pit, captured);
      let moveDesc = `${getPlayerName(player)} joue ${getPitLabel(pit)}`;
      if (captured > 0) moveDesc += `, capture ${captured} graine(s)`;
      setLastMove(moveDesc);

      currentPlayer = other(player);
      updateUI();

      if (!applySolidarity()) {
        isProcessing = false;
        return true;
      }

      if (gameMode === 'solo' && gameActive && currentPlayer === 1 && !waitingForAI) {
        setTimeout(() => makeAIMove(), 600);
      }

      isProcessing = false;
      updateStatus('En attente...', 'waiting');
      return true;
    }

    async function handleMove(pit) {
      if (gameMode === 'online') {
        if (!onlineConnected || currentPlayer !== onlinePlayerRole) return;
        const player = currentPlayer;
        const success = await executeMove(player, pit);
        if (success) sendOnlineMessage({ type: 'move', player, pit });
      } else {
        executeMove(currentPlayer, pit);
      }
    }

    
    //  IA 
    
    function simulateMoveIA(pit, player, boardState, scoresState) {
      const testBoard = [...boardState];
      const testScores = [...scoresState];
      const sowing = performSowing(pit, player, testBoard);
      if (!sowing) return { gain: -Infinity };
      let newBoard = sowing.newBoard;
      const capture = applyCapture(sowing.lastPit, player, newBoard, sowing.fullRoundDone);
      newBoard = capture.newBoard;
      let gain = capture.captured;
      if (wouldEmptyOpponentCamp(newBoard, player)) gain = -1000;
      return { gain, board: newBoard, scores: [testScores[0] + (player === 0 ? gain : 0), testScores[1] + (player === 1 ?
          gain : 0)] };
    }

    function evaluateBoardIA(boardState, scoresState, player) {
      let ownSeeds = 0;
      const start = player * PITS_PER_PLAYER;
      for (let i = start; i < start + PITS_PER_PLAYER; i++) ownSeeds += boardState[i];
      return scoresState[player] + ownSeeds * 0.5;
    }

    function minimaxIA(pit, depth, alpha, beta, isMax, player, boardState, scoresState) {
      const sim = simulateMoveIA(pit, player, boardState, scoresState);
      if (sim.gain === -Infinity) return -Infinity;
      const newBoard = sim.board;
      const newScores = sim.scores;
      const nextPlayer = other(player);
      if (depth === 0) return evaluateBoardIA(newBoard, newScores, player);
      if (isMax) {
        let maxEval = -Infinity;
        const moves = [];
        for (let i = nextPlayer * PITS_PER_PLAYER; i < (nextPlayer + 1) * PITS_PER_PLAYER; i++) {
          if (newBoard[i] > 0) moves.push(i);
        }
        if (moves.length === 0) return evaluateBoardIA(newBoard, newScores, player);
        for (const m of moves) {
          const eval_ = minimaxIA(m, depth - 1, alpha, beta, false, nextPlayer, newBoard, newScores);
          maxEval = Math.max(maxEval, eval_);
          alpha = Math.max(alpha, eval_);
          if (beta <= alpha) break;
        }
        return maxEval;
      } else {
        let minEval = Infinity;
        const moves = [];
        for (let i = player * PITS_PER_PLAYER; i < (player + 1) * PITS_PER_PLAYER; i++) {
          if (newBoard[i] > 0) moves.push(i);
        }
        if (moves.length === 0) return evaluateBoardIA(newBoard, newScores, other(player));
        for (const m of moves) {
          const eval_ = minimaxIA(m, depth - 1, alpha, beta, true, player, newBoard, newScores);
          minEval = Math.min(minEval, eval_);
          beta = Math.min(beta, eval_);
          if (beta <= alpha) break;
        }
        return minEval;
      }
    }

    async function makeAIMove() {
      if (!gameActive || currentPlayer !== 1 || gameMode !== 'solo' || waitingForAI) return;
      waitingForAI = true;
      updateStatus('IA réfléchit...', 'thinking');
      await new Promise(r => setTimeout(r, 300));

      const validMoves = [];
      for (let i = PITS_PER_PLAYER; i < TOTAL_PITS; i++) {
        if (board[i] > 0) validMoves.push(i);
      }
      if (validMoves.length === 0) { waitingForAI = false; return; }

      let chosen;
      if (aiDifficulty === 0) {
        chosen = validMoves[Math.floor(Math.random() * validMoves.length)];
      } else if (aiDifficulty === 1) {
        let bestGain = -1;
        for (const p of validMoves) {
          const sim = simulateMoveIA(p, 1, board, scores);
          if (sim.gain > bestGain) { bestGain = sim.gain;
            chosen = p; }
        }
        if (chosen === undefined) chosen = validMoves[0];
      } else {
        const depth = aiDifficulty === 2 ? 1 : 2;
        let bestEval = -Infinity;
        for (const p of validMoves) {
          const eval_ = minimaxIA(p, depth, -Infinity, Infinity, false, 1, board, scores);
          if (eval_ > bestEval) { bestEval = eval_;
            chosen = p; }
        }
        if (chosen === undefined) chosen = validMoves[0];
      }

      waitingForAI = false;
      await executeMove(1, chosen);
      updateUI();
    }

    
    //  RENDU DU PLATEAU 
    
    function renderBoard() {
      if (!boardDiv) return;
      boardDiv.innerHTML = '';

      const topRow = document.createElement('div');
      topRow.className = 'row';
      for (let i = TOTAL_PITS - 1; i >= PITS_PER_PLAYER; i--) {
        topRow.appendChild(createPitElement(i, 1));
      }

      const bottomRow = document.createElement('div');
      bottomRow.className = 'row';
      for (let i = 0; i < PITS_PER_PLAYER; i++) {
        bottomRow.appendChild(createPitElement(i, 0));
      }

      boardDiv.appendChild(topRow);
      boardDiv.appendChild(bottomRow);

      // Mettre à jour les compteurs
      let sudTotal = 0,
        nordTotal = 0;
      for (let i = 0; i < PITS_PER_PLAYER; i++) sudTotal += board[i];
      for (let i = PITS_PER_PLAYER; i < TOTAL_PITS; i++) nordTotal += board[i];
      if (sudSeeds) sudSeeds.innerText = sudTotal + ' GRAINES';
      if (nordSeeds) nordSeeds.innerText = nordTotal + ' GRAINES';

      // Scores
      if (scoreSud) scoreSud.innerText = scores[0];
      if (scoreNord) scoreNord.innerText = scores[1];

      // Indicateurs de tour
      if (nordIndicator && sudIndicator) {
        nordIndicator.className = 'indicator' + (currentPlayer === 1 && gameActive ? ' active' : '');
        sudIndicator.className = 'indicator' + (currentPlayer === 0 && gameActive ? ' active' : '');
      }
    }

    function createPitElement(index, owner) {
      const div = document.createElement('div');
      div.className = 'pit';

      const count = board[index];
      const seedsHtml = [];
      const maxDisplay = 8;

      for (let i = 0; i < Math.min(count, maxDisplay); i++) {
        seedsHtml.push('<span class="seed-ball"></span>');
      }
      if (count > maxDisplay) {
        seedsHtml.push(`<span class="seed-ball more">+${count - maxDisplay}</span>`);
      }
      if (count === 0) div.classList.add('empty');

      div.innerHTML = `
        <div class="seeds-container">${seedsHtml.join('')}</div>
        <span class="pit-number">${index + 1}</span>
      `;

      let active = false;
      if (gameActive) {
        if (gameMode === 'twoPlayer') {
          active = currentPlayer === owner;
        } else if (gameMode === 'solo') {
          active = currentPlayer === owner && !waitingForAI && !isProcessing;
        } else if (gameMode === 'online') {
          active = currentPlayer === owner && owner === onlinePlayerRole && onlineConnected && !isProcessing;
        }
      }
      if (!active) {
        div.classList.add('disabled');
      } else {
        div.onclick = () => handleMove(index);
      }

      return div;
    }

    function updateUI() {
      renderBoard();
      const name = currentPlayer === 0 ? 'Sud' : 'Nord';
      if (gameActive) {
        updateStatus(`Tour : ${name}`, 'waiting');
      }
    }

    
    // GESTION D'ÉTAT 
    
    function updateStatus(text, state = 'idle') {
      if (statusText) statusText.innerText = text;
      if (statusDot) {
        statusDot.className = 'status-dot';
        if (state === 'waiting') statusDot.classList.add('waiting');
        else if (state === 'thinking') statusDot.classList.add('thinking');
        else if (state === 'idle') statusDot.classList.add('idle');
      }
    }

    function showVictory(winner, score1, score2, remaining, duration) {
      document.getElementById('victoryTitle').innerText = winner === 'Match nul' ? '🤝 Match nul !' :
        `🏆 ${winner} a gagné !`;
      document.getElementById('victorySud').innerText = score1;
      document.getElementById('victoryNord').innerText = score2;
      document.getElementById('victoryRemaining').innerText = remaining;
      document.getElementById('victoryDuration').innerText = duration;
      victoryOverlay.classList.remove('hidden');
      playVictorySound();
      updateStatus('Partie terminée', 'idle');
    }

    function resetGame() {
      board = new Array(TOTAL_PITS).fill(INIT_SEEDS);
      scores = [0, 0];
      currentPlayer = 0;
      gameActive = true;
      waitingForAI = false;
      isProcessing = false;
      currentGameGrains = 0;
      moveHistory = [];
      gameStartTime = Date.now();
      setLastMove('En attente du premier coup...');
      updateHistory();
      updateStatus('En attente...', 'waiting');
      victoryOverlay.classList.add('hidden');
      updateUI();
      updateInfoBar();
    }

    function startGame(mode, difficulty = 1, forcedRole = null) {
      gameMode = mode;
      aiDifficulty = difficulty;
      onlinePlayerRole = mode === 'online' ? forcedRole : null;
      homeScreen.classList.remove('active');
      difficultyScreen.classList.remove('active');
      gameScreen.classList.add('active');
      resetGame();
      if (gameMode === 'solo' && currentPlayer === 1 && gameActive) {
        setTimeout(() => makeAIMove(), 800);
      }
    }

    function backToHome() {
      gameScreen.classList.remove('active');
      homeScreen.classList.add('active');
      if (gameMode === 'online') {
        closeOnlineConnection();
      }
      resetGame();
    }

    function showDifficultyScreen() {
      homeScreen.classList.remove('active');
      difficultyScreen.classList.add('active');
    }

   
    // INITIALISATION 
    
    document.addEventListener('DOMContentLoaded', () => {
      // Références DOM
      homeScreen = document.getElementById('homeScreen');
      difficultyScreen = document.getElementById('difficultyScreen');
      gameScreen = document.getElementById('gameScreen');
      rulesModal = document.getElementById('rulesModal');
      statsModal = document.getElementById('statsModal');
      trophyModal = document.getElementById('trophyModal');
      settingsModal = document.getElementById('settingsModal');
      victoryOverlay = document.getElementById('victoryOverlay');

      boardDiv = document.getElementById('board');
      nordSeeds = document.getElementById('nordSeeds');
      sudSeeds = document.getElementById('sudSeeds');
      nordIndicator = document.getElementById('nordIndicator');
      sudIndicator = document.getElementById('sudIndicator');
      scoreNord = document.getElementById('scoreNord');
      scoreSud = document.getElementById('scoreSud');
      statusDot = document.getElementById('statusDot');
      statusText = document.getElementById('statusText');
      lastMoveTextEl = document.getElementById('lastMoveText');
      historyList = document.getElementById('historyList');
      historyArrow = document.getElementById('historyArrow');
      gameCode = document.getElementById('gameCode');

      // Audio
      initAudio();

      // Stats & Thème
      loadStats();
      loadTheme();

      // Sons
      const savedSound = localStorage.getItem('songhoSoundV3');
      if (savedSound !== null) soundEnabled = savedSound === 'true';
      document.getElementById('soundToggle').checked = soundEnabled;

      // Démarrer avec l'écran d'accueil
      homeScreen.classList.add('active');
      resetGame();

      //  ÉVÉNEMENTS ACCUEIL
      // Bouton VS IA
      document.getElementById('btnVsAI').addEventListener('click', () => {
        pendingMode = 'solo';
        showDifficultyScreen();
      });

      // Bouton Deux joueurs (local)
      document.getElementById('btnTwoPlayer').addEventListener('click', () => {
        pendingMode = 'twoPlayer';
        showDifficultyScreen();
      });

      // Bouton En ligne (P2P)
      const btnOnline = document.getElementById('btnOnline');
      if (btnOnline) {
        btnOnline.addEventListener('click', () => {
          document.getElementById('onlineChoice').classList.remove('hidden');
          document.getElementById('onlineHostPanel').classList.add('hidden');
          document.getElementById('onlineJoinPanel').classList.add('hidden');
          document.getElementById('hostOfferCode').value = '';
          document.getElementById('hostAnswerInput').value = '';
          document.getElementById('joinOfferInput').value = '';
          document.getElementById('joinAnswerCode').value = '';
          document.getElementById('hostStatusMsg').innerText = '';
          document.getElementById('joinStatusMsg').innerText = '';
          document.getElementById('onlineModal').classList.remove('hidden');
        });
      }

      // Boutons icon
      document.getElementById('btnRules').addEventListener('click', () => {
        rulesModal.classList.remove('hidden');
      });

      document.getElementById('btnTrophy').addEventListener('click', () => {
        updateStatsUI();
        trophyModal.classList.remove('hidden');
      });

      document.getElementById('btnStats').addEventListener('click', () => {
        updateStatsUI();
        statsModal.classList.remove('hidden');
      });

      document.getElementById('btnSettings').addEventListener('click', () => {
        settingsModal.classList.remove('hidden');
      });

      // Bouton retour (difficulté)
      document.getElementById('backFromDifficulty').addEventListener('click', () => {
        homeScreen.classList.add('active');
        difficultyScreen.classList.remove('active');
      });

      // Démarrer la partie
      document.getElementById('startGameBtn').addEventListener('click', () => {
        const selected = document.querySelector('input[name="difficulty"]:checked');
        if (selected) aiDifficulty = parseInt(selected.value);
        startGame(pendingMode || 'twoPlayer', aiDifficulty);
      });

      // ÉVÉNEMENTS JEU 
      document.getElementById('rulesBtnGame').addEventListener('click', () => {
        rulesModal.classList.remove('hidden');
      });

      document.getElementById('statsBtnGame').addEventListener('click', () => {
        updateStatsUI();
        statsModal.classList.remove('hidden');
      });

      document.getElementById('restartBtn').addEventListener('click', () => {
        if (confirm('Recommencer la partie ?')) {
          if (gameMode === 'online') sendOnlineMessage({ type: 'restart' });
          resetGame();
          if (gameMode === 'solo' && currentPlayer === 1 && gameActive) {
            setTimeout(() => makeAIMove(), 800);
          }
        }
      });

      document.getElementById('quitBtn').addEventListener('click', () => {
        if (confirm('Quitter la partie ?')) {
          if (gameMode === 'online') sendOnlineMessage({ type: 'quit' });
          backToHome();
        }
      });

      // Historique
      document.getElementById('historyToggle').addEventListener('click', () => {
        historyList.classList.toggle('open');
        historyArrow.innerText = historyList.classList.contains('open') ? '▼' : '▶';
      });

      // Fermeture des modales
      document.getElementById('closeRulesBtn').addEventListener('click', () => rulesModal.classList.add('hidden'));
      document.getElementById('closeStatsBtn').addEventListener('click', () => statsModal.classList.add('hidden'));
      document.getElementById('closeTrophyBtn').addEventListener('click', () => trophyModal.classList.add('hidden'));
      document.getElementById('closeSettingsBtn').addEventListener('click', () => settingsModal.classList.add('hidden'));
      document.getElementById('victoryCloseBtn').addEventListener('click', () => {
        victoryOverlay.classList.add('hidden');
        backToHome();
      });

      // Modale En ligne (P2P)
      const closeOnlineBtn = document.getElementById('closeOnlineBtn');
      if (closeOnlineBtn) {
        closeOnlineBtn.addEventListener('click', () => {
          document.getElementById('onlineModal').classList.add('hidden');
        });
      }

      const onlineHostBtn = document.getElementById('onlineHostBtn');
      if (onlineHostBtn) {
        onlineHostBtn.addEventListener('click', async () => {
          document.getElementById('onlineChoice').classList.add('hidden');
          document.getElementById('onlineHostPanel').classList.remove('hidden');
          document.getElementById('hostStatusMsg').innerText = 'Génération du code...';
          await createHostOffer();
          document.getElementById('hostStatusMsg').innerText = 'Code prêt : envoie-le à ton adversaire.';
        });
      }

      const copyHostOfferBtn = document.getElementById('copyHostOfferBtn');
      if (copyHostOfferBtn) {
        copyHostOfferBtn.addEventListener('click', () => {
          const ta = document.getElementById('hostOfferCode');
          ta.select();
          if (navigator.clipboard) navigator.clipboard.writeText(ta.value).catch(() => {});
        });
      }

      const hostConnectBtn = document.getElementById('hostConnectBtn');
      if (hostConnectBtn) {
        hostConnectBtn.addEventListener('click', () => {
          const code = document.getElementById('hostAnswerInput').value;
          if (code) connectHostWithAnswer(code);
        });
      }

      const onlineJoinBtn = document.getElementById('onlineJoinBtn');
      if (onlineJoinBtn) {
        onlineJoinBtn.addEventListener('click', () => {
          document.getElementById('onlineChoice').classList.add('hidden');
          document.getElementById('onlineJoinPanel').classList.remove('hidden');
        });
      }

      const joinGenerateBtn = document.getElementById('joinGenerateBtn');
      if (joinGenerateBtn) {
        joinGenerateBtn.addEventListener('click', async () => {
          const code = document.getElementById('joinOfferInput').value;
          if (code) {
            document.getElementById('joinStatusMsg').innerText = 'Génération du code réponse...';
            await joinWithOffer(code);
          }
        });
      }

      const copyJoinAnswerBtn = document.getElementById('copyJoinAnswerBtn');
      if (copyJoinAnswerBtn) {
        copyJoinAnswerBtn.addEventListener('click', () => {
          const ta = document.getElementById('joinAnswerCode');
          ta.select();
          if (navigator.clipboard) navigator.clipboard.writeText(ta.value).catch(() => {});
        });
      }

      // Export / import des statistiques
      const exportStatsBtn = document.getElementById('exportStatsBtn');
      if (exportStatsBtn) {
        exportStatsBtn.addEventListener('click', exportStats);
      }

      const importStatsBtn = document.getElementById('importStatsBtn');
      const importStatsFile = document.getElementById('importStatsFile');
      if (importStatsBtn && importStatsFile) {
        importStatsBtn.addEventListener('click', () => importStatsFile.click());
        importStatsFile.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (file) importStatsFromFile(file);
          e.target.value = '';
        });
      }

      // Thème
      document.getElementById('themeToggle').addEventListener('change', applyTheme);

      // Sons
      document.getElementById('soundToggle').addEventListener('change', (e) => {
        soundEnabled = e.target.checked;
        localStorage.setItem('songhoSoundV3', soundEnabled);
      });

      // Fermer les modales au clic sur le fond
      document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) modal.classList.add('hidden');
        });
      });
    });

