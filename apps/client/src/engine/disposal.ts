import { BufferGeometry, Light, Material, Texture, type Object3D } from 'three';

/**
 * Giải phóng mọi geometry, material, texture (và shadow map của đèn) bên dưới `root`.
 * Tài nguyên dùng chung giữa nhiều object chỉ bị giải phóng một lần.
 */
interface Disposable {
  dispose(): void;
}

export function disposeObject3D(root: Object3D): void {
  // Chỉ cần gọi dispose(), nên gom theo kiểu tối thiểu đó.
  const geometries = new Set<Disposable>();
  const materials = new Set<Disposable>();
  const textures = new Set<Disposable>();

  root.traverse((object) => {
    const candidate = object as Object3D & { geometry?: unknown; material?: unknown };
    if (candidate.geometry instanceof BufferGeometry) geometries.add(candidate.geometry);
    const material = candidate.material;
    if (Array.isArray(material)) {
      for (const item of material) if (item instanceof Material) materials.add(item);
    } else if (material instanceof Material) {
      materials.add(material);
    }
    if (object instanceof Light) object.dispose();
  });

  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof Texture) textures.add(value);
    }
    material.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
}
