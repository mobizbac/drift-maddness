class Cube extends GameObject3D {
  constructor(scene, position) {
    super(scene);
    
    // Create a glowing cube
    const geometry = new THREE.BoxGeometry(2.0, 2.0, 2.0);
    const material = new THREE.MeshPhysicalMaterial({ 
      color: 0xffffff,
      metalness: 0.1,
      roughness: 0,
      transmission: 0.9, // Glass-like transmission
      thickness: 1.0, // Refraction
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide
    });
    
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(position);
    this.mesh.position.y += 2.0; // Float above ground
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    
    this.scene.add(this.mesh);
    
    // Set logic position for collision detection
    this.position.copy(this.mesh.position);
    
    // Store initial Y for floating animation
    this.baseY = this.mesh.position.y;

    // Animation properties
    this.floatOffset = Math.random() * Math.PI * 2;
    this.rotationSpeed = 1.0 + Math.random();
  }

  update(dt) {
    if (!this.mesh) return;
    
    // Rotate constantly
    this.mesh.rotation.y += this.rotationSpeed * dt;
    this.mesh.rotation.x += (this.rotationSpeed * 0.5) * dt;
    
    // Float up and down relative to base Y
    const time = Date.now() * 0.002;
    this.mesh.position.y = this.baseY + Math.sin(time + this.floatOffset) * 0.5;
    
    // Sync logic position with mesh position
    this.position.copy(this.mesh.position);
  }
  
  destroy() {
      if (this.mesh) {
          this.scene.remove(this.mesh);
          this.mesh.geometry.dispose();
          this.mesh.material.dispose();
          this.mesh = null;
      }
  }
}
