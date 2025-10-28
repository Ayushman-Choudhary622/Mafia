// ========================================
// MAFIA GAME - COMPLETE LOGIC
// ========================================

let db, auth, currentUser, currentGameId, currentGame, myRole, timerId, phaseTimer;

// Initialize Firebase and Auth
window.addEventListener('load', async () => {
    auth = firebase.auth();
    db = firebase.database();
    
    // Anonymous sign in
    await auth.signInAnonymously();
    currentUser = auth.currentUser;
    
    console.log('✅ Firebase initialized');
});

// ========================================
// SCREEN NAVIGATION
// ========================================

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function showHomeScreen() {
    if (currentGameId) leaveGame();
    showScreen('homeScreen');
}

function showJoinScreen() {
    showScreen('joinScreen');
}

// ========================================
// GAME CREATION & JOINING
// ========================================

async function createGame() {
    const name = document.getElementById('playerName').value.trim();
    if (!name) return alert('⚠️ Please enter your name!');
    
    showScreen('loadingScreen');
    
    const code = generateCode();
    const gameRef = db.ref('games').push();
    currentGameId = gameRef.key;
    
    const gameData = {
        code: code,
        host: currentUser.uid,
        status: 'lobby',
        players: {},
        phase: 'lobby',
        day: 0,
        created: Date.now()
    };
    
    gameData.players[currentUser.uid] = {
        name: name,
        uid: currentUser.uid,
        isBot: false,
        connected: true,
        alive: true,
        ready: true
    };
    
    await gameRef.set(gameData);
    await db.ref('codes/' + code).set(gameRef.key);
    
    listenToGame();
    showScreen('lobbyScreen');
}

async function joinGame() {
    const code = document.getElementById('joinCode').value.trim().toUpperCase();
    const name = document.getElementById('playerName').value.trim();
    
    if (!code || code.length !== 4) return alert('⚠️ Enter valid 4-digit code!');
    if (!name) return alert('⚠️ Please enter your name!');
    
    showScreen('loadingScreen');
    
    const codeSnap = await db.ref('codes/' + code).once('value');
    const gameId = codeSnap.val();
    
    if (!gameId) {
        alert('❌ Game not found!');
        showScreen('joinScreen');
        return;
    }
    
    const gameSnap = await db.ref('games/' + gameId).once('value');
    const game = gameSnap.val();
    
    if (!game) {
        alert('❌ Game no longer exists!');
        showScreen('joinScreen');
        return;
    }
    
    if (game.status !== 'lobby') {
        alert('⚠️ Game already started!');
        showScreen('joinScreen');
        return;
    }
    
    const playerCount = Object.keys(game.players || {}).length;
    if (playerCount >= 20) {
        alert('⚠️ Game is full (20/20)!');
        showScreen('joinScreen');
        return;
    }
    
    currentGameId = gameId;
    
    await db.ref('games/' + gameId + '/players/' + currentUser.uid).set({
        name: name,
        uid: currentUser.uid,
        isBot: false,
        connected: true,
        alive: true,
        ready: true
    });
    
    listenToGame();
    showScreen('lobbyScreen');
}

function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

// ========================================
// REAL-TIME GAME LISTENER
// ========================================

function listenToGame() {
    db.ref('games/' + currentGameId).on('value', (snap) => {
        currentGame = snap.val();
        if (!currentGame) {
            alert('Game ended or deleted');
            showHomeScreen();
            return;
        }
        
        updateUI();
    });
    
    // Presence
    db.ref('games/' + currentGameId + '/players/' + currentUser.uid + '/connected').set(true);
    db.ref('games/' + currentGameId + '/players/' + currentUser.uid + '/connected').onDisconnect().set(false);
}

function updateUI() {
    if (currentGame.status === 'lobby') {
        updateLobby();
    } else if (currentGame.status === 'playing') {
        updateGameScreen();
    } else if (currentGame.status === 'ended') {
        showEndScreen();
    }
}

// ========================================
// LOBBY SCREEN
// ========================================

function updateLobby() {
    document.getElementById('gameCode').textContent = currentGame.code;
    
    const players = Object.values(currentGame.players || {});
    document.getElementById('playerCount').textContent = players.length;
    
    const list = document.getElementById('lobbyPlayers');
    list.innerHTML = '';
    
    players.forEach(p => {
        const item = document.createElement('div');
        item.className = 'player-item';
        item.innerHTML = `
            <span class="player-name">${p.name}</span>
            <span class="player-status ${p.isBot ? 'bot' : ''}">${p.isBot ? '🤖 Bot' : '👤 Player'}</span>
        `;
        list.appendChild(item);
    });
    
    // Show host controls
    if (currentGame.host === currentUser.uid) {
        document.getElementById('hostControls').classList.remove('hidden');
    }
}

