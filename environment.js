class Environment {
  constructor(game, mapType = 'forest') {
    this.game = game;
    this.scene = game.scene;
    this.mapType = mapType;
    
    this.trees = [];
    this.speedBoosts = [];
    this.cubes = [];
    this.mountains = [];
    this.clouds = [];
    this.cliffMeshes = [];
    this.otherMeshes = []; // For start line etc
    
    this.ground = null;
    this.trackMesh = null;
    
    // Configure Map Settings
    this.config = this.getMapConfig(mapType);
    
    // Update Scene Fog/Background if needed (Game.js sets defaults, we override)
    if (this.config.skyColor) {
        this.scene.background = new THREE.Color(this.config.skyColor);
        this.scene.fog = new THREE.FogExp2(this.config.skyColor, this.config.fogDensity);
    }

    // Create track first to use its curve for terrain
    this.createTrack();
    
    this.createGround();
    this.createCliffTerrain(); 
    this.createMountains();
    this.createClouds();
    this.spawnTreesInstanced();
    this.spawnSpeedBoosts();
    this.spawnCubes();
    this.createStartLine();
  }
  
  getMapConfig(type) {
      if (type === 'desert') {
          return {
              skyColor: 0x87CEEB, // Sky Blue
              fogDensity: 0.0005,
              groundColor: 0xc2b280, // Sand
              cliffTopColor: 0xd2b48c, // Tan
              cliffFaceColor: 0x8b4513, // SaddleBrown
              mountainColors: [0x8b4513, 0xa0522d, 0xcd853f], // Browns
              treeColor: 0x6b8c42, // Olive (Cactus-ish)
              trunkColor: 0x8b4513,
              treeScale: 0.8, // Smaller bushes/cacti
              trackColor: 0x554433, // Dirty road
              trackPoints: [
                  new THREE.Vector3(0, 0, -60), 
                  new THREE.Vector3(0, 0, -200),
                  new THREE.Vector3(-200, 0, -400),
                  new THREE.Vector3(-400, 0, -200), // Big loop left
                  new THREE.Vector3(-200, 0, 0),
                  new THREE.Vector3(0, 0, 100),
                  new THREE.Vector3(200, 0, 0),
                  new THREE.Vector3(400, 0, -200), // Big loop right
                  new THREE.Vector3(200, 0, -400),
                  new THREE.Vector3(0, 0, -200), // Figure 8 crossing (needs height diff? No, simple flat crossing for now or avoid crossing)
                  // Let's do a simple oval/kidney shape to avoid crossing logic issues
                  new THREE.Vector3(0, 0, -60)
              ]
          };
      }
      
      // Default Forest
      return {
          skyColor: 0xfd5e53, // Sunset
          fogDensity: 0.00025,
          groundColor: 0x2b3a2b, // Dark Abyss
          cliffTopColor: 0x3a5a3a, // Grass
          cliffFaceColor: 0x5a4a3a, // Rock
          mountainColors: null, // Procedural logic
          treeColor: 0x2d5a27,
          trunkColor: 0x5d4037,
          treeScale: 2.5,
          trackColor: 0x333333,
          trackPoints: [
              new THREE.Vector3(0, 0, -60), 
              new THREE.Vector3(0, 0, -100),
              new THREE.Vector3(-50, 0, -250), 
              new THREE.Vector3(50, 0, -400), 
              new THREE.Vector3(-20, 0, -550), 
              new THREE.Vector3(150, 0, -700), 
              new THREE.Vector3(400, 0, -600), 
              new THREE.Vector3(200, 0, -400), 
              new THREE.Vector3(500, 0, -200), 
              new THREE.Vector3(300, 0, 0), 
              new THREE.Vector3(100, 0, 50), 
              new THREE.Vector3(0, 0, 0)
          ]
      };
  }

  createGround() {
    const geo = new THREE.PlaneGeometry(10000, 10000);
    const mat = new THREE.MeshStandardMaterial({ 
      color: this.config.groundColor, 
      roughness: 1.0,
    });
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -400; 
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
  }

  createMountains() {
    const mountainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      flatShading: true 
    });

    const count = 30; 
    const center = new THREE.Vector3(350, 0, -250); 
    const minRadius = 1800;
    const maxRadius = 3500;

    for (let i = 0; i < count; i++) {
      const baseRadius = 600 + Math.random() * 600;
      const height = 1500 + Math.random() * 1500;
      
      let geometry = new THREE.ConeGeometry(baseRadius, height, 32, 16, true); 
      geometry = geometry.toNonIndexed();
      
      const posAttribute = geometry.attributes.position;
      const colorAttribute = new THREE.BufferAttribute(new Float32Array(posAttribute.count * 3), 3);
      
      const vertex = new THREE.Vector3();
      const color = new THREE.Color();
      
      const noiseOffset = Math.random() * 100;
      const ridges = 3 + Math.floor(Math.random() * 5); 
      
      for (let v = 0; v < posAttribute.count; v++) {
        vertex.fromBufferAttribute(posAttribute, v);
        
        const h = (vertex.y + height/2) / height;
        const angle = Math.atan2(vertex.z, vertex.x);
        const dist = Math.sqrt(vertex.x*vertex.x + vertex.z*vertex.z);
        
        let displacement = Math.sin(angle * ridges + noiseOffset) * (baseRadius * 0.4);
        displacement += Math.sin(angle * 15 + h * 10) * (baseRadius * 0.05);
        const rocky = Math.sin(vertex.x * 0.05) * Math.cos(vertex.y * 0.05) * 20;
        
        const effectiveDisplacement = displacement * Math.sin(h * Math.PI); 
        const newDist = dist + effectiveDisplacement + rocky;
        
        vertex.x = Math.cos(angle) * newDist;
        vertex.z = Math.sin(angle) * newDist;
        
        const bendAmount = 200 * h * h;
        vertex.x += Math.cos(noiseOffset) * bendAmount;
        vertex.z += Math.sin(noiseOffset) * bendAmount;

        posAttribute.setXYZ(v, vertex.x, vertex.y, vertex.z);
        
        // Color Logic
        if (this.mapType === 'desert') {
             // Desert Colors
             if (h > 0.8) color.setHex(0xd2b48c); // Light top
             else if (h > 0.4) color.setHex(0xcd853f); // Peru
             else color.setHex(0x8b4513); // Saddle Brown base
        } else {
             // Forest Colors
            if (h > 0.75) color.setHex(0xFFFFFF);
            else if (h > 0.65) color.setHex(Math.random() > 0.5 ? 0xFFFFFF : 0x777777);
            else if (h > 0.3) {
                const shade = 0.4 + Math.random() * 0.1;
                color.setRGB(shade, shade, shade);
            } else color.setHex(0x2b3a2b);
        }
        
        colorAttribute.setXYZ(v, color.r, color.g, color.b);
      }
      
      geometry.setAttribute('color', colorAttribute);
      geometry.computeVertexNormals();
      
      const mesh = new THREE.Mesh(geometry, mountainMat);
      
      const placeAngle = (i / count) * Math.PI * 2 + (Math.random() * 0.2);
      const distFromCenter = minRadius + Math.random() * (maxRadius - minRadius);
      
      const x = center.x + Math.cos(placeAngle) * distFromCenter;
      const z = center.z + Math.sin(placeAngle) * distFromCenter;
      
      mesh.position.set(x, -400 + height/2 - 100, z);
      
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      
      this.scene.add(mesh);
      this.mountains.push(mesh);
    }
  }

  createClouds() {
      const cloudCount = 20;
      const center = new THREE.Vector3(350, 0, -250);
      
      const cloudGeo = new THREE.DodecahedronGeometry(1, 0);
      const cloudMat = new THREE.MeshStandardMaterial({
          color: 0xffdddd, 
          roughness: 0.9,
          flatShading: true,
          transparent: true,
          opacity: 0.8,
          depthWrite: false 
      });

      // Estimate total puffs: 20 clouds * avg 4.5 puffs = ~90
      const maxPuffs = cloudCount * 6; 
      this.cloudMesh = new THREE.InstancedMesh(cloudGeo, cloudMat, maxPuffs);
      this.cloudMesh.castShadow = false;
      this.cloudMesh.receiveShadow = false; 
      
      const dummy = new THREE.Object3D();
      let count = 0;

      for(let i=0; i<cloudCount; i++) {
          const angle = Math.random() * Math.PI * 2;
          const radius = 400 + Math.random() * 800;
          const cloudX = center.x + Math.cos(angle) * radius;
          const cloudZ = center.z + Math.sin(angle) * radius;
          const cloudY = 300 + Math.random() * 200;
          
          const puffs = 3 + Math.floor(Math.random() * 3);
          for(let j=0; j<puffs; j++) {
              const offX = (Math.random() - 0.5) * 50;
              const offY = (Math.random() - 0.5) * 20;
              const offZ = (Math.random() - 0.5) * 30;
              
              dummy.position.set(cloudX + offX, cloudY + offY, cloudZ + offZ);
              
              const scale = 20 + Math.random() * 30;
              dummy.scale.set(scale, scale, scale);
              
              dummy.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
              
              dummy.updateMatrix();
              this.cloudMesh.setMatrixAt(count++, dummy.matrix);
          }
      }
      
      this.cloudMesh.count = count;
      this.scene.add(this.cloudMesh);
  }

  createTrack() {
    let points = this.config.trackPoints;
    
    // If desert, redefine points to be a winding canyon track
    if (this.mapType === 'desert') {
        points = [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -150),
            new THREE.Vector3(-100, 0, -300), // Left turn
            new THREE.Vector3(-100, 0, -600), // Straight
            new THREE.Vector3(100, 0, -900),  // Right sweeping turn
            new THREE.Vector3(400, 0, -1000), // Bottom of the canyon
            new THREE.Vector3(700, 0, -800),  // Climbing out
            new THREE.Vector3(600, 0, -400),  // Winding back
            new THREE.Vector3(300, 0, -200),  // Sharp turn
            new THREE.Vector3(200, 0, 50),    // Final stretch
            new THREE.Vector3(0, 0, 0)        // Finish
        ];
    }

    this.trackCurve = new THREE.CatmullRomCurve3(points, true); 

    const tubeGeo = new THREE.TubeGeometry(this.trackCurve, 200, 15, 8, true); 
    const trackMat = new THREE.MeshStandardMaterial({ 
      color: this.config.trackColor, 
      roughness: 0.6,
      side: THREE.DoubleSide
    });
    
    this.trackMesh = new THREE.Mesh(tubeGeo, trackMat);
    this.trackMesh.scale.y = 0.002; 
    this.trackMesh.receiveShadow = true;
    this.scene.add(this.trackMesh);
  }

  createStartLine() {
      const width = 24; 
      const length = 4;
      
      const geometry = new THREE.PlaneGeometry(width, length);
      
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0,0,64,64);
      ctx.fillStyle = '#000000';
      
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillRect(32, 32, 32, 32);
      
      const texture = new THREE.CanvasTexture(canvas);
      texture.magFilter = THREE.NearestFilter;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      
      texture.repeat.set(width / 4, 1);
      
      const material = new THREE.MeshBasicMaterial({ 
          map: texture,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -1 
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      
      const pt = this.trackCurve.getPointAt(0);
      const tangent = new THREE.Vector3(0, 0, -1);
      
      mesh.position.copy(pt);
      mesh.position.x -= 4.5; 
      mesh.position.y = 0.05; 
      
      const angle = Math.atan2(tangent.x, tangent.z);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = angle; 
      
      this.scene.add(mesh);
      this.otherMeshes.push(mesh);
      
      const postGeo = new THREE.CylinderGeometry(0.3, 0.3, 8);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
      
      const leftPost = new THREE.Mesh(postGeo, postMat);
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      
      const postDist = width / 2 + 2;

      leftPost.position.copy(mesh.position).add(normal.clone().multiplyScalar(postDist));
      leftPost.position.y = 4;
      this.scene.add(leftPost);
      this.otherMeshes.push(leftPost);
      
      const rightPost = new THREE.Mesh(postGeo, postMat);
      rightPost.position.copy(mesh.position).add(normal.clone().multiplyScalar(-postDist));
      rightPost.position.y = 4;
      this.scene.add(rightPost);
      this.otherMeshes.push(rightPost);
      
      const bannerWidth = postDist * 2;
      const bannerGeo = new THREE.BoxGeometry(bannerWidth, 1.5, 0.2);
      const bannerMat = new THREE.MeshBasicMaterial({ color: 0xcc0000 });
      const banner = new THREE.Mesh(bannerGeo, bannerMat);
      banner.position.copy(mesh.position);
      banner.position.y = 7;
      banner.rotation.y = angle; 
      this.scene.add(banner);
      this.otherMeshes.push(banner);
  }

  createCliffTerrain() {
    const curve = this.trackCurve;
    const divisions = 600; 
    const layers = 10; 
    const cliffHeight = 350;
    
    const verticesTop = [];
    const indicesTop = [];
    const verticesFace = [];
    const indicesFace = [];
    
    for (let i = 0; i <= divisions; i++) {
        const t = (i % divisions) / divisions;
        const point = curve.getPointAt(t);
        const tangent = curve.getTangentAt(t).normalize();
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize(); 
        
        const edgeNoise = Math.sin(i * 0.1) * 3 + Math.cos(i * 0.3) * 2 + Math.sin(i * 0.8) * 1;
        const distRight = 22 + edgeNoise;
        
        const vRight = point.clone().add(normal.clone().multiplyScalar(distRight));
        const vLeft = point.clone().add(normal.clone().multiplyScalar(-800)); 
        
        verticesTop.push(vRight.x, -0.1, vRight.z);
        verticesTop.push(vLeft.x, -0.1, vLeft.z);
        
        if (i < divisions) {
            const base = i * 2;
            indicesTop.push(base, base + 2, base + 1);
            indicesTop.push(base + 1, base + 2, base + 3);
        }

        for (let j = 0; j <= layers; j++) {
            const vProgress = j / layers; 
            let y = -0.1 - (vProgress * cliffHeight);
            
            let pos = vRight.clone();
            pos.y = y;
            
            if (j > 0) {
                const freqX = 0.2;
                const freqY = 0.5;
                const amp = 15;
                
                const noise1 = Math.sin(i * freqX + j * freqY) * amp;
                const noise2 = Math.cos(i * freqX * 2.5 + j * freqY * 2.5) * (amp * 0.5);
                const noise3 = Math.sin(i * 0.8 + j * 1.5) * 5; 
                
                const totalNoise = noise1 + noise2 + noise3;
                
                pos.add(normal.clone().multiplyScalar(totalNoise));
                pos.y += Math.sin(i * 0.3 + j) * 10;
            }
            
            verticesFace.push(pos.x, pos.y, pos.z);
        }
        
        if (i < divisions) {
            const vertsPerCol = layers + 1;
            const base = i * vertsPerCol;
            
            for (let j = 0; j < layers; j++) {
                const current = base + j;
                const next = base + j + 1;
                const right = base + vertsPerCol + j;
                const rightNext = base + vertsPerCol + j + 1;
                
                indicesFace.push(current, right, next);
                indicesFace.push(next, right, rightNext);
            }
        }
    }
    
    const geoTop = new THREE.BufferGeometry();
    geoTop.setAttribute('position', new THREE.Float32BufferAttribute(verticesTop, 3));
    geoTop.setIndex(indicesTop);
    geoTop.computeVertexNormals();
    const matTop = new THREE.MeshStandardMaterial({ 
        color: this.config.cliffTopColor, 
        roughness: 1.0,
        side: THREE.DoubleSide 
    });
    const meshTop = new THREE.Mesh(geoTop, matTop);
    meshTop.receiveShadow = true;
    this.scene.add(meshTop);
    this.cliffMeshes.push(meshTop);

    const geoFace = new THREE.BufferGeometry();
    geoFace.setAttribute('position', new THREE.Float32BufferAttribute(verticesFace, 3));
    geoFace.setIndex(indicesFace);
    geoFace.computeVertexNormals();
    const matFace = new THREE.MeshStandardMaterial({ 
        color: this.config.cliffFaceColor, 
        roughness: 0.9, 
        flatShading: true, 
        side: THREE.DoubleSide
    });
    const meshFace = new THREE.Mesh(geoFace, matFace);
    meshFace.receiveShadow = true;
    this.scene.add(meshFace);
    this.cliffMeshes.push(meshFace);
  }

  spawnCubes() {
    // Remove existing cubes if any (e.g. on reset)
    if (this.cubes) {
        this.cubes.forEach(c => {
             c.destroy();
             // Also remove from game entities
             const idx = this.game.entities.indexOf(c);
             if (idx > -1) this.game.entities.splice(idx, 1);
        });
    }
    this.cubes = [];

    // Hide powerup cubes for now
    return;

    const curve = this.trackCurve;
    // Spawn rows of 5 cubes every ~8% of the track
    const rowCount = 12; 
    
    for (let i = 0; i < rowCount; i++) {
        // Distribute rows along the track, avoiding the very start (0.0) and end
        const t = 0.05 + (i / rowCount) * 0.90;
        
        const point = curve.getPointAt(t);
        const tangent = curve.getTangentAt(t).normalize();
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        
        // Create a row of 5 cubes
        const offsets = [-12, -6, 0, 6, 12];
        
        offsets.forEach(offset => {
            const pos = point.clone().add(normal.clone().multiplyScalar(offset));
            
            // Ensure y is correct
            pos.y = 1.0;

            const cube = new Cube(this.scene, pos);
            this.cubes.push(cube);
            this.game.entities.push(cube);
        });
    }
  }

  spawnSpeedBoosts() {
    if (this.speedBoosts) {
        this.speedBoosts.forEach(b => b.destroy());
    }
    this.speedBoosts = [];

    const curve = this.trackCurve;
    const boostCount = 8; 
    
    for (let i = 0; i < boostCount; i++) {
        const t = 0.1 + (i / boostCount) * 0.85;
        
        const point = curve.getPointAt(t);
        const tangent = curve.getTangentAt(t).normalize();
        
        const dummy = new THREE.Object3D();
        dummy.position.copy(point);
        dummy.lookAt(point.clone().add(tangent));
        
        const boost = new SpeedBoost(this.scene, point, dummy.rotation);
        this.speedBoosts.push(boost);
        this.game.entities.push(boost);
    }
  }

  spawnTreesInstanced() {
    // Clear old trees
    if (this.treeMeshTrunk) {
        this.scene.remove(this.treeMeshTrunk);
        this.treeMeshTrunk.geometry.dispose();
        this.treeMeshTrunk.material.dispose();
    }
    if (this.treeMeshLeaves) {
        this.scene.remove(this.treeMeshLeaves);
        this.treeMeshLeaves.geometry.dispose();
        this.treeMeshLeaves.material.dispose();
    }
    this.trees = []; // For collision

    const curve = this.trackCurve;
    const divisions = 300; 
    
    // Use config scale instead of hardcoded 2.5
    const scale = this.config.treeScale || 2.5;

    // --- MODIFIED TRUNK & LEAVES FOR SHORTER TRUNKS ---
    // Make trunk shorter: 1.2 * scale (instead of 4 * scale)
    const trunkH = 1.2 * scale;
    const trunkGeo = new THREE.CylinderGeometry(0.4 * scale, 0.6 * scale, trunkH, 6);
    // Move trunk up so its base is at 0 (it is centered at 0,0,0 by default)
    trunkGeo.translate(0, trunkH / 2, 0);

    const trunkMat = new THREE.MeshLambertMaterial({ color: this.config.trunkColor || 0x5d4037 });
    
    // Leaves
    // Cone Height: 5.0 * scale
    // Position: Sit lower to cover the short trunk
    // Trunk top is at Y = trunkH
    // We want leaves to start slightly below trunk top
    const leafH = 5.0 * scale;
    // Overlap: 0.5 * scale
    const leafY = trunkH + (leafH * 0.5) - (0.5 * scale);
    
    const leafGeo = new THREE.ConeGeometry(2.5 * scale, leafH, 7);
    leafGeo.translate(0, leafY, 0);
    const leafMat = new THREE.MeshLambertMaterial({ color: this.config.treeColor || 0x2d5a27 });

    // 2. Create Instanced Meshes
    const maxTrees = divisions;
    this.treeMeshTrunk = new THREE.InstancedMesh(trunkGeo, trunkMat, maxTrees);
    this.treeMeshLeaves = new THREE.InstancedMesh(leafGeo, leafMat, maxTrees);
    
    this.treeMeshTrunk.castShadow = true;
    this.treeMeshTrunk.receiveShadow = true;
    this.treeMeshLeaves.castShadow = true;
    this.treeMeshLeaves.receiveShadow = true;
    
    const dummy = new THREE.Object3D();
    let count = 0;

    for (let i = 0; i < divisions; i++) {
      const t = i / divisions;
      const point = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      
      const offset = 30 + Math.random() * 25; 
      
      if (Math.random() > 0.3) {
        const p2 = point.clone().add(normal.clone().multiplyScalar(-offset));
        
        p2.x += (Math.random() - 0.5) * 10;
        p2.z += (Math.random() - 0.5) * 10;
        
        // Position
        dummy.position.set(p2.x, 0, p2.z); 
        dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
        
        // --- VARYING HEIGHTS ---
        // Random scale between 0.8 and 1.3
        const s = 0.8 + Math.random() * 0.5;
        dummy.scale.set(s, s, s);
        
        dummy.updateMatrix();
        
        this.treeMeshTrunk.setMatrixAt(count, dummy.matrix);
        this.treeMeshLeaves.setMatrixAt(count, dummy.matrix);
        
        // Collision Data (Scale affects radius, but we use approximation)
        this.trees.push({ position: new THREE.Vector3(p2.x, 0, p2.z) });
        
        count++;
      }
    }
    
    this.treeMeshTrunk.count = count;
    this.treeMeshLeaves.count = count;
    
    this.scene.add(this.treeMeshTrunk);
    this.scene.add(this.treeMeshLeaves);
  }

  update(dt, playerPos, playerVel) {
  }
  
  reset() {
      this.spawnCubes();
  }
  
  destroy() {
    // Remove all meshes from scene
    if (this.ground) {
        this.scene.remove(this.ground);
        if (this.ground.geometry) this.ground.geometry.dispose();
        if (this.ground.material) this.ground.material.dispose();
    }
    if (this.trackMesh) {
        this.scene.remove(this.trackMesh);
        if (this.trackMesh.geometry) this.trackMesh.geometry.dispose();
        if (this.trackMesh.material) this.trackMesh.material.dispose();
    }
    
    // this.trees.forEach(t => t.destroy()); // Trees are now instanced, just clear array
    if (this.treeMeshTrunk) {
        this.scene.remove(this.treeMeshTrunk);
        this.treeMeshTrunk.geometry.dispose();
        this.treeMeshTrunk.material.dispose();
        this.treeMeshTrunk = null;
    }
    if (this.treeMeshLeaves) {
        this.scene.remove(this.treeMeshLeaves);
        this.treeMeshLeaves.geometry.dispose();
        this.treeMeshLeaves.material.dispose();
        this.treeMeshLeaves = null;
    }
    this.speedBoosts.forEach(b => b.destroy());
    this.cubes.forEach(c => c.destroy());
    
    this.mountains.forEach(m => {
        this.scene.remove(m);
        if (m.geometry) m.geometry.dispose();
        if (m.material) m.material.dispose();
    });
    
    this.cliffMeshes.forEach(m => {
        this.scene.remove(m);
        if (m.geometry) m.geometry.dispose();
        if (m.material) m.material.dispose();
    });
    
    if (this.cloudMesh) {
        this.scene.remove(this.cloudMesh);
        this.cloudMesh.geometry.dispose();
        this.cloudMesh.material.dispose();
        this.cloudMesh = null;
    }
    
    this.otherMeshes.forEach(m => {
        this.scene.remove(m);
        if (m.geometry) m.geometry.dispose();
        if (m.material) m.material.dispose();
    });
    
    // Clean up arrays
    this.trees = [];
    this.speedBoosts = [];
    this.cubes = [];
    this.mountains = [];
    // this.clouds = []; // Removed
    this.cliffMeshes = [];
    this.otherMeshes = [];
  }
}
