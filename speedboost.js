class SpeedBoost extends GameObject3D {
  constructor(scene, position, rotation) {
    super(scene);
    this.name = 'SpeedBoost';
    this.radius = 3.5; // Collision radius
    
    this.position.copy(position);
    this.rotation.copy(rotation);
    
    this.createMesh();
  }

  createMesh() {
    this.mesh = new THREE.Group();
    
    // Glowing base pad
    const padGeo = new THREE.PlaneGeometry(5, 8);
    const padMat = new THREE.MeshBasicMaterial({ 
      color: 0x00ffff, 
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.05; // Just above road
    this.mesh.add(pad);
    
    // Chevrons
    const shape = new THREE.Shape();
    shape.moveTo(-1.5, -0.8);
    shape.lineTo(0, 1.2);
    shape.lineTo(1.5, -0.8);
    shape.lineTo(0, -0.2);
    shape.lineTo(-1.5, -0.8);
    
    const chevronGeo = new THREE.ShapeGeometry(shape);
    // Base material config
    const baseChevronMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending
    });
    
    this.arrows = [];
    for(let i=0; i<3; i++) {
        // CLONE material so each arrow can have independent opacity/color
        const arrow = new THREE.Mesh(chevronGeo, baseChevronMat.clone());
        arrow.rotation.x = Math.PI / 2;
        
        // i=0: z=2 (Front/End of pad), i=1: z=0, i=2: z=-2 (Back/Start of pad)
        // Arrows point +Z (Forward relative to pad)
        arrow.position.set(0, 0.06, 2.0 - i * 2.0); 
        
        this.mesh.add(arrow);
        this.arrows.push(arrow);
    }

    // Glow light
    const light = new THREE.PointLight(0x00ffff, 2, 8);
    light.position.set(0, 1, 0);
    this.mesh.add(light);

    this.scene.add(this.mesh);
    this.mesh.position.copy(this.position);
    this.mesh.rotation.copy(this.rotation);
  }
  
  update(dt) {
      // Animate arrows sequentially
      // 8 cycles per second speed factor
      const speed = 8; 
      const time = Date.now() / 1000 * speed;
      
      // Sequence: 2 (Back) -> 1 (Middle) -> 0 (Front)
      // This makes the light "travel" forward in the direction of the boost
      const activeIndex = 2 - (Math.floor(time) % 3);
      
      this.arrows.forEach((arrow, i) => {
          if (i === activeIndex) {
              arrow.material.opacity = 1.0;
              arrow.material.color.setHex(0xffffff); // Bright White
          } else {
              arrow.material.opacity = 0.3;
              arrow.material.color.setHex(0xffffff); // White (same as active)
          }
      });
      
      super.update(dt);
  }
}
