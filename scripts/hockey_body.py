"""Procedural hockey player and goalie, built from scratch on the first-party rig.

Everything here is authored in the rig's rest pose: the player stands at the
origin facing -Y, left is +X, arms out to the sides along X at shoulder height
(z = 1.44), hips at 0.95, knees at 0.5, ankles at 0.12, ice at z = 0.

The body is made of smooth lofts (cross-sections swept along an axis or a
path) rather than stretched primitives, and every piece that crosses a joint
carries blended skin weights, so the sleeves, socks and torso bend instead of
breaking at the elbow, knee and waist. All parts are joined into the original
mesh object so the GLB keeps one skinned mesh with one draw call per material.

Materials (named, the runtime depends on them):
  jersey, accent, pants   tinted per player (tintMaterials.ts)
  number                  back panel the player's number is printed on
  white, dark, skin, steel, stick, visor
"""
import math
import bpy
import bmesh
from mathutils import Vector

TAU = math.tau

# Stick orientation. The blade is authored in the stick bone's rest frame so
# that, once hockey_motion.py leans the shaft into the carrying pose, the
# blade lies flat on the ice with the toe pointing away from the player.
# Measured from the authored 'idle' clips (see the refine script).
SKATER_TOE = Vector((-0.22, -0.56, -0.80)).normalized()
SKATER_BLADE_UP = Vector((-0.29, -0.74, 0.60)).normalized()
SKATER_STICK_TOP = 1.66
SKATER_HEEL = Vector((0, 0, 0.045))
# The goalie's blade runs across the front of the pads (world +X).
GOALIE_TOE = Vector((0.99, 0.033, -0.134)).normalized()
GOALIE_BLADE_UP = Vector((0.134, -0.468, 0.874)).normalized()
GOALIE_STICK_TOP = 1.2
GOALIE_HEEL = Vector((0, 0, 0.315))


# ----------------------------------------------------------------------------
# Small maths helpers
# ----------------------------------------------------------------------------

def smoothstep(e0, e1, x):
    if e0 == e1:
        return 1.0 if x >= e1 else 0.0
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def gauss(a, s):
    return math.exp(-(a / s) ** 2)


def superellipse(angle, n):
    c, s = math.cos(angle), math.sin(angle)
    e = 2.0 / n
    return math.copysign(abs(c) ** e, c), math.copysign(abs(s) ** e, s)


def lerp_profile(profile, key):
    """Interpolates a list of (key, v1, v2, ...) rows at `key` (rows sorted by key, either direction)."""
    rows = sorted(profile, key=lambda r: r[0])
    if key <= rows[0][0]:
        return rows[0][1:]
    if key >= rows[-1][0]:
        return rows[-1][1:]
    for r0, r1 in zip(rows, rows[1:]):
        if r0[0] <= key <= r1[0]:
            t = (key - r0[0]) / (r1[0] - r0[0])
            t = t * t * (3 - 2 * t) * 0.35 + t * 0.65  # gently eased, so lofts read smooth
            return tuple(a + (b - a) * t for a, b in zip(r0[1:], r1[1:]))
    return rows[-1][1:]


def ring(center, u, v, a, b, seg, n=2.0, phase=0.0):
    points = []
    for i in range(seg):
        cu, sv = superellipse(phase + TAU * i / seg, n)
        points.append(center + u * (a * cu) + v * (b * sv))
    return points


def path_frames(points):
    """Parallel-transport frames (u, v) along a polyline."""
    tangents = []
    for i in range(len(points)):
        p0 = points[max(0, i - 1)]
        p1 = points[min(len(points) - 1, i + 1)]
        tangents.append((p1 - p0).normalized())
    ref = Vector((0, 0, 1)) if abs(tangents[0].z) < 0.9 else Vector((1, 0, 0))
    u = tangents[0].cross(ref).normalized()
    frames = []
    for t in tangents:
        u = (u - t * u.dot(t)).normalized()
        frames.append((u, t.cross(u).normalized()))
    return frames


def smooth_path(points, samples=4):
    """Catmull-Rom resampling of a few control points into a smooth polyline."""
    pts = [Vector(p) for p in points]
    if len(pts) < 3:
        return pts
    out = []
    ext = [pts[0] * 2 - pts[1]] + pts + [pts[-1] * 2 - pts[-2]]
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for k in range(samples):
            t = k / samples
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(pts[-1])
    return out


# ----------------------------------------------------------------------------
# Skin weights
# ----------------------------------------------------------------------------

def torso_weights(co):
    z = co.z
    if z < 1.12:
        b = smoothstep(1.0, 1.16, z)
        w = {'hips': 1 - b, 'spine': b}
    else:
        b = smoothstep(1.14, 1.34, z)
        w = {'spine': 1 - b, 'chest': b}
    # Shoulder caps follow the arm as it lifts.
    side = 'upperarm_L' if co.x > 0 else 'upperarm_R'
    arm = 0.75 * smoothstep(0.17, 0.27, abs(co.x)) * smoothstep(1.30, 1.42, z)
    if arm > 0:
        w = {k: v * (1 - arm) for k, v in w.items()}
        w[side] = arm
    return w


def arm_weights(co):
    s = 'L' if co.x > 0 else 'R'
    x = abs(co.x)
    if x < 0.30:
        a = smoothstep(0.15, 0.24, x)
        return {'chest': 1 - a, f'upperarm_{s}': a}
    if x < 0.56:
        b = smoothstep(0.41, 0.49, x)
        return {f'upperarm_{s}': 1 - b, f'forearm_{s}': b}
    b = smoothstep(0.645, 0.685, x)
    return {f'forearm_{s}': 1 - b, f'hand_{s}': b}


def leg_weights(co):
    s = 'L' if co.x > 0 else 'R'
    z = co.z
    if z > 0.72:
        b = smoothstep(0.80, 0.96, z)
        return {f'thigh_{s}': 1 - b, 'hips': b}
    if z > 0.3:
        b = smoothstep(0.44, 0.56, z)
        return {f'shin_{s}': 1 - b, f'thigh_{s}': b}
    b = smoothstep(0.15, 0.23, z)
    return {f'foot_{s}': 1 - b, f'shin_{s}': b}


def head_weights(co):
    b = smoothstep(1.47, 1.56, co.z)
    if co.z < 1.47:
        c = smoothstep(1.42, 1.47, co.z)
        return {'chest': 1 - c, 'neck': c}
    return {'neck': 1 - b, 'head': b}


def bone(name):
    return lambda co: {name: 1.0}


# ----------------------------------------------------------------------------
# Mesh assembly
# ----------------------------------------------------------------------------