async function addBots() {
    const count = parseInt(document.getElementById('botCount').value);
    if (count === 0) return;
    
    const currentPlayers = Object.keys(currentGame.players || {}).length;
    const botsToAdd = Math.min(count, 20 - currentPlayers);
    
    const botNames = ['Bot Alpha', 'Bot Beta', 'Bot Gamma', 'Bot Delta', 'Bot Echo', 
                      'Bot Fox', 'Bot Ghost', 'Bot Hunter', 'Bot Iron', 'Bot Judge',
                      'Bot King', 'Bot Luna', 'Bot Mars', 'Bot Nova', 'Bot Omega'];
    
    for (let i = 0; i < botsToAdd; i++) {
        const botId = 'bot_' + Date.now() + '_' + i;
        await db.ref('games/' + currentGameId + '/players/' + botId).set({
            name: botNames[i % botNames.length],
            uid: botId,
            isBot: true,
            connected: true,
            alive: true,
            ready: true
        });
    }
}

async function startGame() {
    const players = Object.values(currentGame.players || {});
    if (players.length < 1) {
        alert('⚠️ Need at least 1 player!');
        return;
    }
    
    // Assign roles
    const roles = assignRoles(players);
    
    // Save roles privately
    for (let uid in roles) {
        await db.ref('games/' + currentGameId + '/roles/' + uid).set(roles[uid]);
    }
    
    // Start game
    await db.ref('games/' + currentGameId).update({
        status: 'playing',
        phase: 'night',
        day: 1,
        phaseStart: Date.now(),
        phaseDuration: 45000, // 45 seconds
        events: []
    });
    
    showScreen('gameScreen');
}

function assignRoles(players) {
    const count = players.length;
    const roles = {};
    
    // Calculate role distribution
    let mafiaCount = Math.max(1, Math.floor(count / 5));
    if (count >= 10) mafiaCount = Math.floor(count / 4);
    
    const doctorCount = count >= 6 ? 1 : 0;
    const detectiveCount = count >= 5 ? 1 : 0;
    
    // Shuffle players
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    
    let idx = 0;
    
    // Assign mafia
    for (let i = 0; i < mafiaCount; i++) {
        roles[shuffled[idx].uid] = 'mafia';
        idx++;
    }
    
    // Assign doctor
    if (doctorCount > 0) {
        roles[shuffled[idx].uid] = 'doctor';
        idx++;
    }
    
    // Assign detective
    if (detectiveCount > 0) {
        roles[shuffled[idx].uid] = 'detective';
        idx++;
    }
    
    // Rest are villagers
    while (idx < shuffled.length) {
        roles[shuffled[idx].uid] = 'villager';
        idx++;
    }
    
    return roles;
}

function copyCode() {
    const code = currentGame.code;
    navigator.clipboard.writeText(code);
    alert('✅ Code copied: ' + code);
}

async function leaveGame() {
    if (currentGameId) {
        await db.ref('games/' + currentGameId + '/players/' + currentUser.uid).remove();
        db.ref('games/' + currentGameId).off();
        currentGameId = null;
        currentGame = null;
        myRole = null;
    }
}

// ========================================
// GAME SCREEN
// ========================================

async function updateGameScreen() {
    showScreen('gameScreen');
    
    // Get my role
    if (!myRole) {
        const roleSnap = await db.ref('games/' + currentGameId + '/roles/' + currentUser.uid).once('value');
        myRole = roleSnap.val();
        displayRole();
    }
    
    // Update phase indicator
    const phaseDiv = document.getElementById('phaseIndicator');
    const phaseName = document.getElementById('phaseName');
    const dayNum = document.getElementById('dayNumber');
    
    phaseName.textContent = currentGame.phase === 'night' ? '🌙 Night' : '☀️ Day';
    dayNum.textContent = currentGame.day;
    phaseDiv.className = 'phase-indicator ' + currentGame.phase;
    
    // Update timer
    updateTimer();
    
    // Update events
    updateEvents();
    
    // Update action area
    updateActionArea();
    
    // Update player list
    updatePlayerList();
}

function displayRole() {
    const roleCard = document.getElementById('roleCard');
    const roleIcon = document.getElementById('roleIcon');
    const roleName = document.getElementById('roleName');
    const roleDesc = document.getElementById('roleDesc');
    
    roleCard.className = 'role-card ' + myRole;
    
    if (myRole === 'mafia') {
        roleIcon.textContent = '🔪';
        roleName.textContent = 'MAFIA';
        roleDesc.textContent = 'Eliminate villagers at night. Work with other mafia members!';
    } else if (myRole === 'doctor') {
        roleIcon.textContent = '💉';
        roleName.textContent = 'DOCTOR';
        roleDesc.textContent = 'Save one person each night from being killed!';
    } else if (myRole === 'detective') {
        roleIcon.textContent = '🔍';
        roleName.textContent = 'DETECTIVE';
        roleDesc.textContent = 'Investigate one person each night to discover their role!';
    } else {
        roleIcon.textContent = '👤';
        roleName.textContent = 'VILLAGER';
        roleDesc.textContent = 'Vote during the day to eliminate the mafia!';
    }
}

