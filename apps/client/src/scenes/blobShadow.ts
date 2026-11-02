import { CircleGeometry, Mesh, MeshBasicMaterial, type Texture } from 'three';

/** Bóng giả dưới chân (1 draw call, không cần shadow map): dùng khi tắt bóng thật. */
export function createBlobShadow(dotTexture: Texture, radius = 0.32): Mesh {
  const mesh = new Mesh(
    new CircleGeometry(radius, 20),
    new MeshBasicMaterial({
      map: dotTexture,
      color: 0x5a3e2b,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.006;
  mesh.renderOrder = 1;
  return mesh;
}