class Kit:
    def __init__(self):
        self.parts = []

    def add(self, name, verts, faces, material, weights, uvs=None, weld=True, recalc=False):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([tuple(v) for v in verts], [], faces)
        if uvs is not None:
            layer = mesh.uv_layers.new(name='UVMap')
            for poly in mesh.polygons:
                for li in poly.loop_indices:
                    layer.data[li].uv = uvs[mesh.loops[li].vertex_index]
        if weld or recalc:
            bm = bmesh.new()
            bm.from_mesh(mesh)
            if weld:
                bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
            if recalc:
                bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            bm.to_mesh(mesh)
            bm.free()
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.data.materials.append(bpy.data.materials[material])
        for poly in mesh.polygons:
            poly.use_smooth = True
        groups = {}
        for v in mesh.vertices:
            for bone_name, value in weights(v.co).items():
                if value <= 1e-4:
                    continue
                group = groups.get(bone_name)
                if group is None:
                    group = groups[bone_name] = obj.vertex_groups.new(name=bone_name)
                group.add([v.index], value, 'REPLACE')
        self.parts.append(obj)
        return obj

    def loft(self, name, rings, material, weights, cap_start=True, cap_end=True):
        seg = len(rings[0])
        verts = [p for r in rings for p in r]
        faces = []
        for r in range(len(rings) - 1):
            for i in range(seg):
                j = (i + 1) % seg
                faces.append((r * seg + i, r * seg + j, (r + 1) * seg + j, (r + 1) * seg + i))
        # Caps are fans to a centre point, so they shade and triangulate cleanly.
        if cap_start:
            c = len(verts)
            verts.append(sum(rings[0], Vector()) / seg)
            for i in range(seg):
                faces.append((c, (i + 1) % seg, i))
        if cap_end:
            c = len(verts)
            last = (len(rings) - 1) * seg
            verts.append(sum(rings[-1], Vector()) / seg)
            for i in range(seg):
                faces.append((c, last + i, last + (i + 1) % seg))
        return self.add(name, verts, faces, material, weights, recalc=True)

    def tube(self, name, points, radius, material, weights, seg=10, n=2.0, caps=True, samples=0):
        pts = smooth_path(points, samples) if samples else [Vector(p) for p in points]
        frames = path_frames(pts)
        rings = []
        count = len(pts)
        for i, (p, (u, v)) in enumerate(zip(pts, frames)):
            f = i / max(1, count - 1)
            a, b = radius(f) if callable(radius) else (radius, radius)
            rings.append(ring(p, u, v, a, b, seg, n))
        return self.loft(name, rings, material, weights, caps, caps)

    def sphere(self, name, center, radii, material, weights, seg=20, rings_=12, deform=None):
        verts, faces = [], []
        cx = Vector(center)
        for r in range(rings_ + 1):
            phi = math.pi * r / rings_
            for i in range(seg):
                th = TAU * i / seg
                d = Vector((math.sin(phi) * math.cos(th), math.sin(phi) * math.sin(th), math.cos(phi)))
                p = deform(d) if deform else Vector((d.x * radii[0], d.y * radii[1], d.z * radii[2]))
                verts.append(cx + p)
        for r in range(rings_):
            for i in range(seg):
                j = (i + 1) % seg
                faces.append((r * seg + i, (r + 1) * seg + i, (r + 1) * seg + j, r * seg + j))
        return self.add(name, verts, faces, material, weights, recalc=True)

    def grid(self, name, cols, rows, point_at, material, weights, uv=False, wrap=False):
        """A sheet: u across (0..1), v up (0..1). Faces wind so du x dv is the front."""
        ucount = cols if wrap else cols + 1
        verts, uvs = [], []
        for r in range(rows + 1):
            for c in range(ucount):
                verts.append(point_at(c / cols, r / rows))
                uvs.append((c / cols, r / rows))
        faces = []
        for r in range(rows):
            for c in range(cols):
                c1 = (c + 1) % ucount
                faces.append((r * ucount + c, r * ucount + c1, (r + 1) * ucount + c1, (r + 1) * ucount + c))
        return self.add(name, verts, faces, material, weights, uvs=uvs if uv else None, weld=not uv)


# ----------------------------------------------------------------------------
# Body profiles
# ----------------------------------------------------------------------------

# Sweater: (z, half-width, half-depth, centre y). Square shoulders from the
# pads underneath, a taper to the waist and a loose hem over the breezers.
SKATER_TORSO = [
    (0.900, 0.214, 0.160, 0.004),
    (0.960, 0.206, 0.152, 0.002),
    (1.040, 0.190, 0.140, 0.000),
    (1.120, 0.186, 0.136, -0.002),
    (1.210, 0.200, 0.144, -0.006),
    (1.290, 0.218, 0.152, -0.008),
    (1.350, 0.236, 0.156, -0.006),
    (1.400, 0.238, 0.150, -0.002),
    (1.445, 0.226, 0.140, 0.002),
    (1.485, 0.200, 0.126, 0.006),
    (1.510, 0.140, 0.098, 0.010),
    (1.528, 0.078, 0.070, 0.010),
]
GOALIE_TORSO = [
    (0.900, 0.236, 0.178, 0.004),
    (0.960, 0.228, 0.172, 0.000),
    (1.050, 0.222, 0.172, -0.010),
    (1.150, 0.236, 0.184, -0.018),
    (1.250, 0.256, 0.192, -0.020),
    (1.330, 0.272, 0.192, -0.016),
    (1.400, 0.276, 0.180, -0.006),
    (1.450, 0.262, 0.164, 0.002),
    (1.490, 0.226, 0.140, 0.006),
    (1.515, 0.150, 0.104, 0.010),
    (1.530, 0.080, 0.072, 0.010),
]
TORSO_N = 2.35


def torso_point(profile, z, angle, lift=0.0):
    a, b, cy = lerp_profile(profile, z)
    cu, sv = superellipse(angle, TORSO_N)
    return Vector((cu * (a + lift), cy + sv * (b + lift), z))


# Sleeve along X: (|x|, radius across y, radius up z).
SKATER_SLEEVE = [
    (0.150, 0.080, 0.060), (0.200, 0.096, 0.086), (0.250, 0.102, 0.096), (0.340, 0.092, 0.088),
    (0.420, 0.084, 0.080), (0.470, 0.090, 0.086), (0.530, 0.080, 0.076),
    (0.600, 0.076, 0.072), (0.630, 0.078, 0.074),
]
GOALIE_SLEEVE = [
    (0.150, 0.096, 0.070), (0.200, 0.116, 0.100), (0.250, 0.124, 0.116), (0.330, 0.112, 0.106),
    (0.380, 0.118, 0.112), (0.430, 0.106, 0.100), (0.470, 0.112, 0.106),
    (0.530, 0.100, 0.094), (0.580, 0.104, 0.098), (0.630, 0.094, 0.090),
]


