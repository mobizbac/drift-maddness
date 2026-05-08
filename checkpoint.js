class Checkpoint extends GameObject3D {
  constructor(scene, position) {
    super(scene);
    this.name = 'Checkpoint';
    this.position.copy(position);
    this.createMesh();
    this.pulseTime = 0;
  }

  createMesh() {
    this.mesh = new THREE.Group();

    // Pillars
    const postGeo = new THREE.CylinderGeometry(0.2, 0.2, 8, 8);
    const postMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    
    const leftPost = new THREE.Mesh(postGeo, postMat);
    leftPost.position.set(-6, 4, 0);
    this.mesh.add(leftPost);

    const rightPost = new THREE.Mesh(postGeo, postMat);
    rightPost.position.set(6, 4, 0);
    this.mesh.add(rightPost);

    // Glowing Ring/Banner
    const bannerGeo = new THREE.BoxGeometry(12, 1, 0.2);
    this.bannerMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8 });
    const banner = new THREE.Mesh(bannerGeo, this.bannerMat);
    banner.position.set(0, 7, 0);
    this.mesh.add(banner);

    // Light
    const light = new THREE.PointLight(0x00ff00, 20, 20);
    light.position.set(0, 6, 0);
    this.mesh.add(light);

    this.mesh.position.copy(this.position);
    
    // Face the origin initially (will look at player in game loop maybe?)
    // For now, simple rotation
    this.scene.add(this.mesh);
  }

  update(dt) {
    this.pulseTime += dt * 5;
    if (this.bannerMat) {
      this.bannerMat.opacity = 0.5 + Math.sin(this.pulseTime) * 0.3;
    }
    super.update(dt);
  }
}
