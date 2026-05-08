class Tree extends GameObject3D {
  constructor(scene, x, z) {
    super(scene);
    this.name = 'Tree';
    this.position.set(x, 0, z);
    // Random rotation for variety
    this.rotation.y = Math.random() * Math.PI * 2;
    
    // Varying heights: Scale factor between 0.8x and 1.4x of base size
    // Base scale 2.5 similar to before
    this.treeScale = 2.5 * (0.8 + Math.random() * 0.6);
    
    this.createMesh();
  }

  createMesh() {
    this.mesh = new THREE.Group();

    // Trunk - Shorter than before
    // Old logic was approx (2 to 4) * scale
    // New logic: (0.5 to 1.0) * scale -> significantly shorter trunk visible
    const trunkH = (0.5 + Math.random() * 0.5) * this.treeScale;
    const trunkRadiusTop = 0.4 * this.treeScale;
    const trunkRadiusBottom = 0.6 * this.treeScale;
    
    // Store for bounds
    this.trunkHeight = trunkH;

    const trunkGeo = new THREE.CylinderGeometry(trunkRadiusTop, trunkRadiusBottom, trunkH, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    this.mesh.add(trunk);

    // Leaves (Cone layers)
    const leavesMat = new THREE.MeshLambertMaterial({ color: 0x2d5a27 });
    
    const layers = 3;
    for(let i=0; i<layers; i++) {
      const size = (2.5 - (i * 0.6)) * this.treeScale;
      // Position leaves relative to trunk top
      // Overlap slightly more to hide the top of the trunk
      const yPos = trunkH + (i * 1.1 * this.treeScale) - (0.3 * this.treeScale);
      
      const coneH = 2.5 * this.treeScale;
      const leavesGeo = new THREE.ConeGeometry(size, coneH, 7);
      const leaves = new THREE.Mesh(leavesGeo, leavesMat);
      leaves.position.y = yPos;
      leaves.castShadow = true;
      this.mesh.add(leaves);
    }

    this.mesh.position.copy(this.position);
    this.mesh.rotation.copy(this.rotation);
    this.scene.add(this.mesh);
  }

  // Override getBounds for collision
  getBounds() {
    // Create a box around the trunk and lower foliage
    const center = this.position.clone();
    
    // Center Y at roughly half the visual height
    // Visual height is roughly trunk + 3 layers
    const approximateHeight = 4.5 * this.treeScale;
    center.y = approximateHeight / 2;
    
    // Width based on scale (make it slightly forgiving)
    const width = 1.0 * this.treeScale;
    
    const size = new THREE.Vector3(width, approximateHeight, width);
    return new THREE.Box3().setFromCenterAndSize(center, size);
  }
}