def sleeve_point(profile, sign, x, angle, lift=0.0):
    ry, rz = lerp_profile(profile, x)
    return Vector((sign * x, math.cos(angle) * (ry + lift), 1.44 + math.sin(angle) * (rz + lift)))


# Sock over the shin guard: (z, half-width, half-depth, centre y). The knee cap
# and the shin pad push the front of the sock forward.
SOCK = [
    (0.600, 0.090, 0.098, 0.004),
    (0.540, 0.092, 0.104, -0.010),
    (0.490, 0.090, 0.104, -0.016),
    (0.430, 0.080, 0.094, -0.012),
    (0.340, 0.072, 0.086, -0.010),
    (0.260, 0.058, 0.066, -0.004),
    (0.200, 0.048, 0.056, 0.002),
    (0.160, 0.046, 0.052, 0.004),
]

# Breezers leg: (z, half-width, half-depth, centre y).
SKATER_BREEZER = [
    (0.950, 0.080, 0.118, 0.006), (0.905, 0.118, 0.146, 0.003), (0.860, 0.132, 0.152, 0.000),
    (0.780, 0.13, 0.148, -0.006), (0.660, 0.118, 0.136, -0.010),
    (0.575, 0.11, 0.128, -0.010),
]
GOALIE_BREEZER = [
    (0.950, 0.090, 0.130, 0.006), (0.905, 0.130, 0.160, 0.003), (0.860, 0.146, 0.168, 0.000),
    (0.780, 0.150, 0.162, -0.006), (0.660, 0.142, 0.150, -0.010),
    (0.580, 0.140, 0.146, -0.010),
]


# ----------------------------------------------------------------------------
# Head and face
# ----------------------------------------------------------------------------

HEAD_CENTRE = Vector((0, -0.008, 1.652))


def head_surface(d):
    """Unit direction -> offset from HEAD_CENTRE: a sculpted head, not an egg."""
    x, y, z = d.x, d.y, d.z
    front = max(0.0, -y)
    rx, ry, rz = 0.073, 0.094, 0.114
    if z < 0:
        rx *= 1 - 0.2 * (-z) ** 1.6          # jaw narrows toward the chin
        ry *= 1 - 0.08 * (-z) ** 2
    if y > 0:
        ry *= 1.05                            # fuller back of the skull
    px, py, pz = x * rx, y * ry, z * rz
    nose = 0.024 * gauss(x, 0.12) * gauss(z + 0.06, 0.15) * front ** 3
    nose += 0.007 * gauss(x, 0.08) * gauss(z + 0.19, 0.06) * front ** 3
    brow = 0.008 * gauss(z - 0.22, 0.07) * gauss(x, 0.6) * front ** 2
    socket = -0.008 * (gauss(x - 0.34, 0.13) + gauss(x + 0.34, 0.13)) * gauss(z - 0.1, 0.08) * front
    cheek = 0.005 * (gauss(x - 0.48, 0.16) + gauss(x + 0.48, 0.16)) * gauss(z + 0.12, 0.12) * front
    chin = 0.010 * gauss(x, 0.3) * gauss(z + 0.8, 0.12) * front
    mouth = -0.0035 * gauss(x, 0.24) * gauss(z + 0.47, 0.035) * front
    lip = 0.0025 * gauss(x, 0.22) * (gauss(z + 0.42, 0.04) + gauss(z + 0.53, 0.04)) * front
    py -= nose + brow + socket + cheek + chin + mouth + lip
    return Vector((px, py, pz))


def face_point(x, z):
    """A point on the face surface at unit-sphere coordinates (x, z), front side."""
    y = -math.sqrt(max(0.0, 1 - x * x - z * z))
    return HEAD_CENTRE + head_surface(Vector((x, y, z)))


def build_head(kit, goalie):
    kit.sphere('Head', HEAD_CENTRE, None, 'skin', bone('head'), seg=44, rings_=30, deform=head_surface)
    kit.tube('Neck', [(0, 0.004, 1.43), (0, 0.0, 1.5), (0, -0.004, 1.585)], lambda f: (0.053, 0.058), 'skin', head_weights, seg=18, caps=False)
    for sx in (-1, 1):
        x = sx * 0.34
        socket = face_point(x, 0.1)
        eye = socket + Vector((0, 0.0075, 0))
        kit.sphere('Eye', eye, (0.0125, 0.0118, 0.0108), 'white', bone('head'), seg=14, rings_=8)
        kit.sphere('Iris', eye + Vector((0, -0.0112, 0.0005)), (0.0066, 0.0024, 0.0066), 'dark', bone('head'), seg=12, rings_=6)
        brow = [face_point(sx * t, 0.235 - 0.05 * (t - 0.36) ** 2) + Vector((0, -0.002, 0)) for t in (0.17, 0.3, 0.44, 0.56)]
        kit.tube('Eyebrow', brow, lambda f: (0.0035, 0.0022 * (1.2 - 0.6 * f)), 'dark', bone('head'), seg=6)
        # Ear, mostly under the helmet's ear guard.
        kit.sphere('Ear', HEAD_CENTRE + Vector((sx * 0.074, 0.008, 0.002)), (0.012, 0.026, 0.034), 'skin', bone('head'), seg=12, rings_=8)


def helmet_dir(theta, phi):
    """theta 0 = front (-Y), pi/2 = left (+X); phi 0 = top."""
    return Vector((math.sin(phi) * math.sin(theta), -math.sin(phi) * math.cos(theta), math.cos(phi)))