function updateTimer() {
    if (phaseTimer) clearInterval(phaseTimer);
    
    const duration = currentGame.phaseDuration || 45000;
    const start = currentGame.phaseStart || Date.now();
    const end = start + duration;
    
    phaseTimer = setInterval(() => {
        const now = Date.now();
        const remaining = Math.max(0, Math.floor((end - now) / 1000));
        
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        document.getElementById('timer').textContent = 
            `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
        if (remaining === 0) {
            clearInterval(phaseTimer);
            if (currentGame.host === currentUser.uid) {
                resolvePhase();
            }
        }
    }, 1000);
}

function updateEvents() {
    const eventsDiv = document.getElementById('gameEvents');
    const events = currentGame.events || [];
    
    if (events.length > 0) {
        const lastEvent = events[events.length - 1];
        eventsDiv.innerHTML = `<strong>Last Event:</strong> ${lastEvent}`;
        eventsDiv.style.display = 'block';
    } else {
        eventsDiv.style.display = 'none';
    }
}

function updateActionArea() {
    const actionArea = document.getElementById('actionArea');
    const me = currentGame.players[currentUser.uid];
    
    if (!me || !me.alive) {
        actionArea.innerHTML = '<div class="warning-box">☠️ You are dead. You can observe but cannot act.</div>';
        return;
    }
    
    const myAction = (currentGame.actions || {})[currentUser.uid];
    
    if (currentGame.phase === 'night') {
        if (myRole === 'mafia') {
            showMafiaAction(myAction);
        } else if (myRole === 'doctor') {
            showDoctorAction(myAction);
        } else if (myRole === 'detective') {
            showDetectiveAction(myAction);
        } else {
            actionArea.innerHTML = '<div class="info-box">😴 Sleep tight! Mafia are choosing...</div>';
        }
    } else if (currentGame.phase === 'day') {
        showVoteAction(myAction);
    }
}

function showMafiaAction(myAction) {
    const actionArea = document.getElementById('actionArea');
    const alivePlayers = Object.values(currentGame.players).filter(p => p.alive && p.uid !== currentUser.uid && (currentGame.roles || {})[p.uid] !== 'mafia');
    
    if (myAction) {
        actionArea.innerHTML = `<div class="success-box">✅ You voted to kill: ${getPlayerName(myAction)}</div>`;
        return;
    }
    
    let html = '<div class="info-box"><strong>🔪 Choose a victim:</strong></div><div class="action-grid">';
    alivePlayers.forEach(p => {
        html += `<button class="vote-button" onclick="submitAction('${p.uid}')">Kill ${p.name}</button>`;
    });
    html += '</div>';
    actionArea.innerHTML = html;
}

function showDoctorAction(myAction) {
    const actionArea = document.getElementById('actionArea');
    const alivePlayers = Object.values(currentGame.players).filter(p => p.alive);
    
    if (myAction) {
        actionArea.innerHTML = `<div class="success-box">✅ You protected: ${getPlayerName(myAction)}</div>`;
        return;
    }
    
    let html = '<div class="info-box"><strong>💉 Choose someone to save:</strong></div><div class="action-grid">';
    alivePlayers.forEach(p => {
        html += `<button class="vote-button" onclick="submitAction('${p.uid}')">Save ${p.name}</button>`;
    });
    html += '</div>';
    actionArea.innerHTML = html;
}

function showDetectiveAction(myAction) {
    const actionArea = document.getElementById('actionArea');
    const alivePlayers = Object.values(currentGame.players).filter(p => p.alive && p.uid !== currentUser.uid);
    
    if (myAction) {
        const result = (currentGame.detectiveResults || {})[currentUser.uid];
        const resultText = result ? '🔴 IS MAFIA!' : '✅ Not Mafia';
        actionArea.innerHTML = `<div class="success-box">🔍 You investigated: ${getPlayerName(myAction)}<br><strong>${resultText}</strong></div>`;
        return;
    }
    
    let html = '<div class="info-box"><strong>🔍 Choose someone to investigate:</strong></div><div class="action-grid">';
    alivePlayers.forEach(p => {
        html += `<button class="vote-button" onclick="submitAction('${p.uid}')">Investigate ${p.name}</button>`;
    });
    html += '</div>';
    actionArea.innerHTML = html;
}

function showVoteAction(myAction) {
    const actionArea = document.getElementById('actionArea');
    const alivePlayers = Object.values(currentGame.players).filter(p => p.alive && p.uid !== currentUser.uid);
    
    if (myAction) {
        actionArea.innerHTML = `<div class="success-box">✅ You voted to eliminate: ${getPlayerName(myAction)}</div>`;
        return;
    }
    
    let html = '<div class="warning-box"><strong>⚖️ Vote to eliminate someone:</strong></div><div class="action-grid">';
    alivePlayers.forEach(p => {
        html += `<button class="vote-button danger" onclick="submitAction('${p.uid}')">Vote ${p.name}</button>`;
    });
    html += '</div>';
    actionArea.innerHTML = html;
}

async function submitAction(targetUid) {
    await db.ref('games/' + currentGameId + '/actions/' + currentUser.uid).set(targetUid);
}

function getPlayerName(uid) {
    return (currentGame.players[uid] || {}).name || 'Unknown';
}

function updatePlayerList() {
    const list = document.getElementById('gamePlayers');
    list.innerHTML = '<strong>👥 Players:</strong><br>';
    
    const players = Object.values(currentGame.players);
    players.forEach(p => {
        const item = document.createElement('div');
        item.className = 'player-item';
        
        const status = p.alive ? 
            `<span class="player-status">Alive</span>` : 
            `<span class="player-status dead">☠️ Dead</span>`;
        
        item.innerHTML = `
            <span class="player-name">${p.name}</span>
            ${status}
        `;
        list.appendChild(item);
    });
}

// ========================================
// PHASE RESOLUTION (HOST ONLY)
// ========================================

async function resolvePhase() {
    if (currentGame.host !== currentUser.uid) return;
    
    if (currentGame.phase === 'night') {
        await resolveNight();
    } else if (currentGame.phase === 'day') {
        await resolveDay();
    }
}

async function resolveNight() {
    const actions = currentGame.actions || {};
    const players = currentGame.players;
    const roles = currentGame.roles || {};
    
    // Process bots actions
    await processBotActions();
    
    // Wait a moment for bot actions
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Re-fetch actions
    const actionsSnap = await db.ref('games/' + currentGameId + '/actions').once('value');
    const finalActions = actionsSnap.val() || {};
    
    // Find mafia target (most voted)
    const mafiaVotes = {};
    Object.keys(finalActions).forEach(uid => {
        if (roles[uid] === 'mafia') {
            const target = finalActions[uid];
            mafiaVotes[target] = (mafiaVotes[target] || 0) + 1;
        }
    });
    
    let victim = null;
    let maxVotes = 0;
    Object.keys(mafiaVotes).forEach(uid => {
        if (mafiaVotes[uid] > maxVotes) {
            maxVotes = mafiaVotes[uid];
            victim = uid;
        }
    });
    
    // Find doctor's save
    let saved = null;
    Object.keys(finalActions).forEach(uid => {
        if (roles[uid] === 'doctor') {
            saved = finalActions[uid];
        }
    });
    
    // Find detective's target
    let investigated = null;
    let investigator = null;
    Object.keys(finalActions).forEach(uid => {
        if (roles[uid] === 'detective') {
            investigated = finalActions[uid];
            investigator = uid;
        }
    });
    
    // Process detective result
    if (investigated && investigator) {
        const isMafia = roles[investigated] === 'mafia';
        await db.ref('games/' + currentGameId + '/detectiveResults/' + investigator).set(isMafia);
    }
    
    // Determine if victim dies
    const events = currentGame.events || [];
    if (victim && victim !== saved) {
        await db.ref('games/' + currentGameId + '/players/' + victim + '/alive').set(false);
        events.push(`☠️ ${getPlayerName(victim)} was killed by the Mafia!`);
    } else if (victim && victim === saved) {
        events.push(`💉 Someone was saved by the Doctor!`);
    } else {
        events.push(`🌙 A quiet night... no one died.`);
    }
    
    // Check win condition
    const alive = Object.values(players).filter(p => p.alive);
    const aliveMafia = alive.filter(p => roles[p.uid] === 'mafia').length;
    const aliveVillagers = alive.length - aliveMafia;
    
    if (aliveMafia === 0) {
        await endGame('villagers');
        return;
    } else if (aliveMafia >= aliveVillagers) {
        await endGame('mafia');
        return;
    }
    
    // Move to day phase
    await db.ref('games/' + currentGameId).update({
        phase: 'day',
        phaseStart: Date.now(),
        phaseDuration: 60000, // 60 seconds
        events: events,
        actions: null,
        detectiveResults: null
    });
}

async function resolveDay() {
    const actions = currentGame.actions || {};
    
    // Process bot votes
    await processBotActions();
    
    // Wait for bot votes
    await new Promise(resolve => setTimeout(resolv
