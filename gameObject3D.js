class GameObject3D {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.position = new THREE.Vector3();
    this.rotation = new THREE.Euler();
    this.velocity = new THREE.Vector3();
    this.name = 'GameObject3D';
    this.active = true;
  }

  update(dt) {
    if (!this.active) return;
    
    // Sync entity state to mesh
    if (this.mesh) {
      this.mesh.position.copy(this.position);
      this.mesh.rotation.copy(this.rotation);
    }
  }

  getBounds() {
    if (!this.mesh) return null;
    const box = new THREE.Box3().setFromObject(this.mesh);
    return box;
  }

  destroy() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      // Traverse to dispose geometries and materials to prevent memory leaks
      this.mesh.traverse((child) => {
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
    }
    this.active = false;
  }
}