def build_helmet(kit):
    centre = Vector((0, 0.01, 1.672))
    rx, ry, rz = 0.106, 0.124, 0.116

    def edge(theta):
        back = (1 - math.cos(theta)) / 2
        return 1.30 + 0.72 * back ** 0.85

    def surface(theta, phi, inset):
        d = helmet_dir(theta, phi)
        # Sculpted shell: two raised ribs over the top, a slight brow lip.
        lateral = d.x
        rib = 0.006 * (gauss(lateral - 0.28, 0.07) + gauss(lateral + 0.28, 0.07)) * smoothstep(0.2, 0.9, d.z + 0.3)
        lip = 0.004 * gauss(phi - edge(theta), 0.08)
        scale = 1 + rib / 0.11 + lip / 0.11
        return centre + Vector((d.x * rx * scale, d.y * ry * scale, d.z * rz * scale)) - d * inset

    cols, rows = 48, 14
    verts, faces = [], []
    for side, inset in enumerate((0.0, 0.011)):
        for r in range(rows + 1):
            for c in range(cols):
                theta = TAU * c / cols
                verts.append(surface(theta, edge(theta) * r / rows, inset))
    per = (rows + 1) * cols
    for side in range(2):
        base = side * per
        for r in range(rows):
            for c in range(cols):
                c1 = (c + 1) % cols
                quad = (base + r * cols + c, base + (r + 1) * cols + c, base + (r + 1) * cols + c1, base + r * cols + c1)
                faces.append(quad if side == 0 else tuple(reversed(quad)))
    for c in range(cols):
        c1 = (c + 1) % cols
        o, i = rows * cols, per + rows * cols
        faces.append((o + c, i + c, i + c1, o + c1))
    kit.add('Helmet', verts, faces, 'dark', bone('head'))

    # Vent slots: recessed dark ribs front to back over the crown.
    for lat in (-0.14, 0.14, -0.42, 0.42):
        pts = []
        for k in range(5):
            # Front-to-back along the crown, sitting just proud of the shell.
            y = -0.5 + 0.25 * k
            x = lat
            z = math.sqrt(max(0.0, 1 - x * x - y * y))
            d = Vector((x, y, z)).normalized()
            pts.append(centre + Vector((d.x * rx, d.y * ry, d.z * rz)) * 1.01)
        kit.tube('Vent', pts, lambda f: (0.009 * (1 - abs(f - 0.5)), 0.004), 'stick', bone('head'), seg=8, n=3.0, samples=3)

    # Ear guards with an opening, and the clips.
    for sx in (-1, 1):
        guard_c = Vector((sx * 0.102, 0.0, 1.632))
        kit.sphere('Ear guard', guard_c, (0.02, 0.046, 0.05), 'dark', bone('head'), seg=18, rings_=10)
        kit.sphere('Ear hole', guard_c + Vector((sx * 0.017, 0.004, -0.004)), (0.006, 0.012, 0.014), 'stick', bone('head'), seg=10, rings_=6)
        kit.sphere('Visor screw', Vector((sx * 0.111, -0.052, 1.655)), (0.007, 0.009, 0.009), 'steel', bone('head'), seg=10, rings_=6)
        # Chin strap: from the ear guard down and around under the chin.
        strap = [
            Vector((sx * 0.1, -0.026, 1.598)), Vector((sx * 0.08, -0.042, 1.568)),
            Vector((sx * 0.05, -0.058, 1.55)), Vector((sx * 0.0, -0.066, 1.546)),
        ]
        kit.tube('Chin strap', strap, lambda f: (0.009, 0.0025), 'dark', bone('head'), seg=8, n=3.0, samples=3)
    kit.sphere('Chin cup', Vector((0, -0.068, 1.548)), (0.018, 0.008, 0.012), 'white', bone('head'), seg=14, rings_=8)
    # Rear adjuster clip.
    kit.sphere('Adjuster', centre + Vector((0, 0.124, -0.035)), (0.032, 0.008, 0.012), 'steel', bone('head'), seg=12, rings_=6)

    # Half visor, brow to nose tip, wrapping to the temples.
    def visor_point(u, v):
        theta = -1.05 + 2.1 * u
        z = 1.612 + 0.094 * v
        out = 0.0 + 0.014 * (1 - v)
        r_x, r_y = rx + 0.006 + out, ry + 0.004 + out
        return Vector((centre.x + math.sin(theta) * r_x, centre.y - math.cos(theta) * r_y, z))

    kit.grid('Visor', 20, 4, visor_point, 'visor', bone('head'))


def build_goalie_mask(kit):
    centre = Vector((0, -0.006, 1.656))
    rx, ry, rz = 0.112, 0.128, 0.132

    def surface(theta, phi, inset):
        d = helmet_dir(theta, phi)
        # Pointed chin and a slight forward jut, like a fibreglass mask.
        jut = 0.018 * gauss(theta, 0.6) * smoothstep(1.6, 2.4, phi)
        return centre + Vector((d.x * rx, d.y * ry - jut, d.z * rz)) - d * inset

    def is_window(theta, phi):
        t = (theta + math.pi) % TAU - math.pi
        return abs(t) < 0.62 and 1.05 < phi < 2.05

    cols, rows = 48, 18
    phi_max = 2.42
    verts, faces = [], []
    for inset in (0.0, 0.01):
        for r in range(rows + 1):
            for c in range(cols):
                verts.append(surface(TAU * c / cols, phi_max * r / rows, inset))
    per = (rows + 1) * cols
    for side in range(2):
        base = side * per
        for r in range(rows):
            for c in range(cols):
                c1 = (c + 1) % cols
                mid_t, mid_p = TAU * (c + 0.5) / cols, phi_max * (r + 0.5) / rows
                if is_window(mid_t, mid_p):
                    continue
                quad = (base + r * cols + c, base + (r + 1) * cols + c, base + (r + 1) * cols + c1, base + r * cols + c1)
                faces.append(quad if side == 0 else tuple(reversed(quad)))
    for c in range(cols):
        c1 = (c + 1) % cols
        o, i = rows * cols, per + rows * cols
        faces.append((o + c, i + c, i + c1, o + c1))
    kit.add('Mask', verts, faces, 'white', bone('head'))

    # Team stripe over the crown, from above the cage to the back plate.
    def stripe(u, v):
        d = helmet_dir((u - 0.5) * 0.36, 0.98 - 2.6 * v)
        return centre + Vector((d.x * rx, d.y * ry, d.z * rz)) + d * 0.003

    kit.grid('Mask stripe', 3, 20, stripe, 'accent', bone('head'))

    # Cat-eye cage across the window.
    def on_cage(theta, phi):
        d = helmet_dir(theta, phi)
        return centre + Vector((d.x * (rx + 0.016), d.y * (ry + 0.024), d.z * (rz + 0.012)))

    for phi in (1.12, 1.42, 1.72, 2.0):
        pts = [on_cage(-0.66 + 1.32 * k / 10, phi) for k in range(11)]
        kit.tube('Cage bar', pts, 0.0032, 'steel', bone('head'), seg=6)
    for theta in (-0.42, -0.14, 0.14, 0.42):
        pts = [on_cage(theta, 1.02 + 1.06 * k / 8) for k in range(9)]
        kit.tube('Cage bar', pts, 0.0032, 'steel', bone('head'), seg=6)
    # Throat guard hanging under the chin.
    def dangler(u, v):
        return Vector(((u - 0.5) * 0.085 * (0.75 + 0.25 * v), -0.088 + 0.006 * v, 1.47 + 0.07 * v))

    kit.grid('Throat guard', 4, 3, dangler, 'white', bone('head'))
    for sx in (-1, 1):
        kit.sphere('Mask strap clip', centre + Vector((sx * 0.112, 0.03, -0.02)), (0.006, 0.014, 0.014), 'steel', bone('head'), seg=10, rings_=6)


# ----------------------------------------------------------------------------
# Torso, arms, hands
# ----------------------------------------------------------------------------

