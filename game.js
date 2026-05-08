const PLAYER_DATA_DEFAULTS = {
  bestTime: 0,
  totalRaces: 0,
  leaderboard: [
    { field: 'bestTime', label: 'Best Race Time (s)' }
  ]
};

class Game {
  constructor(mapType = 'forest') {
    window.game = this;
    // Init persistent save data
    this.playerData = PLAYER_DATA_DEFAULTS;
    SaveData.init(PLAYER_DATA_DEFAULTS).then(data => { this.playerData = data; });
    this.mapType = mapType;
    
    this.container = document.getElementById('gameContainer');
    this.entities = [];
    this.aiCars = [];
    this.sparks = []; // Spark particles array
    
    // Setup Three.js
    this.scene = new THREE.Scene();
    // Sunset Sky Color
    const skyColor = 0xfd5e53; // Sunset Orange/Pink
    this.scene.background = new THREE.Color(skyColor);
    // Fog matches sky for seamless horizon - Reduced density for better visibility of mountains
    this.scene.fog = new THREE.FogExp2(skyColor, 0.00025);

    // Increased far plane to see further (mountains)
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 4000);
    this.camera.position.set(0, 10, 20);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Lighting - Sunset
    // Reduced ambient light slightly to make car headlights pop more
    const ambientLight = new THREE.AmbientLight(0xffcccc, 0.35); 
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffaa33, 1.0); // Orange sun
    dirLight.position.set(-100, 50, -100); // Lower sun position for sunset
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 1000; // Increased shadow distance
    dirLight.shadow.bias = -0.0005;
    
    // Follow shadow camera with player roughly
    const d = 100;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    this.scene.add(dirLight);
    this.sunLight = dirLight;

    // Input
    this.clock = new THREE.Clock();
    this.input = { forward: false, backward: false, left: false, right: false, drift: false };
    
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('resize', () => this.onResize());

    // Game State
    this.score = 0;
    this.time = 0;
    this.isPlaying = false;
    this.raceStarted = false;
    this.raceFinished = false;
    this.countdownTimeout = null;
    
    // Create Countdown UI
    this.countdownEl = document.createElement('div');
    this.countdownEl.id = 'countdown';
    this.countdownEl.style.display = 'none';
    document.getElementById('ui-layer').appendChild(this.countdownEl);
    
    // Update Score Label to POS
    const scoreLabel = document.querySelector('#hud .hud-item:nth-child(2) .label');
    if(scoreLabel) scoreLabel.innerText = "POS";

    // Initial Entities
    this.player = new Car(this.scene);
    this.entities.push(this.player);
    
    // Shared Geometry/Material for Sparks
    this.sparkGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    this.sparkMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xffcc00, 
        transparent: true, 
        opacity: 0.5 
    });

    // Create 8 AI Cars around the player
    const aiColors = [0x3498db, 0x9b59b6, 0xf1c40f, 0xe67e22, 0x2ecc71, 0x1abc9c, 0x34495e, 0x95a5a6];
    // Shifted all X positions by -3.5 to move cars left (was -3)
    const offsets = [
        { x: -9.5, z: -40 }, { x: -3.5, z: -40 }, { x: 2.5, z: -40 },
        { x: -9.5, z: -30 }, { x: -3.5, z: -30 }, { x: 2.5, z: -30 },
        { x: -9.5, z: -20 }, { x: 2.5, z: -20 }
    ];

    for(let i=0; i<8; i++) {
        const ai = new Car(this.scene, { isAI: true, color: aiColors[i] });
        // Store initial relative offset for resetting
        ai.startOffset = offsets[i];
        this.aiCars.push(ai);
        this.entities.push(ai);
    }

    // -- Cinematic Preview Initial Positions (Single File) --
    // Player at the front
    this.player.position.set(0, 0.02, -20);
    this.player.rotation.set(0, 0, 0);
    if(this.player.mesh) {
        this.player.mesh.position.copy(this.player.position);
        this.player.mesh.rotation.copy(this.player.rotation);
    }
    
    // AI cars in a line behind
    this.aiCars.forEach((ai, i) => {
        // Roughly single file with slight variation
        const xVar = (Math.random() - 0.5) * 3.0; 
        ai.position.set(xVar, 0.02, -20 - (i + 1) * 12); // Spaced 12 units apart
        ai.rotation.set(0, 0, 0);
        
        // Update mesh immediately
        if(ai.mesh) {
            ai.mesh.position.copy(ai.position);
            ai.mesh.rotation.copy(ai.rotation);
        }
    });
    
    this.environment = new Environment(this, this.mapType);
    
    // Title Screen State
    this.isTitleScreen = false;
    this.cameraAngleIndex = 0;
    this.cameraSwitchTimer = 0;
    
    // Multiplayer State
    this.isMultiplayer = false;
    this.remotePlayers = {}; // id -> { car, targetPos, targetRot, targetSpeed }
    this.mpPlayerColors = [0xe74c3c, 0x3498db, 0x9b59b6, 0xf1c40f, 0xe67e22, 0x2ecc71];
    this.mpStartOffsets = [
        { x: -3.5, z: -20 }, { x: 2.5, z: -20 },
        { x: -3.5, z: -30 }, { x: 2.5, z: -30 },
        { x: -3.5, z: -40 }, { x: 2.5, z: -40 }
    ];
  }

  startTitleScreen() {
    this.isTitleScreen = true;
    this.isPlaying = true; // Allow update loop to run
    this.raceStarted = false;
    document.getElementById('hud').style.display = 'none';
    document.getElementById('countdown').style.display = 'none';
    
    // Start the loop if not already started
    if (!this.loopRunning) {
        this.loopRunning = true;
        const loop = () => {
            requestAnimationFrame(loop);
            this.update();
            this.render();
        };
        loop();
    }
  }

  async startMultiplayerLobby(mapType) {
    this.isMultiplayer = true;
    this.mapType = mapType;
    
    document.getElementById('lobbyScreen').style.display = 'block';
    document.getElementById('lobbyStatus').innerText = 'Connecting...';
    
    try {
        await Multiplayer.connect();
    } catch(e) {
        document.getElementById('lobbyStatus').innerText = 'Connection failed. Try again.';
        return;
    }
    
    document.getElementById('lobbyStatus').innerText = 'Waiting for players...';
    
    // Check if a game is already in progress
    const gameData = Multiplayer.getGameData();
    if (gameData && gameData.raceInProgress) {
        document.getElementById('lobbyStatus').innerText = 'Game in progress';
        document.getElementById('lobbyStartBtn').style.display = 'none';
    }
    
    // Listen for game data changes (race starting/ending)
    Multiplayer.onGameDataUpdate((data) => {
        if (data && data.raceInProgress && !this.raceStarted) {
            document.getElementById('lobbyStatus').innerText = 'Game in progress';
            document.getElementById('lobbyStartBtn').style.display = 'none';
        }
    });
    
    this.updateLobbyUI();
    
    // Send a presence update so others see us
    Multiplayer.sendUpdate({ inLobby: true });
    
    // Lobby start button (host can start with 2+ players)
    document.getElementById('lobbyStartBtn').addEventListener('click', () => {
        if (Multiplayer.isHost() && Multiplayer.getPlayerCount() >= 2) {
            Multiplayer.sendMessage('startRace', { map: this.mapType });
        }
    });
    
    // Listen for players joining/leaving
    Multiplayer.onPlayerJoin((player) => {
        this.updateLobbyUI();
        // Auto-start at 6 players
        if (Multiplayer.getPlayerCount() >= 6 && Multiplayer.isHost()) {
            Multiplayer.sendMessage('startRace', { map: this.mapType });
        }
    });
    
    Multiplayer.onPlayerLeave((player) => {
        this.updateLobbyUI();
        // Remove remote player car
        if (this.remotePlayers[player.id]) {
            this.remotePlayers[player.id].car.destroy();
            const idx = this.entities.indexOf(this.remotePlayers[player.id].car);
            if (idx > -1) this.entities.splice(idx, 1);
            delete this.remotePlayers[player.id];
        }
    });
    
    // Listen for race start message
    Multiplayer.onMessage('startRace', (data) => {
        document.getElementById('lobbyScreen').style.display = 'none';
        if (Multiplayer.isHost()) {
            Multiplayer.setGameData({ raceInProgress: true });
        }
        this.startMultiplayerRace(data.map || this.mapType);
    });
    
    // Listen for race end message (time limit)
    Multiplayer.onMessage('raceTimeUp', (data) => {
        this.multiplayerTimeUp(data.rankings);
    });
    
    // Listen for player updates
    Multiplayer.on('playerUpdate', (data) => {
        if (data.id === Multiplayer.getMyId()) return;
        
        if (!this.remotePlayers[data.id]) {
            // Create remote player car
            const pIdx = data.playerIndex || 0;
            const color = this.mpPlayerColors[pIdx % this.mpPlayerColors.length];
            const car = new Car(this.scene, { isAI: true, color: color });
            car.isRemote = true;
            this.remotePlayers[data.id] = {
                car: car,
                targetPos: new THREE.Vector3(data.x || 0, data.y || 0.02, data.z || 0),
                targetRot: data.ry || 0,
                targetSpeed: data.speed || 0
            };
            this.entities.push(car);
        }
        
        const rp = this.remotePlayers[data.id];
        // Recolor car based on playerIndex if not yet colored correctly
        if (data.playerIndex !== undefined && rp.colorIndex !== data.playerIndex) {
            rp.colorIndex = data.playerIndex;
            this.recolorCar(rp.car, this.mpPlayerColors[data.playerIndex % this.mpPlayerColors.length]);
        }
        rp.targetPos.set(data.x || 0, data.y || 0.02, data.z || 0);
        rp.targetRot = data.ry || 0;
        rp.targetSpeed = data.speed || 0;
        rp.car.lap = data.lap || 0;
        rp.car.trackT = data.trackT || 0;
        rp.car.finished = data.finished || false;
        rp.car.finishTime = data.finishTime || 0;
        
        // Non-host players sync timer from host
        if (data.hostTime !== undefined && !Multiplayer.isHost()) {
            this.time = data.hostTime;
            this._lastHostTime = Date.now() / 1000;
        }
    });
  }
  
  updateLobbyUI() {
    const count = Multiplayer.getPlayerCount();
    const players = Multiplayer.getPlayers();
    const myId = Multiplayer.getMyId();
    
    document.getElementById('lobbyCount').innerText = `${count} / 6 Players`;
    
    const listEl = document.getElementById('playerList');
    listEl.innerHTML = '';
    
    // Build display list ensuring local player is included
    let displayPlayers = [...players];
    const localInList = displayPlayers.some(p => p.id === myId);
    if (!localInList && myId) {
        displayPlayers.unshift({ id: myId });
    }
    
    for (let i = 0; i < 6; i++) {
        const slot = document.createElement('div');
        slot.className = 'player-slot';
        
        if (displayPlayers[i]) {
            slot.classList.add('filled');
            if (displayPlayers[i].id === myId) {
                slot.classList.add('you');
                slot.innerText = 'YOU';
            } else {
                slot.innerText = `P${i + 1}`;
            }
        } else {
            slot.innerText = '?';
        }
        
        listEl.appendChild(slot);
    }
    
    // Show start button for host with 2+ players
    const startBtn = document.getElementById('lobbyStartBtn');
    if (Multiplayer.isHost() && count >= 2) {
        startBtn.style.display = 'block';
        document.getElementById('lobbyStatus').innerText = 'You are the host. Start when ready!';
    } else if (count >= 2) {
        startBtn.style.display = 'none';
        document.getElementById('lobbyStatus').innerText = 'Waiting for host to start...';
    } else {
        startBtn.style.display = 'none';
        document.getElementById('lobbyStatus').innerText = 'Waiting for players...';
    }
  }
  
  startMultiplayerRace(mapType) {
    // Hide AI cars for multiplayer
    this.aiCars.forEach(ai => {
        ai.destroy();
    });
    this.aiCars = [];
    this.entities = this.entities.filter(e => e !== undefined && e.active !== false);
    
    // Switch map if needed
    if (this.mapType !== mapType) {
        this.mapType = mapType;
        if (this.environment) this.environment.destroy();
        this.entities = [this.player];
        // Re-add remote players
        Object.values(this.remotePlayers).forEach(rp => {
            this.entities.push(rp.car);
        });
        this.environment = new Environment(this, this.mapType);
    }
    
    // Create remote player cars for existing players
    const players = Multiplayer.getPlayers();
    const myId = Multiplayer.getMyId();
    players.forEach((p) => {
        if (p.id === myId) return;
        const pIdx = p.playerIndex !== undefined ? p.playerIndex : (players.indexOf(p));
        const color = this.mpPlayerColors[pIdx % this.mpPlayerColors.length];
        const offset = this.mpStartOffsets[pIdx % this.mpStartOffsets.length];
        // Always use grid start offsets for race start
        const startX = offset.x;
        const startY = 0.02;
        const startZ = offset.z;
        const startRY = 0;
        if (!this.remotePlayers[p.id]) {
            const car = new Car(this.scene, { isAI: true, color: color });
            car.isRemote = true;
            car.position.set(startX, startY, startZ);
            car.rotation.y = startRY;
            this.remotePlayers[p.id] = {
                car: car,
                targetPos: new THREE.Vector3(startX, startY, startZ),
                targetRot: startRY,
                targetSpeed: 0,
                colorIndex: pIdx
            };
            this.entities.push(car);
        } else {
            // Already exists — update position and recolor
            const rp = this.remotePlayers[p.id];
            rp.targetPos.set(startX, startY, startZ);
            rp.car.position.set(startX, startY, startZ);
            rp.car.rotation.y = startRY;
            rp.targetRot = startRY;
            this.recolorCar(rp.car, color);
            rp.colorIndex = pIdx;
        }
    });
    
    // Position local player
    const myIndex = Multiplayer.getMyPlayerIndex() || 0;
    const myOffset = this.mpStartOffsets[myIndex % this.mpStartOffsets.length];
    this.player.position.set(myOffset.x, 0.02, myOffset.z);
    
    // Set player car color based on index
    this.recolorCar(this.player, this.mpPlayerColors[myIndex % this.mpPlayerColors.length]);
    
    this.isTitleScreen = false;
    this.isPlaying = true;
    this.raceFinished = false;
    this.finalPosition = null;
    this._sentTimeUp = false;
    this.score = 0;
    this.time = 0;
    this.mpRaceStartWall = null;
    this.player.velocity.set(0, 0, 0);
    this.player.actualVelocity.set(0, 0, 0);
    this.player.rotation.set(0, 0, 0);
    this.player.speed = 0;
    this.player.isFalling = false;
    this.player.yVelocity = 0;
    this.player.trackT = 0.99;
    this.player.lap = 0;
    this.player.finished = false;
    this.player.finishTime = 0;
    this.player.isDrifting = false;
    this.player.driftTime = 0;
    this.player.boostTimer = 0;
    this.player.boostEffectTimer = 0;
    
    this.entities.forEach(e => {
        if(e.mesh) {
            e.mesh.position.copy(e.position);
            e.mesh.rotation.copy(e.rotation);
            e.mesh.updateMatrixWorld(true);
        }
    });
    
    const relativeOffset = new THREE.Vector3(0, 5, 12);
    const cameraOffset = relativeOffset.clone().applyMatrix4(this.player.mesh.matrixWorld);
    this.camera.position.copy(cameraOffset);
    this.camera.lookAt(this.player.position.clone().add(new THREE.Vector3(0, 2, 0)));
    
    document.getElementById('timeLimitHint').style.display = 'block';
    this.startCountdown();
    document.getElementById('hud').style.display = 'block';
    
    if (!this.loopRunning) {
        this.loopRunning = true;
        const loop = () => {
            requestAnimationFrame(loop);
            this.update();
            this.render();
        };
        loop();
    }
  }

  switchMap(mapType) {
    this.mapType = mapType;
    
    // Cleanup old environment
    if (this.environment) {
        this.environment.destroy();
    }
    
    // Reset entities list to just cars (remove old trees/boosts)
    this.entities = [this.player, ...this.aiCars];
    
    // Create new environment
    this.environment = new Environment(this, this.mapType);
    
    // Reset game state
    this.resetGame();
  }

  onKey(e, pressed) {
    switch(e.code) {
      case 'ArrowUp': case 'KeyW': this.input.forward = pressed; break;
      case 'ArrowDown': case 'KeyS': this.input.backward = pressed; break;
      case 'ArrowLeft': case 'KeyA': this.input.left = pressed; break;
      case 'ArrowRight': case 'KeyD': this.input.right = pressed; break;
      // case 'ShiftLeft': case 'ShiftRight': this.input.drift = pressed; break; // Drift is now automatic
    }
  }

  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  async start() {
    this.playerData = await SaveData.getPlayerData(PLAYER_DATA_DEFAULTS);
    this.isTitleScreen = false;
    this.isPlaying = true;
    this.isMultiplayer = false;
    
    // Recreate AI cars if they were destroyed (e.g. after multiplayer)
    if (this.aiCars.length === 0) {
        const aiColors = [0x3498db, 0x9b59b6, 0xf1c40f, 0xe67e22, 0x2ecc71, 0x1abc9c, 0x34495e, 0x95a5a6];
        const offsets = [
            { x: -9.5, z: -40 }, { x: -3.5, z: -40 }, { x: 2.5, z: -40 },
            { x: -9.5, z: -30 }, { x: -3.5, z: -30 }, { x: 2.5, z: -30 },
            { x: -9.5, z: -20 }, { x: 2.5, z: -20 }
        ];
        for (let i = 0; i < 8; i++) {
            const ai = new Car(this.scene, { isAI: true, color: aiColors[i] });
            ai.startOffset = offsets[i];
            this.aiCars.push(ai);
            this.entities.push(ai);
        }
    }
    
    this.resetGame();
    
    if (!this.loopRunning) {
        this.loopRunning = true;
        const loop = () => {
            requestAnimationFrame(loop);
            this.update();
            this.render();
        };
        loop();
    }
  }

  resetGame() {
    this.raceFinished = false;
    this.finalPosition = null;
    this.score = 0;
    this.time = 0;
    // Set Y to 0.02 to be on top of the flat road
    // Shifted player start position to x = -3.5 (was -3)
    this.player.position.set(-3.5, 0.02, -20);
    this.player.velocity.set(0, 0, 0);
    this.player.actualVelocity.set(0, 0, 0);
    // Reset rotation to face forward (-Z)
    this.player.rotation.set(0, 0, 0);
    this.player.speed = 0;
    this.player.isFalling = false;
    this.player.yVelocity = 0;
    this.player.trackT = 0.99; // Start at end of loop to prevent immediate lap decrement
    this.player.lap = 0;
    this.player.finished = false;
    this.player.finishTime = 0;
    this.player.isDrifting = false;
    this.player.driftTime = 0;
    this.player.boostTimer = 0;
    this.player.boostEffectTimer = 0;
    
    // Reset AI Cars
    this.aiCars.forEach(ai => {
        ai.position.set(ai.startOffset.x, 0.02, ai.startOffset.z);
        ai.velocity.set(0, 0, 0);
        ai.actualVelocity.set(0, 0, 0);
        ai.rotation.set(0, 0, 0);
        ai.speed = 0;
        ai.trackT = 0.99; // Start at end of loop
        ai.lap = 0;
        ai.finished = false;
        ai.finishTime = 0;
        ai.isFalling = false;
        ai.yVelocity = 0;
        ai.isDrifting = false;
        ai.driftTime = 0;
        ai.boostTimer = 0;
        ai.boostEffectTimer = 0;
    });

    this.environment.reset();
    
    // Sync meshes to new positions immediately so they appear correctly during countdown
    this.entities.forEach(e => {
        if(e.mesh) {
            e.mesh.position.copy(e.position);
            e.mesh.rotation.copy(e.rotation);
            e.mesh.updateMatrixWorld(true);
        }
    });

    // Snap camera to start position
    const relativeOffset = new THREE.Vector3(0, 5, 12);
    const cameraOffset = relativeOffset.clone().applyMatrix4(this.player.mesh.matrixWorld);
    this.camera.position.copy(cameraOffset);
    this.camera.lookAt(this.player.position.clone().add(new THREE.Vector3(0, 2, 0)));

    if (!this.isTitleScreen) {
        this.startCountdown();
        document.getElementById('hud').style.display = 'block';
    } else {
        // In title screen, just place cars but don't start countdown
        document.getElementById('hud').style.display = 'none';
    }
    
    this.isPlaying = true;
  }
  
  startCountdown() {
    // Clear any existing countdown
    if (this.countdownTimeout) clearTimeout(this.countdownTimeout);

    this.raceStarted = false;
    this.countdownEl.style.display = 'block';
    
    // Reset any inline styles from previous runs
    this.countdownEl.style.transform = '';
    this.countdownEl.style.fontSize = '';
    this.countdownEl.style.color = '';
    
    let count = 3;
    
    const tick = () => {
        // Force reflow to restart animation
        this.countdownEl.className = '';
        void this.countdownEl.offsetWidth;
        
        if (count > 0) {
            this.countdownEl.innerText = count;
            this.countdownEl.className = 'count-number';
            
            // Traffic light colors
            if (count === 3) this.countdownEl.style.color = '#ff3333';
            else if (count === 2) this.countdownEl.style.color = '#ffaa33';
            else if (count === 1) this.countdownEl.style.color = '#ffff33';
            
            count--;
            this.countdownTimeout = setTimeout(tick, 1000);
        } else {
            this.countdownEl.innerText = "GO!";
            this.countdownEl.className = 'count-go';
            this.countdownEl.style.color = ''; // Use CSS color (Green)
            
            this.raceStarted = true;
            
            // Hide after animation finishes
            this.countdownTimeout = setTimeout(() => {
                this.countdownEl.style.display = 'none';
            }, 1500);
        }
    };
    
    tick();
  }

  async gameOver() {
    // this.raceStarted = false; // Keep race running for other cars
    this.raceFinished = true;
    
    this.finalPosition = this.calculateRacePosition();
    const position = this.finalPosition;
    let posText = position + "th";
    if (position === 1) posText = "1st";
    else if (position === 2) posText = "2nd";
    else if (position === 3) posText = "3rd";
    
    // Submit to leaderboard (lower time = better; invert for score)
    const raceTime = parseFloat(this.time.toFixed(3));
    const lbScore = Math.max(0, Math.round((300 - raceTime) * 100));
    Leaderboard.attest(lbScore, { time: raceTime, map: this.mapType });
    Leaderboard.finalize(lbScore, { time: raceTime, map: this.mapType });
    // Save personal best
    if (this.playerData.bestTime === 0 || raceTime < this.playerData.bestTime) {
        this.playerData.bestTime = raceTime;
    }
    this.playerData.totalRaces = (this.playerData.totalRaces || 0) + 1;
    await SaveData.setPlayerData(this.playerData);
    
    // In multiplayer, don't show game over screen yet — wait for 120s time limit
    if (this.isMultiplayer) {
        // Show race finished banner
        document.getElementById('raceFinishedBanner').style.display = 'block';
        return;
    }
    
    const screen = document.getElementById('gameOverScreen');
    screen.style.display = 'block';
    
    const h1 = screen.querySelector('h1');
    if(h1) h1.innerText = "RACE FINISHED!";
    
    const scoreEl = document.getElementById('finalScore');
    const bestTxt = this.playerData.bestTime > 0 ? ` | Best: ${this.playerData.bestTime.toFixed(3)}s` : '';
    if(scoreEl) scoreEl.innerText = `Position: ${posText} | Time: ${raceTime.toFixed(3)}s${bestTxt}`;
  }

  update() {
    if (!this.isPlaying) return;

    const dt = Math.min(this.clock.getDelta(), 0.1);

    if (this.isTitleScreen) {
        // Cinematic Camera - Smooth Follow
        const target = this.player;
        
        // Camera Angles Cycling
        this.cameraSwitchTimer += dt;
        if (this.cameraSwitchTimer > 5.0) {
            this.cameraSwitchTimer = 0;
            this.cameraAngleIndex = (this.cameraAngleIndex + 1) % 4;
        }

        let offset;
        switch(this.cameraAngleIndex) {
            case 0: offset = new THREE.Vector3(0, 6, 16); break; // Back View
            case 1: offset = new THREE.Vector3(0, 40, 0); break; // Top View
            case 2: offset = new THREE.Vector3(20, 6, 0); break; // Side View
            case 3: offset = new THREE.Vector3(0, 5, -18); break; // Front View
            default: offset = new THREE.Vector3(0, 6, 16);
        }
        
        // Convert offset to world space based on car rotation
        const worldOffset = offset.clone().applyMatrix4(target.mesh.matrixWorld);
        
        // Smoothly interpolate current camera position to target
        this.camera.position.lerp(worldOffset, dt * 2.0);
        
        // Look at the car (slightly ahead)
        const lookTarget = target.position.clone().add(new THREE.Vector3(0, 1.5, 0));
        this.camera.lookAt(lookTarget);
        
        // Make ALL cars drive automatically in background
        const trackCurve = this.environment ? this.environment.trackCurve : null;
        
        // Update AI cars
        this.aiCars.forEach(ai => {
            ai.speed = Math.min(ai.speed + 10 * dt, 40); // Cap speed
            ai.update(dt, { forward: true }, trackCurve);
        });
        
        // Update Player Car (Simulate AI driving)
        if (this.player) {
            this.player.speed = Math.min(this.player.speed + 10 * dt, 40);
            
            // Generate AI-like input for player
            let playerInput = { forward: true, drift: false, turn: 0 };
            if (trackCurve) {
                playerInput = this.player.updateAI(dt, trackCurve);
            }
            
            this.player.update(dt, playerInput, trackCurve);
        }

        // Update sparks if any
        this.updateSparks(dt);
        
        return; // Skip race logic
    }

    if (this.raceStarted) {
        // Check for Finish
        if (this.player.lap >= 2 && !this.raceFinished) {
            this.gameOver();
        }

        // Update Entities
        // Pass trackCurve for AI
        const trackCurve = this.environment ? this.environment.trackCurve : null;
        this.entities.forEach(e => {
            // Skip remote players - they are interpolated below
            if (e.isRemote) return;
            e.update(dt, this.input, trackCurve);
        });
        
        // Interpolate remote players
        Object.values(this.remotePlayers).forEach(rp => {
            rp.car.position.lerp(rp.targetPos, 10 * dt);
            rp.car.rotation.y = THREE.MathUtils.lerp(rp.car.rotation.y, rp.targetRot, 10 * dt);
            rp.car.speed = THREE.MathUtils.lerp(rp.car.speed, rp.targetSpeed, 5 * dt);
            if (rp.car.mesh) {
                rp.car.mesh.position.copy(rp.car.position);
                rp.car.mesh.rotation.copy(rp.car.rotation);
            }
        });
        
        // Send multiplayer update (throttled to ~20 times/sec)
        if (!this._lastMpSend) this._lastMpSend = 0;
        const _mpNow = performance.now();
        if (this.isMultiplayer && Multiplayer.isConnected() && _mpNow - this._lastMpSend >= 50) {
            this._lastMpSend = _mpNow;
            const updateData = {
                playerIndex: Multiplayer.getMyPlayerIndex() || 0,
                x: this.player.position.x,
                y: this.player.position.y,
                z: this.player.position.z,
                ry: this.player.rotation.y,
                speed: this.player.speed,
                lap: this.player.lap,
                trackT: this.player.trackT,
                finished: this.player.finished,
                finishTime: this.player.finishTime
            };
            // Host broadcasts authoritative timer
            if (Multiplayer.isHost()) {
                updateData.hostTime = this.time;
            }
            Multiplayer.sendUpdate(updateData);
        }

        // Update Environment
        this.environment.update(dt, this.player.position, this.player.actualVelocity);
        
        // Collisions
        this.checkCollisions();
        
        // Score Logic
        if (this.player.speed > 0) {
            // Points for speed
            this.score += Math.floor(this.player.speed * dt);
            // Points for drifting
            if (this.player.isDrifting) {
                this.score += Math.floor(this.player.speed * dt * 2);
            }
        }
        
        // Timer Logic
        if (this.isMultiplayer) {
            // Host uses wall-clock time so tab-switching doesn't pause the timer
            if (Multiplayer.isHost()) {
                if (this.mpRaceStartWall === null) this.mpRaceStartWall = Date.now() / 1000 - this.time;
                this.time = Date.now() / 1000 - this.mpRaceStartWall;
            }
        } else if (!this.raceFinished) {
            this.time += dt;
        }
        
        // Non-host: if host left, continue timer locally using wall clock
        if (this.isMultiplayer && !Multiplayer.isHost() && this._lastHostTime) {
            const now = Date.now() / 1000;
            const elapsed = now - this._lastHostTime;
            // Only use local fallback if host hasn't sent an update recently (>2s)
            if (elapsed > 2) {
                this.time += dt;
            }
        }
        
        // Multiplayer 120s time limit (runs regardless of individual finish)
        if (this.isMultiplayer && this.time >= 120 && Multiplayer.isHost() && !this._sentTimeUp) {
            this._sentTimeUp = true;
            const rankings = this.buildMultiplayerRankings();
            Multiplayer.sendMessage('raceTimeUp', { rankings });
        }
    }
    
    // Update Sparks
    this.updateSparks(dt);

    // Camera Follow
    // Smooth follow logic
    const relativeOffset = new THREE.Vector3(0, 5, 12);
    // Calculate ideal camera position based on car rotation
    const cameraOffset = relativeOffset.applyMatrix4(this.player.mesh.matrixWorld);
    
    // Snap camera if race hasn't started (so it doesn't drift from spawn)
    const lerpFactor = this.raceStarted ? 5 * dt : 1.0;
    
    this.camera.position.lerp(cameraOffset, lerpFactor);
    this.camera.lookAt(this.player.position.clone().add(new THREE.Vector3(0, 2, 0)));

    // FOV Effect
    const targetFOV = (this.player.boostEffectTimer > 0) ? 85 : 60;
    const fovLerp = 2.0 * dt;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, fovLerp);
    this.camera.updateProjectionMatrix();

    // Camera Shake during boost
    if (this.player.boostEffectTimer > 0) {
        const shakeIntensity = 0.15;
        this.camera.position.x += (Math.random() - 0.5) * shakeIntensity;
        this.camera.position.y += (Math.random() - 0.5) * shakeIntensity;
        this.camera.position.z += (Math.random() - 0.5) * shakeIntensity;
    }
    
    // Update sun position to stay near player for shadows
    this.sunLight.position.x = this.player.position.x - 100;
    this.sunLight.position.z = this.player.position.z - 100;
    this.sunLight.target.position.copy(this.player.position);
    this.sunLight.target.updateMatrixWorld();

    // UI - Position Calculation
    const position = (this.raceFinished && this.finalPosition) ? this.finalPosition : this.calculateRacePosition();
    let posText = position + "th";
    if (position === 1) posText = "1st";
    else if (position === 2) posText = "2nd";
    else if (position === 3) posText = "3rd";
    
    document.getElementById('speedValue').innerText = Math.abs(Math.round(this.player.speed * 2));
    document.getElementById('scoreValue').innerText = posText;
    document.getElementById('timeValue').innerText = this.time.toFixed(3);
  }

  buildMultiplayerRankings() {
    const myId = Multiplayer.getMyId();
    const players = Multiplayer.getPlayers();
    const entries = [];
    
    // Add local player
    entries.push({
        id: myId,
        name: 'YOU',
        lap: this.player.lap,
        trackT: this.player.trackT,
        finished: this.player.finished,
        finishTime: this.player.finishTime
    });
    
    // Add remote players
    Object.entries(this.remotePlayers).forEach(([id, rp]) => {
        const pInfo = players.find(p => p.id === id);
        entries.push({
            id: id,
            name: pInfo ? `P${players.indexOf(pInfo) + 1}` : 'P?',
            lap: rp.car.lap || 0,
            trackT: rp.car.trackT || 0,
            finished: rp.car.finished || false,
            finishTime: rp.car.finishTime || 0
        });
    });
    
    // Sort by race progress
    entries.sort((a, b) => {
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished) return -1;
        if (b.finished) return 1;
        if (a.lap !== b.lap) return b.lap - a.lap;
        return b.trackT - a.trackT;
    });
    
    return entries;
  }

  multiplayerTimeUp(rankings) {
    // Don't show time's up screen if player is still in lobby
    if (!this.raceStarted && !this.raceFinished) return;
    
    this.raceFinished = true;
    this.raceStarted = false;
    
    if (Multiplayer.isHost()) {
        Multiplayer.setGameData({ raceInProgress: false });
    }
    
    // Clean up remote players and disconnect so lobby players don't see us
    Object.values(this.remotePlayers).forEach(rp => {
        rp.car.destroy();
        const idx = this.entities.indexOf(rp.car);
        if (idx > -1) this.entities.splice(idx, 1);
    });
    this.remotePlayers = {};
    
    try { Multiplayer.disconnect(); } catch(e) {}
    
    const myId = Multiplayer.getMyId();
    const myRank = rankings.findIndex(r => r.id === myId) + 1;
    
    const posText = (pos) => {
        if (pos === 1) return '1st';
        if (pos === 2) return '2nd';
        if (pos === 3) return '3rd';
        return pos + 'th';
    };
    
    // Build rankings display
    let rankingsHtml = '';
    rankings.forEach((r, i) => {
        const isYou = r.id === myId;
        const label = isYou ? 'YOU' : r.name;
        const lapInfo = r.finished ? `Finished (${r.finishTime.toFixed(1)}s)` : `Lap ${r.lap} - ${Math.floor(r.trackT * 100)}%`;
        const style = isYou ? 'color: #ffd700; font-weight: 700;' : 'color: #ccc;';
        rankingsHtml += `<div style="${style} font-size: 14px; margin: 6px 0; font-family: Orbitron, sans-serif; letter-spacing: 1px;">${posText(i + 1)} — ${label} — ${lapInfo}</div>`;
    });
    
    // Hide the race finished banner if it was showing
    document.getElementById('raceFinishedBanner').style.display = 'none';
    
    const screen = document.getElementById('gameOverScreen');
    screen.style.display = 'block';
    
    const h1 = screen.querySelector('h1');
    if (h1) h1.innerText = 'TIME\'S UP!';
    
    const scoreEl = document.getElementById('finalScore');
    if (scoreEl) scoreEl.innerHTML = `Your Position: ${posText(myRank)}<br><br>${rankingsHtml}`;
    
    // Replace button with main menu button
    const restartBtn = document.getElementById('restartBtn');
    if (restartBtn) {
        restartBtn.innerText = 'MAIN MENU';
        const newBtn = restartBtn.cloneNode(true);
        restartBtn.parentNode.replaceChild(newBtn, restartBtn);
        newBtn.id = 'restartBtn';
        newBtn.addEventListener('click', () => {
            screen.style.display = 'none';
            newBtn.innerText = 'TRY AGAIN';
            document.getElementById('hud').style.display = 'none';
            document.getElementById('timeLimitHint').style.display = 'none';
            document.getElementById('splashScreen').style.display = 'flex';
            this.isTitleScreen = true;
            this.isMultiplayer = false;
            this.raceStarted = false;
            this.raceFinished = false;
            this.startTitleScreen();
        });
    }
    
    this.finalPosition = myRank;
  }

  recolorCar(car, color) {
    if (!car.mesh) return;
    car.color = color;
    car.mesh.traverse((child) => {
        if (child.isMesh && child.material && child.material.color) {
            // Only recolor body parts (MeshStandardMaterial with metalness 0.6 = body paint)
            if (child.material.metalness === 0.6 && child.material.roughness === 0.1) {
                child.material.color.setHex(color);
            }
        }
    });
  }

  calculateRacePosition() {
    const remoteCars = Object.values(this.remotePlayers).map(rp => rp.car);
    const allCars = [this.player, ...this.aiCars, ...remoteCars];
    
    allCars.sort((a, b) => {
        if (a.finished && b.finished) {
            return a.finishTime - b.finishTime;
        }
        if (a.finished) return -1;
        if (b.finished) return 1;
        
        if (a.lap !== b.lap) {
            return b.lap - a.lap;
        }
        return b.trackT - a.trackT;
    });
    
    return allCars.indexOf(this.player) + 1;
  }

  checkCollisions() {
    // Tree Collisions (OBB vs Circle)
    // Visual trunk radius is ~1.5 (0.6 * 2.5)
    const treeRadius = 1.5; 
    
    // Car OBB properties
    const hw = this.player.width / 2;
    const hl = this.player.length / 2;
    
    const angle = this.player.rotation.y;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const carX = this.player.position.x;
    const carZ = this.player.position.z;

    for (const tree of this.environment.trees) {
      // Transform tree position to car's local space
      const dx = tree.position.x - carX;
      const dz = tree.position.z - carZ;
      
      // Rotate backwards (-angle)
      // x' = x*cos + z*sin
      // z' = -x*sin + z*cos
      const localX = dx * cos + dz * sin;
      const localZ = -dx * sin + dz * cos;
      
      // Find closest point on box to circle center (clamping)
      const closestX = Math.max(-hw, Math.min(hw, localX));
      const closestZ = Math.max(-hl, Math.min(hl, localZ));
      
      // Distance from closest point to circle center
      const distX = localX - closestX;
      const distZ = localZ - closestZ;
      const distSq = distX * distX + distZ * distZ;
      
      if (distSq < treeRadius * treeRadius) {
         // Collision Detected
         const dist = Math.sqrt(distSq);
         
         // Calculate normal in local space (pointing from Car Surface -> Tree Center)
         let normalLocalX = distX;
         let normalLocalZ = distZ;
         
         if (dist > 0.0001) {
             normalLocalX /= dist;
             normalLocalZ /= dist;
         } else {
             // Deep penetration (center inside box), push out along smallest axis
             // For simplicity, assume push out along X or Z based on which is closer to edge
             if (Math.abs(localX) / hw > Math.abs(localZ) / hl) {
                 normalLocalX = Math.sign(localX);
                 normalLocalZ = 0;
             } else {
                 normalLocalX = 0;
                 normalLocalZ = Math.sign(localZ);
             }
         }
         
         // Rotate normal back to world space (Car -> Tree direction)
         // x = x'*cos - z'*sin
         // z = x'*sin + z'*cos
         const normalWorldX = normalLocalX * cos - normalLocalZ * sin;
         const normalWorldZ = normalLocalX * sin + normalLocalZ * cos;
         
         const overlap = treeRadius - dist;
         
         // Push player AWAY from tree (opposite to normal)
         this.player.position.x -= normalWorldX * overlap;
         this.player.position.z -= normalWorldZ * overlap;
         
         // Velocity Response
         const velX = this.player.actualVelocity.x;
         const velZ = this.player.actualVelocity.z;
         
         // Project velocity onto collision normal (Car -> Tree)
         const dot = velX * normalWorldX + velZ * normalWorldZ;
         
         // Only bounce if moving towards the tree
         if (dot > 0) { 
             const restitution = 0.5;
             const impulse = -(1 + restitution) * dot;
             this.player.actualVelocity.x += normalWorldX * impulse;
             this.player.actualVelocity.z += normalWorldZ * impulse;
             this.player.speed *= 0.5; // Friction loss
         }
      }
    }

    // Speed Boost Collisions
    if (this.environment.speedBoosts) {
        const allCars = [this.player, ...this.aiCars];
        const boostRadiusSq = 30; // 5.5^2 approx

        for (const car of allCars) {
            for (const boost of this.environment.speedBoosts) {
                if (car.position.distanceToSquared(boost.position) < boostRadiusSq) {
                     car.applyBoost();
                }
            }
        }
    }

    // Cube Collection
    if (this.environment.cubes) {
        const cubeRadiusSq = 25.0; // Increased radius (5.0^2) for easier collection
        
        // Iterate backwards to allow removal
        for (let i = this.environment.cubes.length - 1; i >= 0; i--) {
            const cube = this.environment.cubes[i];
            
            // Only player collects cubes for now
            // Use 2D distance check (ignoring Y) for better gameplay feel
            const dx = this.player.position.x - cube.position.x;
            const dz = this.player.position.z - cube.position.z;
            const distSq2D = dx*dx + dz*dz;

            if (distSq2D < cubeRadiusSq) {
                // Collect!
                this.score += 500;
                
                // Visual effect
                this.createSparks(cube.position, 15);
                
                // Remove from environment
                this.environment.cubes.splice(i, 1);
                
                // Remove from game entities
                const entityIdx = this.entities.indexOf(cube);
                if (entityIdx > -1) {
                    this.entities.splice(entityIdx, 1);
                }
                
                // Destroy object
                cube.destroy();
            }
        }
    }

    // Car vs Car Collisions (OBB / SAT)
    const remoteCarsArr = Object.values(this.remotePlayers).map(rp => rp.car);
    const allCars = [this.player, ...this.aiCars, ...remoteCarsArr];
    
    for (let i = 0; i < allCars.length; i++) {
      for (let j = i + 1; j < allCars.length; j++) {
        
        // Skip collision if vertical distance is large (falling)
        if (Math.abs(allCars[i].position.y - allCars[j].position.y) > 2.0) continue;

        // Broad phase check (bounding sphere) to save performance
        const posA = new THREE.Vector2(allCars[i].position.x, allCars[i].position.z);
        const posB = new THREE.Vector2(allCars[j].position.x, allCars[j].position.z);
        const broadDist = 6.0; // Slightly larger than max dimension
        if(posA.distanceToSquared(posB) > broadDist * broadDist) continue;

        // Narrow phase (SAT)
        const result = this.checkOBBCollision(allCars[i], allCars[j]);
        if (result) {
            this.resolveCarCollision(allCars[i], allCars[j], result);
        }
      }
    }
  }
  
  // Helper to get corners of the car OBB in world space
  getCarCorners(car) {
    const hw = car.width / 2;
    const hl = car.length / 2;
    
    // Local corners
    const corners = [
        new THREE.Vector2(hw, -hl),
        new THREE.Vector2(-hw, -hl),
        new THREE.Vector2(-hw, hl),
        new THREE.Vector2(hw, hl)
    ];
    
    const angle = -car.rotation.y; // Inverted angle to match 2D rotation matrix with 3D coordinate system (Z is forward/down)
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const cx = car.position.x;
    const cy = car.position.z;
    
    // Transform to world space
    return corners.map(c => {
        const rx = c.x * cos - c.y * sin;
        const ry = c.x * sin + c.y * cos;
        return new THREE.Vector2(cx + rx, cy + ry);
    });
  }

  // SAT Collision Check
  checkOBBCollision(carA, carB) {
    const cornersA = this.getCarCorners(carA);
    const cornersB = this.getCarCorners(carB);
    
    let minOverlap = Infinity;
    let collisionNormal = null;
    
    // Get axes to test (normals of the edges)
    // Since they are rectangles, we only need 2 axes per shape (width and length axes)
    const getAxes = (corners) => {
        return [
            corners[1].clone().sub(corners[0]).normalize(), // Right vector
            corners[3].clone().sub(corners[0]).normalize()  // Forward vector
        ];
    };
    
    const axes = [...getAxes(cornersA), ...getAxes(cornersB)];
    
    for (const axis of axes) {
        // Project corners onto axis
        let minA = Infinity, maxA = -Infinity;
        let minB = Infinity, maxB = -Infinity;
        
        for (const c of cornersA) {
            const p = c.dot(axis);
            minA = Math.min(minA, p);
            maxA = Math.max(maxA, p);
        }
        
        for (const c of cornersB) {
            const p = c.dot(axis);
            minB = Math.min(minB, p);
            maxB = Math.max(maxB, p);
        }
        
        // Check overlap
        const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
        
        if (overlap < 0) {
            return null; // Separating axis found
        }
        
        if (overlap < minOverlap) {
            minOverlap = overlap;
            collisionNormal = axis;
            
            // Ensure normal points from A to B
            const centerA = new THREE.Vector2(carA.position.x, carA.position.z);
            const centerB = new THREE.Vector2(carB.position.x, carB.position.z);
            const dir = centerB.clone().sub(centerA);
            if (dir.dot(collisionNormal) < 0) {
                collisionNormal.negate();
            }
        }
    }
    
    return { overlap: minOverlap, normal: collisionNormal };
  }

  resolveCarCollision(carA, carB, collisionData) {
    const { overlap, normal } = collisionData;
    
    const aIsRemote = carA.isRemote || false;
    const bIsRemote = carB.isRemote || false;
    
    // 1. Separate cars
    if (aIsRemote && !bIsRemote) {
        // Only push B away (full overlap)
        carB.position.x += normal.x * overlap;
        carB.position.z += normal.y * overlap;
    } else if (!aIsRemote && bIsRemote) {
        // Only push A away (full overlap)
        carA.position.x -= normal.x * overlap;
        carA.position.z -= normal.y * overlap;
    } else {
        // Both local — split 50/50
        const separation = normal.clone().multiplyScalar(overlap * 0.5);
        carA.position.x -= separation.x;
        carA.position.z -= separation.y;
        carB.position.x += separation.x;
        carB.position.z += separation.y;
    }
    
    // 2. Exchange Velocity (Elastic Collision)
    const velA = new THREE.Vector2(carA.actualVelocity.x, carA.actualVelocity.z);
    const velB = new THREE.Vector2(carB.actualVelocity.x, carB.actualVelocity.z);
    
    const relVel = velB.clone().sub(velA);
    const velAlongNormal = relVel.dot(normal);
    
    if (velAlongNormal > 0) return;
    
    const restitution = 0.5;
    const j = -(1 + restitution) * velAlongNormal;
    const impulseScalar = j / 2;
    
    const impulse = normal.clone().multiplyScalar(impulseScalar);
    
    // Only apply impulse to local cars
    if (!aIsRemote) {
        carA.actualVelocity.x -= impulse.x;
        carA.actualVelocity.z -= impulse.y;
        carA.speed *= 0.99;
    }
    if (!bIsRemote) {
        carB.actualVelocity.x += impulse.x;
        carB.actualVelocity.z += impulse.y;
        carB.speed *= 0.99;
    }

    // --- Create Sparks ---
    const midPoint = new THREE.Vector3().addVectors(carA.position, carB.position).multiplyScalar(0.5);
    // Reduced spark count from 15 to 5 (Much less)
    this.createSparks(midPoint, 5);
  }

  createSparks(position, count = 10) {
    for(let i=0; i<count; i++) {
        // Clone material to allow individual opacity fading
        const mat = this.sparkMaterial.clone();
        const mesh = new THREE.Mesh(this.sparkGeometry, mat);
        
        mesh.position.copy(position);
        mesh.position.x += (Math.random() - 0.5) * 0.5;
        mesh.position.z += (Math.random() - 0.5) * 0.5;
        mesh.position.y += 0.5; // Lift up a bit
        
        this.scene.add(mesh);
        
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 10,
            Math.random() * 5 + 2,
            (Math.random() - 0.5) * 10
        );
        
        this.sparks.push({ mesh, velocity, life: 0.5 });
    }
  }

  updateSparks(dt) {
      for(let i=this.sparks.length-1; i>=0; i--) {
          const s = this.sparks[i];
          s.life -= dt;
          if(s.life <= 0) {
              this.scene.remove(s.mesh);
              // Geometry is shared, do not dispose!
              s.mesh.material.dispose(); // Material is cloned, so dispose
              this.sparks.splice(i, 1);
              continue;
          }
          
          s.velocity.y -= 15.0 * dt; // Gravity
          s.mesh.position.add(s.velocity.clone().multiplyScalar(dt));
          s.mesh.rotation.x += s.velocity.z * dt;
          s.mesh.rotation.z -= s.velocity.x * dt;
          
          // Fade out
          if (s.mesh.material.opacity > 0) {
              s.mesh.material.opacity = (s.life / 0.5) * 0.5;
          }
      }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    if (!this.isTitleScreen) this.updateMinimap();
  }
  
  updateMinimap() {
    const canvas = document.getElementById('minimap');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.clearRect(0, 0, w, h);
    
    if (!this.environment || !this.environment.trackCurve) return;
    
    const points = this.environment.trackCurve.getPoints(100);
    let minX = Infinity, maxZ = -Infinity, maxX = -Infinity, minZ = Infinity;
    points.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    });
    
    const padding = 20;
    const scaleX = (w - padding * 2) / (maxX - minX);
    const scaleZ = (h - padding * 2) / (maxZ - minZ);
    const scale = Math.min(scaleX, scaleZ);
    
    const centerX = (maxX + minX) / 2;
    const centerZ = (maxZ + minZ) / 2;
    
    const toMapX = (x) => w/2 + (x - centerX) * scale;
    const toMapY = (z) => h/2 + (z - centerZ) * scale;
    
    // Draw track
    ctx.beginPath();
    points.forEach((p, i) => {
        const mx = toMapX(p.x);
        const my = toMapY(p.z);
        if (i === 0) ctx.moveTo(mx, my);
        else ctx.lineTo(mx, my);
    });
    ctx.closePath();
    ctx.lineWidth = 20;
    ctx.strokeStyle = '#333';
    ctx.stroke();
    
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#888';
    ctx.stroke();
    
    // Draw starting line
    if (points.length > 1) {
        const p0 = points[0];
        const p1 = points[1];
        const dx = p1.x - p0.x;
        const dz = p1.z - p0.z;
        const angle = Math.atan2(dz, dx);
        
        const mx = toMapX(p0.x);
        const my = toMapY(p0.z);
        
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(angle);
        
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(0, 10);
        ctx.stroke();
        
        ctx.restore();
    }
    
    const drawArrow = (x, y, rotation, color) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-rotation);
        ctx.beginPath();
        ctx.moveTo(0, -12); // Point of the arrow
        ctx.lineTo(8, 8);   // Bottom right
        ctx.lineTo(-8, 8);  // Bottom left
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    };

    // Draw AI cars first
    this.aiCars.forEach(car => {
        const mx = toMapX(car.position.x);
        const my = toMapY(car.position.z);
        drawArrow(mx, my, car.rotation.y, '#ff3333');
    });
    
    // Draw remote players
    const mpColors = ['#3498db', '#9b59b6', '#f1c40f', '#e67e22', '#2ecc71'];
    let rpIdx = 0;
    Object.values(this.remotePlayers).forEach(rp => {
        const mx = toMapX(rp.car.position.x);
        const my = toMapY(rp.car.position.z);
        drawArrow(mx, my, rp.car.rotation.y, mpColors[rpIdx % mpColors.length]);
        rpIdx++;
    });
    
    // Draw player on top
    const px = toMapX(this.player.position.x);
    const py = toMapY(this.player.position.z);
    drawArrow(px, py, this.player.rotation.y, '#00ff00');
  }
  
  getObjectAt(screenX, screenY) {
    const mouse = new THREE.Vector2(
      (screenX / window.innerWidth) * 2 - 1,
      -(screenY / window.innerHeight) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);
    const meshes = this.entities.map(e => e.mesh).filter(m => m);
    const intersects = raycaster.intersectObjects(meshes);
    if (intersects.length > 0) {
      const hitMesh = intersects[0].object;
      return this.entities.find(e => e.mesh === hitMesh);
    }
    return null;
  }
}
