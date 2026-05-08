class Car extends GameObject3D {
  constructor(scene, options = {}) {
    super(scene);
    this.name = 'Car';
    this.isAI = options.isAI || false;
    this.color = options.color || 0xe74c3c;
    
    // Dimensions for collision
    this.width = 2.3; // Increased to match wheel width
    this.length = 4.6; // Slightly increased for bumper-to-bumper contact
    
    // Initial position on top of road
    this.position.y = 0.02;
    
    // Physics properties
    this.speed = 0;
    
    // Player is only 1% faster than AI
    // AI Speed: 95 - 97
    // Player Speed: ~98 (approx 1% faster than fastest AI)
    this.maxSpeed = this.isAI ? 95 + Math.random() * 2 : 98; 
    this.acceleration = this.isAI ? 40 : 45;
    
    this.friction = 0.98; 
    // Reduced player turn speed for less sensitivity (Even more slight)
    this.turnSpeed = this.isAI ? 3.0 : 0.9;
    this.driftFactor = 0.94;
    
    // Drift State
    this.isDrifting = false;
    this.driftTime = 0; 
    this.boostTimer = 0; 
    this.driftAngle = 0;
    this.particles = [];
    this.smokeTimer = 0;
    this.exhaustTimer = 0;
    this.boostEffectTimer = 0;
    
    // Particle Resources (Cached for performance)
    this.sparkGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.sparkMaterials = [
        new THREE.MeshBasicMaterial({ color: 0xffaa00 }),
        new THREE.MeshBasicMaterial({ color: 0xffcc00 }),
        new THREE.MeshBasicMaterial({ color: 0xff8800 }),
        new THREE.MeshBasicMaterial({ color: 0xff4400 })
    ];
    
    // Boost Particle Resources
    this.boostParticleGeometry = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    this.boostParticleMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ffff, 
        transparent: true, 
        opacity: 0.8,
        blending: THREE.AdditiveBlending 
    });
    
    // Tire Tracks
    this.lastTrackPos = { left: null, right: null };
    this.trackMeshes = [];
    
    // AI & Track State
    this.trackT = 0; 
    this.lap = 0; // Lap counter
    this.finished = false;
    this.aiLaneOffset = (Math.random() - 0.5) * 10; 
    
    // Falling / Cliff State
    this.isFalling = false;
    this.yVelocity = 0;
    
    // Respawn / Safe Position State
    this.lastSafePosition = new THREE.Vector3().copy(this.position);
    this.lastSafeRotation = new THREE.Euler().copy(this.rotation);
    this.lastSafeT = 0;

    // State
    this.moveInput = 0;
    this.turnInput = 0;
    this.actualVelocity = new THREE.Vector3();
    
    this.finished = false;

    this.wheelMeshes = []; // Store for rotation
    this.createMesh();
  }

  createMesh() {
    this.mesh = new THREE.Group();
    
    const carColor = this.color;
    const windowColor = 0x111111;
    
    // Materials
    const bodyMat = new THREE.MeshStandardMaterial({ 
      color: carColor, 
      roughness: 0.1, // Shiny car paint
      metalness: 0.6 
    });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }); // Tires/Plastic
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.9 }); // Rims/Exhaust
    const windowMat = new THREE.MeshStandardMaterial({ color: windowColor, roughness: 0.1, metalness: 0.9 });
    const glowRed = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2 });
    const glowWhite = new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffffaa, emissiveIntensity: 2 });

    // --- CHASSIS / LOWER BODY ---
    // Main base slab (Lower center of gravity)
    const baseGeo = new THREE.BoxGeometry(1.9, 0.4, 4.4);
    const base = new THREE.Mesh(baseGeo, bodyMat);
    base.position.y = 0.5;
    base.castShadow = true;
    base.receiveShadow = true;
    this.mesh.add(base);

    // --- UPPER BODY / COCKPIT ---
    // Tapered Cabin
    // Using a smaller box for the greenhouse
    const cabinGeo = new THREE.BoxGeometry(1.5, 0.5, 2.2);
    const cabin = new THREE.Mesh(cabinGeo, windowMat);
    cabin.position.set(0, 0.95, -0.1);
    cabin.castShadow = true;
    this.mesh.add(cabin);
    
    // Roof (Body color cap)
    const roofGeo = new THREE.BoxGeometry(1.52, 0.05, 2.0);
    const roof = new THREE.Mesh(roofGeo, bodyMat);
    roof.position.set(0, 1.2, -0.1);
    this.mesh.add(roof);

    // Pillars (Visual) - A, B, C pillars simulated by slightly wider body color blocks?
    // Let's keep it simple but clean. The windowMat box is the glass.

    // --- HOOD SCOOP & VENTS ---
    const scoopGeo = new THREE.BoxGeometry(1.0, 0.1, 1.2);
    const scoop = new THREE.Mesh(scoopGeo, bodyMat);
    scoop.position.set(0, 0.72, -1.5); // On hood
    this.mesh.add(scoop);

    // --- WIDE BODY FENDERS ---
    // Add bulk over wheels
    const fenderGeo = new THREE.BoxGeometry(0.5, 0.35, 1.0);
    const fenderPos = [
        { x: 0.9, y: 0.6, z: -1.3 }, // Front L
        { x: -0.9, y: 0.6, z: -1.3 }, // Front R
        { x: 0.9, y: 0.65, z: 1.3 },  // Rear L (Slightly higher/beefier)
        { x: -0.9, y: 0.65, z: 1.3 }, // Rear R
    ];
    fenderPos.forEach(p => {
        const f = new THREE.Mesh(fenderGeo, bodyMat);
        f.position.set(p.x, p.y, p.z);
        f.castShadow = true;
        this.mesh.add(f);
    });

    // --- SPOILER ---
    // Wing
    const wingGeo = new THREE.BoxGeometry(2.1, 0.05, 0.5);
    const wing = new THREE.Mesh(wingGeo, bodyMat);
    wing.position.set(0, 1.35, 2.0);
    this.mesh.add(wing);
    
    // Supports
    const supportGeo = new THREE.BoxGeometry(0.1, 0.4, 0.2);
    const supL = new THREE.Mesh(supportGeo, blackMat);
    supL.position.set(0.5, 1.15, 2.0);
    this.mesh.add(supL);
    const supR = new THREE.Mesh(supportGeo, blackMat);
    supR.position.set(-0.5, 1.15, 2.0);
    this.mesh.add(supR);
    
    // Winglets
    const wingletGeo = new THREE.BoxGeometry(0.05, 0.2, 0.5);
    const wl = new THREE.Mesh(wingletGeo, bodyMat);
    wl.position.set(1.05, 1.4, 2.0);
    this.mesh.add(wl);
    const wr = new THREE.Mesh(wingletGeo, bodyMat);
    wr.position.set(-1.05, 1.4, 2.0);
    this.mesh.add(wr);

    // --- WHEELS ---
    // High detail wheels
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 32); // Smoother cylinder
    wheelGeo.rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.36, 16);
    rimGeo.rotateZ(Math.PI / 2);
    
    const wheelPositions = [
      { x: 0.95, z: -1.3 },
      { x: -0.95, z: -1.3 },
      { x: 0.95, z: 1.3 },
      { x: -0.95, z: 1.3 }
    ];

    wheelPositions.forEach(w => {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(w.x, 0.42, w.z);
      
      // Tire
      const tire = new THREE.Mesh(wheelGeo, blackMat);
      tire.castShadow = true;
      wheelGroup.add(tire);
      
      // Rim
      const rim = new THREE.Mesh(rimGeo, chromeMat);
      wheelGroup.add(rim);
      
      // Spokes
      const spokeGeo = new THREE.BoxGeometry(0.3, 0.38, 0.05);
      spokeGeo.rotateZ(Math.PI/2); 
      const spoke1 = new THREE.Mesh(spokeGeo, chromeMat);
      wheelGroup.add(spoke1);
      const spoke2 = new THREE.Mesh(spokeGeo, chromeMat);
      spoke2.rotation.x = Math.PI/2;
      wheelGroup.add(spoke2);

      this.mesh.add(wheelGroup);
      this.wheelMeshes.push(wheelGroup);
    });

    // --- LIGHTS & GRILL ---
    // Front Grill
    const grillGeo = new THREE.BoxGeometry(1.6, 0.25, 0.1);
    const grill = new THREE.Mesh(grillGeo, blackMat);
    grill.position.set(0, 0.4, -2.2);
    this.mesh.add(grill);

    // Headlights
    const hlGeo = new THREE.BoxGeometry(0.35, 0.15, 0.1);
    const hlL = new THREE.Mesh(hlGeo, glowWhite);
    hlL.position.set(0.65, 0.55, -2.21);
    this.mesh.add(hlL);
    const hlR = new THREE.Mesh(hlGeo, glowWhite);
    hlR.position.set(-0.65, 0.55, -2.21);
    this.mesh.add(hlR);

    // Tail Lights (Strip style)
    const tlGeo = new THREE.BoxGeometry(0.4, 0.12, 0.1);
    const tlL = new THREE.Mesh(tlGeo, glowRed);
    tlL.position.set(0.65, 0.6, 2.21);
    this.mesh.add(tlL);
    const tlR = new THREE.Mesh(tlGeo, glowRed);
    tlR.position.set(-0.65, 0.6, 2.21);
    this.mesh.add(tlR);
    
    // Center Brake Light
    const cblGeo = new THREE.BoxGeometry(0.6, 0.05, 0.05);
    const cbl = new THREE.Mesh(cblGeo, glowRed);
    cbl.position.set(0, 1.1, 2.05); // On spoiler support level
    this.mesh.add(cbl);

    // --- EXHAUSTS ---
    const exhaustGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.3, 12);
    exhaustGeo.rotateX(Math.PI / 2);
    const exL = new THREE.Mesh(exhaustGeo, chromeMat);
    exL.position.set(0.5, 0.25, 2.25);
    this.mesh.add(exL);
    const exR = new THREE.Mesh(exhaustGeo, chromeMat);
    exR.position.set(-0.5, 0.25, 2.25);
    this.mesh.add(exR);

    // --- MIRRORS ---
    const mirrorGeo = new THREE.BoxGeometry(0.25, 0.15, 0.1);
    const mirrorL = new THREE.Mesh(mirrorGeo, bodyMat);
    mirrorL.position.set(0.9, 0.95, -0.6);
    mirrorL.rotation.y = -0.2;
    this.mesh.add(mirrorL);
    const mirrorR = new THREE.Mesh(mirrorGeo, bodyMat);
    mirrorR.position.set(-0.9, 0.95, -0.6);
    mirrorR.rotation.y = 0.2;
    this.mesh.add(mirrorR);


    // Realistic Lighting (Player Only)
    if (!this.isAI) {
        const spotIntensity = 80;
        const spotDist = 120;
        const spotAngle = Math.PI / 3;
        const spotPenumbra = 1.0;

        const spotL = new THREE.SpotLight(0xffffee, spotIntensity);
        spotL.angle = spotAngle;
        spotL.penumbra = spotPenumbra;
        spotL.decay = 1.5;
        spotL.distance = spotDist;
        spotL.castShadow = true; 
        spotL.shadow.bias = -0.0001;
        spotL.shadow.radius = 4; 
        spotL.position.set(0.6, 0.6, -1.8);
        spotL.target.position.set(0.6, 0, -20);
        this.mesh.add(spotL);
        this.mesh.add(spotL.target);

        const spotR = new THREE.SpotLight(0xffffee, spotIntensity);
        spotR.angle = spotAngle;
        spotR.penumbra = spotPenumbra;
        spotR.decay = 1.5;
        spotR.distance = spotDist;
        spotR.castShadow = true;
        spotR.shadow.bias = -0.0001;
        spotR.shadow.radius = 4;
        spotR.position.set(-0.6, 0.6, -1.8);
        spotR.target.position.set(-0.6, 0, -20);
        this.mesh.add(spotR);
        this.mesh.add(spotR.target);

        const headPointIntensity = 1.0;
        const headPointDist = 8.0;
        const pointL = new THREE.PointLight(0xffffee, headPointIntensity, headPointDist);
        pointL.position.set(0.6, 0.6, -2.1);
        this.mesh.add(pointL);
        const pointR = new THREE.PointLight(0xffffee, headPointIntensity, headPointDist);
        pointR.position.set(-0.6, 0.6, -2.1);
        this.mesh.add(pointR);

        const tailPointIntensity = 1.5;
        const tailPointDist = 6.0;
        const tailPointL = new THREE.PointLight(0xff0000, tailPointIntensity, tailPointDist);
        tailPointL.position.set(0.6, 0.6, 2.1);
        this.mesh.add(tailPointL);
        const tailPointR = new THREE.PointLight(0xff0000, tailPointIntensity, tailPointDist);
        tailPointR.position.set(-0.6, 0.6, 2.1);
        this.mesh.add(tailPointR);

        // Boost Light (Blue Glow)
        this.boostLight = new THREE.PointLight(0x00ffff, 0, 12);
        this.boostLight.position.set(0, 0.5, 2.5);
        this.mesh.add(this.boostLight);
    }

    this.scene.add(this.mesh);
  }

  update(dt, input, trackCurve) {
    if (trackCurve) {
        this.updateTrackProgress(trackCurve);
        
        // Check for cliff falling if not already falling
        if (!this.isFalling) {
            this.checkCliff(trackCurve);
        }
    }

    // If falling, override physics
    if (this.isFalling) {
        this.updateFalling(dt);
        super.update(dt);
        return;
    }

    let currentInput = input;
    
    if (this.finished) {
        // Decelerate and disable input
        currentInput = { forward: false, backward: false, left: false, right: false, drift: false };
        this.speed *= 0.96; // Strong braking friction
    } else if (this.isAI && trackCurve) {
        currentInput = this.updateAI(dt, trackCurve);
    }

    // Handle Input
    this.moveInput = 0;
    if (currentInput.forward) this.moveInput += 1;
    if (currentInput.backward) this.moveInput -= 1;

    // Handle Turning (Support both digital and analog input)
    if (currentInput.turn !== undefined) {
        // AI or analog input
        this.turnInput = currentInput.turn;
    } else {
        // Digital input
        this.turnInput = 0;
        if (currentInput.left) this.turnInput += 1;
        if (currentInput.right) this.turnInput -= 1;
    }

    // DRIFT LOGIC (Auto-Drift)
    const minDriftSpeed = 25;
    const turnThreshold = 0.6; // Must turn hard to drift
    
    // Auto-drift condition: sharp turn + high speed
    // AI uses drift input from updateAI, Player uses auto-detection
    let wantsDrift = false;
    
    if (this.isAI) {
        wantsDrift = currentInput.drift; // AI might set this manually if programmed
    } else {
        wantsDrift = Math.abs(this.turnInput) > turnThreshold && Math.abs(this.speed) > minDriftSpeed;
    }
    
    if (wantsDrift) {
        if (!this.isDrifting) {
            this.isDrifting = true;
            this.driftTime = 0;
        }
        this.driftTime += dt;
    } else {
        // Not turning hard enough or too slow
        if (this.isDrifting) {
            // End Drift - Check for Boost
            if (this.driftTime > 0.5) {
                 this.applyDriftBoost(); 
            }
            this.isDrifting = false;
            this.driftTime = 0;
        }
    }
    


    // Acceleration
    if (this.moveInput !== 0) {
      this.speed += this.moveInput * this.acceleration * dt;
    } else {
      // Frame-rate independent coasting friction (exponential decay)
      this.speed *= Math.pow(0.98, dt * 60);
    }

    // BOOST PHYSICS
    let currentMaxSpeed = this.maxSpeed;
    
    if (this.boostTimer > 0) {
        this.boostTimer -= dt;
        currentMaxSpeed *= 1.2; // 20% higher top speed
        
        // Boost acceleration
        if (this.moveInput > 0) {
            this.speed += 15 * dt; 
        }
        
        // Visuals
        if (Math.random() < 0.3) {
             this.spawnExhaust(dt);
        }
        
        // Enable Boost Light
        if (this.boostLight) this.boostLight.intensity = THREE.MathUtils.lerp(this.boostLight.intensity, 4.0, 10 * dt);
    } else {
        // Disable Boost Light
        if (this.boostLight) this.boostLight.intensity = THREE.MathUtils.lerp(this.boostLight.intensity, 0, 10 * dt);
    }
    this.speed = THREE.MathUtils.clamp(this.speed, -this.maxSpeed / 2, currentMaxSpeed);

    // Apply frame-rate independent rolling friction
    const friction = Math.pow(this.friction, dt * 60);
    this.speed *= friction;

    if (Math.abs(this.speed) < 0.1) this.speed = 0;

    // Turning
    if (Math.abs(this.speed) > 0.5) {
      // Swapped rotation for reverse: Always steer based on key direction (dir = 1)
      const dir = 1; 
      
      // Increased turn multiplier for easier turning during drift
      // Reduced from 2.5 to 1.8 for slighter drift control
      const turnMult = this.isDrifting ? 1.8 : 1.0;
      this.rotation.y += this.turnInput * this.turnSpeed * turnMult * dt * dir;
    }

    // PHYSICS MOVEMENT
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyEuler(this.rotation);
    forward.normalize();

    const targetVelocity = forward.clone().multiplyScalar(this.speed);
    
    // Slide factor
    // Increased from 1.0 to 2.0 for tighter drift (less slide)
    const slideFactor = this.isDrifting ? 2.0 : 5.0;
    this.actualVelocity.lerp(targetVelocity, slideFactor * dt);

    this.position.add(this.actualVelocity.clone().multiplyScalar(dt));

    // Update tracks before super update
    this.updateTireTracks(dt);

    super.update(dt);
    
    // VISUALS
    // Wheel Rotation
    if (this.wheelMeshes) {
        const wheelRotSpeed = this.speed * dt * 0.5;
        this.wheelMeshes.forEach(w => {
            w.rotation.x -= wheelRotSpeed; // Rotate around local X axis
        });
    }

    // Drift Angle
    const targetDriftAngle = this.isDrifting ? -this.turnInput * 0.5 : 0;
    this.driftAngle = THREE.MathUtils.lerp(this.driftAngle, targetDriftAngle, 5 * dt);
    
    // Apply visual rotations
    this.mesh.rotation.y += this.driftAngle;
    
    // Lean (Banking)
    this.mesh.rotation.z += this.turnInput * 0.1 * (this.speed / this.maxSpeed);
    this.mesh.rotation.x += -this.moveInput * 0.05; // Pitch

    // PARTICLES
    if (this.isDrifting && Math.abs(this.speed) > 20) {
        if (this.driftTime > 0.1) {
            this.spawnDriftSparks(dt);
        }
    }
    
    // Boost Effects
    if (this.boostEffectTimer > 0) {
        this.boostEffectTimer -= dt;
        this.spawnBoostLines(dt);
    }

    // Exhaust Smoke
    if (Math.abs(this.speed) > 1.0) {
        this.spawnExhaust(dt);
    }
    this.updateParticles(dt);
  }

  updateTrackProgress(trackCurve) {
    // Search locally around current T to find closest point
    const searchRange = 0.05;
    const samples = 10;
    let closestDistSq = Infinity;
    let bestT = this.trackT;

    for(let i = 0; i < samples; i++) {
        const t = this.trackT - (searchRange/2) + (i/samples) * searchRange;
        // Handle wrap-around for closed loop
        const safeT = (t < 0 ? t + 1 : t) % 1;
        const pt = trackCurve.getPointAt(safeT);
        const dSq = pt.distanceToSquared(this.position);
        if (dSq < closestDistSq) {
            closestDistSq = dSq;
            bestT = safeT;
        }
    }
    
    // Check for lap completion
    // If we went from 0.9something to 0.0something, we completed a lap
    if (this.trackT > 0.9 && bestT < 0.1) {
        this.lap++;
        if (this.lap >= 2 && !this.finished) {
            this.finished = true;
            this.finishTime = window.game ? window.game.time : 0;
        }
    } else if (this.trackT < 0.1 && bestT > 0.9) {
        // Went backwards across start line
        this.lap--;
    }
    
    this.trackT = bestT;
  }

  checkCliff(trackCurve) {
      const pt = trackCurve.getPointAt(this.trackT);
      const tangent = trackCurve.getTangentAt(this.trackT);
      // "Right" vector relative to track forward
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize(); 
      
      // Vector from track center to car
      const toCar = this.position.clone().sub(pt);
      
      // Project onto normal (Right distance)
      const rightDist = toCar.dot(normal);

      // Calculate Cliff Edge based on Environment generation logic
      const divisions = 600;
      const floatI = this.trackT * divisions;
      
      // Interpolate noise to match visual mesh
      const i1 = Math.floor(floatI);
      const i2 = i1 + 1;
      const alpha = floatI - i1;
      
      const getNoise = (idx) => Math.sin(idx * 0.1) * 3 + Math.cos(idx * 0.3) * 2 + Math.sin(idx * 0.8) * 1;
      
      const noise1 = getNoise(i1);
      const noise2 = getNoise(i2);
      const edgeNoise = noise1 * (1 - alpha) + noise2 * alpha;

      // Match Environment.js updated base distance (22)
      const cliffEdge = 22 + edgeNoise; 
      
      // Save safe position if we are well within the road
      if (Math.abs(rightDist) < 14) { 
          this.lastSafePosition.copy(this.position);
          this.lastSafeRotation.copy(this.rotation);
          this.lastSafeT = this.trackT;
      }
      
      // Cliff edge - Use calculated cliff edge instead of hardcoded 15
      if (rightDist > cliffEdge) {
          this.isFalling = true;
          this.yVelocity = 0;
          
          // Add some outward momentum if moving slow
          this.actualVelocity.x += normal.x * 5;
          this.actualVelocity.z += normal.z * 5;
      }

      // Slow down if on grass (between road edge 15 and cliff edge)
      if (rightDist > 15 && rightDist <= cliffEdge) {
          this.speed *= 0.95; // Grass friction
      }
  }

  updateFalling(dt) {
      // Gravity
      this.yVelocity -= 40 * dt; 
      this.position.y += this.yVelocity * dt;
      
      // Maintain horizontal momentum
      this.position.add(this.actualVelocity.clone().multiplyScalar(dt));
      
      // Tumble rotation
      this.mesh.rotation.x += dt * 2;
      this.mesh.rotation.z += dt * 2;
      
      // Respawn if too low
      if (this.position.y < -30) {
          this.respawn();
      }
  }

  respawn() {
      this.isFalling = false;
      this.yVelocity = 0;
      this.speed = 0;
      this.actualVelocity.set(0, 0, 0);
      
      // Restore last safe position
      this.position.copy(this.lastSafePosition);
      this.position.y = Math.max(this.position.y, 0.5);
      
      this.rotation.copy(this.lastSafeRotation);
      this.trackT = this.lastSafeT;
      
      // Reset visual rotation
      this.mesh.rotation.copy(this.rotation);
      this.driftAngle = 0;
      this.driftTime = 0;
      this.isDrifting = false;
  }

  updateTireTracks(dt) {
      // Manage existing tracks (fade out)
      for (let i = this.trackMeshes.length - 1; i >= 0; i--) {
          const mesh = this.trackMeshes[i];
          mesh.material.opacity -= dt * 0.3; // Fade out over ~3 seconds
          if (mesh.material.opacity <= 0) {
              this.scene.remove(mesh);
              mesh.geometry.dispose();
              mesh.material.dispose();
              this.trackMeshes.splice(i, 1);
          }
      }

      // Check if we should spawn new tracks
      let intensity = 0;
      
      if (this.isDrifting) {
          intensity = 1.0;
      } else {
          const speedRatio = Math.abs(this.speed) / this.maxSpeed;
          if (Math.abs(this.turnInput) > 0.1 && Math.abs(this.speed) > 20) {
              intensity = Math.min(0.6, (speedRatio * Math.abs(this.turnInput) * 1.5));
          }
      }
      
      if (intensity < 0.1) {
          this.lastTrackPos.left = null;
          this.lastTrackPos.right = null;
          return;
      }

      // Calculate wheel positions
      const getPos = (ox, oz) => {
          const vec = new THREE.Vector3(ox, 0, oz);
          const visualRotation = this.rotation.clone();
          visualRotation.y += this.driftAngle;
          
          vec.applyEuler(visualRotation);
          vec.add(this.position);
          return vec;
      };

      const currL = getPos(0.95, 1.3); // Updated to match new wheel Z
      const currR = getPos(-0.95, 1.3);

      if (this.lastTrackPos.left) {
          const dist = currL.distanceTo(this.lastTrackPos.left);
          if (dist > 0.5) {
              this.createTrackSegment(this.lastTrackPos.left, currL, intensity);
              this.createTrackSegment(this.lastTrackPos.right, currR, intensity);
              
              this.lastTrackPos.left = currL;
              this.lastTrackPos.right = currR;
          }
      } else {
          this.lastTrackPos.left = currL;
          this.lastTrackPos.right = currR;
      }
  }

  createTrackSegment(p1, p2, intensity = 1.0) {
      const width = 0.35; 
      const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
      const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(width / 2);
      
      const v1 = new THREE.Vector3().subVectors(p1, perp);
      const v2 = new THREE.Vector3().addVectors(p1, perp);
      const v3 = new THREE.Vector3().subVectors(p2, perp);
      const v4 = new THREE.Vector3().addVectors(p2, perp);
      
      const y = 0.04;
      v1.y = y; v2.y = y; v3.y = y; v4.y = y;

      const geometry = new THREE.BufferGeometry();
      const vertices = new Float32Array([
          v1.x, v1.y, v1.z,
          v2.x, v2.y, v2.z,
          v3.x, v3.y, v3.z,
          
          v2.x, v2.y, v2.z,
          v4.x, v4.y, v4.z,
          v3.x, v3.y, v3.z
      ]);
      
      geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      
      const material = new THREE.MeshBasicMaterial({
          color: 0x000000,
          transparent: true,
          opacity: 0.5 * intensity,
          side: THREE.DoubleSide,
          depthWrite: false
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      
      this.scene.add(mesh);
      this.trackMeshes.push(mesh);
  }

  spawnSmoke(dt) {
      this.smokeTimer = (this.smokeTimer || 0) + dt;
      if (this.smokeTimer < 0.05) return; 
      this.smokeTimer = 0;

      const wheelOffsets = [
          new THREE.Vector3(0.95, 0.2, 1.3),
          new THREE.Vector3(-0.95, 0.2, 1.3)
      ];

      wheelOffsets.forEach(offset => {
          const worldPos = offset.clone().applyMatrix4(this.mesh.matrixWorld);
          
          const geometry = new THREE.DodecahedronGeometry(0.4, 0);
          
          const material = new THREE.MeshLambertMaterial({ 
            color: 0xdddddd, 
            transparent: true,
            opacity: 0.5,
            emissive: 0x222222
          });
          
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.copy(worldPos);
          
          mesh.position.x += (Math.random() - 0.5) * 0.4;
          mesh.position.z += (Math.random() - 0.5) * 0.4;
          
          mesh.rotation.set(
              Math.random() * Math.PI,
              Math.random() * Math.PI,
              Math.random() * Math.PI
          );
          
          this.scene.add(mesh);
          
          this.particles.push({
              mesh: mesh,
              life: 1.0,
              maxLife: 1.0,
              baseOpacity: 0.5,
              velocity: new THREE.Vector3(
                  (Math.random() - 0.5) * 0.5, 
                  0.5 + Math.random() * 1.0, 
                  (Math.random() - 0.5) * 0.5
              ),
              rotVelocity: new THREE.Vector3(
                  (Math.random() - 0.5) * 2,
                  (Math.random() - 0.5) * 2,
                  (Math.random() - 0.5) * 2
              ),
              isExhaust: false
          });
      });
  }

  spawnDriftSparks(dt) {
      this.sparkTimer = (this.sparkTimer || 0) + dt;
      // Spawn much more frequently
      if (this.sparkTimer < 0.005) return;
      this.sparkTimer = 0;

      const wheelOffsets = [
          new THREE.Vector3(0.95, 0.05, 1.3),
          new THREE.Vector3(-0.95, 0.05, 1.3)
      ];

      wheelOffsets.forEach(offset => {
          // Spawn multiple sparks per wheel per frame for density
          const count = 2 + Math.floor(Math.random() * 3); 
          
          for(let i=0; i<count; i++) {
              // Use cached materials
              const material = this.sparkMaterials[Math.floor(Math.random() * this.sparkMaterials.length)];
              const worldPos = offset.clone().applyMatrix4(this.mesh.matrixWorld);
              
              // Use cached geometry and scale it
              const mesh = new THREE.Mesh(this.sparkGeometry, material);
              const size = 0.02 + Math.random() * 0.08;
              mesh.scale.set(size, size, size);
              
              mesh.position.copy(worldPos);
              
              // Random start position spread
              mesh.position.x += (Math.random() - 0.5) * 0.4;
              mesh.position.z += (Math.random() - 0.5) * 0.4;
              mesh.position.y += Math.random() * 0.2;
              
              this.scene.add(mesh);
              
              // High velocity random spread and UPWARDS
              const velocity = new THREE.Vector3(
                  (Math.random() - 0.5) * 15, // Wider spread
                  Math.random() * 8 + 4,      // Much more upwards (4 to 12)
                  (Math.random() - 0.5) * 15
              );
              
              // Add some car velocity
              velocity.add(this.actualVelocity.clone().multiplyScalar(0.2));

              // Very short life (0.05s to 0.25s) - disappear much quicker
              const life = 0.05 + Math.random() * 0.2; 

              this.particles.push({
                  mesh: mesh,
                  life: life,
                  maxLife: life,
                  velocity: velocity,
                  rotVelocity: new THREE.Vector3(
                      (Math.random() - 0.5) * 50,
                      (Math.random() - 0.5) * 50,
                      (Math.random() - 0.5) * 50
                  ),
                  isSpark: true
              });
          }
      });
  }

  spawnBoostLines(dt) {
      // Spawn localized energy particles from exhaust
      const count = 4; 
      
      const exhaustOffsets = [
          new THREE.Vector3(0.5, 0.25, 2.3),
          new THREE.Vector3(-0.5, 0.25, 2.3)
      ];

      for(let i=0; i<count; i++) {
          const offset = exhaustOffsets[Math.floor(Math.random() * exhaustOffsets.length)];
          const worldPos = offset.clone().applyMatrix4(this.mesh.matrixWorld);
          
          // Use cloned material for independent opacity fading
          const mesh = new THREE.Mesh(this.boostParticleGeometry, this.boostParticleMaterial.clone());
          
          mesh.position.copy(worldPos);
          // Randomize slightly around exhaust
          mesh.position.x += (Math.random() - 0.5) * 0.2;
          mesh.position.y += (Math.random() - 0.5) * 0.2;
          mesh.position.z += (Math.random() - 0.5) * 0.2;
          
          mesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
          
          this.scene.add(mesh);
          
          // Velocity: Eject backwards relative to car
          const backward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion).normalize();
          const ejectSpeed = 8 + Math.random() * 8;
          
          // Combine ejection with some car velocity (so they trail behind but don't stop instantly)
          const velocity = backward.multiplyScalar(ejectSpeed).add(this.actualVelocity.clone().multiplyScalar(0.3));
          
          // Add random spread
          velocity.x += (Math.random() - 0.5) * 3;
          velocity.y += (Math.random() - 0.5) * 3;
          velocity.z += (Math.random() - 0.5) * 3;

          this.particles.push({
              mesh: mesh,
              life: 0.5, 
              maxLife: 0.5,
              velocity: velocity,
              rotVelocity: new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).multiplyScalar(15),
              isBoostLine: true
          });
      }
  }

  spawnExhaust(dt) {
      this.exhaustTimer = (this.exhaustTimer || 0) + dt;
      // Emit faster at higher speeds, slower when slow
      const emissionRate = Math.max(0.02, 0.12 - (Math.abs(this.speed) / this.maxSpeed) * 0.1);
      
      if (this.exhaustTimer < emissionRate) return;
      this.exhaustTimer = 0;

      const exhaustOffsets = [
          new THREE.Vector3(0.5, 0.25, 2.3),
          new THREE.Vector3(-0.5, 0.25, 2.3)
      ];

      exhaustOffsets.forEach(offset => {
          const worldPos = offset.clone().applyMatrix4(this.mesh.matrixWorld);
          
          const geometry = new THREE.DodecahedronGeometry(0.25, 0); 
          const material = new THREE.MeshLambertMaterial({ 
            color: 0xaaaaaa, 
            transparent: true,
            opacity: 0.4, // More visible
            emissive: 0x222222
          });
          
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.copy(worldPos);
          
          // More random position
          mesh.position.x += (Math.random() - 0.5) * 0.3;
          mesh.position.y += (Math.random() - 0.5) * 0.3;
          mesh.position.z += (Math.random() - 0.5) * 0.3;
          
          mesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
          
          this.scene.add(mesh);
          
          const life = 0.2 + Math.random() * 0.2; // Shorter life (0.2-0.4s)

          this.particles.push({
              mesh: mesh,
              life: life,
              maxLife: life,
              baseOpacity: 0.4,
              velocity: new THREE.Vector3(
                  (Math.random() - 0.5) * 0.5, // More horizontal spread
                  2.5 + Math.random() * 2.0,   // Fast upward float
                  (Math.random() - 0.5) * 0.5
              ),
              rotVelocity: new THREE.Vector3(
                  (Math.random() - 0.5) * 3,
                  (Math.random() - 0.5) * 3,
                  (Math.random() - 0.5) * 3
              ),
              isExhaust: true 
          });
      });
  }

  updateParticles(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
          const p = this.particles[i];
          p.life -= dt;
          
          if (p.life <= 0) {
              this.scene.remove(p.mesh);
              // Only dispose unique geometries (smoke/exhaust), not cached sparks
              if (!p.isSpark) {
                  p.mesh.geometry.dispose();
                  p.mesh.material.dispose();
              }
              this.particles.splice(i, 1);
              continue;
          }
          
          // Physics
          if (p.isSpark) {
              p.velocity.y -= 5 * dt; // Reduced Gravity for more upward flight
              // Bounce
              if (p.mesh.position.y < 0.1 && p.velocity.y < 0) {
                  p.velocity.y *= -0.5;
              }
          }

          // Move
          p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));
          
          // Rotate
          p.mesh.rotation.x += p.rotVelocity.x * dt;
          p.mesh.rotation.y += p.rotVelocity.y * dt;
          p.mesh.rotation.z += p.rotVelocity.z * dt;

          // Scale & Opacity Logic
          if (p.isBoostLine) {
             // Fade out boost lines and shrink
             const ratio = p.life / p.maxLife;
             p.mesh.material.opacity = ratio * 0.8;
             p.mesh.scale.setScalar(ratio); 
          } else if (!p.isSpark) {
              const progress = 1 - (p.life / p.maxLife);
              const startScale = p.isExhaust ? 0.8 : 0.5;
              const endScale = p.isExhaust ? 2.5 : 2.0; 
              
              const scale = startScale + progress * (endScale - startScale); 
              p.mesh.scale.set(scale, scale, scale);
              
              // Fade out
              const baseOp = p.baseOpacity !== undefined ? p.baseOpacity : (p.isExhaust ? 0.4 : 0.9);
              
              if (p.isExhaust) {
                  p.mesh.material.opacity = (1 - progress) * baseOp;
              } else {
                 if (progress > 0.5) {
                    p.mesh.material.opacity = (1 - progress) / 0.5 * baseOp;
                 }
              }
          } else {
              // Spark fade
              p.mesh.material.opacity = p.life / p.maxLife;
          }
      }
  }

  applyBoost() {
      // Prevent stacking boosts too quickly (debounce for single pad traversal)
      if (this.boostTimer > 0.8) return; 
      
      this.boostTimer = 1.0; // Duration
      this.boostEffectTimer = 1.0; // Visual effect duration
      this.speed += 10; // Reduced instant kick
  }

  applyDriftBoost() {
      // Don't override a major speed boost (from pad)
      if (this.boostTimer > 0.5) return;

      this.boostTimer = 0.3; // Short duration
      this.boostEffectTimer = 0.3; 
      this.speed += 8; // Small kick
  }

  updateAI(dt, trackCurve) {
    // 1. Calculate current state relative to track
    const currentPt = trackCurve.getPointAt(this.trackT);
    const currentTangent = trackCurve.getTangentAt(this.trackT).normalize();
    const currentNormal = new THREE.Vector3(-currentTangent.z, 0, currentTangent.x).normalize();
    
    // Vector from track center to car
    const toCar = this.position.clone().sub(currentPt);
    const currentDist = toCar.dot(currentNormal);

    // 2. Look ahead for target
    const speedRatio = this.speed / this.maxSpeed;
    // Reduced lookahead slightly for tighter cornering
    const lookAheadAmt = 0.01 + speedRatio * 0.02; 
    const targetT = (this.trackT + lookAheadAmt) % 1;
    
    const targetPt = trackCurve.getPointAt(targetT);
    const targetTangent = trackCurve.getTangentAt(targetT).normalize();
    const targetNormal = new THREE.Vector3(-targetTangent.z, 0, targetTangent.x).normalize();
    
    // 3. Analyze Track Curvature (Predictive Braking)
    const farT = (this.trackT + 0.06) % 1;
    const farTangent = trackCurve.getTangentAt(farT).normalize();
    const curvature = 1 - currentTangent.dot(farTangent); // 0 = straight, >0.1 = curve

    // 4. Determine Lane Offset & Target
    let effectiveOffset = this.aiLaneOffset;
    let targetOverride = null;

    // Avoidance Logic
    if (window.game && window.game.entities) {
        const avoidanceRadius = 10.0; 
        let avoidanceShift = 0;

        for (const other of window.game.entities) {
            if (other === this || !other.position || other.name !== 'Car') continue;
            
            // Only avoid cars that are roughly at the same track progress (or slightly ahead/behind)
            // Simple distance check is usually enough and robust
            const distSq = this.position.distanceToSquared(other.position);
            
            if (distSq < avoidanceRadius * avoidanceRadius) {
                const dist = Math.sqrt(distSq);
                // Vector from other to self
                const fromOther = this.position.clone().sub(other.position);
                
                // Project onto the track's "right" vector (currentNormal)
                // This tells us if we should move left or right relative to the track
                const sidePush = fromOther.dot(currentNormal);
                
                // Inverse distance weight (closer = stronger push)
                const weight = (1.0 - dist / avoidanceRadius);
                
                // Push away laterally
                // If sidePush is positive, we are to the right of them -> push more right
                // If sidePush is negative, we are to the left of them -> push more left
                // If sidePush is near zero (directly behind/front), pick a random side or use offset
                let dir = Math.sign(sidePush);
                if (Math.abs(sidePush) < 0.5) dir = (this.aiLaneOffset > 0 ? 1 : -1);
                
                avoidanceShift += dir * weight * 6.0; // Strength 6.0
            }
        }
        effectiveOffset += avoidanceShift;
    }

    // Check for Speed Boosts (AI only) - Seek aggressively
    if (curvature < 0.2 && window.game && window.game.environment && window.game.environment.speedBoosts) {
        const boosts = window.game.environment.speedBoosts;
        // Increased search radius significantly
        let closestDistSq = 150 * 150;
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion).normalize();

        for (const boost of boosts) {
            const distSq = this.position.distanceToSquared(boost.position);
            if (distSq < closestDistSq) {
                const toBoost = boost.position.clone().sub(this.position).normalize();
                // Wider angle to detect boosts (0.4 is approx 66 degrees)
                if (forward.dot(toBoost) > 0.4) { 
                    closestDistSq = distSq;
                    targetOverride = boost.position.clone();
                }
            }
        }
    }
    
    // Safety: If approaching edge, force back to center
    // Road width is approx 15. Safe zone is +/- 10.
    const edgeThreshold = 9.0;
    if (currentDist > edgeThreshold) {
        effectiveOffset = -5.0; // Hard steer left
        targetOverride = null; // Cancel boost hunting
    } else if (currentDist < -edgeThreshold) {
        effectiveOffset = 5.0; // Hard steer right
        targetOverride = null;
    }

    if (targetOverride) {
        targetPt.copy(targetOverride);
    } else {
        targetPt.add(targetNormal.multiplyScalar(effectiveOffset));
    }

    // 5. Steering Calculation
    const localTarget = targetPt.clone().sub(this.position);
    localTarget.applyEuler(new THREE.Euler(0, -this.rotation.y, 0)); 
    
    // localTarget.x is right, -z is forward
    const angle = Math.atan2(localTarget.x, -localTarget.z);
    
    const steerInput = { forward: true, backward: false, left: false, right: false, drift: false, turn: 0 };
    
    // Steer towards target
    let steer = THREE.MathUtils.clamp(-angle * 3.5, -1, 1);
    
    // 6. Speed Control & Drifting
    const absAngle = Math.abs(angle);
    const isSharpTurn = curvature > 0.08 || absAngle > 0.3;
    
    // Drift Logic
    if (isSharpTurn && this.speed > 40) {
        steerInput.drift = true;
        steerInput.turn = THREE.MathUtils.clamp(steer * 1.5, -1, 1); 
        
        if (this.speed > this.maxSpeed * 0.95) {
            steerInput.forward = false; 
        }
    } else {
        steerInput.drift = false;
        steerInput.turn = steer;
        
        // Intelligent Braking
        if (curvature > 0.15 && this.speed > 55) {
             steerInput.forward = false;
             steerInput.backward = true; // Brake hard for upcoming sharp turn
        } else if (absAngle > 0.25 && this.speed > 65) {
             steerInput.forward = false;
             steerInput.backward = true; 
        } else if (absAngle > 0.15 && this.speed > 85) {
             steerInput.forward = false; // Coast
        }
    }

    // Emergency Edge Recovery
    if (Math.abs(currentDist) > 13) {
        steerInput.backward = true; // Brake hard
        steerInput.forward = false;
        steerInput.drift = false; // Stop drifting to regain traction
        steerInput.turn = currentDist > 0 ? 1 : -1; // Max steer to center
    }

    return steerInput;
  }

  destroy() {
    this.trackMeshes.forEach(mesh => {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
    });
    this.trackMeshes = [];

    this.particles.forEach(p => {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
    });
    this.particles = [];

    super.destroy();
  }
}