def build_torso(kit, goalie):
    profile = GOALIE_TORSO if goalie else SKATER_TORSO
    zs = [r[0] for r in profile]
    rings = []
    seg = 40
    # Resample the profile so the sweater curves rather than facets.
    z_values = [zs[0] + (zs[-1] - zs[0]) * k / 22 for k in range(23)]
    for z in z_values:
        rings.append([torso_point(profile, z, TAU * i / seg) for i in range(seg)])
    kit.loft('Sweater', rings, 'jersey', torso_weights, cap_start=False, cap_end=False)

    def band(z0, z1, material, lift, steps=4):
        rings_b = []
        for k in range(steps + 1):
            z = z0 + (z1 - z0) * k / steps
            rings_b.append([torso_point(profile, z, TAU * i / seg, lift) for i in range(seg)])
        kit.loft('Sweater band', rings_b, material, torso_weights, False, False)

    # Hem stripes: white / accent / white.
    band(0.935, 0.948, 'white', 0.0065)
    band(0.952, 1.010, 'accent', 0.006)
    band(1.014, 1.027, 'white', 0.0065)
    # Collar.
    top = zs[-1]
    band(top - 0.016, top, 'accent', 0.0045)

    # Laced V-neck insert at the throat.
    def v_point(u, v):
        z = 1.40 + (top - 0.016 - 1.40) * v
        half = 0.034 * v ** 0.9 + 0.003
        angle = -math.pi / 2 + (u - 0.5) * 2 * (half / 0.15)
        return torso_point(profile, z, angle, 0.005)

    kit.grid('Collar insert', 6, 6, v_point, 'accent', torso_weights)
    for k in range(3):
        z = 1.418 + 0.024 * k
        for s in (-1, 1):
            a = torso_point(profile, z, -math.pi / 2 - s * 0.05, 0.0075)
            b = torso_point(profile, z + 0.015, -math.pi / 2 + s * 0.05, 0.0075)
            kit.tube('Lace', [a, b], 0.0026, 'white', torso_weights, seg=5)

    # Back number panel (printed per player at runtime). u runs left to right
    # as seen from behind, v runs up; 5 mm proud of the cloth.
    half = 0.62

    def back_point(u, v):
        z = 1.14 + 0.25 * v
        angle = math.pi / 2 - half + 2 * half * u
        return torso_point(profile, z, angle, 0.005)

    kit.grid('Back number', 12, 6, back_point, 'number', torso_weights, uv=True)

    for sx in (-1, 1):
        if goalie:
            # Shoulder floaters, the raised discs on top of a goalie's arms.
            kit.sphere('Floater', Vector((sx * 0.27, -0.01, 1.53)), (0.085, 0.1, 0.035), 'jersey', arm_weights, seg=20, rings_=10)


def build_arm(kit, sign, goalie):
    profile = GOALIE_SLEEVE if goalie else SKATER_SLEEVE
    seg = 22
    xs = [0.15 + (0.632 - 0.15) * k / 20 for k in range(21)]
    rings = [[sleeve_point(profile, sign, x, TAU * i / seg) for i in range(seg)] for x in xs]
    kit.loft('Sleeve', rings, 'jersey', arm_weights, cap_start=False, cap_end=False)

    def band(x0, x1, material, lift):
        rr = [[sleeve_point(profile, sign, x, TAU * i / seg, lift) for i in range(seg)] for x in (x0, (x0 + x1) / 2, x1)]
        kit.loft('Sleeve band', rr, material, arm_weights, False, False)

    if goalie:
        for x in (0.36, 0.45, 0.55):
            band(x, x + 0.012, 'accent', 0.004)
    else:
        # Elbow stripes: white / accent / white, and a yoke over the shoulder.
        band(0.488, 0.500, 'white', 0.0045)
        band(0.503, 0.548, 'accent', 0.004)
        band(0.551, 0.563, 'white', 0.0045)
        band(0.30, 0.335, 'accent', 0.004)


def build_glove(kit, sign):
    """Skater glove: rolled cuff, padded gauntlet, segmented fingers, thumb."""
    s = sign
    w = arm_weights
    hand = bone('hand_L' if s > 0 else 'hand_R')
    # Cuff: a flared roll, accent band.
    cuff = [(0.612, 0.078, 0.074), (0.63, 0.094, 0.09), (0.66, 0.097, 0.092), (0.69, 0.088, 0.084), (0.70, 0.07, 0.066)]
    rings = []
    for x, ry, rz in cuff:
        rings.append(ring(Vector((s * x, 0, 1.44)), Vector((0, 1, 0)), Vector((0, 0, 1)), ry, rz, 20, 2.6))
    kit.loft('Glove cuff', rings, 'jersey', w, cap_start=True, cap_end=False)
    rings = [ring(Vector((s * x, 0, 1.44)), Vector((0, 1, 0)), Vector((0, 0, 1)), ry + 0.003, rz + 0.003, 20, 2.6) for x, ry, rz in cuff[1:3]]
    kit.loft('Glove roll', rings, 'accent', w, False, False)
    # Back of the hand: a padded block, fingers curled under.
    back = []
    for k, x in enumerate([0.69, 0.71, 0.74, 0.77, 0.795, 0.81]):
        f = k / 5
        a = 0.058 - 0.008 * f ** 2
        b = 0.05 - 0.012 * f ** 3
        back.append(ring(Vector((s * x, -0.004, 1.446 - 0.01 * f)), Vector((0, 1, 0)), Vector((0, 0, 1)), a, b, 20, 3.0))
    kit.loft('Glove hand', back, 'jersey', hand, cap_start=False, cap_end=True)
    # Finger bolsters: four padded rolls over the knuckles toward the tips.
    for i in range(4):
        y = -0.036 + i * 0.024
        pts = [Vector((s * 0.735, y, 1.494)), Vector((s * 0.79, y, 1.488)), Vector((s * 0.825, y, 1.462)), Vector((s * 0.83, y, 1.43))]
        kit.tube('Finger', pts, lambda f: (0.0125 - 0.002 * f, 0.0125 - 0.002 * f), 'jersey', hand, seg=10, samples=3)
        kit.tube('Knuckle pad', [Vector((s * 0.712, y, 1.496)), Vector((s * 0.74, y, 1.498))], 0.011, 'accent', hand, seg=8)
    # Thumb, forward and wrapped round the shaft.
    thumb = [Vector((s * 0.71, -0.05, 1.43)), Vector((s * 0.75, -0.07, 1.425)), Vector((s * 0.79, -0.064, 1.41))]
    kit.tube('Thumb', thumb, lambda f: (0.018 - 0.004 * f, 0.016 - 0.003 * f), 'jersey', hand, seg=10, samples=3)
    # Leather palm underneath.
    kit.sphere('Palm', Vector((s * 0.76, -0.004, 1.405)), (0.055, 0.04, 0.014), 'dark', hand, seg=16, rings_=8)


def build_goalie_hands(kit):
    # Catching glove on the left (+X): a big trapper opening forward (-Y).
    hand_l = bone('hand_L')
    centre = Vector((0.79, -0.035, 1.47))

    def trapper(d):
        x, y, z = d.x, d.y, d.z
        p = Vector((x * 0.1, y * 0.075, z * 0.17))
        if z > 0:
            p.x *= 1 + 0.25 * z   # the T-trap fans out at the top
        if y < 0:
            pocket = 0.06 * math.exp(-((x / 0.65) ** 2 + ((z + 0.1) / 0.6) ** 2)) * (-y)
            p.y += pocket
        return p

    kit.sphere('Trapper', centre, None, 'white', hand_l, seg=32, rings_=20, deform=trapper)
    # Rim roll and lacing web in the pocket.
    rim = [centre + trapper(Vector((math.cos(t), -0.35, math.sin(t))).normalized()) + Vector((0, -0.006, 0)) for t in [TAU * k / 24 for k in range(25)]]
    kit.tube('Trapper rim', rim, 0.013, 'accent', hand_l, seg=8)
    for zz in (-0.06, -0.02, 0.02, 0.06, 0.1):
        a = centre + Vector((-0.05, -0.02, zz))
        b = centre + Vector((0.05, -0.02, zz))
        kit.tube('Web lace', [a, (a + b) / 2 + Vector((0, 0.012, 0)), b], 0.0035, 'dark', hand_l, seg=5)
    kit.tube('Web lace', [centre + Vector((0, -0.02, -0.1)), centre + Vector((0, -0.008, 0.0)), centre + Vector((0, -0.02, 0.13))], 0.004, 'dark', hand_l, seg=5)
    cuff_rings = [ring(Vector((x, 0, 1.44)), Vector((0, 1, 0)), Vector((0, 0, 1)), r, r * 1.15, 20, 3.0) for x, r in ((0.62, 0.09), (0.66, 0.1), (0.71, 0.098))]
    kit.loft('Catcher cuff', cuff_rings, 'white', arm_weights, True, True)

    # Blocker on the right (-X): a padded board facing forward over the glove.
    hand_r = bone('hand_R')
    c = Vector((-0.76, -0.085, 1.44))
    board = []
    for y, shrink in ((-0.052, 0.94), (-0.046, 1.0), (-0.004, 1.0), (0.004, 0.95)):
        board.append(ring(c + Vector((0, y, 0)), Vector((1, 0, 0)), Vector((0, 0, 1)), 0.105 * shrink, 0.19 * shrink, 40, 5.0))
    kit.loft('Blocker', board, 'white', hand_r)
    # Raised border and team stripes on the face.
    border = [c + Vector((p.x, -0.054, p.z)) for p in ring(Vector(), Vector((1, 0, 0)), Vector((0, 0, 1)), 0.098, 0.182, 40, 5.0)]
    border.append(border[0])
    kit.tube('Blocker rim', border, lambda f: (0.008, 0.005), 'accent', hand_r, seg=6, caps=False)
    for zz in (-0.08, 0.0, 0.08):
        kit.tube('Blocker stripe', [c + Vector((-0.07, -0.055, zz)), c + Vector((0.07, -0.055, zz))], lambda f: (0.004, 0.012), 'accent', hand_r, seg=6, n=4.0)
    mitt = [ring(Vector((-x, 0, 1.44)), Vector((0, 1, 0)), Vector((0, 0, 1)), r, r, 18, 2.4) for x, r in ((0.62, 0.085), (0.67, 0.094), (0.72, 0.07), (0.78, 0.055))]
    kit.loft('Blocker glove', mitt, 'dark', arm_weights, True, True)


# ----------------------------------------------------------------------------
# Legs
# ----------------------------------------------------------------------------

def build_breezers(kit, goalie):
    profile = GOALIE_BREEZER if goalie else SKATER_BREEZER
    seg = 32
    # Waist: under the sweater hem, shaping the seat.
    waist = []
    for z, a, b in ((0.90, 0.2, 0.148), (0.95, 0.196, 0.146), (1.0, 0.188, 0.14)):
        waist.append(ring(Vector((0, 0.004, z)), Vector((1, 0, 0)), Vector((0, 1, 0)), a * (1.08 if goalie else 1), b * (1.08 if goalie else 1), seg, 2.6))
    kit.loft('Breezer waist', waist, 'pants', lambda co: {'hips': 1.0}, False, False)
    # Seat and crotch, so nothing shows between the legs.
    kit.sphere('Seat', Vector((0, 0.01, 0.885)), (0.12, 0.13, 0.085), 'pants', lambda co: {'hips': 1.0}, seg=20, rings_=10)
    for sx in (-1, 1):
        x0 = sx * 0.118
        zs = [0.95 - (0.95 - profile[-1][0]) * k / 14 for k in range(15)]

        def point(z, angle, lift=0.0):
            a, b, cy = lerp_profile(profile, z)
            cu, sv = superellipse(angle, 2.5)
            return Vector((x0 + cu * (a + lift), cy + sv * (b + lift), z))

        rings = [[point(z, TAU * i / seg) for i in range(seg)] for z in zs]
        kit.loft('Breezer leg', rings, 'pants', leg_weights, False, False)
        # Hem trim.
        for z0, z1, mat, lift in ((profile[-1][0], profile[-1][0] + 0.03, 'accent', 0.004), (profile[-1][0] + 0.034, profile[-1][0] + 0.046, 'white', 0.0045)):
            kit.loft('Breezer hem', [[point(z, TAU * i / seg, lift) for i in range(seg)] for z in (z0, (z0 + z1) / 2, z1)], mat, leg_weights, False, False)
        # Side stripe down the outside of the leg.
        outer = 0.0 if sx > 0 else math.pi
        for du, mat, lift, width in ((0.0, 'accent', 0.005, 0.2), (0.24, 'white', 0.0055, 0.035), (-0.24, 'white', 0.0055, 0.035)):
            def stripe(u, v, du=du, lift=lift, width=width):
                z = profile[-1][0] + 0.05 + (0.93 - profile[-1][0] - 0.05) * v
                return point(z, outer + du + (u - 0.5) * width, lift)
            kit.grid('Breezer stripe', 2, 10, stripe, mat, leg_weights)


def build_sock(kit, sx):
    x0 = sx * 0.11
    seg = 28
    zs = [0.60 - (0.60 - 0.155) * k / 18 for k in range(19)]

    def point(z, angle, lift=0.0):
        a, b, cy = lerp_profile(SOCK, z)
        cu, sv = superellipse(angle, 2.2)
        return Vector((x0 + cu * (a + lift), cy + sv * (b + lift), z))

    rings = [[point(z, TAU * i / seg) for i in range(seg)] for z in zs]
    kit.loft('Sock', rings, 'jersey', leg_weights, False, False)
    for z0, z1, mat, lift in ((0.395, 0.41, 'white', 0.0042), (0.345, 0.39, 'accent', 0.004), (0.325, 0.34, 'white', 0.0042)):
        kit.loft('Sock stripe', [[point(z, TAU * i / seg, lift) for i in range(seg)] for z in (z0, (z0 + z1) / 2, z1)], mat, leg_weights, False, False)


def build_skate(kit, sx):
    x0 = sx * 0.11
    w = lambda co: {f'foot_{"L" if sx > 0 else "R"}': 1 - smoothstep(0.17, 0.25, co.z), f'shin_{"L" if sx > 0 else "R"}': smoothstep(0.17, 0.25, co.z)}
    foot = bone(f'foot_{"L" if sx > 0 else "R"}')
    # Boot: sections along Y (front is -Y): (y, half-width, bottom z, top z).
    boot = [
        (0.090, 0.024, 0.060, 0.205), (0.082, 0.046, 0.050, 0.232), (0.064, 0.057, 0.046, 0.25),
        (0.030, 0.062, 0.046, 0.256), (-0.010, 0.061, 0.046, 0.248), (-0.050, 0.057, 0.046, 0.200),
        (-0.090, 0.055, 0.046, 0.158), (-0.130, 0.052, 0.046, 0.132), (-0.170, 0.048, 0.046, 0.114),
        (-0.200, 0.042, 0.048, 0.102), (-0.222, 0.030, 0.052, 0.092), (-0.234, 0.012, 0.060, 0.080),
    ]
    rings = []
    for y, a, z0, z1 in boot:
        rings.append(ring(Vector((x0, y, (z0 + z1) / 2)), Vector((1, 0, 0)), Vector((0, 0, 1)), a, (z1 - z0) / 2, 24, 3.4))
    kit.loft('Boot', rings, 'dark', w)
    # Padded collar round the ankle opening and the tendon guard at the back.
    tendon = [Vector((x0, 0.084, 0.21)), Vector((x0, 0.09, 0.27)), Vector((x0, 0.078, 0.32))]
    kit.tube('Tendon guard', tendon, lambda f: (0.008, 0.034 - 0.01 * f), 'dark', w, seg=10, n=3.0, samples=3)
    # Tongue, felt-white, standing up the front of the shin.
    tongue = [Vector((x0, -0.07, 0.18)), Vector((x0, -0.09, 0.26)), Vector((x0, -0.097, 0.31))]
    kit.tube('Tongue', tongue, lambda f: (0.009, 0.04 - 0.008 * f), 'dark', w, seg=10, n=3.0, samples=3)
    kit.tube('Tongue felt', [tongue[-1] + Vector((0, 0.001, -0.012)), tongue[-1] + Vector((0, 0.0, 0.004))], lambda f: (0.0105, 0.033), 'white', w, seg=10, n=3.0)
    # Laces across the instep.
    for k, y in enumerate((-0.02, -0.055, -0.09, -0.125, -0.155)):
        top = lerp_profile([(b[0], b[3]) for b in boot], y)[0]
        kit.tube('Boot lace', [Vector((x0 - 0.04, y + 0.008, top - 0.008)), Vector((x0, y, top + 0.002)), Vector((x0 + 0.04, y - 0.008, top - 0.008))], 0.0035, 'white', foot, seg=5)
    # Holder: towers front and back, a bridge between.
    holder = []
    for y, top, half in ((0.085, 0.052, 0.008), (0.07, 0.054, 0.012), (0.03, 0.05, 0.013), (0.0, 0.034, 0.011), (-0.07, 0.03, 0.011), (-0.13, 0.05, 0.013), (-0.19, 0.054, 0.012), (-0.215, 0.05, 0.008)):
        holder.append(ring(Vector((x0, y, (0.014 + top) / 2)), Vector((1, 0, 0)), Vector((0, 0, 1)), half, (top - 0.014) / 2, 12, 4.0))
    kit.loft('Holder', holder, 'white', foot)
    # Steel runner with a profiled rocker and an upturned toe.
    blade = []
    for k in range(17):
        f = k / 16
        y = 0.095 - 0.335 * f
        bottom = 0.004 + 0.07 * (2 * f - 1) ** 8 + 0.03 * smoothstep(0.88, 1.0, f) ** 2
        top = 0.022 + 0.01 * smoothstep(0.9, 1.0, f)
        blade.append(ring(Vector((x0, y, (bottom + top) / 2)), Vector((1, 0, 0)), Vector((0, 0, 1)), 0.0022, (top - bottom) / 2, 8, 6.0))
    kit.loft('Runner', blade, 'steel', foot)


def build_goalie_pads(kit, sx):
    x0 = sx * 0.112
    shin = bone(f'shin_{"L" if sx > 0 else "R"}')
    thigh = bone(f'thigh_{"L" if sx > 0 else "R"}')
    # Leg pad: (z, half-width, half-depth, centre y). Toe bridge low, knee
    # stack high, a thigh rise above the knee.
    pad = [
        (0.04, 0.115, 0.05, -0.17), (0.09, 0.13, 0.06, -0.14), (0.16, 0.135, 0.065, -0.115),
        (0.30, 0.135, 0.068, -0.11), (0.42, 0.138, 0.07, -0.112), (0.50, 0.14, 0.078, -0.12),
        (0.58, 0.138, 0.07, -0.112), (0.66, 0.125, 0.06, -0.1), (0.70, 0.1, 0.045, -0.09),
    ]
    zs = [pad[0][0] + (pad[-1][0] - pad[0][0]) * k / 24 for k in range(25)]

    def point(z, angle, lift=0.0):
        a, b, cy = lerp_profile(pad, z)
        cu, sv = superellipse(angle, 4.0)
        # The face is gently convex, the back hugs the leg.
        return Vector((x0 + cu * (a + lift), cy + sv * (b + lift), z))

    rings = [[point(z, TAU * i / 40) for i in range(40)] for z in zs]
    kit.loft('Leg pad', rings, 'white', shin)
    # Outer roll down the outside edge.
    outer = [Vector((x0 + sx * 0.138, lerp_profile(pad, z)[2] - 0.01, z)) for z in (0.06, 0.2, 0.4, 0.6, 0.68)]
    kit.tube('Pad roll', outer, 0.03, 'white', shin, seg=14, samples=3)
    # Knee stack and landing block.
    # Team-colour graphics: three bands across the face, and a vertical channel.
    for z0 in (0.14, 0.3, 0.6):
        def face_band(u, v, z0=z0):
            z = z0 + 0.04 * v
            return point(z, -math.pi / 2 + (u - 0.5) * 2.6, 0.003)
        kit.grid('Pad graphic', 12, 2, face_band, 'accent', shin)
    def channel(u, v):
        z = 0.08 + 0.58 * v
        return point(z, -math.pi / 2 + (u - 0.5) * 0.18, 0.0035)
    kit.grid('Pad channel', 2, 12, channel, 'accent', shin)
    # Straps round the back of the leg.
    for z in (0.12, 0.27, 0.45):
        strap = [Vector((x0 + 0.13 * math.cos(t), -0.07 + 0.11 * math.sin(t), z)) for t in [math.pi * (0.05 + 0.9 * k / 10) for k in range(11)]]
        kit.tube('Pad strap', strap, lambda f: (0.004, 0.012), 'dark', shin, seg=6, n=4.0)
    # Thigh board on the front of the breezer.
    def board(u, v):
        z = 0.62 + 0.22 * v
        angle = -math.pi / 2 + (u - 0.5) * 1.6
        a, b, cy = lerp_profile(GOALIE_BREEZER, z)
        cu, sv = superellipse(angle, 2.5)
        return Vector((x0 + cu * (a + 0.012), cy + sv * (b + 0.012), z))
    kit.grid('Thigh board', 8, 6, board, 'pants', thigh)


# ----------------------------------------------------------------------------
# Sticks
# ----------------------------------------------------------------------------

def build_stick(kit, goalie):
    stick = bone('stick')
    top = GOALIE_STICK_TOP if goalie else SKATER_STICK_TOP
    heel = GOALIE_HEEL if goalie else SKATER_HEEL
    toe_dir = GOALIE_TOE if goalie else SKATER_TOE
    up = (GOALIE_BLADE_UP - toe_dir * GOALIE_BLADE_UP.dot(toe_dir) if goalie else SKATER_BLADE_UP - toe_dir * SKATER_BLADE_UP.dot(toe_dir)).normalized()
    face = toe_dir.cross(up).normalized()

    # Shaft: a rounded rectangle, tapering into the hosel.
    shaft = []
    if goalie:
        width_dir = Vector((toe_dir.x, toe_dir.y, 0)).normalized()
        thick_dir = Vector((0, 0, 1)).cross(width_dir).normalized()
        paddle_top = heel.z + 0.62
        for k in range(17):
            z = top - (top - heel.z) * k / 16
            paddle = smoothstep(paddle_top + 0.04, paddle_top - 0.04, z)
            half_w = 0.0145 + 0.03 * paddle
            shaft.append(ring(Vector((0, 0, z)) + width_dir * (0.022 * paddle), width_dir, thick_dir, half_w, 0.0105 + 0.002 * paddle, 16, 4.0))
    else:
        for k in range(13):
            z = top - (top - heel.z - 0.03) * k / 12
            taper = smoothstep(0.35, 0.08, z)
            shaft.append(ring(Vector((0, 0, z)), Vector((1, 0, 0)), Vector((0, 1, 0)), 0.0145 - 0.002 * taper, 0.0105 - 0.001 * taper, 16, 4.0))
    kit.loft('Shaft', shaft, 'stick', stick)

    # Blade: a curved, rounded plate from heel to toe.
    length = 0.38 if goalie else 0.30
    height = 0.045 if goalie else 0.034
    blade = []
    steps = 16
    for k in range(steps + 1):
        f = k / steps
        s = length * f
        curve = (0.0 if goalie else 0.022) * f * f
        h = height * (1 - 0.12 * f) * (1 - smoothstep(0.86, 1.0, f) * 0.55) * (0.75 + 0.25 * smoothstep(0.0, 0.12, f))
        centre = heel + toe_dir * s + face * curve + up * (0.0 if goalie else 0.004 * f)
        blade.append(ring(centre, up, face, h, 0.0055 * (1 - 0.3 * f), 16, 4.5))
    kit.loft('Blade', blade, 'stick', stick)
    # Tape on the blade, white, heel to near the toe.
    tape = []
    for k in range(11):
        f = 0.12 + 0.72 * k / 10
        s = length * f
        curve = (0.0 if goalie else 0.022) * f * f
        h = height * (1 - 0.12 * f) * 0.94
        centre = heel + toe_dir * s + face * curve + up * (0.0 if goalie else 0.004 * f)
        tape.append(ring(centre, up, face, h + 0.0012, 0.0055 * (1 - 0.3 * f) + 0.0012, 16, 4.5))
    kit.loft('Blade tape', tape, 'white', stick, False, False)
    # Knob: grip tape wrapped into a bulb at the top of the shaft.
    knob = []
    for z, r in ((top - 0.12, 0.0) , (top - 0.11, 0.0015), (top - 0.03, 0.0022), (top - 0.012, 0.004), (top, 0.0035), (top + 0.008, -0.004)):
        knob.append(ring(Vector((0, 0, z)), Vector((1, 0, 0)), Vector((0, 1, 0)), 0.0145 + r, 0.0105 + r, 16, 3.2))
    kit.loft('Knob', knob, 'white', stick, False, True)
    if not goalie:
        # Maker's graphics: two thin accent bands up the shaft.
        for z in (0.9, 0.93):
            kit.loft('Shaft band', [ring(Vector((0, 0, zz)), Vector((1, 0, 0)), Vector((0, 1, 0)), 0.0152, 0.0112, 16, 4.0) for zz in (z, z + 0.012)], 'accent', stick, False, False)


# ----------------------------------------------------------------------------
# Entry point (called by refine-hockey-models.py)
# ----------------------------------------------------------------------------

def rebuild_body(original, goalie=False):
    """Replaces `original`'s geometry with the new kit, skinned to the same bones."""
    bm = bmesh.new()
    bm.from_mesh(original.data)
    bmesh.ops.delete(bm, geom=list(bm.verts), context='VERTS')
    bm.to_mesh(original.data)
    bm.free()

    kit = Kit()
    build_head(kit, goalie)
    if goalie:
        build_goalie_mask(kit)
    else:
        build_helmet(kit)
    build_torso(kit, goalie)
    for sign in (1, -1):
        build_arm(kit, sign, goalie)
        if not goalie:
            build_glove(kit, sign)
    if goalie:
        build_goalie_hands(kit)
    build_breezers(kit, goalie)
    for sx in (1, -1):
        build_sock(kit, sx)
        build_skate(kit, sx)
        if goalie:
            build_goalie_pads(kit, sx)
    build_stick(kit, goalie)

    bpy.ops.object.select_all(action='DESELECT')
    original.select_set(True)
    for part in kit.parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = original
    bpy.ops.object.join()
    mesh = original.data
    # Hard edges only where the surface really turns a corner (caps, the
    # blade's edge, the blocker's rim); everything else shades smooth.
    try:
        mesh.set_sharp_from_angle(angle=math.radians(48))
    except AttributeError:
        pass
    mesh.validate(clean_customdata=True)
    mesh.update()
    return original
